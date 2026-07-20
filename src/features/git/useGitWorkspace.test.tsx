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

function createWrapper(client: GitClient, visible = true) {
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

  it("treats an initial missing repository as an empty state", async () => {
    const client = createTestClient();
    let rejectSnapshot!: (reason: Error) => void;
    client.getSnapshot.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSnapshot = reject;
        }),
    );
    const { result } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(client.getSnapshot).toHaveBeenCalledTimes(1));

    await act(async () => {
      rejectSnapshot(new Error("No repository is selected"));
      await Promise.resolve();
    });

    expect(result.current.snapshot).toBeNull();
    expect(result.current.selectedRepository).toBeNull();
    expect(result.current.error).toBeNull();
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

  it("keeps an action error through background refresh until the next action", async () => {
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
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe("Nothing to commit");

    await act(async () => {
      await result.current.push();
    });
    expect(result.current.error).toBeNull();
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

  it("preserves a newer draft typed while commit is pending", async () => {
    const client = createTestClient();
    let finishCommit!: (result: OperationResult) => void;
    client.commit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCommit = resolve;
        }),
    );
    const { result } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    act(() => result.current.setCommitMessage("Submitted draft"));
    let commitPromise!: Promise<boolean>;
    act(() => {
      commitPromise = result.current.commit();
    });
    await waitFor(() => expect(result.current.busyAction).toBe("commit"));
    act(() => result.current.setCommitMessage("New draft"));

    await act(async () => {
      finishCommit({ success: true });
      await commitPromise;
    });

    expect(result.current.commitMessage).toBe("New draft");
  });

  it("retains the message when a commit invocation rejects", async () => {
    const client = createTestClient();
    client.commit.mockRejectedValueOnce(new Error("Native bridge unavailable"));
    const { result } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    act(() => result.current.setCommitMessage("Retry this commit"));
    await act(async () => {
      await result.current.commit();
    });

    expect(result.current.commitMessage).toBe("Retry this commit");
    expect(result.current.error).toBe("Native bridge unavailable");
  });

  it("refreshes partial commit-and-push failure without clearing its message or error", async () => {
    const client = createTestClient();
    const committedSnapshot = {
      ...cloneSnapshot(initialSnapshot),
      ahead: 1,
      changes: [],
    };
    client.getSnapshot
      .mockResolvedValueOnce(cloneSnapshot(initialSnapshot))
      .mockResolvedValueOnce(committedSnapshot);
    client.commitAndPush.mockResolvedValueOnce({
      success: false,
      message: "Push failed after commit",
    });
    const { result } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    act(() => result.current.setCommitMessage("Commit before push"));
    await act(async () => {
      await result.current.commitAndPush();
    });

    expect(client.getSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.snapshot).toEqual(committedSnapshot);
    expect(result.current.commitMessage).toBe("Commit before push");
    expect(result.current.error).toBe("Push failed after commit");
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

  it("keeps slow polling refreshes single-flight", async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    let finishSnapshot!: (snapshot: RepositorySnapshot) => void;
    const slowSnapshot = new Promise<RepositorySnapshot>((resolve) => {
      finishSnapshot = resolve;
    });
    client.getSnapshot.mockImplementation(() => slowSnapshot);
    const { result } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client, true),
    });
    await act(async () => Promise.resolve());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(client.getSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishSnapshot(cloneSnapshot(initialSnapshot));
      await slowSnapshot;
    });
    expect(result.current.snapshot).toEqual(initialSnapshot);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(client.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("ignores a pending refresh when the panel becomes hidden", async () => {
    const client = createTestClient();
    let finishSnapshot!: (snapshot: RepositorySnapshot) => void;
    client.getSnapshot.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSnapshot = resolve;
        }),
    );
    let visible = true;
    const wrapper = ({ children }: PropsWithChildren) => (
      <GitProvider client={client} visible={visible}>
        {children}
      </GitProvider>
    );
    const { result, rerender } = renderHook(() => useGitWorkspace(), {
      wrapper,
    });
    await waitFor(() => expect(client.getSnapshot).toHaveBeenCalledTimes(1));

    visible = false;
    rerender();
    await act(async () => {
      finishSnapshot(cloneSnapshot(initialSnapshot));
      await Promise.resolve();
    });

    expect(result.current.snapshot).toBeNull();
    expect(result.current.selectedRepository).toBeNull();
  });

  it("ignores a pending refresh from a replaced client", async () => {
    const oldClient = createTestClient();
    const newClient = createTestClient();
    const newSnapshot = {
      ...cloneSnapshot(initialSnapshot),
      currentBranch: "develop",
    };
    let finishOldSnapshot!: (snapshot: RepositorySnapshot) => void;
    oldClient.getSnapshot.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldSnapshot = resolve;
        }),
    );
    newClient.getSnapshot.mockResolvedValue(newSnapshot);
    let activeClient: GitClient = oldClient;
    const wrapper = ({ children }: PropsWithChildren) => (
      <GitProvider client={activeClient}>{children}</GitProvider>
    );
    const { result, rerender } = renderHook(() => useGitWorkspace(), {
      wrapper,
    });
    await waitFor(() => expect(oldClient.getSnapshot).toHaveBeenCalledTimes(1));

    activeClient = newClient;
    rerender();
    await waitFor(() => expect(result.current.snapshot).toEqual(newSnapshot));

    await act(async () => {
      finishOldSnapshot(cloneSnapshot(initialSnapshot));
      await Promise.resolve();
    });
    expect(result.current.snapshot).toEqual(newSnapshot);
  });

  it("ignores a successful mutation from a replaced client and preserves its new draft", async () => {
    const oldClient = createTestClient();
    const newClient = createTestClient();
    const newSnapshot = {
      ...cloneSnapshot(initialSnapshot),
      currentBranch: "develop",
    };
    newClient.getSnapshot.mockResolvedValue(newSnapshot);
    let finishOldCommit!: (result: OperationResult) => void;
    oldClient.commit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldCommit = resolve;
        }),
    );
    let activeClient: GitClient = oldClient;
    const wrapper = ({ children }: PropsWithChildren) => (
      <GitProvider client={activeClient}>{children}</GitProvider>
    );
    const { result, rerender } = renderHook(() => useGitWorkspace(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    act(() => result.current.setCommitMessage("Old draft"));
    let oldCommitPromise!: Promise<boolean>;
    act(() => {
      oldCommitPromise = result.current.commit();
    });
    await waitFor(() => expect(result.current.busyAction).toBe("commit"));

    activeClient = newClient;
    rerender();
    act(() => result.current.setCommitMessage("New client draft"));
    await waitFor(() => expect(result.current.snapshot).toEqual(newSnapshot));

    await act(async () => {
      finishOldCommit({ success: true, message: "Old commit completed" });
      await oldCommitPromise;
    });

    expect(result.current.commitMessage).toBe("New client draft");
    expect(result.current.notice).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.snapshot).toEqual(newSnapshot);
  });

  it("ignores a rejected mutation from a replaced client", async () => {
    const oldClient = createTestClient();
    const newClient = createTestClient();
    let rejectOldCommit!: (reason: Error) => void;
    oldClient.commit.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectOldCommit = reject;
        }),
    );
    let activeClient: GitClient = oldClient;
    const wrapper = ({ children }: PropsWithChildren) => (
      <GitProvider client={activeClient}>{children}</GitProvider>
    );
    const { result, rerender } = renderHook(() => useGitWorkspace(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    act(() => result.current.setCommitMessage("Old draft"));
    let oldCommitPromise!: Promise<boolean>;
    act(() => {
      oldCommitPromise = result.current.commit();
    });
    await waitFor(() => expect(result.current.busyAction).toBe("commit"));

    activeClient = newClient;
    rerender();
    act(() => result.current.setCommitMessage("New client draft"));
    await waitFor(() => expect(newClient.getSnapshot).toHaveBeenCalled());

    await act(async () => {
      rejectOldCommit(new Error("Old client failed"));
      await oldCommitPromise;
    });

    expect(result.current.commitMessage).toBe("New client draft");
    expect(result.current.error).toBeNull();
    expect(result.current.notice).toBeNull();
  });

  it("does not let an old mutation release a newer action token", async () => {
    const oldClient = createTestClient();
    const newClient = createTestClient();
    let finishOldCommit!: (result: OperationResult) => void;
    let finishNewPush!: (result: OperationResult) => void;
    oldClient.commit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldCommit = resolve;
        }),
    );
    newClient.push.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNewPush = resolve;
        }),
    );
    let activeClient: GitClient = oldClient;
    const wrapper = ({ children }: PropsWithChildren) => (
      <GitProvider client={activeClient}>{children}</GitProvider>
    );
    const { result, rerender } = renderHook(() => useGitWorkspace(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    act(() => result.current.setCommitMessage("Old draft"));
    let oldCommitPromise!: Promise<boolean>;
    act(() => {
      oldCommitPromise = result.current.commit();
    });
    await waitFor(() => expect(result.current.busyAction).toBe("commit"));

    activeClient = newClient;
    rerender();
    await waitFor(() => expect(result.current.busyAction).toBeNull());

    let newPushPromise!: Promise<boolean>;
    act(() => {
      newPushPromise = result.current.push();
    });
    await waitFor(() => expect(result.current.busyAction).toBe("push"));

    await act(async () => {
      finishOldCommit({ success: true });
      await oldCommitPromise;
    });
    expect(result.current.busyAction).toBe("push");

    await act(async () => {
      finishNewPush({ success: true });
      await newPushPromise;
    });
    expect(result.current.busyAction).toBeNull();
  });

  it("returns false when a pending mutation settles after unmount", async () => {
    const client = createTestClient();
    let finishCommit!: (result: OperationResult) => void;
    client.commit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCommit = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    act(() => result.current.setCommitMessage("Pending commit"));
    let commitPromise!: Promise<boolean>;
    act(() => {
      commitPromise = result.current.commit();
    });
    await waitFor(() => expect(result.current.busyAction).toBe("commit"));
    unmount();

    let completed!: boolean;
    await act(async () => {
      finishCommit({ success: true });
      completed = await commitPromise;
    });
    expect(completed).toBe(false);
  });

  it("forces a post-mutation snapshot after an older refresh completes", async () => {
    const client = createTestClient();
    const beforeMutation = cloneSnapshot(initialSnapshot);
    const afterMutation = {
      ...cloneSnapshot(initialSnapshot),
      ahead: 1,
    };
    let finishOldRefresh!: (snapshot: RepositorySnapshot) => void;
    client.getSnapshot
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldRefresh = resolve;
          }),
      )
      .mockResolvedValueOnce(afterMutation);
    const { result } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(client.getSnapshot).toHaveBeenCalledTimes(1));

    let pushPromise!: Promise<boolean>;
    act(() => {
      pushPromise = result.current.push();
    });
    await waitFor(() => expect(result.current.busyAction).toBe("push"));
    expect(client.getSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishOldRefresh(beforeMutation);
      await pushPromise;
    });

    expect(client.getSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.snapshot).toEqual(afterMutation);
  });

  it("leaves the last observable snapshot unchanged after unmount", async () => {
    const client = createTestClient();
    let finishSnapshot!: (snapshot: RepositorySnapshot) => void;
    let pendingSnapshot!: Promise<RepositorySnapshot>;
    client.getSnapshot.mockImplementationOnce(() => {
      pendingSnapshot = new Promise((resolve) => {
        finishSnapshot = resolve;
      });
      return pendingSnapshot;
    });
    const { result, unmount } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client, true),
    });
    await waitFor(() => expect(client.getSnapshot).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => {
      finishSnapshot(cloneSnapshot(initialSnapshot));
      await pendingSnapshot;
    });

    expect(result.current.snapshot).toBeNull();
    expect(result.current.selectedRepository).toBeNull();
  });
});
