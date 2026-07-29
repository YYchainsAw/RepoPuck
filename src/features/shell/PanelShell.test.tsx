// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../styles/tokens.css";
import "../../styles/global.css";
import type { GitWorkspaceValue } from "../git/useGitWorkspace";
import type { NativeShellClient, NativeShellListeners } from "./nativeClient";
import type { ShellSettingsValue } from "./ShellSettingsProvider";
import type { NativeShellStateValue } from "./useNativeShellState";
import { PanelShell } from "./PanelShell";

const workspace = vi.hoisted(() => ({ current: {} as GitWorkspaceValue }));
const dialog = vi.hoisted(() => ({ open: vi.fn() }));
const shell = vi.hoisted(() => ({ current: {} as ShellSettingsValue }));
const native = vi.hoisted(() => ({ current: {} as NativeShellClient }));
const nativeShellState = vi.hoisted(() => ({
  current: {} as NativeShellStateValue,
}));
const nativeListeners = vi.hoisted(() => ({ current: null as NativeShellListeners | null }));

vi.mock("../git/useGitWorkspace", () => ({
  useGitWorkspace: () => workspace.current,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: dialog.open,
}));

vi.mock("./ShellSettingsProvider", () => ({
  useShellSettings: () => shell.current,
}));

vi.mock("./nativeClient", () => ({
  createNativeShellClient: () => native.current,
}));

