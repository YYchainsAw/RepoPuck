// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { App, getWindowView } from "./App";

const native = vi.hoisted(() => ({
  client: {
    togglePanel: vi.fn().mockResolvedValue(undefined),
    setPanelPinned: vi.fn().mockResolvedValue(undefined),
    savePuckPosition: vi.fn().mockResolvedValue(undefined),
    openSettings: vi.fn().mockResolvedValue(undefined),
    showPuckMenu: vi.fn().mockResolvedValue(undefined),
    startDragging: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn(),
  },
}));
const workspace = vi.hoisted(() => ({
  current: { snapshot: { changes: [{}, {}, {}] }, refresh: vi.fn() },
}));

vi.mock("./features/git/GitProvider", () => ({
  GitProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./features/git/useGitWorkspace", () => ({
  useGitWorkspace: () => workspace.current,
}));

vi.mock("./features/shell/PanelShell", () => ({
  PanelShell: () => <div>Panel surface</div>,
}));

vi.mock("./features/shell/nativeClient", () => ({
  createNativeShellClient: () => native.client,
}));

beforeEach(() => {
  workspace.current = { snapshot: { changes: [{}, {}, {}] }, refresh: vi.fn() };
  native.client.listen.mockReset();
  native.client.listen.mockResolvedValue(() => undefined);
});

it("routes the puck window to the compact launcher with the live change count", () => {
  render(
    <App
      view="puck"
      initialSettings={{ theme: "light", pinned: false, recentRepositories: [] }}
    />,
  );

  expect(screen.getByRole("main", { name: "RepoPuck launcher" })).toBeInTheDocument();
  expect(screen.getByText("3")).toHaveAccessibleName("3 changed files");
});

it("defaults unknown URLs to the panel surface", () => {
  expect(getWindowView("?view=puck")).toBe("puck");
  expect(getWindowView("?view=anything-else")).toBe("panel");
});

it("refreshes the puck workspace from native refresh events and unregisters on unmount", async () => {
  const refresh = vi.fn();
  const stop = vi.fn();
  let listeners: { onRefreshRequested(): void } | undefined;
  native.client.listen.mockImplementation(async (value) => {
    listeners = value;
    return stop;
  });
  workspace.current = { snapshot: { changes: [] }, refresh };

  const rendered = render(
    <App view="puck" initialSettings={{ theme: "light", pinned: false, recentRepositories: [] }} />,
  );

  await vi.waitFor(() => expect(listeners).toBeDefined());
  listeners?.onRefreshRequested();
  expect(refresh).toHaveBeenCalledTimes(1);
  rendered.unmount();
  expect(stop).toHaveBeenCalledTimes(1);
});
