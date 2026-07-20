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
    remoteUrl?: string;
  };
  currentBranch: string;
  branches: BranchSummary[];
  ahead: number;
  behind: number;
  changes: ChangeEntry[];
}

export interface GitClient {
  getSnapshot(): Promise<RepositorySnapshot>;
  stage(paths: string[]): Promise<OperationResult>;
  unstage(paths: string[]): Promise<OperationResult>;
  commit(message: string): Promise<OperationResult>;
  push(): Promise<OperationResult>;
  checkout(branch: string): Promise<OperationResult>;
}
