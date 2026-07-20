// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../styles/tokens.css";
import "../../styles/global.css";
import type { GitWorkspaceValue } from "../git/useGitWorkspace";
import { PanelShell } from "./PanelShell";

const workspace = vi.hoisted(() => ({ current: {} as GitWorkspaceValue }));
const dialog = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("../git/useGitWorkspace", () => ({
  useGitWorkspace: () => workspace.current,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: dialog.open,
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
  dialog.open.mockReset();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
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
    const trigger = screen.getByRole("button", { name: "More actions" });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("announces the action menu and focuses its first item when opened", () => {
    render(<PanelShell />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    fireEvent.click(trigger);

    expect(screen.getByRole("menuitem", { name: "Fetch" })).toHaveFocus();
  });

  it("supports arrow, Home, and End navigation across enabled menu items", () => {
    render(<PanelShell />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const fetch = screen.getByRole("menuitem", { name: "Fetch" });
    const pull = screen.getByRole("menuitem", { name: "Pull" });
    const settings = screen.getByRole("menuitem", { name: "Settings" });

    fireEvent.keyDown(fetch, { key: "ArrowDown" });
    expect(pull).toHaveFocus();
    fireEvent.keyDown(pull, { key: "End" });
    expect(settings).toHaveFocus();
    fireEvent.keyDown(settings, { key: "Home" });
    expect(fetch).toHaveFocus();
    fireEvent.keyDown(fetch, { key: "ArrowUp" });
    expect(settings).toHaveFocus();
  });

  it("closes on outside interaction and returns focus to the trigger", () => {
    render(<PanelShell />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("returns focus after running a menu action", () => {
    render(<PanelShell />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("menuitem", { name: "Fetch" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("offers repository selection when there is no snapshot", () => {
    workspace.current = createWorkspace({ snapshot: null, selectedRepository: null });
    render(<PanelShell />);

    expect(screen.getByRole("heading", { name: "Choose a repository" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose repository" })).toBeEnabled();
  });

  it("keeps notices, errors, and busy state visible without a snapshot", () => {
    workspace.current = createWorkspace({
      snapshot: null,
      selectedRepository: null,
      busyAction: "selectRepository",
      notice: "Repository selected",
      error: "Repository could not be opened",
    });
    render(<PanelShell />);

    expect(screen.getByRole("status")).toHaveTextContent("Repository selected");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Repository could not be opened",
    );
    expect(screen.getByText(/Choosing repository/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose repository" })).toBeDisabled();
  });

  it("wires row staging and message edits to the workspace", () => {
    render(<PanelShell />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Unstage src/App.tsx" }));
    expect(workspace.current.setStaged).toHaveBeenCalledWith(["src/App.tsx"], false);

    fireEvent.change(screen.getByRole("textbox", { name: "Commit message" }), {
      target: { value: "Updated message" },
    });
    expect(workspace.current.setCommitMessage).toHaveBeenCalledWith("Updated message");
  });

  it("wires both commit actions to the workspace", () => {
    render(<PanelShell />);

    fireEvent.click(screen.getByRole("button", { name: "Commit" }));
    fireEvent.click(screen.getByRole("button", { name: "Commit & Push" }));
    expect(workspace.current.commit).toHaveBeenCalledTimes(1);
    expect(workspace.current.commitAndPush).toHaveBeenCalledTimes(1);
  });

  it("passes a Tauri repository selection to the workspace", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    dialog.open.mockResolvedValue("C:\\Projects\\chosen");
    workspace.current = createWorkspace({ snapshot: null, selectedRepository: null });
    render(<PanelShell />);

    fireEvent.click(screen.getByRole("button", { name: "Choose repository" }));

    await waitFor(() => {
      expect(workspace.current.selectRepository).toHaveBeenCalledWith(
        "C:\\Projects\\chosen",
      );
    });
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

  it("keeps primary controls and menu hit targets at 44 pixels", () => {
    render(<PanelShell />);
    expect(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--panel-control-height")
        .trim(),
    ).toBe("44px");

    const moreActions = screen.getByRole("button", { name: "More actions" });
    const branch = screen.getByRole("combobox", { name: "Branch" });
    const commit = screen.getByRole("button", { name: "Commit" });
    expect(getComputedStyle(moreActions).minHeight).toBe(
      "var(--panel-control-height)",
    );
    expect(getComputedStyle(branch).minHeight).toBe("var(--panel-control-height)");
    expect(getComputedStyle(commit).minHeight).toBe("var(--panel-control-height)");

    fireEvent.click(moreActions);
    expect(
      getComputedStyle(screen.getByRole("menuitem", { name: "Fetch" })).minHeight,
    ).toBe("var(--panel-control-height)");
  });

  it("describes remote divergence without arrow glyphs", () => {
    render(<PanelShell />);
    const divergence = screen.getByText("Ahead 1, behind 2");
    expect(divergence).not.toHaveTextContent(/[↑↓]/);
  });
});
