import type { GitClient, RepositorySnapshot } from "./types";

const demoSnapshot: RepositorySnapshot = {
  repository: {
    name: "repopuck",
    path: "C:\\Projects\\repopuck",
    remoteUrl: "https://github.com/example/repopuck.git",
  },
  currentBranch: "develop",
  branches: [
    { name: "develop", isCurrent: true, upstream: "origin/develop" },
    { name: "main", isCurrent: false, upstream: "origin/main" },
  ],
  ahead: 1,
  behind: 0,
  changes: [
    {
      path: "src/features/git/client.ts",
      kind: "modified",
      staged: false,
      untracked: false,
      additions: 18,
      deletions: 4,
    },
    {
      path: "src/features/git/client.test.ts",
      kind: "added",
      staged: false,
      untracked: true,
      additions: 12,
      deletions: 0,
    },
  ],
};

const successfulOperation = (): Promise<{ success: true }> =>
  Promise.resolve({ success: true });

export function createDemoGitClient(): GitClient {
  return {
    getSnapshot: async () => structuredClone(demoSnapshot),
    stage: successfulOperation,
    unstage: successfulOperation,
    commit: successfulOperation,
    push: successfulOperation,
    checkout: successfulOperation,
  };
}
