import type {
  GitClient,
  OperationResult,
  RepositorySnapshot,
} from "./types";

const demoSnapshot: RepositorySnapshot = {
  repository: {
    name: "OrbitTactics",
    path: "D:\\UnityProjects\\OrbitTactics",
    remoteUrl: "https://github.com/example/orbit-tactics.git",
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
      path: "Assets/Scripts/QuickCommitPanel.cs",
      kind: "modified",
      staged: false,
      untracked: false,
      additions: 18,
      deletions: 4,
      gameCategory: "code",
    },
    {
      path: "Assets/Scenes/CombatArena.unity",
      kind: "added",
      staged: false,
      untracked: true,
      additions: 12,
      deletions: 0,
      gameCategory: "scene",
    },
  ],
  gameProject: {
    name: "OrbitTactics",
    engine: "unity",
    version: "2022.3.56f1",
    descriptorPath: "ProjectSettings/ProjectVersion.txt",
  },
  gameSafetyIssues: [
    {
      kind: "missing-meta",
      severity: "danger",
      path: "Assets/Scenes/CombatArena.unity",
      message: "This Unity asset is missing its .meta file.",
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
    getRefreshToken: async () =>
      JSON.stringify({
        branch: snapshot.currentBranch,
        ahead: snapshot.ahead,
        behind: snapshot.behind,
        changes: snapshot.changes,
      }),
    stage: (paths) => updateStaged(paths, true),
    unstage: (paths) => updateStaged(paths, false),
    commit,
    generateCommitMessage: async (request) => {
      const stagedChanges = snapshot.changes.filter((change) => change.staged);
      if (stagedChanges.length === 0) {
        throw new Error("Stage at least one file before generating a message.");
      }

      const documentationOnly = stagedChanges.every((change) =>
        /\.(?:md|mdx|txt)$/i.test(change.path),
      );
      const testsOnly = stagedChanges.every((change) =>
        /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.[^/]+$/i.test(
          change.path,
        ),
      );
      const commitType = documentationOnly
        ? "docs"
        : testsOnly
          ? "test"
          : stagedChanges.some((change) => change.kind === "added")
            ? "feat"
            : "fix";
      const scope = request.useScope
        ? stagedChanges.every((change) => change.path.startsWith("src/"))
          ? "ui"
          : "project"
        : "";
      const prefix = scope ? `${commitType}(${scope}):` : `${commitType}:`;
      const subject =
        request.language === "zh-CN"
          ? "更新暂存的项目文件"
          : "update staged project files";
      return {
        message: `${prefix} ${subject}`,
        truncated: false,
        excludedFiles: [],
      };
    },
    amendLastCommit: (message) =>
      success(message?.trim() ? "Last commit amended with a new message" : "Last commit amended"),
    push: async () => {
      snapshot.ahead = 0;
      return { success: true, message: "Pushed to remote" };
    },
    commitAndPush: async (message) => {
      const result = await commit(message);
      if (!result.success) {
        return {
          success: false,
          committed: false,
          pushed: false,
          stage: "commit",
          message: result.message ?? "Commit failed",
        };
      }
      snapshot.ahead = 0;
      return {
        success: true,
        committed: true,
        pushed: true,
        stage: "complete",
        message: "Committed and pushed",
      };
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
    cancelOperation: () => success("Cancellation requested"),
    openTerminal: () => success("Opened terminal"),
    openExplorer: () => success("Opened Explorer"),
  };
}
