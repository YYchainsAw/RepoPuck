import { BaseStyles, Button, Dialog, Spinner, TextInput, ThemeProvider } from "@primer/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChangeGroups } from "../git/ChangeGroups";
import { CommitComposer } from "../git/CommitComposer";
import { RepositoryEmptyState } from "../git/RepositoryEmptyState";
import { useGitWorkspace } from "../git/useGitWorkspace";
import { ActionMenu } from "./ActionMenu";
import { Header } from "./Header";
import { createNativeShellClient } from "./nativeClient";
import { Notice } from "./Notice";
import { SettingsDialog } from "./SettingsDialog";
import { useShellSettings } from "./ShellSettingsProvider";

const busyLabels = {
  selectRepository: "Choosing repository…",
  stage: "Staging…",
  unstage: "Unstaging…",
  commit: "Committing…",
  amendLastCommit: "Amending last commit…",
  push: "Pushing…",
  commitAndPush: "Committing and pushing…",
  switchBranch: "Switching branch…",
  createBranch: "Creating branch…",
  fetch: "Fetching…",
  pull: "Pulling…",
  stash: "Stashing…",
  openTerminal: "Opening terminal…",
  openExplorer: "Opening Explorer…",
} as const;

export function PanelShell() {
  const workspace = useGitWorkspace();
  const shell = useShellSettings();
  const nativeClient = useRef(createNativeShellClient()).current;
  const dark = shell.colorMode === "dark";
  const pinned = shell.settings.pinned;
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const busy = workspace.busyAction !== null;
  const closeActionMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    const closeMenus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCreateBranchOpen(false);
      }
    };
    document.addEventListener("keydown", closeMenus);
    return () => document.removeEventListener("keydown", closeMenus);
  }, []);

  useEffect(() => {
    void nativeClient.setPanelPinned(pinned).catch(() => undefined);
  }, [nativeClient, pinned]);

  useEffect(() => {
    let active = true;
    let stopListening: (() => void) | undefined;
    void nativeClient
      .listen({
        onRefreshRequested: () => void workspace.refresh(),
        onOpenSettingsRequested: () => setSettingsOpen(true),
      })
      .then((stop) => {
        if (active) stopListening = stop;
        else stop();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stopListening?.();
    };
  }, [nativeClient, workspace.refresh]);

  useEffect(() => {
    if (workspace.selectedRepository) {
      shell.rememberRepository(workspace.selectedRepository.path);
    }
  }, [shell, workspace.selectedRepository]);

  const chooseRepository = async () => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ directory: true, multiple: false });
    if (typeof path === "string") await workspace.selectRepository(path);
  };

  const createBranch = () => {
    const name = branchName.trim();
    if (!name || busy) return;
    void workspace.createBranch(name);
    setBranchName("");
    setCreateBranchOpen(false);
  };

  const feedback = (
    <>
      {workspace.notice && (
        <Notice kind="success" onDismiss={workspace.clearNotice}>
          {workspace.notice}
        </Notice>
      )}
      {workspace.error && <Notice kind="error">{workspace.error}</Notice>}
      {workspace.busyAction && (
        <div className="busy-status" aria-live="polite">
          <Spinner size="small" />
          <span>{busyLabels[workspace.busyAction]}</span>
        </div>
      )}
    </>
  );

  return (
    <ThemeProvider colorMode={dark ? "night" : "day"}>
      <BaseStyles>
        <section
          className="panel-shell panel-shell--responsive"
          role="region"
          aria-label="RepoPuck Git panel"
          aria-busy={busy}
          data-color-mode={dark ? "dark" : "light"}
          data-pinned={pinned}
          data-min-width="360"
          data-min-height="560"
        >
          {workspace.snapshot ? (
            <>
              <div className="panel-top">
                <Header
                  snapshot={workspace.snapshot}
                  busy={busy}
                  pinned={pinned}
                  dark={dark}
                  menuOpen={menuOpen}
                  menuButtonRef={menuButtonRef}
                  onChooseRepository={() => void chooseRepository()}
                  onSwitchBranch={(branch) => void workspace.switchBranch(branch)}
                  onCreateBranch={() => setCreateBranchOpen(true)}
                  onRefresh={() => void workspace.refresh()}
                  onTogglePin={() => shell.setPinned(!pinned)}
                  onToggleTheme={() => shell.setTheme(dark ? "light" : "dark")}
                  onToggleMenu={() => setMenuOpen((value) => !value)}
                />
                <ActionMenu
                  open={menuOpen}
                  busy={busy}
                  remoteName={workspace.snapshot.repository.remoteName}
                  triggerRef={menuButtonRef}
                  onClose={closeActionMenu}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onAmendLastCommit={() => setAmendOpen(true)}
                  actions={{
                    fetch: () => void workspace.fetch(),
                    pull: () => void workspace.pull(),
                    push: () => void workspace.push(),
                    stash: () => void workspace.stash(),
                    openTerminal: () => void workspace.openTerminal(),
                    openExplorer: () => void workspace.openExplorer(),
                  }}
                />
              </div>
              {feedback}
              <main className="changes-scroll" aria-label="Repository changes">
                <ChangeGroups
                  changes={workspace.snapshot.changes}
                  busy={busy}
                  onSetStaged={(paths, staged) => void workspace.setStaged(paths, staged)}
                />
              </main>
              <CommitComposer
                message={workspace.commitMessage}
                hasStaged={workspace.snapshot.changes.some((change) => change.staged)}
                busyAction={workspace.busyAction}
                onMessageChange={workspace.setCommitMessage}
                onCommit={() => void workspace.commit()}
                onCommitAndPush={() => void workspace.commitAndPush()}
              />
            </>
          ) : (
            <>
              {feedback}
              <RepositoryEmptyState
                busy={busy}
                recentRepositories={shell.settings.recentRepositories}
                onChoose={() => void chooseRepository()}
                onOpenRecent={(path) => void workspace.selectRepository(path)}
              />
            </>
          )}
          {createBranchOpen && (
            <Dialog title="Create branch" onClose={() => setCreateBranchOpen(false)}>
              <form
                className="create-branch-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  createBranch();
                }}
              >
                <label htmlFor="new-branch-name">New branch name</label>
                <TextInput
                  id="new-branch-name"
                  aria-label="New branch name"
                  value={branchName}
                  autoFocus
                  onChange={(event) => setBranchName(event.target.value)}
                  block
                />
                <Button type="submit" variant="primary" disabled={!branchName.trim() || busy}>
                  Create
                </Button>
              </form>
            </Dialog>
          )}
          {amendOpen && (
            <Dialog title="Amend last commit" onClose={() => setAmendOpen(false)}>
              <form
                className="create-branch-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  void workspace.amendLastCommit();
                  setAmendOpen(false);
                }}
              >
                <p>
                  Amending rewrites the latest local commit. RepoPuck never force-pushes.
                </p>
                <label htmlFor="amend-commit-message">Optional commit message</label>
                <TextInput
                  id="amend-commit-message"
                  aria-label="Optional commit message"
                  value={workspace.commitMessage}
                  autoFocus
                  onChange={(event) => workspace.setCommitMessage(event.target.value)}
                  placeholder="Keep the existing commit message"
                  block
                />
                <p>Staged files, if any, are included. Leave this blank to keep the existing message.</p>
                <div className="dialog-actions">
                  <Button type="button" onClick={() => setAmendOpen(false)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" disabled={busy}>
                    Amend commit
                  </Button>
                </div>
              </form>
            </Dialog>
          )}
          <SettingsDialog
            open={settingsOpen}
            settings={shell.settings}
            onThemeChange={shell.setTheme}
            onPinnedChange={shell.setPinned}
            onClearRecent={shell.clearRecentRepositories}
            onOpenRecent={(path) => {
              setSettingsOpen(false);
              void workspace.selectRepository(path);
            }}
            onClose={() => setSettingsOpen(false)}
          />
        </section>
      </BaseStyles>
    </ThemeProvider>
  );
}