vi.mock("./useNativeShellState", () => ({
  useNativeShellState: () => nativeShellState.current,
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
    stagingInputsLocked: false,
    cancellingOperation: false,
    generatingCommitMessage: false,
    notice: null,
    clearNotice: vi.fn(),
    error: null,
    refresh: vi.fn(),
    setCommitMessage: vi.fn(),
    generateCommitMessage: vi.fn(),
    selectRepository: vi.fn(),
    setStaged: vi.fn(),
    commit: vi.fn(),
    amendLastCommit: vi.fn(),
    push: vi.fn(),
    commitAndPush: vi.fn(),
    switchBranch: vi.fn(),
    createBranch: vi.fn(),
    fetch: vi.fn(),
    pull: vi.fn(),
    stash: vi.fn(),
    cancelOperation: vi.fn(),
    openTerminal: vi.fn(),
    openExplorer: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  dialog.open.mockReset();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  workspace.current = createWorkspace();
  shell.current = {
    settings: { theme: "light", pinned: false, recentRepositories: [] },
    colorMode: "light",
    setTheme: vi.fn(),
    setPinned: vi.fn(),
    setLanguage: vi.fn(),
    setAiCommitPreferences: vi.fn(),
    rememberRepository: vi.fn(),
    clearRecentRepositories: vi.fn(),
  };
  nativeListeners.current = null;
  nativeShellState.current = {
    state: {
      mode: "puck",
      panelPhase: "hidden",
      transitionId: null,
      activeMonitorName: null,
      dockCorner: null,
    },
    transition: null,
    modePending: false,
    modeError: null,
    setMode: vi.fn().mockResolvedValue(undefined),
    completeTransition: vi.fn().mockResolvedValue(undefined),
  };
  native.current = {
    togglePanel: vi.fn().mockResolvedValue(undefined),
    setPanelPinned: vi.fn().mockResolvedValue(undefined),
    savePuckPosition: vi.fn().mockResolvedValue(undefined),
    openSettings: vi.fn().mockResolvedValue(undefined),
    showPuckMenu: vi.fn().mockResolvedValue(undefined),
    startDragging: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn().mockImplementation(async (listeners: NativeShellListeners) => {
      nativeListeners.current = listeners;
      return () => undefined;
    }),
  };
});

describe("PanelShell", () => {
  it("generates a commit message with the saved AI preferences", () => {
    const generateCommitMessage = vi.fn();
    workspace.current = createWorkspace({ generateCommitMessage });
    shell.current = {
      ...shell.current,
      settings: {
        ...shell.current.settings,
        aiCommit: {
          baseUrl: "https://example.ai/v1",
          model: "game-commit-model",
          language: "zh-CN",
          useScope: true,
        },
      },
    };

    render(<PanelShell />);
    fireEvent.click(
      screen.getByRole("button", { name: "Generate commit message with AI" }),
    );

    expect(generateCommitMessage).toHaveBeenCalledWith({
      baseUrl: "https://example.ai/v1",
      model: "game-commit-model",
      language: "zh-CN",
      useScope: true,
    });
  });

  it("shows AI generation progress without marking a Git action busy", () => {
    workspace.current = createWorkspace({
      busyAction: null,
      generatingCommitMessage: true,
    });

    render(<PanelShell />);

    expect(screen.getByText("Generating commit message…")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "RepoPuck Git panel" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("textbox", { name: "Commit message" }),
    ).not.toBeDisabled();
  });

  it("shows detected game project context and safety checks above changes", () => {
    workspace.current = createWorkspace({
      snapshot: {
        ...snapshot,
        gameProject: {
          name: "Orbit Tactics",
          engine: "unity",
          version: "2022.3.56f1",
          descriptorPath: "ProjectSettings/ProjectVersion.txt",
        },
        gameSafetyIssues: [
          {
            kind: "missing-meta",
            severity: "danger",
            path: "Assets/Scenes/CombatArena.unity",
            message: "This Unity asset is missing its .meta file.",
          },
        ],
      },
    });

    render(<PanelShell />);

    expect(screen.getByText("Orbit Tactics")).toBeInTheDocument();
    expect(screen.getByText("Unity 2022.3.56f1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Game project checks/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Missing .meta file")).toBeInTheDocument();
  });

  it("keeps game-only context and file groups hidden in a regular Git repository", () => {
    workspace.current = createWorkspace({
      snapshot: {
        ...snapshot,
        changes: [
          {
            ...snapshot.changes[0],
            path: "content/example.scene",
            gameCategory: "scene",
          },
        ],
      },
    });

    render(<PanelShell />);

    expect(screen.getByRole("heading", { name: "Changes 1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Scenes 1" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Unity|Unreal|Game project checks/)).not.toBeInTheDocument();
  });

  it("reopens danger checks when switching nested projects in one repository", () => {
    const issue = {
      kind: "missing-meta" as const,
      severity: "danger" as const,
      path: "Assets/Scenes/CombatArena.unity",
      message: "This Unity asset is missing its .meta file.",
    };
    const firstSnapshot = {
      ...snapshot,
      repository: {
        ...snapshot.repository,
        selectionPath: "C:\\Projects\\studio\\Games\\First",
      },
      gameProject: {
        name: "First",
        engine: "unity" as const,
      },
      gameSafetyIssues: [issue],
    };
    workspace.current = createWorkspace({
      snapshot: firstSnapshot,
      selectedRepository: firstSnapshot.repository,
    });
    const { rerender } = render(<PanelShell />);
    const safetyToggle = screen.getByRole("button", {
      name: /Game project checks/,
    });
    fireEvent.click(safetyToggle);
    expect(safetyToggle).toHaveAttribute("aria-expanded", "false");

    const secondSnapshot = {
      ...firstSnapshot,
      repository: {
        ...firstSnapshot.repository,
        selectionPath: "C:\\Projects\\studio\\Games\\Second",
      },
      gameProject: {
        name: "Second",
        engine: "unity" as const,
      },
    };
    workspace.current = createWorkspace({
      snapshot: secondSnapshot,
      selectedRepository: secondSnapshot.repository,
    });
    rerender(<PanelShell />);

    expect(
      screen.getByRole("button", { name: /Game project checks/ }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("removes the drawer drag control on the first close-transition event", () => {
    nativeShellState.current.state.mode = "top-drawer";
    nativeShellState.current.state.panelPhase = "open";
    nativeShellState.current.transition = {
      transitionId: 21,
      mode: "top-drawer",
      direction: "close",
      animation: "drawer-roll",
      anchor: "top-center",
      durationMs: 200,
    };

    const { container } = render(<PanelShell />);

    expect(screen.queryByRole("button", { name: "Move top drawer" })).toBeNull();
    expect(container.querySelector(".drawer-drag-handle--inactive")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

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

  it("opens, cancels, and confirms the amend dialog from the overflow menu", () => {
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

    fireEvent.click(screen.getByRole("menuitem", { name: "Amend last commit" }));
    expect(screen.getByRole("dialog", { name: "Amend last commit" })).toBeInTheDocument();
    expect(screen.getByText(/rewrites the latest local commit/i)).toBeInTheDocument();
    expect(screen.getByText(/never force-pushes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Amend last commit" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Amend last commit" }));
    fireEvent.click(screen.getByRole("button", { name: "Amend commit" }));
    expect(workspace.current.amendLastCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps amend dialog actions aligned horizontally at the dialog edge", () => {
    render(<PanelShell />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Amend last commit" }));

    const actions = screen.getByRole("button", { name: "Cancel" }).parentElement!;
    expect(actions).toHaveClass("dialog-actions");
    expect(getComputedStyle(actions).display).toBe("flex");
    expect(getComputedStyle(actions).flexWrap).toBe("wrap");
    expect(getComputedStyle(actions).justifyContent).toBe("flex-end");
    expect(getComputedStyle(actions).gap).toBe("8px");
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

  it("marks the overflow divider as a menu separator", () => {
    render(<PanelShell />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(screen.getByRole("separator")).toHaveClass("action-menu-divider");
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

  it("does not show a loading banner for a staging checkbox update", () => {
    workspace.current = createWorkspace({ busyAction: "stage" });

    render(<PanelShell />);

    expect(screen.queryByText("Staging…")).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Unstage src/App.tsx" }),
    ).toBeEnabled();
  });

  it("temporarily locks staging inputs while recovering from a Git error", () => {
    workspace.current = createWorkspace({
      busyAction: "stage",
      stagingInputsLocked: true,
    });

    render(<PanelShell />);

    expect(screen.queryByText("Staging…")).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Unstage src/App.tsx" }),
    ).toBeDisabled();
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

  it("offers cancellation only for the cancellable Fetch operation", () => {
    workspace.current = createWorkspace({ busyAction: "fetch" });
    const rendered = render(<PanelShell />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(workspace.current.cancelOperation).toHaveBeenCalledTimes(1);

    workspace.current = createWorkspace({
      busyAction: "fetch",
      cancellingOperation: true,
    });
    rendered.rerender(<PanelShell />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    workspace.current = createWorkspace({ busyAction: "push" });
    rendered.rerender(<PanelShell />);
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("dismisses completed success feedback and exposes error copying", () => {
    workspace.current = createWorkspace({
      notice: "Fetched from remote",
      error: "Authentication failed",
    });
    render(<PanelShell />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(workspace.current.clearNotice).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Copy error details" })).toBeInTheDocument();
  });

  it("supplies Primer dark tokens to the repository picker, counter, input, and buttons", () => {
    document.documentElement.dataset.colorMode = "dark";
    document.documentElement.dataset.lightTheme = "light";
    document.documentElement.dataset.darkTheme = "dark";
    shell.current = { ...shell.current, colorMode: "dark" };
    render(<PanelShell />);

    const panel = screen.getByRole("region", { name: "RepoPuck Git panel" });
    const picker = screen.getByRole("button", { name: "repopuck" });
    const counter = screen.getByText("1", { exact: true });
    const message = screen.getByRole("textbox", { name: "Commit message" });
    const messageWrapper = message.closest('[class*="TextInputBaseWrapper"]')!;
    const commit = screen.getByRole("button", { name: "Commit" });
    expect(panel).toHaveAttribute("data-color-mode", "dark");
    expect(getComputedStyle(document.documentElement).getPropertyValue("--control-bgColor-rest").trim()).toBe("#212830");
    expect(getComputedStyle(document.documentElement).getPropertyValue("--fgColor-default").trim()).toBe("#f0f6fc");
    expect(getComputedStyle(picker).backgroundColor).toContain("--button-default-bgColor-rest");
    expect(getComputedStyle(counter).backgroundColor).toContain("--bgColor-neutral-muted");
    expect(getComputedStyle(messageWrapper).backgroundColor).toContain("--bgColor-default");
    expect(getComputedStyle(commit).backgroundColor).toContain("--button-primary-bgColor-rest");
    delete document.documentElement.dataset.colorMode;
    delete document.documentElement.dataset.lightTheme;
    delete document.documentElement.dataset.darkTheme;
  });

  it("keeps native branch and settings options readable in dark mode", () => {
    document.documentElement.dataset.colorMode = "dark";
    document.documentElement.dataset.lightTheme = "light";
    document.documentElement.dataset.darkTheme = "dark";
    shell.current = {
      ...shell.current,
      colorMode: "dark",
      settings: { ...shell.current.settings, theme: "dark" },
    };
    render(<PanelShell />);

    const branchSelect = screen.getByRole("combobox", { name: "Branch" });
    const branchOption = screen.getByRole("option", { name: "develop" });
    expect(getComputedStyle(branchSelect).backgroundColor).toBe(
      "var(--panel-subtle)",
    );
    expect(getComputedStyle(branchSelect).colorScheme).toBe("dark");
    expect(getComputedStyle(branchOption).backgroundColor).toBe(
      "var(--panel-surface)",
    );
    expect(getComputedStyle(branchOption).color).toBe("var(--panel-text)");

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    const themeSelect = screen.getByRole("combobox", { name: "Theme" });
    const darkOption = screen.getByRole("option", { name: "Dark" });
    expect(getComputedStyle(themeSelect).colorScheme).toBe("dark");
    expect(getComputedStyle(darkOption).backgroundColor).toBe(
      "var(--panel-surface)",
    );
    expect(getComputedStyle(darkOption).color).toBe("var(--panel-text)");

    delete document.documentElement.dataset.colorMode;
    delete document.documentElement.dataset.lightTheme;
    delete document.documentElement.dataset.darkTheme;
  });

  it("identifies the Push remote in the overflow menu when one is available", () => {
    workspace.current = createWorkspace({
      snapshot: {
        ...snapshot,
        repository: { ...snapshot.repository, remoteName: "origin" },
      },
    });
    render(<PanelShell />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(screen.getByRole("menuitem", { name: "Push origin" })).toBeInTheDocument();
  });

  it("persists pin and dark theme choices through the shell settings", () => {
    render(<PanelShell />);
    const panel = screen.getByRole("region", { name: "RepoPuck Git panel" });
    const pin = screen.getByRole("button", { name: "Pin panel" });
    const theme = screen.getByRole("button", { name: "Use dark theme" });

    fireEvent.click(pin);
    fireEvent.click(theme);
    expect(shell.current.setPinned).toHaveBeenCalledWith(true);
    expect(shell.current.setTheme).toHaveBeenCalledWith("dark");
    expect(native.current.setPanelPinned).toHaveBeenCalledWith(false);
    expect(panel).toHaveAttribute("data-color-mode", "light");
  });

  it("opens real settings from the overflow and native tray event", async () => {
    render(<PanelShell />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(screen.getByRole("combobox", { name: "Theme" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(nativeListeners.current).not.toBeNull());
    act(() => nativeListeners.current?.onOpenSettingsRequested());
    expect(screen.getByRole("combobox", { name: "Theme" })).toBeInTheDocument();
    act(() => nativeListeners.current?.onRefreshRequested());
    expect(workspace.current.refresh).toHaveBeenCalledTimes(1);
  });

  it("offers recent repositories in the empty state", () => {
    workspace.current = createWorkspace({ snapshot: null, selectedRepository: null });
    shell.current = {
      ...shell.current,
      settings: {
        ...shell.current.settings,
        recentRepositories: ["C:\\Projects\\recent"],
      },
    };
    render(<PanelShell />);

    fireEvent.click(screen.getByRole("button", { name: "Open C:\\Projects\\recent" }));
    expect(workspace.current.selectRepository).toHaveBeenCalledWith(
      "C:\\Projects\\recent",
    );
    expect(
      getComputedStyle(screen.getByRole("button", { name: "Open C:\\Projects\\recent" }))
        .minHeight,
    ).toBe("var(--panel-control-height)");
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

  it("omits no-op remote divergence so the branch keeps compact-row space", () => {
    workspace.current = createWorkspace({
      snapshot: { ...snapshot, ahead: 0, behind: 0 },
    });
    render(<PanelShell />);

    expect(screen.queryByTitle("Remote divergence")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Branch" })).toHaveValue("main");
  });
});
