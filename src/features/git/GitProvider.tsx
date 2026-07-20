import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { createGitClient } from "./client";
import type { GitClient, OperationResult, RepositorySnapshot } from "./types";
import {
  GitWorkspaceContext,
  type GitAction,
  type GitWorkspaceValue,
} from "./useGitWorkspace";

export interface GitProviderProps extends PropsWithChildren {
  client?: GitClient;
  visible?: boolean;
}

const getErrorMessage = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason);

export function GitProvider({
  children,
  client: injectedClient,
  visible = true,
}: GitProviderProps) {
  const client = useMemo(
    () => injectedClient ?? createGitClient(),
    [injectedClient],
  );
  const [snapshot, setSnapshot] = useState<RepositorySnapshot | null>(null);
  const [selectedRepository, setSelectedRepository] = useState<
    RepositorySnapshot["repository"] | null
  >(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [busyAction, setBusyAction] = useState<GitAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef<GitAction | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nextSnapshot = await client.getSnapshot();
      setSnapshot(nextSnapshot);
      setSelectedRepository(nextSnapshot.repository);
      setError(null);
    } catch (reason) {
      setError(getErrorMessage(reason));
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!visible) return;

    const timer = window.setInterval(() => {
      if (!busyRef.current) void refresh();
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [refresh, visible]);

  const runMutation = useCallback(
    async (
      action: GitAction,
      operation: () => Promise<OperationResult>,
      clearCommitMessage = false,
    ): Promise<boolean> => {
      if (busyRef.current) return false;

      busyRef.current = action;
      setBusyAction(action);
      setError(null);
      setNotice(null);

      try {
        const result = await operation();
        if (!result.success) {
          setError(result.message ?? `${action} failed`);
          return false;
        }

        if (clearCommitMessage) setCommitMessage("");
        setNotice(result.message ?? null);
        await refresh();
        return true;
      } catch (reason) {
        setError(getErrorMessage(reason));
        return false;
      } finally {
        busyRef.current = null;
        setBusyAction(null);
      }
    },
    [refresh],
  );

  const value = useMemo<GitWorkspaceValue>(
    () => ({
      snapshot,
      selectedRepository,
      commitMessage,
      busyAction,
      notice,
      error,
      refresh,
      setCommitMessage,
      selectRepository: (path) =>
        runMutation("selectRepository", () => client.selectRepository(path)),
      setStaged: (paths, staged) =>
        runMutation(staged ? "stage" : "unstage", () =>
          staged ? client.stage(paths) : client.unstage(paths),
        ),
      commit: () =>
        runMutation("commit", () => client.commit(commitMessage), true),
      push: () => runMutation("push", () => client.push()),
      commitAndPush: () =>
        runMutation(
          "commitAndPush",
          () => client.commitAndPush(commitMessage),
          true,
        ),
      switchBranch: (branch) =>
        runMutation("switchBranch", () => client.switchBranch(branch)),
      createBranch: (branch) =>
        runMutation("createBranch", () => client.createBranch(branch)),
      fetch: () => runMutation("fetch", () => client.fetch()),
      pull: () => runMutation("pull", () => client.pull()),
      stash: () => runMutation("stash", () => client.stash()),
      openTerminal: () =>
        runMutation("openTerminal", () => client.openTerminal()),
      openExplorer: () =>
        runMutation("openExplorer", () => client.openExplorer()),
    }),
    [
      busyAction,
      client,
      commitMessage,
      error,
      notice,
      refresh,
      runMutation,
      selectedRepository,
      snapshot,
    ],
  );

  return (
    <GitWorkspaceContext.Provider value={value}>
      {children}
    </GitWorkspaceContext.Provider>
  );
}
