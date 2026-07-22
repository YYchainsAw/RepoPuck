export type ChangeKind = "added" | "modified" | "deleted" | "renamed";

export interface ChangeEntry {
  path: string;
  kind: ChangeKind;
  staged: boolean;
  untracked: boolean;
  additions: number;
  deletions: number;
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

export interface RepositorySnapshot {
  repository: {
    name: string;
    path: string;
    remoteName?: string;
    remoteUrl?: string;
  };
  currentBranch: string;
  branches: BranchSummary[];
  ahead: number;
  behind: number;
  changes: ChangeEntry[];
}

export interface GitClient {
  selectRepository(path: string): Promise<OperationResult>;
  getSnapshot(): Promise<RepositorySnapshot>;
  stage(paths: string[]): Promise<OperationResult>;
  unstage(paths: string[]): Promise<OperationResult>;
  commit(message: string): Promise<OperationResult>;
  amendLastCommit(message?: string): Promise<OperationResult>;
  push(): Promise<OperationResult>;
  commitAndPush(message: string): Promise<OperationResult>;
  checkout(branch: string): Promise<OperationResult>;
  switchBranch(branch: string): Promise<OperationResult>;
  createBranch(branch: string): Promise<OperationResult>;
  fetch(): Promise<OperationResult>;
  pull(): Promise<OperationResult>;
  stash(): Promise<OperationResult>;
  openTerminal(): Promise<OperationResult>;
  openExplorer(): Promise<OperationResult>;
}
