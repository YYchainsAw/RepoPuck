import type {
  GitClient,
  OperationResult,
  RepositorySnapshot,
} from "./types";

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

export function createDemoGitClient(): GitClient {
  const snapshot = structuredClone(demoSnapshot);

  const success = (message: string): Promise<OperationResult> =>
    Promise.resolve({ success: true, message });
  const updateStaged = (paths: string[], staged: boolean) => {
    snapshot.changes = snapshot.changes.map((change) =>
      paths.includes(change.path) ? { ...change, staged } : change,
    );
    return success(staged ? "Changes staged" : "Changes unstaged");
  };
  const commit = async (message: string): Promise<OperationResult> => {
    if (!message.trim()) {
      return { success: false, message: "Enter a commit message" };
    }

    const stagedChanges = snapshot.changes.filter((change) => change.staged);
    if (stagedChanges.length === 0) {
      return { success: false, message: "Nothing staged to commit" };
    }

    snapshot.changes = snapshot.changes.filter((change) => !change.staged);
    snapshot.ahead += 1;
    return { success: true, message: "Commit created" };
  };
  const switchBranch = async (branch: string): Promise<OperationResult> => {
    if (!snapshot.branches.some((candidate) => candidate.name === branch)) {
      return { success: false, message: `Branch ${branch} does not exist` };
    }
    snapshot.currentBranch = branch;
    snapshot.branches = snapshot.branches.map((candidate) => ({
      ...candidate,
      isCurrent: candidate.name === branch,
    }));
    return { success: true, message: `Switched to ${branch}` };
  };

  return {
    selectRepository: async (path) => {
      const segments = path.split(/[\\/]/).filter(Boolean);
      snapshot.repository = {
        name: segments.at(-1) ?? path,
        path,
      };
      return { success: true, message: "Repository selected" };
    },
    getSnapshot: async () => structuredClone(snapshot),
    stage: (paths) => updateStaged(paths, true),
    unstage: (paths) => updateStaged(paths, false),
    commit,
    push: async () => {
      snapshot.ahead = 0;
      return { success: true, message: "Pushed to remote" };
    },
    commitAndPush: async (message) => {
      const result = await commit(message);
      if (!result.success) return result;
      snapshot.ahead = 0;
      return { success: true, message: "Committed and pushed" };
    },
    checkout: switchBranch,
    switchBranch,
    createBranch: async (branch) => {
      if (snapshot.branches.some((candidate) => candidate.name === branch)) {
        return { success: false, message: `Branch ${branch} already exists` };
      }
      snapshot.currentBranch = branch;
      snapshot.branches = [
        ...snapshot.branches.map((candidate) => ({
          ...candidate,
          isCurrent: false,
        })),
        { name: branch, isCurrent: true },
      ];
      return { success: true, message: `Created ${branch}` };
    },
    fetch: () => success("Fetched from remote"),
    pull: async () => {
      snapshot.behind = 0;
      return { success: true, message: "Pulled from remote" };
    },
    stash: async () => {
      snapshot.changes = [];
      return { success: true, message: "Changes stashed" };
    },
    openTerminal: () => success("Opened terminal"),
    openExplorer: () => success("Opened Explorer"),
  };
}
