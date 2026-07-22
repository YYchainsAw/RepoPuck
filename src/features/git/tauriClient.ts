import { invoke } from "@tauri-apps/api/core";
import type { GitClient, OperationResult, RepositorySnapshot } from "./types";

const operation = (command: string, args?: Record<string, unknown>) =>
  args
    ? invoke<OperationResult>(command, args)
    : invoke<OperationResult>(command);

export function createTauriGitClient(): GitClient {
  const switchBranch = (branch: string) =>
    operation("switch_branch", { branch });

  return {
    selectRepository: (path) => operation("select_repository", { path }),
    getSnapshot: () => invoke<RepositorySnapshot>("get_snapshot"),
    stage: (paths) => operation("set_staged", { paths, staged: true }),
    unstage: (paths) => operation("set_staged", { paths, staged: false }),
    commit: (message) => operation("commit", { message }),
    amendLastCommit: (message) => operation("amend_last_commit", { message }),
    push: () => operation("push"),
    commitAndPush: (message) => operation("commit_and_push", { message }),
    checkout: switchBranch,
    switchBranch,
    createBranch: (branch) => operation("create_branch", { branch }),
    fetch: () => operation("fetch"),
    pull: () => operation("pull"),
    stash: () => operation("stash"),
    openTerminal: () => operation("open_terminal"),
    openExplorer: () => operation("open_explorer"),
  };
}
