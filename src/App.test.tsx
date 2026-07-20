// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { App, getWindowView } from "./App";

vi.mock("./features/git/GitProvider", () => ({
  GitProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./features/git/useGitWorkspace", () => ({
  useGitWorkspace: () => ({
    snapshot: { changes: [{}, {}, {}] },
  }),
}));

vi.mock("./features/shell/PanelShell", () => ({
  PanelShell: () => <div>Panel surface</div>,
}));

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
