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
        generating={false}
        onMessageChange={setMessage}
        onGenerate={vi.fn()}
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
        generating={false}
        onMessageChange={vi.fn()}
        onGenerate={vi.fn()}
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
        generating={false}
        onMessageChange={vi.fn()}
        onGenerate={vi.fn()}
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

  it("does not submit while an IME composition is active", () => {
    const onCommit = vi.fn();
    const onCommitAndPush = vi.fn();
    render(
      <CommitComposer
        message="候補"
        hasStaged
        busyAction={null}
        generating={false}
        onMessageChange={vi.fn()}
        onGenerate={vi.fn()}
        onCommit={onCommit}
        onCommitAndPush={onCommitAndPush}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Commit message" });

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true, isComposing: true });

    expect(onCommit).not.toHaveBeenCalled();
    expect(onCommitAndPush).not.toHaveBeenCalled();
  });

  it.each([
    { message: "", hasStaged: true, busyAction: null },
    { message: "Ship it", hasStaged: false, busyAction: null },
    { message: "Ship it", hasStaged: true, busyAction: "commit" as const },
  ])("disables both actions for an invalid or busy composer", (props) => {
    render(
      <CommitComposer
        {...props}
        generating={false}
        onMessageChange={vi.fn()}
        onGenerate={vi.fn()}
        onCommit={vi.fn()}
        onCommitAndPush={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Commit$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Commit & Push/ })).toBeDisabled();
  });

  it("generates from staged changes without disabling manual input", () => {
    const onGenerate = vi.fn();
    const onMessageChange = vi.fn();
    const { rerender } = render(
      <CommitComposer
        message=""
        hasStaged
        busyAction={null}
        generating={false}
        onMessageChange={onMessageChange}
        onGenerate={onGenerate}
        onCommit={vi.fn()}
        onCommitAndPush={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Generate commit message with AI" }),
    );
    expect(onGenerate).toHaveBeenCalledTimes(1);

    rerender(
      <CommitComposer
        message=""
        hasStaged
        busyAction={null}
        generating
        onMessageChange={onMessageChange}
        onGenerate={onGenerate}
        onCommit={vi.fn()}
        onCommitAndPush={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Generate commit message with AI" }),
    ).toBeDisabled();
    const input = screen.getByRole("textbox", { name: "Commit message" });
    expect(input).not.toBeDisabled();
    fireEvent.change(input, { target: { value: "Manual draft" } });
    expect(onMessageChange).toHaveBeenCalledWith("Manual draft");
  });

  it("requires at least one staged file before AI generation", () => {
    render(
      <CommitComposer
        message=""
        hasStaged={false}
        busyAction={null}
        generating={false}
        onMessageChange={vi.fn()}
        onGenerate={vi.fn()}
        onCommit={vi.fn()}
        onCommitAndPush={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Generate commit message with AI" }),
    ).toBeDisabled();
  });
});
