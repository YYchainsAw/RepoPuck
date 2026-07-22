// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { NativeShellClient, NativeShellListeners } from "./nativeClient";
import { PuckWindow } from "./PuckWindow";

const count = vi.hoisted(() => ({
  refresh: vi.fn(),
  usePuckChangeCount: vi.fn(),
}));
const native = vi.hoisted(() => ({
  client: {} as NativeShellClient,
}));

vi.mock("./puckChangeCount", () => ({
  usePuckChangeCount: count.usePuckChangeCount,
}));

vi.mock("./nativeClient", () => ({
  createNativeShellClient: () => native.client,
}));

beforeEach(() => {
  count.refresh.mockReset();
  count.refresh.mockResolvedValue(undefined);
  count.usePuckChangeCount.mockReset();
  count.usePuckChangeCount.mockReturnValue({ changeCount: 3, refresh: count.refresh });
  native.client = {
    togglePanel: vi.fn().mockResolvedValue(undefined),
    setPanelPinned: vi.fn().mockResolvedValue(undefined),
    savePuckPosition: vi.fn().mockResolvedValue(undefined),
    openSettings: vi.fn().mockResolvedValue(undefined),
    showPuckMenu: vi.fn().mockResolvedValue(undefined),
    startDragging: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn().mockResolvedValue(() => undefined),
  };
});

it("renders the lightweight count with a thirty-second polling interval", () => {
  render(<PuckWindow />);

  expect(screen.getByText("3")).toHaveAccessibleName("3 changed files");
  expect(count.usePuckChangeCount).toHaveBeenCalledWith({ pollIntervalMs: 30_000 });
});

it("refreshes the count from native events and unregisters on unmount", async () => {
  const stop = vi.fn();
  let listeners: NativeShellListeners | undefined;
  vi.mocked(native.client.listen).mockImplementation(async (value) => {
    listeners = value;
    return stop;
  });

  const rendered = render(<PuckWindow />);
  await waitFor(() => expect(listeners).toBeDefined());
  act(() => listeners?.onRefreshRequested());
  expect(count.refresh).toHaveBeenCalledTimes(1);

  rendered.unmount();
  expect(stop).toHaveBeenCalledTimes(1);
});
