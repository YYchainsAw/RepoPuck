// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../../styles/global.css";
import { PanelWindow } from "./PanelWindow";

const panelVisibility = vi.hoisted(() => ({
  isVisible: vi.fn(),
  listen: vi.fn(),
  startResizeDragging: vi.fn(),
}));
const providers = vi.hoisted(() => ({
  props: [] as Array<{ visible?: boolean; pollIntervalMs?: number }>,
}));
const nativeShell = vi.hoisted(() => ({
  current: {
    state: {
      mode: "puck" as "puck" | "top-island" | "top-drawer",
      panelPhase: "hidden" as "hidden" | "opening" | "open" | "closing",
      transitionId: null as number | null,
      activeMonitorName: null as string | null,
      dockCorner: null as
        | "top-left"
        | "top-right"
        | "bottom-left"
        | "bottom-right"
        | null,
    },
    transition: null as null | {
      transitionId: number;
      mode: "puck" | "top-island" | "top-drawer";
      direction: "open" | "close";
      animation: "corner-scale" | "island-drop" | "drawer-roll";
      anchor:
        | "top-left"
        | "top-right"
        | "bottom-left"
        | "bottom-right"
        | "top-center";
      durationMs: number;
    },
    setMode: vi.fn(),
    completeTransition: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: panelVisibility.listen,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isVisible: panelVisibility.isVisible,
    startResizeDragging: panelVisibility.startResizeDragging,
  }),
}));

vi.mock("./useNativeShellState", () => ({
  useNativeShellState: () => nativeShell.current,
}));

vi.mock("../git/GitProvider", () => ({
  GitProvider: ({
    children,
    visible,
    pollIntervalMs,
  }: {
    children: React.ReactNode;
    visible?: boolean;
    pollIntervalMs?: number;
  }) => {
    providers.props.push({ visible, pollIntervalMs });
    return children;
  },
}));

vi.mock("./PanelShell", () => ({
  PanelShell: () => <div>Panel surface</div>,
}));

beforeEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  providers.props = [];
  panelVisibility.isVisible.mockReset();
  panelVisibility.isVisible.mockResolvedValue(false);
  panelVisibility.listen.mockReset();
  panelVisibility.listen.mockResolvedValue(() => undefined);
  panelVisibility.startResizeDragging.mockReset();
  panelVisibility.startResizeDragging.mockResolvedValue(undefined);
  nativeShell.current.state.mode = "puck";
  nativeShell.current.state.panelPhase = "hidden";
  nativeShell.current.state.transitionId = null;
  nativeShell.current.state.activeMonitorName = null;
  nativeShell.current.state.dockCorner = null;
  nativeShell.current.transition = null;
  nativeShell.current.setMode.mockReset();
  nativeShell.current.completeTransition.mockReset();
  nativeShell.current.completeTransition.mockResolvedValue(undefined);
});

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

it("uses the visible panel polling interval in the browser", async () => {
  render(<PanelWindow />);

  expect(await screen.findByText("Panel surface")).toBeInTheDocument();
  expect(providers.props.at(-1)).toEqual({ visible: true, pollIntervalMs: 10_000 });
});

it("pauses native polling while hidden and follows native visibility events", async () => {
  Reflect.set(window, "__TAURI_INTERNALS__", {});
  const stop = vi.fn();
  let onVisibilityChanged:
    | ((event: { payload: boolean }) => void)
    | undefined;
  panelVisibility.listen.mockImplementation(async (eventName, listener) => {
    if (eventName === "panel_visibility_changed") onVisibilityChanged = listener;
    return stop;
  });
  const rendered = render(<PanelWindow />);

  await waitFor(() => expect(panelVisibility.isVisible).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("Panel surface")).toBeInTheDocument();
  expect(providers.props.at(-1)).toEqual({ visible: false, pollIntervalMs: 10_000 });
  expect(rendered.container.querySelector(".panel-window-content--concealed")).not.toBeNull();

  act(() => onVisibilityChanged?.({ payload: true }));
  expect(providers.props.at(-1)).toEqual({ visible: true, pollIntervalMs: 10_000 });
  expect(rendered.container.querySelector(".panel-window-content--concealed")).toBeNull();

  act(() => onVisibilityChanged?.({ payload: false }));
  expect(providers.props.at(-1)).toEqual({ visible: false, pollIntervalMs: 10_000 });
  expect(rendered.container.querySelector(".panel-window-content--concealed")).not.toBeNull();

  rendered.unmount();
  expect(stop).toHaveBeenCalledTimes(2);
});

