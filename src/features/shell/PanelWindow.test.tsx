// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PanelWindow } from "./PanelWindow";

const panelVisibility = vi.hoisted(() => ({
  isVisible: vi.fn(),
  listen: vi.fn(),
}));
const providers = vi.hoisted(() => ({
  props: [] as Array<{ visible?: boolean; pollIntervalMs?: number }>,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: panelVisibility.listen,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ isVisible: panelVisibility.isVisible }),
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
    expect(eventName).toBe("panel_visibility_changed");
    onVisibilityChanged = listener;
    return stop;
  });
  const rendered = render(<PanelWindow />);

  await waitFor(() => expect(panelVisibility.isVisible).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("Panel surface")).toBeInTheDocument();
  expect(providers.props.at(-1)).toEqual({ visible: false, pollIntervalMs: 10_000 });

  act(() => onVisibilityChanged?.({ payload: true }));
  expect(providers.props.at(-1)).toEqual({ visible: true, pollIntervalMs: 10_000 });

  act(() => onVisibilityChanged?.({ payload: false }));
  expect(providers.props.at(-1)).toEqual({ visible: false, pollIntervalMs: 10_000 });

  rendered.unmount();
  expect(stop).toHaveBeenCalledTimes(1);
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
    onVisibilityChanged = listener;
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
