// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameSafetyPanel } from "./GameSafetyPanel";
import type { GameSafetyIssue } from "./types";

const issues: GameSafetyIssue[] = [
  {
    kind: "missing-meta",
    severity: "danger",
    path: "Assets/Characters/Hero.prefab",
    message: "Add the matching .meta file before committing this asset.",
  },
  {
    kind: "orphan-meta",
    severity: "warning",
    path: "Assets/Props/Crate.prefab.meta",
    message: "The referenced Unity asset is not present.",
  },
  {
    kind: "generated-file",
    severity: "warning",
    path: "Intermediate/Build/Win64/Module.obj",
    message: "Generated Unreal build output should normally be ignored.",
  },
  {
    kind: "large-file",
    severity: "warning",
    path: "Content/Cinematics/Intro.umap",
    message: "Review this file before adding it to Git history.",
  },
  {
    kind: "lfs-recommended",
    severity: "warning",
    path: "Content/Characters/Hero.uasset",
    message: "Track this binary asset with Git LFS.",
  },
];

describe("GameSafetyPanel", () => {
  it("renders each supported game safety issue with its path and message", () => {
    render(<GameSafetyPanel issues={issues} defaultExpanded />);

    expect(screen.getByText("Missing .meta file")).toBeInTheDocument();
    expect(screen.getByText("Orphan .meta file")).toBeInTheDocument();
    expect(screen.getByText("Generated file")).toBeInTheDocument();
    expect(screen.getByText("Large file")).toBeInTheDocument();
    expect(screen.getByText("Git LFS recommended")).toBeInTheDocument();

    for (const issue of issues) {
      expect(screen.getByTitle(issue.path)).toHaveTextContent(issue.path);
      expect(screen.getByText(issue.message)).toBeInTheDocument();
    }
  });

  it("collapses and expands without losing the supplied issues", () => {
    render(<GameSafetyPanel issues={issues} defaultExpanded />);
    const toggle = screen.getByRole("button", { name: /Game project checks/ });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Missing .meta file")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Missing .meta file")).toBeInTheDocument();
  });

  it("reports requested changes when expansion is controlled", () => {
    const onExpandedChange = vi.fn();
    const { rerender } = render(
      <GameSafetyPanel
        issues={issues}
        expanded={false}
        onExpandedChange={onExpandedChange}
      />,
    );
    const toggle = screen.getByRole("button", { name: /Game project checks/ });

    fireEvent.click(toggle);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    rerender(
      <GameSafetyPanel
        issues={issues}
        expanded
        onExpandedChange={onExpandedChange}
      />,
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("uses an accessible clear state when no issues are present", () => {
    render(<GameSafetyPanel issues={[]} defaultExpanded />);

    expect(screen.getByText("No game project safety issues.")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /Game project checks/ }),
    ).toBeVisible();
  });

  it("preserves danger severity for styling and review priority", () => {
    const { container } = render(
      <GameSafetyPanel issues={[issues[0]]} defaultExpanded />,
    );

    expect(container.querySelector('[data-severity="danger"]')).toHaveTextContent(
      "Missing .meta file",
    );
    expect(screen.getByText("danger")).toBeInTheDocument();
  });
});
