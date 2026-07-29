import type {
  GameFileCategory,
  GameProjectSummary,
  GameSafetyIssue,
} from "../game";

export type ChangeKind = "added" | "modified" | "deleted" | "renamed";

export interface ChangeEntry {
  path: string;
  kind: ChangeKind;
  staged: boolean;
  untracked: boolean;
  additions: number;
  deletions: number;
  gameCategory?: GameFileCategory;
}

export interface BranchSummary {
  name: string;
  isCurrent: boolean;
  upstream?: string;
}

export interface OperationResult {
  success: boolean;
  message?: string;
}

export type CommitAndPushStage = "commit" | "push" | "complete";

export interface CommitAndPushResult extends OperationResult {
  committed: boolean;
  pushed: boolean;
  stage: CommitAndPushStage;
  message: string;
}

export type AiCommitLanguage = "zh-CN" | "en";

export interface AiCommitPreferences {
  baseUrl: string;
  model: string;
  language: AiCommitLanguage;
  useScope: boolean;
}

export interface GenerateCommitMessageResult {
  message: string;
  truncated: boolean;
  excludedFiles: string[];
}

export interface RepositorySnapshot {
  repository: {
    name: string;
    path: string;
    selectionPath?: string;
    remoteName?: string;
    remoteUrl?: string;
  };
  currentBranch: string;
  branches: BranchSummary[];
  ahead: number;
  behind: number;
  changes: ChangeEntry[];
  gameProject?: GameProjectSummary;
  gameSafetyIssues?: GameSafetyIssue[];
}

export interface GitClient {
  selectRepository(path: string): Promise<OperationResult>;
  getSnapshot(): Promise<RepositorySnapshot>;
  getRefreshToken?(): Promise<string>;
  stage(paths: string[]): Promise<OperationResult>;
  unstage(paths: string[]): Promise<OperationResult>;
  commit(message: string): Promise<OperationResult>;
  generateCommitMessage(
    request: AiCommitPreferences,
  ): Promise<GenerateCommitMessageResult>;
  amendLastCommit(message?: string): Promise<OperationResult>;
  push(): Promise<OperationResult>;
  commitAndPush(message: string): Promise<CommitAndPushResult>;
  checkout(branch: string): Promise<OperationResult>;
  switchBranch(branch: string): Promise<OperationResult>;
  createBranch(branch: string): Promise<OperationResult>;
  fetch(): Promise<OperationResult>;
  pull(): Promise<OperationResult>;
  stash(): Promise<OperationResult>;
  cancelOperation(): Promise<OperationResult>;
  openTerminal(): Promise<OperationResult>;
  openExplorer(): Promise<OperationResult>;
}
