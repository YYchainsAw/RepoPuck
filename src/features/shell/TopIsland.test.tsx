// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import "../../styles/tokens.css";
import "../../styles/global.css";
import type { NativeShellClient } from "./nativeClient";
import { TopIsland } from "./TopIsland";

function createClient(): NativeShellClient {
  return {
    togglePanel: vi.fn().mockResolvedValue(undefined),
    setPanelPinned: vi.fn().mockResolvedValue(undefined),
    savePuckPosition: vi.fn().mockResolvedValue(undefined),
    openSettings: vi.fn().mockResolvedValue(undefined),
    showPuckMenu: vi.fn().mockResolvedValue(undefined),
    startDragging: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn().mockResolvedValue(() => undefined),
  };
}

it("renders a 260 by 52 top-docked surface without capsule styling", () => {
  const { container } = render(
    <TopIsland changeCount={3} expanded={false} client={createClient()} />,
  );

  const island = screen.getByRole("button", {
    name: "Show RepoPuck Git panel, 3 changed files",
  });
  const surface = container.querySelector<HTMLElement>(".top-island-surface");
  expect(surface).toHaveAttribute("data-placement", "top-edge");
  expect(surface).toHaveAttribute("data-expanded", "false");
  expect(getComputedStyle(surface!).width).toBe("260px");
  expect(getComputedStyle(surface!).height).toBe("52px");
  expect(island).toHaveAttribute("aria-expanded", "false");
  expect(getComputedStyle(island).width).toBe("260px");
  expect(getComputedStyle(island).height).toBe("48px");
  expect(getComputedStyle(island).borderTopWidth).toBe("0");
  expect(getComputedStyle(island).borderRadius).toBe(
    "0 0 var(--panel-radius) var(--panel-radius)",
  );
  expect(screen.getByText("RepoPuck")).toBeInTheDocument();
  expect(screen.getByText("3 changed files")).toBeInTheDocument();
});

it("toggles from pointer or keyboard activation and exposes a clear expanded state", () => {
  const client = createClient();
  const { container } = render(
    <TopIsland changeCount={0} expanded client={client} />,
  );
  const island = screen.getByRole("button", {
    name: "Hide RepoPuck Git panel, no changed files",
  });

  expect(island).toHaveAttribute("aria-expanded", "true");
  expect(container.querySelector(".top-island-surface")).toHaveAttribute(
    "data-expanded",
    "true",
  );
  expect(getComputedStyle(island).borderBottomColor).toBe("var(--panel-focus)");
  expect(getComputedStyle(island).boxShadow).toContain("inset 0 -2px 0");
  fireEvent.click(island);
  fireEvent.keyDown(island, { key: "Enter" });
  fireEvent.click(island);
  expect(client.togglePanel).toHaveBeenCalledTimes(1);
});

it("serializes rapid toggles without losing the second activation", async () => {
  const client = createClient();
  let finish!: () => void;
  vi.mocked(client.togglePanel).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<TopIsland changeCount={1} expanded={false} client={client} />);
  const island = screen.getByRole("button", {
    name: "Show RepoPuck Git panel, 1 changed file",
  });

  fireEvent.click(island);
  fireEvent.click(island);
  expect(client.togglePanel).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await Promise.resolve();
  });
  expect(client.togglePanel).toHaveBeenCalledTimes(2);
});

it("opens the native menu on right click", () => {
  const client = createClient();
  render(<TopIsland changeCount={0} expanded={false} client={client} />);

  fireEvent.contextMenu(
    screen.getByRole("button", {
      name: "Show RepoPuck Git panel, no changed files",
    }),
  );
  expect(client.showPuckMenu).toHaveBeenCalledTimes(1);
});
