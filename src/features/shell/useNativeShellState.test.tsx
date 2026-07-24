// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createNativeShellStateClient,
  DEFAULT_NATIVE_SHELL_STATE,
  NativeShellStateProvider,
  normalizeNativeShellState,
  normalizePanelTransition,
  useNativeShellState,
  type NativeShellStateClient,
  type NativeShellStateSnapshot,
} from "./useNativeShellState";

const nativeApi = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: nativeApi.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: nativeApi.listen }));

beforeEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  nativeApi.invoke.mockReset();
  nativeApi.listen.mockReset();
  nativeApi.listen.mockResolvedValue(() => undefined);
});

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  delete document.documentElement.dataset.shellMode;
});

it("normalizes unknown shell-state and transition payloads to safe strict unions", () => {
  expect(
    normalizeNativeShellState({
      mode: "unknown",
      panelPhase: "almost-open",
      transitionId: -2,
      activeMonitorName: 42,
      dockCorner: "top-center",
    }),
  ).toEqual(DEFAULT_NATIVE_SHELL_STATE);

  expect(
    normalizePanelTransition({
      transitionId: 7,
      mode: "top-drawer",
      direction: "sideways",
      animation: "unknown",
      anchor: "somewhere",
      durationMs: 5_000,
    }),
  ).toEqual({
    transitionId: 7,
    mode: "top-drawer",
    direction: "open",
    animation: "drawer-roll",
    anchor: "top-center",
    durationMs: 1_000,
  });
  expect(normalizePanelTransition({ transitionId: "7" })).toBeNull();
});

it("uses the fixed native shell command contract", async () => {
  Reflect.set(window, "__TAURI_INTERNALS__", {});
  nativeApi.invoke.mockImplementation(async (command) => {
    if (command === "get_shell_state") {
      return { ...DEFAULT_NATIVE_SHELL_STATE, mode: "top-island" };
    }
    return undefined;
  });
  const client = createNativeShellStateClient();

  await expect(client.getState()).resolves.toMatchObject({ mode: "top-island" });
  await client.setMode("top-drawer");
  await client.completeTransition(19);

  expect(nativeApi.invoke.mock.calls).toEqual([
    ["get_shell_state"],
    ["set_shell_mode", { mode: "top-drawer" }],
    ["complete_panel_transition", { transitionId: 19 }],
  ]);
});

function StateProbe() {
  const shell = useNativeShellState();
  return (
    <>
      <output aria-label="mode">{shell.state.mode}</output>
      <output aria-label="phase">{shell.state.panelPhase}</output>
      <output aria-label="transition">
        {shell.transition?.animation ?? "none"}
      </output>
      <output aria-label="mode pending">{String(shell.modePending)}</output>
      <output aria-label="mode error">{shell.modeError ?? "none"}</output>
      <button type="button" onClick={() => void shell.setMode("top-island")}>
        Change mode
      </button>
      <button type="button" onClick={() => void shell.setMode("top-drawer")}>
        Change to drawer
      </button>
      <button
        type="button"
        onClick={() => void shell.completeTransition(12)}
      >
        Complete
      </button>
    </>
  );
}

it("subscribes before querying so stale startup state cannot replace a newer event", async () => {
  let listeners:
    | Parameters<NativeShellStateClient["listen"]>[0]
    | undefined;
  let resolveState!: (state: NativeShellStateSnapshot) => void;
  const client: NativeShellStateClient = {
    getState: vi.fn(
      () =>
        new Promise<NativeShellStateSnapshot>((resolve) => {
          resolveState = resolve;
        }),
    ),
    setMode: vi.fn().mockResolvedValue(undefined),
    completeTransition: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn(async (value) => {
      listeners = value;
      return () => undefined;
    }),
  };
  render(
    <NativeShellStateProvider client={client}>
      <StateProbe />
    </NativeShellStateProvider>,
  );
  await waitFor(() => expect(listeners).toBeDefined());

  act(() => {
    listeners?.onStateChanged({
      ...DEFAULT_NATIVE_SHELL_STATE,
      mode: "top-island",
      panelPhase: "open",
    });
  });
  await act(async () => {
    resolveState(DEFAULT_NATIVE_SHELL_STATE);
    await Promise.resolve();
  });

  expect(screen.getByLabelText("mode")).toHaveTextContent("top-island");
  expect(screen.getByLabelText("phase")).toHaveTextContent("open");
  expect(document.documentElement).toHaveAttribute(
    "data-shell-mode",
    "top-island",
  );
});

