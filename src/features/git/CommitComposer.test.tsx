// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommitComposer } from "./CommitComposer";

describe("CommitComposer", () => {
  it("limits messages to 72 characters and reports the count", () => {
    const setMessage = vi.fn();
    render(
      <CommitComposer
        message="Ship it"
        hasStaged
        busyAction={null}
        onMessageChange={setMessage}
        onCommit={vi.fn()}
        onCommitAndPush={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Commit message" });
    expect(input).toHaveAttribute("maxlength", "72");
    expect(screen.getByText("7 / 72")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Release panel" } });
    expect(setMessage).toHaveBeenCalledWith("Release panel");
  });

  it("keeps Commit and Commit & Push as distinct actions", () => {
    const onCommit = vi.fn();
    const onCommitAndPush = vi.fn();
    render(
      <CommitComposer
        message="Ship it"
        hasStaged
        busyAction={null}
        onMessageChange={vi.fn()}
        onCommit={onCommit}
        onCommitAndPush={onCommitAndPush}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Commit" }));
    fireEvent.click(screen.getByRole("button", { name: "Commit & Push" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommitAndPush).toHaveBeenCalledTimes(1);
  });

  it("supports Enter to commit and Ctrl+Enter to commit and push", () => {
    const onCommit = vi.fn();
    const onCommitAndPush = vi.fn();
    render(
      <CommitComposer
        message="Ship it"
        hasStaged
        busyAction={null}
        onMessageChange={vi.fn()}
        onCommit={onCommit}
        onCommitAndPush={onCommitAndPush}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Commit message" });

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommitAndPush).toHaveBeenCalledTimes(1);
  });

  it.each([
    { message: "", hasStaged: true, busyAction: null },
    { message: "Ship it", hasStaged: false, busyAction: null },
    { message: "Ship it", hasStaged: true, busyAction: "commit" as const },
  ])("disables both actions for an invalid or busy composer", (props) => {
    render(
      <CommitComposer
        {...props}
        onMessageChange={vi.fn()}
        onCommit={vi.fn()}
        onCommitAndPush={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Commit$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Commit & Push/ })).toBeDisabled();
  });
});
