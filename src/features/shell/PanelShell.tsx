import { BaseStyles, Button, Dialog, Spinner, TextInput, ThemeProvider } from "@primer/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { getShellCopy } from "../../i18n/shell";
import { GameProjectBanner, GameSafetyPanel } from "../game";
import { ChangeGroups } from "../git/ChangeGroups";
import { CommitComposer } from "../git/CommitComposer";
import { RepositoryEmptyState } from "../git/RepositoryEmptyState";
import { useGitWorkspace } from "../git/useGitWorkspace";
import { ActionMenu } from "./ActionMenu";
import { DrawerDragHandle } from "./DrawerDragHandle";
import { Header } from "./Header";
import { LocalizedDialogHeader } from "./LocalizedDialogHeader";
import { createNativeShellClient } from "./nativeClient";
import { Notice } from "./Notice";
import { SettingsDialog } from "./SettingsDialog";
import { getAICommitPreferences } from "./settings";
import { useShellSettings } from "./ShellSettingsProvider";
import { useNativeShellState } from "./useNativeShellState";

export function PanelShell() {
  const { language } = useI18n();
  const copy = getShellCopy(language);
  const workspace = useGitWorkspace();
  const shell = useShellSettings();
  const nativeShell = useNativeShellState();
  const nativeClient = useRef(createNativeShellClient()).current;
  const dark = shell.colorMode === "dark";
  const pinned = shell.settings.pinned;
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [busyElapsedSeconds, setBusyElapsedSeconds] = useState(0);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const busy = workspace.busyAction !== null;
  const visibleBusyAction =
    workspace.busyAction === "stage" || workspace.busyAction === "unstage"
      ? null
      : workspace.busyAction;
  const closeActionMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!visibleBusyAction) {
      setBusyElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setBusyElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setBusyElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [visibleBusyAction]);

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
      shell.rememberRepository(
        workspace.selectedRepository.selectionPath ??
          workspace.selectedRepository.path,
      );
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
      {visibleBusyAction && (
        <div className="busy-status" aria-live="polite">
          <Spinner size="small" />
          <span>{copy.panel.busy[visibleBusyAction]}</span>
          {busyElapsedSeconds > 0 && (
            <span className="busy-elapsed">{busyElapsedSeconds}s</span>
          )}
          {visibleBusyAction === "fetch" && (
            <Button
              size="small"
              disabled={workspace.cancellingOperation}
              onClick={() => void workspace.cancelOperation()}
            >
              {copy.panel.cancel}
            </Button>
          )}
        </div>
      )}
      {workspace.generatingCommitMessage && (
        <div className="busy-status" aria-live="polite">
          <Spinner size="small" />
          <span>{copy.panel.generatingCommitMessage}</span>
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
          aria-label={copy.panel.ariaLabel}
          aria-busy={busy || workspace.generatingCommitMessage}
          data-color-mode={dark ? "dark" : "light"}
          data-pinned={pinned}
          data-min-width="360"
          data-min-height="560"
        >
          <DrawerDragHandle
            mode={nativeShell.state.mode}
            closing={
              nativeShell.transition?.direction === "close" ||
              nativeShell.state.panelPhase === "closing"
            }
          />
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
              <main className="changes-scroll" aria-label={copy.panel.repositoryChanges}>
                {workspace.snapshot.gameProject && (
                  <div className="game-project-context">
                    <GameProjectBanner
                      profile={workspace.snapshot.gameProject}
                      issues={workspace.snapshot.gameSafetyIssues ?? []}
                    />
                    {(workspace.snapshot.gameSafetyIssues?.length ?? 0) > 0 && (
                      <GameSafetyPanel
                        key={
                          workspace.snapshot.repository.selectionPath ??
                          workspace.snapshot.repository.path
                        }
                        issues={workspace.snapshot.gameSafetyIssues ?? []}
                        defaultExpanded={workspace.snapshot.gameSafetyIssues?.some(
                          (issue) => issue.severity === "danger",
                        )}
                      />
                    )}
                  </div>
                )}
                <ChangeGroups
                  changes={workspace.snapshot.changes}
                  busy={
                    visibleBusyAction !== null ||
                    workspace.stagingInputsLocked
                  }
                  gameProjectDetected={Boolean(
                    workspace.snapshot.gameProject &&
                      (workspace.snapshot.gameProject.engine === "unity" ||
                        workspace.snapshot.gameProject.engine === "unreal"),
                  )}
                  onSetStaged={(paths, staged) => void workspace.setStaged(paths, staged)}
                />
              </main>
              <CommitComposer
                message={workspace.commitMessage}
                hasStaged={workspace.snapshot.changes.some((change) => change.staged)}
                busyAction={workspace.busyAction}
                generating={workspace.generatingCommitMessage}
                onMessageChange={workspace.setCommitMessage}
                onGenerate={() =>
                  void workspace.generateCommitMessage(
                    getAICommitPreferences(shell.settings),
                  )
                }
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
            <Dialog
              title={copy.panel.createBranch}
              renderHeader={LocalizedDialogHeader}
              onClose={() => setCreateBranchOpen(false)}
            >
              <form
                className="create-branch-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  createBranch();
                }}
              >
                <label htmlFor="new-branch-name">{copy.panel.newBranchName}</label>
                <TextInput
                  id="new-branch-name"
                  aria-label={copy.panel.newBranchName}
                  value={branchName}
                  autoFocus
                  onChange={(event) => setBranchName(event.target.value)}
                  block
                />
                <Button type="submit" variant="primary" disabled={!branchName.trim() || busy}>
                  {copy.panel.create}
                </Button>
              </form>
            </Dialog>
          )}
          {amendOpen && (
            <Dialog
              title={copy.panel.amendLastCommit}
              renderHeader={LocalizedDialogHeader}
              onClose={() => setAmendOpen(false)}
            >
              <form
                className="create-branch-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  void workspace.amendLastCommit();
                  setAmendOpen(false);
                }}
              >
                <p>{copy.panel.amendWarning}</p>
                <label htmlFor="amend-commit-message">
                  {copy.panel.optionalCommitMessage}
                </label>
                <TextInput
                  id="amend-commit-message"
                  aria-label={copy.panel.optionalCommitMessage}
                  value={workspace.commitMessage}
                  autoFocus
                  onChange={(event) => workspace.setCommitMessage(event.target.value)}
                  placeholder={copy.panel.keepExistingMessage}
                  block
                />
                <p>{copy.panel.amendFilesHelp}</p>
                <div className="dialog-actions">
                  <Button type="button" onClick={() => setAmendOpen(false)} disabled={busy}>
                    {copy.panel.cancel}
                  </Button>
                  <Button type="submit" variant="primary" disabled={busy}>
                    {copy.panel.amendCommit}
                  </Button>
                </div>
              </form>
            </Dialog>
          )}
          <SettingsDialog
            open={settingsOpen}
            settings={shell.settings}
            shellMode={nativeShell.state.mode}
            shellModePending={nativeShell.modePending}
            shellModeError={nativeShell.modeError}
            onShellModeChange={(mode) => void nativeShell.setMode(mode)}
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
