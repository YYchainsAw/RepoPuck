// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitWorkspaceValue } from "../git/useGitWorkspace";
import { PanelShell } from "./PanelShell";

const workspace = vi.hoisted(() => ({ current: {} as GitWorkspaceValue }));

vi.mock("../git/useGitWorkspace", () => ({
  useGitWorkspace: () => workspace.current,
}));

const snapshot = {
  repository: { name: "repopuck", path: "C:\\Projects\\repopuck" },
  currentBranch: "main",
  branches: [
    { name: "main", isCurrent: true },
    { name: "develop", isCurrent: false },
  ],
  ahead: 1,
  behind: 2,
  changes: [
    {
      path: "src/App.tsx",
      kind: "modified" as const,
      staged: true,
      untracked: false,
      additions: 2,
      deletions: 1,
    },
  ],
};

function createWorkspace(overrides: Partial<GitWorkspaceValue> = {}): GitWorkspaceValue {
  return {
    snapshot,
    selectedRepository: snapshot.repository,
    commitMessage: "Ship it",
    busyAction: null,
    notice: null,
    error: null,
    refresh: vi.fn(),
    setCommitMessage: vi.fn(),
    selectRepository: vi.fn(),
    setStaged: vi.fn(),
    commit: vi.fn(),
    push: vi.fn(),
    commitAndPush: vi.fn(),
    switchBranch: vi.fn(),
    createBranch: vi.fn(),
    fetch: vi.fn(),
    pull: vi.fn(),
    stash: vi.fn(),
    openTerminal: vi.fn(),
    openExplorer: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  workspace.current = createWorkspace();
});

describe("PanelShell", () => {
  it("switches branches and creates a branch from the branch menu", () => {
    render(<PanelShell />);

    fireEvent.change(screen.getByRole("combobox", { name: "Branch" }), {
      target: { value: "develop" },
    });
    expect(workspace.current.switchBranch).toHaveBeenCalledWith("develop");

    fireEvent.click(screen.getByRole("button", { name: "Create branch" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New branch name" }), {
      target: { value: "feature/panel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(workspace.current.createBranch).toHaveBeenCalledWith("feature/panel");
  });

  it("runs every available overflow action and explains disabled amend", () => {
    render(<PanelShell />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    for (const [label, action] of [
      ["Fetch", "fetch"],
      ["Pull", "pull"],
      ["Push", "push"],
      ["Stash", "stash"],
      ["Open terminal", "openTerminal"],
      ["Open Explorer", "openExplorer"],
    ] as const) {
      fireEvent.click(screen.getByRole("menuitem", { name: label }));
      expect(workspace.current[action]).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    }

    const amend = screen.getByRole("menuitem", { name: /Amend last commit/ });
    expect(amend).toBeDisabled();
    expect(amend).toHaveAccessibleDescription("Not available in this version");
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeEnabled();
  });

  it("closes open menus with Escape", () => {
    render(<PanelShell />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("offers repository selection when there is no snapshot", () => {
    workspace.current = createWorkspace({ snapshot: null, selectedRepository: null });
    render(<PanelShell />);

    expect(screen.getByRole("heading", { name: "Choose a repository" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose repository" })).toBeEnabled();
  });

  it("shows busy, success, and error states accessibly", () => {
    workspace.current = createWorkspace({
      busyAction: "pull",
      notice: "Fetched from remote",
      error: "Authentication failed",
    });
    render(<PanelShell />);

    expect(screen.getByRole("status")).toHaveTextContent("Fetched from remote");
    expect(screen.getByRole("alert")).toHaveTextContent("Authentication failed");
    expect(screen.getByText("Pulling…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh repository" })).toBeDisabled();
  });

  it("toggles pin and dark visual states without persistence", () => {
    render(<PanelShell />);
    const panel = screen.getByRole("region", { name: "RepoPuck Git panel" });
    const pin = screen.getByRole("button", { name: "Pin panel" });
    const theme = screen.getByRole("button", { name: "Use dark theme" });

    fireEvent.click(pin);
    fireEvent.click(theme);
    expect(pin).toHaveAttribute("aria-pressed", "true");
    expect(panel).toHaveAttribute("data-color-mode", "dark");
    expect(theme).toHaveAccessibleName("Use light theme");
  });

  it("exposes compact responsive semantics down to 360px", () => {
    render(<PanelShell />);
    const panel = screen.getByRole("region", { name: "RepoPuck Git panel" });
    expect(panel).toHaveClass("panel-shell", "panel-shell--responsive");
    expect(panel).toHaveAttribute("data-min-width", "360");
    expect(panel).toHaveAttribute("data-min-height", "560");
  });
});
