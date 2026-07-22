// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Notice } from "./Notice";

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

it("dismisses a success notice on request", () => {
  const onDismiss = vi.fn();
  render(
    <Notice kind="success" onDismiss={onDismiss}>
      Changes pushed
    </Notice>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it("copies the existing safe error text", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<Notice kind="error">Authentication failed</Notice>);

  fireEvent.click(screen.getByRole("button", { name: "Copy error details" }));

  await waitFor(() => expect(writeText).toHaveBeenCalledWith("Authentication failed"));
  expect(await screen.findByText("Copied")).toBeVisible();
});

it("reports a rejected clipboard write", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  render(<Notice kind="error">Authentication failed</Notice>);

  fireEvent.click(screen.getByRole("button", { name: "Copy error details" }));

  expect(await screen.findByText("Copy failed")).toBeVisible();
});

it("reports when the clipboard API is unavailable", async () => {
  render(<Notice kind="error">Authentication failed</Notice>);

  fireEvent.click(screen.getByRole("button", { name: "Copy error details" }));

  expect(await screen.findByText("Copy failed")).toBeVisible();
});
