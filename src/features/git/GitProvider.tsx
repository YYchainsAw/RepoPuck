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

interface MutationFlight {
  token: symbol;
  action: GitAction;
  client: GitClient;
  generation: number;
}

interface MutationOptions {
  submittedMessage?: string;
  refreshOnFailure?: boolean;
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
  const mutationRef = useRef<MutationFlight | null>(null);
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
      mutationRef.current = null;
    };
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    if (mutationRef.current) {
      mutationRef.current = null;
      setBusyAction(null);
    }
    setActionError(null);
    setNotice(null);
    if (!visible) return;

    void performRefresh(client, generation);

    const timer = window.setInterval(() => {
      if (!mutationRef.current) void refresh();
    }, 3_000);
    return () => {
      window.clearInterval(timer);
      if (generationRef.current === generation) {
        generationRef.current += 1;
      }
    };
  }, [client, performRefresh, refresh, visible]);

  const refreshAfterMutation = useCallback(
    async (
      targetClient: GitClient,
      generation: number,
      isCurrent: () => boolean,
    ): Promise<boolean> => {
      const existing = inFlightRef.current;
      if (
        existing?.client === targetClient &&
        existing.generation === generation
      ) {
        await existing.promise;
        if (!isCurrent()) return false;
      }
      await performRefresh(targetClient, generation);
      return isCurrent();
    },
    [performRefresh],
  );

  const runMutation = useCallback(
    async (
      action: GitAction,
      operation: (targetClient: GitClient) => Promise<OperationResult>,
      options: MutationOptions = {},
    ): Promise<boolean> => {
      if (
        mutationRef.current ||
        !mountedRef.current ||
        !visibleRef.current
      ) {
        return false;
      }

      const targetClient = clientRef.current;
      const generation = generationRef.current;
      const mutation: MutationFlight = {
        token: Symbol(action),
        action,
        client: targetClient,
        generation,
      };
      const isCurrent = () =>
        mountedRef.current &&
        visibleRef.current &&
        clientRef.current === targetClient &&
        generationRef.current === generation &&
        mutationRef.current?.token === mutation.token;

      mutationRef.current = mutation;
      setBusyAction(action);
      setActionError(null);
      setNotice(null);

      try {
        const result = await operation(targetClient);
        if (!isCurrent()) return false;

        if (!result.success) {
          const message = result.message ?? `${action} failed`;
          setActionError(message);
          if (options.refreshOnFailure) {
            if (
              !(await refreshAfterMutation(
                targetClient,
                generation,
                isCurrent,
              ))
            ) {
              return false;
            }
            setActionError(message);
          }
          return false;
        }

        if (options.submittedMessage !== undefined) {
          setCommitMessage((currentDraft) =>
            currentDraft === options.submittedMessage ? "" : currentDraft,
          );
        }
        setNotice(result.message ?? null);
        return await refreshAfterMutation(targetClient, generation, isCurrent);
      } catch (reason) {
        if (!isCurrent()) return false;
        setActionError(getErrorMessage(reason));
        return false;
      } finally {
        if (isCurrent()) {
          mutationRef.current = null;
          setBusyAction(null);
        }
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
      clearNotice: () => setNotice(null),
      error: actionError ?? refreshError,
      refresh,
      setCommitMessage,
      selectRepository: (path) =>
        runMutation("selectRepository", (targetClient) =>
          targetClient.selectRepository(path),
        ),
      setStaged: (paths, staged) =>
        runMutation(staged ? "stage" : "unstage", (targetClient) =>
          staged ? targetClient.stage(paths) : targetClient.unstage(paths),
        ),
      commit: () =>
        runMutation(
          "commit",
          (targetClient) => targetClient.commit(commitMessage),
          { submittedMessage: commitMessage },
        ),
      amendLastCommit: () => {
        const submittedMessage = commitMessage;
        const message = submittedMessage.trim() ? submittedMessage : undefined;
        return runMutation(
          "amendLastCommit",
          (targetClient) => targetClient.amendLastCommit(message),
          { submittedMessage },
        );
      },
      push: () => runMutation("push", (targetClient) => targetClient.push()),
      commitAndPush: () =>
        runMutation(
          "commitAndPush",
          (targetClient) => targetClient.commitAndPush(commitMessage),
          { submittedMessage: commitMessage, refreshOnFailure: true },
        ),
      switchBranch: (branch) =>
        runMutation("switchBranch", (targetClient) =>
          targetClient.switchBranch(branch),
        ),
      createBranch: (branch) =>
        runMutation("createBranch", (targetClient) =>
          targetClient.createBranch(branch),
        ),
      fetch: () => runMutation("fetch", (targetClient) => targetClient.fetch()),
      pull: () => runMutation("pull", (targetClient) => targetClient.pull()),
      stash: () => runMutation("stash", (targetClient) => targetClient.stash()),
      openTerminal: () =>
        runMutation("openTerminal", (targetClient) =>
          targetClient.openTerminal(),
        ),
      openExplorer: () =>
        runMutation("openExplorer", (targetClient) =>
          targetClient.openExplorer(),
        ),
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
