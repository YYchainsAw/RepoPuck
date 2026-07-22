// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createPuckChangeCountClient,
  usePuckChangeCount,
} from "./puckChangeCount";

const nativeApi = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: nativeApi.invoke }));

beforeEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  nativeApi.invoke.mockReset();
});

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  vi.useRealTimers();
});

it("uses a deterministic lightweight count in browser previews", async () => {
  const client = createPuckChangeCountClient();

  await expect(client.getChangeCount()).resolves.toBe(2);
  expect(nativeApi.invoke).not.toHaveBeenCalled();
});

it("requests only the native change count in Tauri", async () => {
  Reflect.set(window, "__TAURI_INTERNALS__", {});
  nativeApi.invoke.mockResolvedValue(5);
  const client = createPuckChangeCountClient();

  await expect(client.getChangeCount()).resolves.toBe(5);
  expect(nativeApi.invoke).toHaveBeenCalledWith("get_change_count");
});

it("polls at the configured interval and keeps overlapping refreshes single-flight", async () => {
  vi.useFakeTimers();
  let finishInitial!: (count: number) => void;
  const initialCount = new Promise<number>((resolve) => {
    finishInitial = resolve;
  });
  const getChangeCount = vi
    .fn()
    .mockImplementationOnce(() => initialCount)
    .mockResolvedValue(7);
  const client = { getChangeCount };
  const { result, unmount } = renderHook(() =>
    usePuckChangeCount({ client, pollIntervalMs: 30_000 }),
  );
  await act(async () => Promise.resolve());
  expect(getChangeCount).toHaveBeenCalledTimes(1);

  let firstRefresh!: Promise<void>;
  let secondRefresh!: Promise<void>;
  act(() => {
    firstRefresh = result.current.refresh();
    secondRefresh = result.current.refresh();
  });
  expect(firstRefresh).toBe(secondRefresh);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(90_000);
  });
  expect(getChangeCount).toHaveBeenCalledTimes(1);

  await act(async () => {
    finishInitial(4);
    await firstRefresh;
  });
  expect(result.current.changeCount).toBe(4);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(getChangeCount).toHaveBeenCalledTimes(2);
  expect(result.current.changeCount).toBe(7);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