it("keeps transition completion and mode changes native-owned", async () => {
  let listeners:
    | Parameters<NativeShellStateClient["listen"]>[0]
    | undefined;
  const topIslandState: NativeShellStateSnapshot = {
    ...DEFAULT_NATIVE_SHELL_STATE,
    mode: "top-island",
  };
  const client: NativeShellStateClient = {
    getState: vi.fn().mockResolvedValue(topIslandState),
    setMode: vi.fn().mockResolvedValue(undefined),
    completeTransition: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn(async (value) => {
      listeners = value;
      return () => undefined;
    }),
  };
  render(
    <NativeShellStateProvider client={client}>
      <StateProbe />
    </NativeShellStateProvider>,
  );
  await waitFor(() => expect(listeners).toBeDefined());
  act(() => {
    listeners?.onPanelTransition({
      transitionId: 12,
      mode: "top-island",
      direction: "open",
      animation: "island-drop",
      anchor: "top-center",
      durationMs: 180,
    });
  });
  expect(screen.getByLabelText("transition")).toHaveTextContent("island-drop");

  act(() => screen.getByRole("button", { name: "Change mode" }).click());
  await waitFor(() =>
    expect(client.setMode).toHaveBeenCalledWith("top-island"),
  );
  expect(client.getState).toHaveBeenCalled();

  act(() => screen.getByRole("button", { name: "Complete" }).click());
  await waitFor(() => expect(client.completeTransition).toHaveBeenCalledWith(12));
  expect(screen.getByLabelText("transition")).toHaveTextContent("none");
});

it("serializes rapid mode changes and only applies the latest readback", async () => {
  let finishFirstModeChange!: () => void;
  const client: NativeShellStateClient = {
    getState: vi
      .fn()
      .mockResolvedValueOnce(DEFAULT_NATIVE_SHELL_STATE)
      .mockResolvedValueOnce({
        ...DEFAULT_NATIVE_SHELL_STATE,
        mode: "top-island",
      })
      .mockResolvedValueOnce({
        ...DEFAULT_NATIVE_SHELL_STATE,
        mode: "top-drawer",
      }),
    setMode: vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirstModeChange = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined),
    completeTransition: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn().mockResolvedValue(() => undefined),
  };
  render(
    <NativeShellStateProvider client={client}>
      <StateProbe />
    </NativeShellStateProvider>,
  );
  await waitFor(() => expect(client.getState).toHaveBeenCalledTimes(1));

  act(() => {
    screen.getByRole("button", { name: "Change mode" }).click();
    screen.getByRole("button", { name: "Change to drawer" }).click();
  });
  await waitFor(() =>
    expect(client.setMode).toHaveBeenNthCalledWith(1, "top-island"),
  );
  expect(client.setMode).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("mode pending")).toHaveTextContent("true");

  await act(async () => {
    finishFirstModeChange();
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(client.setMode).toHaveBeenNthCalledWith(2, "top-drawer"),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("mode")).toHaveTextContent("top-drawer"),
  );
  expect(screen.getByLabelText("mode pending")).toHaveTextContent("false");
  expect(screen.getByLabelText("mode error")).toHaveTextContent("none");
});

it("exposes the latest mode-change failure and clears its pending state", async () => {
  const client: NativeShellStateClient = {
    getState: vi.fn().mockResolvedValue(DEFAULT_NATIVE_SHELL_STATE),
    setMode: vi.fn().mockRejectedValue(new Error("native mode failure")),
    completeTransition: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn().mockResolvedValue(() => undefined),
  };
  render(
    <NativeShellStateProvider client={client}>
      <StateProbe />
    </NativeShellStateProvider>,
  );
  await waitFor(() => expect(client.getState).toHaveBeenCalledTimes(1));

  act(() => screen.getByRole("button", { name: "Change mode" }).click());
  expect(screen.getByLabelText("mode pending")).toHaveTextContent("true");
  await waitFor(() =>
    expect(screen.getByLabelText("mode error")).toHaveTextContent(
      "RepoPuck could not change the launch mode.",
    ),
  );
  expect(screen.getByLabelText("mode pending")).toHaveTextContent("false");
  expect(screen.getByLabelText("mode")).toHaveTextContent("puck");
});

it("stops a listener that resolves after the provider has unmounted", async () => {
  let finishListening!: (stop: () => void) => void;
  const stop = vi.fn();
  const client: NativeShellStateClient = {
    getState: vi.fn().mockResolvedValue(DEFAULT_NATIVE_SHELL_STATE),
    setMode: vi.fn().mockResolvedValue(undefined),
    completeTransition: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          finishListening = resolve;
        }),
    ),
  };
  const rendered = render(
    <NativeShellStateProvider client={client}>
      <StateProbe />
    </NativeShellStateProvider>,
  );
  await waitFor(() => expect(client.listen).toHaveBeenCalledTimes(1));

  rendered.unmount();
  await act(async () => {
    finishListening(stop);
    await Promise.resolve();
  });

  expect(stop).toHaveBeenCalledTimes(1);
  expect(client.getState).not.toHaveBeenCalled();
});
