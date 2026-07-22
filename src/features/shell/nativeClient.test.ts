// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNativeShellClient } from "./nativeClient";

const nativeApi = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  startDragging: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: nativeApi.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: nativeApi.listen }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging: nativeApi.startDragging }),
}));

beforeEach(() => {
  Reflect.set(window, "__TAURI_INTERNALS__", {});
  nativeApi.invoke.mockReset();
  nativeApi.invoke.mockResolvedValue(undefined);
});

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

it("uses the native toggle command for launcher activation", async () => {
  const client = createNativeShellClient();

  await client.togglePanel();

  expect(nativeApi.invoke).toHaveBeenCalledWith("toggle_panel");
});

it("keeps browser preview panel activation side-effect free", async () => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  const client = createNativeShellClient();

  await client.togglePanel();

  expect(nativeApi.invoke).not.toHaveBeenCalled();
});
