// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { App, getWindowView } from "./App";

const routes = vi.hoisted(() => ({ panelModuleLoads: 0 }));

vi.mock("./features/shell/PuckWindow", () => ({
  PuckWindow: () => <main aria-label="RepoPuck launcher">Puck surface</main>,
}));

vi.mock("./features/shell/PanelWindow", () => {
  routes.panelModuleLoads += 1;
  return { PanelWindow: () => <div>Panel surface</div> };
});

it("routes the puck without loading the panel module", () => {
  render(
    <App
      view="puck"
      initialSettings={{ theme: "light", pinned: false, recentRepositories: [] }}
    />,
  );

  expect(screen.getByRole("main", { name: "RepoPuck launcher" })).toHaveTextContent(
    "Puck surface",
  );
  expect(routes.panelModuleLoads).toBe(0);
});

it("loads the panel route on demand", async () => {
  render(
    <App
      view="panel"
      initialSettings={{ theme: "light", pinned: false, recentRepositories: [] }}
    />,
  );

  expect(await screen.findByText("Panel surface")).toBeInTheDocument();
  expect(routes.panelModuleLoads).toBe(1);
});

it("defaults unknown URLs to the panel surface", () => {
  expect(getWindowView("?view=puck")).toBe("puck");
  expect(getWindowView("?view=anything-else")).toBe("panel");
});

it("installs the localized UI inside the shell settings provider", () => {
  render(
    <App
      view="puck"
      initialSettings={{
        theme: "light",
        pinned: false,
        recentRepositories: [],
        language: "zh-CN",
      }}
    />,
  );

  expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
});
