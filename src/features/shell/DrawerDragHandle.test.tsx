// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import "../../styles/tokens.css";
import "./native-shell.css";
import { DrawerDragHandle } from "./DrawerDragHandle";

const windowApi = vi.hoisted(() => ({ startDragging: vi.fn() }));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging: windowApi.startDragging }),
}));

beforeEach(() => {
  windowApi.startDragging.mockReset();
  windowApi.startDragging.mockResolvedValue(undefined);
});

it("only renders the drag affordance in top drawer mode", () => {
  const puck = render(<DrawerDragHandle mode="puck" closing={false} />);
  expect(puck.container).toBeEmptyDOMElement();
  puck.rerender(<DrawerDragHandle mode="top-island" closing={false} />);
  expect(puck.container).toBeEmptyDOMElement();

  puck.rerender(<DrawerDragHandle mode="top-drawer" closing={false} />);
  const handle = screen.getByRole("button", { name: "Move top drawer" });
  expect(handle).toHaveAttribute("title", "Drag to move the top drawer");
  expect(getComputedStyle(handle).height).toBe("24px");
  expect(getComputedStyle(handle).width).toBe("100%");
});

it("starts native dragging only from a primary left pointer", () => {
  render(<DrawerDragHandle mode="top-drawer" closing={false} />);
  const handle = screen.getByRole("button", { name: "Move top drawer" });

  const primary = new MouseEvent("pointerdown", { bubbles: true, button: 0 });
  Object.defineProperty(primary, "isPrimary", { value: true });
  fireEvent(handle, primary);
  expect(windowApi.startDragging).toHaveBeenCalledTimes(1);

  const secondary = new MouseEvent("pointerdown", { bubbles: true, button: 2 });
  Object.defineProperty(secondary, "isPrimary", { value: true });
  fireEvent(handle, secondary);
  const nonPrimary = new MouseEvent("pointerdown", { bubbles: true, button: 0 });
  Object.defineProperty(nonPrimary, "isPrimary", { value: false });
  fireEvent(handle, nonPrimary);
  expect(windowApi.startDragging).toHaveBeenCalledTimes(1);
});

it("removes the interactive handle while the drawer is closing", () => {
  const { container } = render(
    <DrawerDragHandle mode="top-drawer" closing />,
  );

  expect(screen.queryByRole("button", { name: "Move top drawer" })).toBeNull();
  expect(container.querySelector(".drawer-drag-handle--inactive")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});