it("does not let a stale visibility query overwrite a newer show event", async () => {
  Reflect.set(window, "__TAURI_INTERNALS__", {});
  let resolveVisibility: ((visible: boolean) => void) | undefined;
  panelVisibility.isVisible.mockReturnValue(
    new Promise<boolean>((resolve) => {
      resolveVisibility = resolve;
    }),
  );
  let onVisibilityChanged:
    | ((event: { payload: boolean }) => void)
    | undefined;
  panelVisibility.listen.mockImplementation(async (_eventName, listener) => {
    if (_eventName === "panel_visibility_changed") onVisibilityChanged = listener;
    return () => undefined;
  });

  render(<PanelWindow />);
  await waitFor(() => expect(panelVisibility.isVisible).toHaveBeenCalledTimes(1));

  act(() => onVisibilityChanged?.({ payload: true }));
  expect(providers.props.at(-1)?.visible).toBe(true);

  await act(async () => {
    resolveVisibility?.(false);
    await Promise.resolve();
  });
  expect(providers.props.at(-1)?.visible).toBe(true);
});

it("animates from the corner reported by panel_opened and ignores a stale visibility query", async () => {
  Reflect.set(window, "__TAURI_INTERNALS__", {});
  let resolveVisibility: ((visible: boolean) => void) | undefined;
  panelVisibility.isVisible.mockReturnValue(
    new Promise<boolean>((resolve) => {
      resolveVisibility = resolve;
    }),
  );
  let onPanelOpened:
    | ((event: { payload: "bottom-left" }) => void)
    | undefined;
  panelVisibility.listen.mockImplementation(async (eventName, listener) => {
    if (eventName === "panel_opened") onPanelOpened = listener;
    return () => undefined;
  });

  const { container } = render(<PanelWindow />);
  await waitFor(() => expect(panelVisibility.isVisible).toHaveBeenCalledTimes(1));
  expect(container.querySelector(".panel-window-content--concealed")).not.toBeNull();

  act(() => onPanelOpened?.({ payload: "bottom-left" }));
  expect(container.querySelector(".panel-window-frame--bottom-left")).not.toBeNull();
  expect(container.querySelector(".panel-window-content--concealed")).toBeNull();
  expect(container.querySelector(".panel-window-content--opening")).toHaveAttribute(
    "data-open-corner",
    "bottom-left",
  );
  expect(providers.props.at(-1)?.visible).toBe(true);

  await act(async () => {
    resolveVisibility?.(false);
    await Promise.resolve();
  });
  expect(providers.props.at(-1)?.visible).toBe(true);
});

it("starts native resizing from all eight transparent edge handles", async () => {
  Reflect.set(window, "__TAURI_INTERNALS__", {});
  const { container } = render(<PanelWindow />);
  await waitFor(() => expect(panelVisibility.isVisible).toHaveBeenCalledTimes(1));

  const handles = Array.from(
    container.querySelectorAll<HTMLElement>("[data-resize-direction]"),
  );
  expect(handles).toHaveLength(8);
  const cursors = [
    "ns-resize",
    "nesw-resize",
    "ew-resize",
    "nwse-resize",
    "ns-resize",
    "nesw-resize",
    "ew-resize",
    "nwse-resize",
  ];
  handles.forEach((handle, index) => {
    expect(handle).toHaveAttribute("aria-hidden", "true");
    expect(getComputedStyle(handle).cursor).toBe(cursors[index]);
    const event = new MouseEvent("pointerdown", { bubbles: true, button: 0 });
    Object.defineProperty(event, "isPrimary", { value: true });
    fireEvent(handle, event);
  });

  expect(panelVisibility.startResizeDragging.mock.calls.map(([direction]) => direction)).toEqual([
    "North",
    "NorthEast",
    "East",
    "SouthEast",
    "South",
    "SouthWest",
    "West",
    "NorthWest",
  ]);

  const secondaryPointer = new MouseEvent("pointerdown", { bubbles: true, button: 0 });
  Object.defineProperty(secondaryPointer, "isPrimary", { value: false });
  fireEvent(handles[0], secondaryPointer);
  expect(panelVisibility.startResizeDragging).toHaveBeenCalledTimes(8);
});

