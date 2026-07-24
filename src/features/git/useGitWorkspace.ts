import { createContext, useContext } from "react";
import type { AiCommitPreferences, RepositorySnapshot } from "./types";

export type GitAction =
  | "selectRepository"
  | "stage"
  | "unstage"
  | "commit"
  | "amendLastCommit"
  | "push"
  | "commitAndPush"
  | "switchBranch"
  | "createBranch"
  | "fetch"
  | "pull"
  | "stash"
  | "openTerminal"
  | "openExplorer";

export interface GitWorkspaceValue {
  snapshot: RepositorySnapshot | null;
  selectedRepository: RepositorySnapshot["repository"] | null;
  commitMessage: string;
  busyAction: GitAction | null;
  generatingCommitMessage: boolean;
  notice: string | null;
  clearNotice(): void;
  error: string | null;
  refresh(): Promise<void>;
  setCommitMessage(message: string): void;
  generateCommitMessage(request: AiCommitPreferences): Promise<boolean>;
  selectRepository(path: string): Promise<boolean>;
  setStaged(paths: string[], staged: boolean): Promise<boolean>;
  commit(): Promise<boolean>;
  amendLastCommit(): Promise<boolean>;
  push(): Promise<boolean>;
  commitAndPush(): Promise<boolean>;
  switchBranch(branch: string): Promise<boolean>;
  createBranch(branch: string): Promise<boolean>;
  fetch(): Promise<boolean>;
  pull(): Promise<boolean>;
  stash(): Promise<boolean>;
  openTerminal(): Promise<boolean>;
  openExplorer(): Promise<boolean>;
}

export const GitWorkspaceContext = createContext<GitWorkspaceValue | null>(null);

export function useGitWorkspace(): GitWorkspaceValue {
  const workspace = useContext(GitWorkspaceContext);
  if (!workspace) {
    throw new Error("useGitWorkspace must be used within a GitProvider");
  }
  return workspace;
}
