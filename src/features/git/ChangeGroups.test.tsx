// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChangeGroups } from "./ChangeGroups";
import type { ChangeEntry } from "./types";

const changes: ChangeEntry[] = [
  {
    path: "src/components/a-very-long-folder-name/FeaturePanel.tsx",
    kind: "modified",
    staged: false,
    untracked: false,
    additions: 24,
    deletions: 8,
  },
  {
    path: "README.md",
    kind: "deleted",
    staged: true,
    untracked: false,
    additions: 0,
    deletions: 3,
  },
  {
    path: "src/new-file.ts",
    kind: "added",
    staged: false,
    untracked: true,
    additions: 12,
    deletions: 0,
  },
];

describe("ChangeGroups", () => {
  it("renders tracked and unversioned changes as separate counted groups", () => {
    render(<ChangeGroups changes={changes} busy={false} onSetStaged={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Changes 2" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Unversioned files 1" }),
    ).toBeInTheDocument();
    expect(screen.getByTitle(changes[0].path)).toHaveTextContent(changes[0].path);
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("+24")).toBeInTheDocument();
    expect(screen.getByText("−8")).toBeInTheDocument();
  });

  it("stages one accessible row", () => {
    const onSetStaged = vi.fn();
    render(<ChangeGroups changes={changes} busy={false} onSetStaged={onSetStaged} />);

    fireEvent.click(screen.getByRole("checkbox", { name: `Stage ${changes[0].path}` }));
    expect(onSetStaged).toHaveBeenCalledWith([changes[0].path], true);
  });

  it("selects each group independently", () => {
    const onSetStaged = vi.fn();
    render(<ChangeGroups changes={changes} busy={false} onSetStaged={onSetStaged} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Stage all Changes" }));
    expect(onSetStaged).toHaveBeenNthCalledWith(
      1,
      [changes[0].path, changes[1].path],
      true,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Stage all Unversioned files" }),
    );
    expect(onSetStaged).toHaveBeenNthCalledWith(2, [changes[2].path], true);
  });

  it("labels and clears a fully staged group", () => {
    const onSetStaged = vi.fn();
    const stagedChanges = changes
      .filter((change) => !change.untracked)
      .map((change) => ({ ...change, staged: true }));
    render(
      <ChangeGroups changes={stagedChanges} busy={false} onSetStaged={onSetStaged} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Unstage all Changes" }));
    expect(onSetStaged).toHaveBeenCalledWith(
      stagedChanges.map((change) => change.path),
      false,
    );
  });

  it("disables staging controls while an action is busy", () => {
    render(<ChangeGroups changes={changes} busy onSetStaged={vi.fn()} />);

    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toBeDisabled();
    }
  });
});
