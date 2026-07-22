// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import "../../styles/tokens.css";
import "../../styles/global.css";
import type { NativeShellClient } from "./nativeClient";
import { Puck } from "./Puck";

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

it("shows the changed-file badge and toggles the panel on click", () => {
  const client = createClient();
  render(<Puck changeCount={4} client={client} />);

  expect(screen.getByText("4")).toHaveAccessibleName("4 changed files");
  fireEvent.click(screen.getByRole("button", { name: "Open Git panel, 4 changed files" }));

  expect(client.togglePanel).toHaveBeenCalledTimes(1);
});

it("keeps the launcher keyboard-focusable and opens the panel with Enter or Space", () => {
  const client = createClient();
  render(<Puck changeCount={0} client={client} />);
  const puck = screen.getByRole("button", { name: "Open Git panel, no changed files" });

  puck.focus();
  expect(puck).toHaveFocus();
  fireEvent.keyDown(puck, { key: "Enter" });
  fireEvent.keyDown(puck, { key: " " });
  fireEvent.keyDown(puck, { key: "Enter", repeat: true });

  expect(client.togglePanel).toHaveBeenCalledTimes(2);
});

it("caps a large visible badge without losing its accessible count", () => {
  render(<Puck changeCount={143} client={createClient()} />);

  expect(screen.getByText("99+")).toHaveAccessibleName("143 changed files");
});

it("uses dark tokens for a readable change-count badge", () => {
  document.documentElement.dataset.colorMode = "dark";
  document.documentElement.dataset.lightTheme = "light";
  document.documentElement.dataset.darkTheme = "dark";
  render(<Puck changeCount={4} client={createClient()} />);

  const badge = screen.getByText("4");
  expect(getComputedStyle(badge).backgroundColor).toBe("rgb(13, 17, 23)");
  expect(getComputedStyle(badge).color).toBe("rgb(230, 237, 243)");
  delete document.documentElement.dataset.colorMode;
  delete document.documentElement.dataset.lightTheme;
  delete document.documentElement.dataset.darkTheme;
});

it("opens the native menu on right click", () => {
  const client = createClient();
  render(<Puck changeCount={0} client={client} />);

  fireEvent.contextMenu(screen.getByRole("button", { name: "Open Git panel, no changed files" }));

  expect(client.showPuckMenu).toHaveBeenCalledTimes(1);
});

it("starts native dragging after pointer movement and saves the final position", async () => {
  const client = createClient();
  render(<Puck changeCount={1} client={client} />);
  const puck = screen.getByRole("button", { name: "Open Git panel, 1 changed file" });

  fireEvent(
    puck,
    new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }),
  );
  fireEvent(
    puck,
    new MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 20 }),
  );
  fireEvent(
    puck,
    new MouseEvent("pointerup", { bubbles: true, clientX: 20, clientY: 20 }),
  );
  fireEvent.click(puck);

  expect(client.startDragging).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(client.savePuckPosition).toHaveBeenCalledTimes(1));
  expect(client.togglePanel).not.toHaveBeenCalled();
});
