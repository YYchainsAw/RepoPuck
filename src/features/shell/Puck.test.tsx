// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import "../../styles/tokens.css";
import "../../styles/global.css";
import type { NativeShellClient } from "./nativeClient";
import { Puck } from "./Puck";

interface PointerInit extends MouseEventInit {
  pointerId?: number;
  isPrimary?: boolean;
}

function firePointer(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  { pointerId = 1, isPrimary = true, ...init }: PointerInit,
) {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    isPrimary: { value: isPrimary },
  });
  fireEvent(target, event);
}

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
  fireEvent.click(screen.getByRole("button", { name: "Toggle Git panel, 4 changed files" }));

  expect(client.togglePanel).toHaveBeenCalledTimes(1);
});

it.each(["Enter", " "])("keeps the launcher keyboard-focusable and opens the panel with %j", (key) => {
  const client = createClient();
  render(<Puck changeCount={0} client={client} />);
  const puck = screen.getByRole("button", { name: "Toggle Git panel, no changed files" });

  puck.focus();
  expect(puck).toHaveFocus();
  expect(getComputedStyle(puck).outlineOffset).toBe("-4px");
  fireEvent.keyDown(puck, { key });
  fireEvent.keyDown(puck, { key, repeat: true });

  expect(client.togglePanel).toHaveBeenCalledTimes(1);
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

  fireEvent.contextMenu(screen.getByRole("button", { name: "Toggle Git panel, no changed files" }));

  expect(client.showPuckMenu).toHaveBeenCalledTimes(1);
});

it("starts native dragging after pointer movement and saves the final position", async () => {
  const client = createClient();
  render(<Puck changeCount={1} client={client} />);
  const puck = screen.getByRole("button", { name: "Toggle Git panel, 1 changed file" });

  firePointer(puck, "pointerdown", {
    pointerId: 7,
    button: 0,
    buttons: 1,
    clientX: 10,
    clientY: 10,
  });
  firePointer(puck, "pointermove", {
    pointerId: 7,
    buttons: 1,
    clientX: 20,
    clientY: 20,
  });
  firePointer(puck, "pointerup", {
    pointerId: 7,
    button: 0,
    buttons: 0,
    clientX: 20,
    clientY: 20,
  });
  fireEvent.click(puck, { detail: 1 });

  expect(client.startDragging).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(client.savePuckPosition).toHaveBeenCalledTimes(1));
  expect(client.togglePanel).not.toHaveBeenCalled();
});

it("opens on the next pointer gesture when native dragging produces no click", async () => {
  const client = createClient();
  render(<Puck changeCount={0} client={client} />);
  const puck = screen.getByRole("button", { name: "Toggle Git panel, no changed files" });

  firePointer(puck, "pointerdown", {
    pointerId: 1,
    button: 0,
    buttons: 1,
    clientX: 8,
    clientY: 8,
  });
  firePointer(puck, "pointermove", {
    pointerId: 1,
    buttons: 1,
    clientX: 22,
    clientY: 22,
  });
  firePointer(puck, "pointerup", {
    pointerId: 1,
    button: 0,
    buttons: 0,
    clientX: 22,
    clientY: 22,
  });
  await waitFor(() => expect(client.savePuckPosition).toHaveBeenCalledTimes(1));

  firePointer(puck, "pointerdown", {
    pointerId: 2,
    button: 0,
    buttons: 1,
    clientX: 12,
    clientY: 12,
  });
  firePointer(puck, "pointerup", {
    pointerId: 2,
    button: 0,
    buttons: 0,
    clientX: 12,
    clientY: 12,
  });

  expect(client.togglePanel).toHaveBeenCalledTimes(1);
});

it("does not poison the next click when native dragging fails", async () => {
  const client = createClient();
  vi.mocked(client.startDragging).mockRejectedValueOnce(new Error("drag unavailable"));
  render(<Puck changeCount={0} client={client} />);
  const puck = screen.getByRole("button", { name: "Toggle Git panel, no changed files" });

  firePointer(puck, "pointerdown", {
    pointerId: 3,
    button: 0,
    buttons: 1,
    clientX: 5,
    clientY: 5,
  });
  firePointer(puck, "pointermove", {
    pointerId: 3,
    buttons: 1,
    clientX: 20,
    clientY: 20,
  });
  firePointer(puck, "pointerup", {
    pointerId: 3,
    button: 0,
    buttons: 0,
    clientX: 20,
    clientY: 20,
  });
  await waitFor(() => expect(client.startDragging).toHaveBeenCalledTimes(1));

  fireEvent.click(puck);
  expect(client.togglePanel).toHaveBeenCalledTimes(1);
});

it("ignores stale pointer movement after the primary button is released", () => {
  const client = createClient();
  render(<Puck changeCount={0} client={client} />);
  const puck = screen.getByRole("button", { name: "Toggle Git panel, no changed files" });

  firePointer(puck, "pointerdown", {
    pointerId: 4,
    button: 0,
    buttons: 1,
    clientX: 4,
    clientY: 4,
  });
  firePointer(puck, "pointermove", {
    pointerId: 4,
    buttons: 0,
    clientX: 24,
    clientY: 24,
  });
  fireEvent.click(puck);

  expect(client.startDragging).not.toHaveBeenCalled();
  expect(client.togglePanel).toHaveBeenCalledTimes(1);
});

it("serializes repeated toggles without losing the second click", async () => {
  const client = createClient();
  let finishShowing!: () => void;
  vi.mocked(client.togglePanel).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishShowing = resolve;
      }),
  );
  render(<Puck changeCount={0} client={client} />);
  const puck = screen.getByRole("button", { name: "Toggle Git panel, no changed files" });

  fireEvent.click(puck);
  fireEvent.click(puck);
  expect(client.togglePanel).toHaveBeenCalledTimes(1);

  await act(async () => {
    finishShowing();
    await Promise.resolve();
  });
  expect(client.togglePanel).toHaveBeenCalledTimes(2);
});
