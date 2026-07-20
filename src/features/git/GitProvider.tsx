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

interface RefreshFlight {
  client: GitClient;
  generation: number;
  promise: Promise<void>;
}

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
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const busyRef = useRef<GitAction | null>(null);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const inFlightRef = useRef<RefreshFlight | null>(null);
  const clientRef = useRef(client);
  const visibleRef = useRef(visible);
  clientRef.current = client;
  visibleRef.current = visible;

  const performRefresh = useCallback(
    (targetClient: GitClient, generation: number): Promise<void> => {
      const existing = inFlightRef.current;
      if (
        existing?.client === targetClient &&
        existing.generation === generation
      ) {
        return existing.promise;
      }

      const isCurrent = () =>
        mountedRef.current &&
        visibleRef.current &&
        clientRef.current === targetClient &&
        generationRef.current === generation;
      const flight: RefreshFlight = {
        client: targetClient,
        generation,
        promise: Promise.resolve(),
      };
      flight.promise = Promise.resolve().then(async () => {
        try {
          const nextSnapshot = await targetClient.getSnapshot();
          if (!isCurrent()) return;
          setSnapshot(nextSnapshot);
          setSelectedRepository(nextSnapshot.repository);
          setRefreshError(null);
        } catch (reason) {
          if (!isCurrent()) return;
          const message = getErrorMessage(reason);
          if (/^No repository is selected[.!]?$/i.test(message)) {
            setSnapshot(null);
            setSelectedRepository(null);
            setRefreshError(null);
          } else {
            setRefreshError(message);
          }
        } finally {
          if (inFlightRef.current === flight) {
            inFlightRef.current = null;
          }
        }
      });
      inFlightRef.current = flight;
      return flight.promise;
    },
    [],
  );

  const refresh = useCallback((): Promise<void> => {
    if (!mountedRef.current || !visibleRef.current) {
      return Promise.resolve();
    }
    return performRefresh(clientRef.current, generationRef.current);
  }, [performRefresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      inFlightRef.current = null;
    };
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    if (!visible) return;

    void performRefresh(client, generation);

    const timer = window.setInterval(() => {
      if (!busyRef.current) void refresh();
    }, 3_000);
    return () => {
      window.clearInterval(timer);
      if (generationRef.current === generation) {
        generationRef.current += 1;
      }
    };
  }, [client, performRefresh, refresh, visible]);

  const refreshAfterMutation = useCallback(async () => {
    const targetClient = clientRef.current;
    const generation = generationRef.current;
    const existing = inFlightRef.current;
    if (
      existing?.client === targetClient &&
      existing.generation === generation
    ) {
      await existing.promise;
    }
    if (
      mountedRef.current &&
      visibleRef.current &&
      clientRef.current === targetClient &&
      generationRef.current === generation
    ) {
      await performRefresh(targetClient, generation);
    }
  }, [performRefresh]);

  const runMutation = useCallback(
    async (
      action: GitAction,
      operation: () => Promise<OperationResult>,
      clearCommitMessage = false,
      refreshOnFailure = false,
    ): Promise<boolean> => {
      if (busyRef.current) return false;

      busyRef.current = action;
      setBusyAction(action);
      setActionError(null);
      setNotice(null);

      try {
        const result = await operation();
        if (!result.success) {
          const message = result.message ?? `${action} failed`;
          setActionError(message);
          if (refreshOnFailure) {
            await refreshAfterMutation();
            setActionError(message);
          }
          return false;
        }

        if (clearCommitMessage) setCommitMessage("");
        setNotice(result.message ?? null);
        await refreshAfterMutation();
        return true;
      } catch (reason) {
        setActionError(getErrorMessage(reason));
        return false;
      } finally {
        busyRef.current = null;
        setBusyAction(null);
      }
    },
    [refreshAfterMutation],
  );

  const value = useMemo<GitWorkspaceValue>(
    () => ({
      snapshot,
      selectedRepository,
      commitMessage,
      busyAction,
      notice,
      error: actionError ?? refreshError,
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
      actionError,
      notice,
      refresh,
      refreshError,
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