it("animates top-island transitions from the top center and acknowledges completion", async () => {
  Reflect.set(window, "__TAURI_INTERNALS__", {});
  nativeShell.current.state.mode = "top-island";
  nativeShell.current.state.panelPhase = "opening";
  nativeShell.current.state.transitionId = 41;
  nativeShell.current.transition = {
    transitionId: 41,
    mode: "top-island",
    direction: "open",
    animation: "island-drop",
    anchor: "top-center",
    durationMs: 180,
  };

  const { container } = render(<PanelWindow />);
  const frame = container.querySelector(".panel-window-frame");
  const content = container.querySelector<HTMLElement>(".panel-window-content");
  expect(frame).toHaveClass("panel-window-frame--top-center");
  expect(frame).toHaveAttribute("data-panel-mode", "top-island");
  expect(content).toHaveClass(
    "panel-window-content--opening",
    "panel-window-content--island-drop",
  );
  expect(content?.style.animationDuration).toBe("180ms");
  expect(
    Array.from(container.querySelectorAll("[data-resize-direction]")).map((handle) =>
      handle.getAttribute("data-resize-direction"),
    ),
  ).toEqual(["East", "SouthEast", "South", "SouthWest", "West"]);

  fireEvent.animationEnd(content!);
  await waitFor(() =>
    expect(nativeShell.current.completeTransition).toHaveBeenCalledWith(41),
  );
});

it("uses the drawer closing animation and removes resize overlays", async () => {
  Reflect.set(window, "__TAURI_INTERNALS__", {});
  nativeShell.current.state.mode = "top-drawer";
  nativeShell.current.state.panelPhase = "closing";
  nativeShell.current.state.transitionId = 72;
  nativeShell.current.transition = {
    transitionId: 72,
    mode: "top-drawer",
    direction: "close",
    animation: "drawer-roll",
    anchor: "top-center",
    durationMs: 200,
  };

  const { container } = render(<PanelWindow />);
  const content = container.querySelector<HTMLElement>(".panel-window-content");
  expect(content).toHaveClass(
    "panel-window-content--closing",
    "panel-window-content--drawer-roll",
  );
  expect(
    Array.from(container.querySelectorAll("[data-resize-direction]")).map((handle) =>
      handle.getAttribute("data-resize-direction"),
    ),
  ).toEqual([]);

  const drawerCloseKeyframes = Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .find((rule) => rule.cssText.includes("@keyframes panel-drawer-close"));
  expect(drawerCloseKeyframes?.cssText).toContain("opacity");
  expect(drawerCloseKeyframes?.cssText).toContain("transform");
  expect(drawerCloseKeyframes?.cssText).not.toContain("clip-path");

  fireEvent.animationEnd(content!);
  await waitFor(() =>
    expect(nativeShell.current.completeTransition).toHaveBeenCalledWith(72),
  );
});

it("acknowledges transitions immediately when reduced motion is requested", async () => {
  Reflect.set(window, "__TAURI_INTERNALS__", {});
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  nativeShell.current.state.mode = "top-drawer";
  nativeShell.current.state.panelPhase = "closing";
  nativeShell.current.state.transitionId = 73;
  nativeShell.current.transition = {
    transitionId: 73,
    mode: "top-drawer",
    direction: "close",
    animation: "drawer-roll",
    anchor: "top-center",
    durationMs: 200,
  };

  render(<PanelWindow />);
  await waitFor(() =>
    expect(nativeShell.current.completeTransition).toHaveBeenCalledWith(73),
  );
});
