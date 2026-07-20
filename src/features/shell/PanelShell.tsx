import { BaseStyles, Button, Dialog, Spinner, TextInput, ThemeProvider } from "@primer/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChangeGroups } from "../git/ChangeGroups";
import { CommitComposer } from "../git/CommitComposer";
import { RepositoryEmptyState } from "../git/RepositoryEmptyState";
import { useGitWorkspace } from "../git/useGitWorkspace";
import { ActionMenu } from "./ActionMenu";
import { Header } from "./Header";
import { Notice } from "./Notice";

const busyLabels = {
  selectRepository: "Choosing repository…",
  stage: "Staging…",
  unstage: "Unstaging…",
  commit: "Committing…",
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
  const [dark, setDark] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
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
      {workspace.notice && <Notice kind="success">{workspace.notice}</Notice>}
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
                  onTogglePin={() => setPinned((value) => !value)}
                  onToggleTheme={() => setDark((value) => !value)}
                  onToggleMenu={() => setMenuOpen((value) => !value)}
                />
                <ActionMenu
                  open={menuOpen}
                  busy={busy}
                  triggerRef={menuButtonRef}
                  onClose={closeActionMenu}
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
              <RepositoryEmptyState busy={busy} onChoose={() => void chooseRepository()} />
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
        </section>
      </BaseStyles>
    </ThemeProvider>
  );
}
