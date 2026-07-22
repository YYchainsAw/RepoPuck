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

vi.mock("@tauri-apps/api/event", () => ({
  listen: panelVisibility.listen,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isVisible: panelVisibility.isVisible,
    startResizeDragging: panelVisibility.startResizeDragging,
  }),
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
