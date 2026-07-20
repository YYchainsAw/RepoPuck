// @vitest-environment jsdom

import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitProvider } from "./GitProvider";
import type {
  GitClient,
  OperationResult,
  RepositorySnapshot,
} from "./types";
import { useGitWorkspace } from "./useGitWorkspace";

const initialSnapshot: RepositorySnapshot = {
  repository: {
    name: "repopuck",
    path: "C:\\Projects\\repopuck",
    remoteUrl: "https://github.com/example/repopuck.git",
  },
  currentBranch: "main",
  branches: [{ name: "main", isCurrent: true, upstream: "origin/main" }],
  ahead: 0,
  behind: 0,
  changes: [
    {
      path: "src/App.tsx",
      kind: "modified",
      staged: false,
      untracked: false,
      additions: 2,
      deletions: 1,
    },
  ],
};

function cloneSnapshot(snapshot: RepositorySnapshot): RepositorySnapshot {
  return structuredClone(snapshot);
}

function createTestClient() {
  const snapshot = cloneSnapshot(initialSnapshot);
  const success = async (): Promise<OperationResult> => ({ success: true });

  const client = {
    selectRepository: vi.fn(success),
    getSnapshot: vi.fn(async () => cloneSnapshot(snapshot)),
    stage: vi.fn(async (paths: string[]) => {
      snapshot.changes = snapshot.changes.map((change) =>
        paths.includes(change.path) ? { ...change, staged: true } : change,
      );
      return { success: true };
    }),
    unstage: vi.fn(async (paths: string[]) => {
      snapshot.changes = snapshot.changes.map((change) =>
        paths.includes(change.path) ? { ...change, staged: false } : change,
      );
      return { success: true };
    }),
    commit: vi.fn(success),
    push: vi.fn(success),
    commitAndPush: vi.fn(success),
    checkout: vi.fn(success),
    switchBranch: vi.fn(success),
    createBranch: vi.fn(success),
    fetch: vi.fn(success),
    pull: vi.fn(success),
    stash: vi.fn(success),
    openTerminal: vi.fn(success),
    openExplorer: vi.fn(success),
  } satisfies GitClient;

  return client;
}

function createWrapper(client: GitClient, visible = false) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <GitProvider client={client} visible={visible}>
        {children}
      </GitProvider>
    );
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useGitWorkspace", () => {
  it("loads the initial snapshot and selected repository", async () => {
    const client = createTestClient();
    const { result } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.snapshot).toEqual(initialSnapshot));

    expect(result.current.selectedRepository).toEqual(initialSnapshot.repository);
    expect(client.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("stages checked paths and refreshes their state", async () => {
    const client = createTestClient();
    const { result } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    await act(async () => {
      await result.current.setStaged(["src/App.tsx"], true);
    });

    expect(client.stage).toHaveBeenCalledWith(["src/App.tsx"]);
    expect(result.current.snapshot?.changes[0].staged).toBe(true);
  });

  it("retains the commit message after a failed commit", async () => {
    const client = createTestClient();
    client.commit.mockResolvedValueOnce({
      success: false,
      message: "Nothing to commit",
    });
    const { result } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    act(() => result.current.setCommitMessage("Keep this message"));
    await act(async () => {
      await result.current.commit();
    });

    expect(result.current.commitMessage).toBe("Keep this message");
    expect(result.current.error).toBe("Nothing to commit");
  });

  it("clears the commit message after a successful commit", async () => {
    const client = createTestClient();
    const { result } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    act(() => result.current.setCommitMessage("Ship it"));
    await act(async () => {
      await result.current.commit();
    });

    expect(client.commit).toHaveBeenCalledWith("Ship it");
    expect(result.current.commitMessage).toBe("");
  });

  it("automatically refreshes after a successful mutation", async () => {
    const client = createTestClient();
    const { result } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(client.getSnapshot).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.push();
    });

    expect(client.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("ignores concurrent actions while a mutation is busy", async () => {
    const client = createTestClient();
    let finishStage!: (result: OperationResult) => void;
    client.stage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStage = resolve;
        }),
    );
    const { result } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    let stagePromise!: Promise<boolean>;
    act(() => {
      stagePromise = result.current.setStaged(["src/App.tsx"], true);
    });
    await waitFor(() => expect(result.current.busyAction).toBe("stage"));

    await act(async () => {
      expect(await result.current.push()).toBe(false);
    });
    expect(client.push).not.toHaveBeenCalled();

    await act(async () => {
      finishStage({ success: true });
      await stagePromise;
    });
    expect(result.current.busyAction).toBeNull();
  });

  it("refreshes every three seconds while visible and cleans up its timer", async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const { result, unmount } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client, true),
    });

    await act(async () => Promise.resolve());
    expect(result.current.snapshot).toEqual(initialSnapshot);
    expect(client.getSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(client.getSnapshot).toHaveBeenCalledTimes(2);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
