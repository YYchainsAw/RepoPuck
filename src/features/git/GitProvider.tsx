import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useI18n } from "../../i18n";
import { getGitCopy, localizeGitMessage } from "../../i18n/git";
import { createGitClient } from "./client";
import type {
  AiCommitPreferences,
  CommitAndPushResult,
  GenerateCommitMessageResult,
  GitClient,
  OperationResult,
  RepositorySnapshot,
} from "./types";
import {
  GitWorkspaceContext,
  type GitAction,
  type GitWorkspaceValue,
} from "./useGitWorkspace";

export interface GitProviderProps extends PropsWithChildren {
  client?: GitClient;
  visible?: boolean;
  pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const FULL_REFRESH_INTERVAL_MS = 60_000;

const getErrorMessage = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason);

const repositoriesEqual = (
  left: RepositorySnapshot["repository"] | null,
  right: RepositorySnapshot["repository"],
) =>
  left !== null &&
  left.name === right.name &&
  left.path === right.path &&
  left.selectionPath === right.selectionPath &&
  left.remoteName === right.remoteName &&
  left.remoteUrl === right.remoteUrl;

const snapshotsEqual = (
  left: RepositorySnapshot | null,
  right: RepositorySnapshot,
) =>
  left !== null &&
  repositoriesEqual(left.repository, right.repository) &&
  left.currentBranch === right.currentBranch &&
  left.ahead === right.ahead &&
  left.behind === right.behind &&
  left.gameProject?.name === right.gameProject?.name &&
  left.gameProject?.engine === right.gameProject?.engine &&
  left.gameProject?.version === right.gameProject?.version &&
  left.gameProject?.descriptorPath === right.gameProject?.descriptorPath &&
  (left.gameSafetyIssues ?? []).length ===
    (right.gameSafetyIssues ?? []).length &&
  (left.gameSafetyIssues ?? []).every((issue, index) => {
    const candidate = (right.gameSafetyIssues ?? [])[index];
    return (
      candidate !== undefined &&
      issue.kind === candidate.kind &&
      issue.severity === candidate.severity &&
      issue.path === candidate.path &&
      issue.message === candidate.message
    );
  }) &&
  left.branches.length === right.branches.length &&
  left.branches.every((branch, index) => {
    const candidate = right.branches[index];
    return (
      candidate !== undefined &&
      branch.name === candidate.name &&
      branch.isCurrent === candidate.isCurrent &&
      branch.upstream === candidate.upstream
    );
  }) &&
  left.changes.length === right.changes.length &&
  left.changes.every((change, index) => {
    const candidate = right.changes[index];
    return (
      candidate !== undefined &&
      change.path === candidate.path &&
      change.kind === candidate.kind &&
      change.staged === candidate.staged &&
      change.untracked === candidate.untracked &&
      change.additions === candidate.additions &&
      change.deletions === candidate.deletions &&
      change.gameCategory === candidate.gameCategory
    );
  });

const normalizeGameMetadata = (
  snapshot: RepositorySnapshot,
): RepositorySnapshot => {
  const engine = snapshot.gameProject?.engine;
  const gameProjectDetected = engine === "unity" || engine === "unreal";
  if (gameProjectDetected) return snapshot;

  const hasGameMetadata =
    snapshot.gameProject !== undefined ||
    snapshot.gameSafetyIssues !== undefined ||
    snapshot.changes.some((change) => change.gameCategory !== undefined);
  if (!hasGameMetadata) return snapshot;

  return {
    ...snapshot,
    gameProject: undefined,
    gameSafetyIssues: undefined,
    changes: snapshot.changes.map((change) => {
      const plainChange = { ...change };
      delete plainChange.gameCategory;
      return plainChange;
    }),
  };
};

interface RefreshFlight {
  client: GitClient;
  generation: number;
  promise: Promise<boolean>;
}

interface MutationFlight {
  token: symbol;
  action: GitAction;
  client: GitClient;
  generation: number;
}

interface AiGenerationFlight {
  token: symbol;
  client: GitClient;
  generation: number;
}

interface MutationOptions {
  submittedMessage?: string;
  refreshOnFailure?: boolean;
}

interface PendingRefresh {
  client: GitClient;
  generation: number;
}

interface RefreshTokenState {
  client: GitClient;
  generation: number;
  value: string;
  fullRefreshAt: number;
}

type Feedback =
  | { kind: "message"; message: string }
  | { kind: "actionFailed"; action: GitAction }
  | { kind: "commitPushPartialFailure"; message: string }
  | {
      kind: "aiGenerated";
      truncated: boolean;
      excludedFileCount: number;
    };

const formatFeedback = (
  feedback: Feedback | null,
  language: ReturnType<typeof useI18n>["language"],
): string | null => {
  if (!feedback) return null;
  const copy = getGitCopy(language);
  if (feedback.kind === "commitPushPartialFailure") {
    return copy.commitSucceededPushFailed(
      localizeGitMessage(feedback.message, language),
    );
  }
  if (feedback.kind === "message") {
    return localizeGitMessage(feedback.message, language);
  }
  if (feedback.kind === "actionFailed") {
    return copy.actionFailed(feedback.action);
  }

  const details = [
    feedback.truncated ? copy.stagedDiffTruncated : null,
    feedback.excludedFileCount > 0
      ? copy.sensitiveFilesExcluded(feedback.excludedFileCount)
      : null,
  ].filter((detail): detail is string => detail !== null);
  return copy.generated(details);
};

const isCommitAndPushResult = (
  result: OperationResult,
): result is CommitAndPushResult =>
  "committed" in result &&
  "pushed" in result &&
  "stage" in result &&
  typeof result.committed === "boolean" &&
  typeof result.pushed === "boolean";

export function GitProvider({
  children,
  client: injectedClient,
  visible = true,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: GitProviderProps) {
  const { language } = useI18n();
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
  const [cancellingOperation, setCancellingOperation] = useState(false);
  const [generatingCommitMessage, setGeneratingCommitMessage] = useState(false);
  const [noticeFeedback, setNoticeFeedback] = useState<Feedback | null>(null);
  const [actionErrorFeedback, setActionErrorFeedback] =
    useState<Feedback | null>(null);
  const [refreshErrorFeedback, setRefreshErrorFeedback] =
    useState<Feedback | null>(null);
  const mutationRef = useRef<MutationFlight | null>(null);
  const cancellationRequestRef = useRef<symbol | null>(null);
  const aiGenerationRef = useRef<AiGenerationFlight | null>(null);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const inFlightRef = useRef<RefreshFlight | null>(null);
  const pendingRefreshRef = useRef<PendingRefresh | null>(null);
  const refreshTokenRef = useRef<RefreshTokenState | null>(null);
  const tokenCheckInFlightRef = useRef(false);
  const clientRef = useRef(client);
  const visibleRef = useRef(visible);
  clientRef.current = client;
  visibleRef.current = visible;

  const performRefresh = useCallback(
    (targetClient: GitClient, generation: number): Promise<boolean> => {
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
        promise: Promise.resolve(false),
      };
      flight.promise = Promise.resolve().then(async () => {
        try {
          const nextSnapshot = normalizeGameMetadata(
            await targetClient.getSnapshot(),
          );
          if (!isCurrent()) return false;
          setSnapshot((current) =>
            snapshotsEqual(current, nextSnapshot) ? current : nextSnapshot,
          );
          setSelectedRepository((current) =>
            repositoriesEqual(current, nextSnapshot.repository)
              ? current
              : nextSnapshot.repository,
          );
          setRefreshErrorFeedback(null);
          return true;
        } catch (reason) {
          if (!isCurrent()) return false;
          const message = getErrorMessage(reason);
          if (/^No repository is selected[.!]?$/i.test(message)) {
            setSnapshot(null);
            setSelectedRepository(null);
            setRefreshErrorFeedback(null);
            return true;
          } else {
            setRefreshErrorFeedback({ kind: "message", message });
            return false;
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

  const refreshFromCurrentState = useCallback(
    async (
      targetClient: GitClient,
      generation: number,
      force: boolean,
    ): Promise<void> => {
      if (!targetClient.getRefreshToken) {
        await performRefresh(targetClient, generation);
        return;
      }
      if (!force && tokenCheckInFlightRef.current) return;
      if (!force) tokenCheckInFlightRef.current = true;

      let token: string;
      try {
        token = await targetClient.getRefreshToken();
      } catch {
        await performRefresh(targetClient, generation);
        return;
      } finally {
        if (!force) tokenCheckInFlightRef.current = false;
      }
      if (
        !mountedRef.current ||
        !visibleRef.current ||
        clientRef.current !== targetClient ||
        generationRef.current !== generation
      ) {
        return;
      }

      const cached = refreshTokenRef.current;
      const fullRefreshDue =
        !cached ||
        cached.client !== targetClient ||
        cached.generation !== generation ||
        Date.now() - cached.fullRefreshAt >= FULL_REFRESH_INTERVAL_MS;
      if (!force && !fullRefreshDue && cached.value === token) {
        return;
      }

      const refreshed = await performRefresh(targetClient, generation);
      if (
        refreshed &&
        mountedRef.current &&
        visibleRef.current &&
        clientRef.current === targetClient &&
        generationRef.current === generation
      ) {
        refreshTokenRef.current = {
          client: targetClient,
          generation,
          value: token,
          fullRefreshAt: Date.now(),
        };
      }
    },
    [performRefresh],
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (
      !mountedRef.current ||
      !visibleRef.current ||
      mutationRef.current
    ) {
      return;
    }
    const targetClient = clientRef.current;
    const generation = generationRef.current;
    const existing = inFlightRef.current;
    if (
      existing?.client === targetClient &&
      existing.generation === generation
    ) {
      pendingRefreshRef.current = { client: targetClient, generation };
      await existing.promise;
      const pending = pendingRefreshRef.current;
      if (
        pending?.client !== targetClient ||
        pending.generation !== generation ||
        !mountedRef.current ||
        !visibleRef.current ||
        clientRef.current !== targetClient ||
        generationRef.current !== generation
      ) {
        return;
      }
      pendingRefreshRef.current = null;
    }
    await refreshFromCurrentState(targetClient, generation, true);
  }, [refreshFromCurrentState]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      inFlightRef.current = null;
      pendingRefreshRef.current = null;
      refreshTokenRef.current = null;
      tokenCheckInFlightRef.current = false;
      mutationRef.current = null;
      cancellationRequestRef.current = null;
      aiGenerationRef.current = null;
    };
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    pendingRefreshRef.current = null;
    refreshTokenRef.current = null;
    tokenCheckInFlightRef.current = false;
    if (mutationRef.current) {
      mutationRef.current = null;
      setBusyAction(null);
    }
    cancellationRequestRef.current = null;
    setCancellingOperation(false);
    if (aiGenerationRef.current) {
      aiGenerationRef.current = null;
      setGeneratingCommitMessage(false);
    }
    setActionErrorFeedback(null);
    setNoticeFeedback(null);
    if (!visible) return;

    void refreshFromCurrentState(client, generation, true);

    const timer = window.setInterval(() => {
      if (!mutationRef.current) {
        void refreshFromCurrentState(client, generation, false);
      }
    }, pollIntervalMs);
    return () => {
      window.clearInterval(timer);
      if (generationRef.current === generation) {
        generationRef.current += 1;
      }
    };
  }, [client, pollIntervalMs, refreshFromCurrentState, visible]);

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
      await refreshFromCurrentState(targetClient, generation, true);
      return isCurrent();
    },
    [refreshFromCurrentState],
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

      if (aiGenerationRef.current) {
        aiGenerationRef.current = null;
        setGeneratingCommitMessage(false);
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
      cancellationRequestRef.current = null;
      setCancellingOperation(false);
      setBusyAction(action);
      setActionErrorFeedback(null);
      setNoticeFeedback(null);

      try {
        const result = await operation(targetClient);
        if (!isCurrent()) return false;

        if (!result.success) {
          if (/cancelled/i.test(result.message ?? "")) {
            setNoticeFeedback(
              result.message ? { kind: "message", message: result.message } : null,
            );
            return false;
          }
          const commitCompleted =
            action === "commitAndPush" &&
            isCommitAndPushResult(result) &&
            result.committed;
          if (
            commitCompleted &&
            options.submittedMessage !== undefined
          ) {
            setCommitMessage((currentDraft) =>
              currentDraft === options.submittedMessage ? "" : currentDraft,
            );
          }
          const feedback: Feedback =
            commitCompleted && result.message
              ? {
                  kind: "commitPushPartialFailure",
                  message: result.message,
                }
              : result.message
                ? { kind: "message", message: result.message }
                : { kind: "actionFailed", action };
          setActionErrorFeedback(feedback);
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
            setActionErrorFeedback(feedback);
          }
          return false;
        }

        if (options.submittedMessage !== undefined) {
          setCommitMessage((currentDraft) =>
            currentDraft === options.submittedMessage ? "" : currentDraft,
          );
        }
        setNoticeFeedback(
          result.message
            ? { kind: "message", message: result.message }
            : null,
        );
        return await refreshAfterMutation(targetClient, generation, isCurrent);
      } catch (reason) {
        if (!isCurrent()) return false;
        setActionErrorFeedback({
          kind: "message",
          message: getErrorMessage(reason),
        });
        return false;
      } finally {
        if (isCurrent()) {
          mutationRef.current = null;
          cancellationRequestRef.current = null;
          setCancellingOperation(false);
          setBusyAction(null);
        }
      }
    },
    [refreshAfterMutation],
  );

  const cancelOperation = useCallback(async (): Promise<boolean> => {
    const mutation = mutationRef.current;
    if (
      !mutation ||
      mutation.action !== "fetch" ||
      cancellationRequestRef.current ||
      !mountedRef.current ||
      !visibleRef.current
    ) {
      return false;
    }

    const token = Symbol("cancelGitOperation");
    cancellationRequestRef.current = token;
    setCancellingOperation(true);
    try {
      const result = await mutation.client.cancelOperation();
      if (
        cancellationRequestRef.current !== token ||
        mutationRef.current?.token !== mutation.token
      ) {
        return false;
      }
      if (!result.success) {
        setActionErrorFeedback(
          result.message
            ? { kind: "message", message: result.message }
            : { kind: "actionFailed", action: mutation.action },
        );
      }
      return result.success;
    } catch (reason) {
      if (cancellationRequestRef.current !== token) return false;
      setActionErrorFeedback({
        kind: "message",
        message: getErrorMessage(reason),
      });
      return false;
    } finally {
      if (cancellationRequestRef.current === token) {
        cancellationRequestRef.current = null;
        setCancellingOperation(false);
      }
    }
  }, []);

  const updateCommitMessage = useCallback((message: string) => {
    if (aiGenerationRef.current) {
      aiGenerationRef.current = null;
      setGeneratingCommitMessage(false);
    }
    setCommitMessage(message);
  }, []);

  const generateCommitMessage = useCallback(
    async (request: AiCommitPreferences): Promise<boolean> => {
      if (
        aiGenerationRef.current ||
        mutationRef.current ||
        !mountedRef.current ||
        !visibleRef.current
      ) {
        return false;
      }

      const targetClient = clientRef.current;
      const generation = generationRef.current;
      const flight: AiGenerationFlight = {
        token: Symbol("generateCommitMessage"),
        client: targetClient,
        generation,
      };
      const isCurrent = () =>
        mountedRef.current &&
        visibleRef.current &&
        clientRef.current === targetClient &&
        generationRef.current === generation &&
        aiGenerationRef.current?.token === flight.token;

      aiGenerationRef.current = flight;
      setGeneratingCommitMessage(true);
      setActionErrorFeedback(null);
      setNoticeFeedback(null);

      try {
        const result: GenerateCommitMessageResult =
          await targetClient.generateCommitMessage(request);
        if (!isCurrent()) return false;

        setCommitMessage(result.message);
        setNoticeFeedback({
          kind: "aiGenerated",
          truncated: result.truncated,
          excludedFileCount: result.excludedFiles.length,
        });
        return true;
      } catch (reason) {
        if (!isCurrent()) return false;
        setActionErrorFeedback({
          kind: "message",
          message: getErrorMessage(reason),
        });
        return false;
      } finally {
        if (isCurrent()) {
          aiGenerationRef.current = null;
          setGeneratingCommitMessage(false);
        }
      }
    },
    [],
  );

  const notice = formatFeedback(noticeFeedback, language);
  const error = formatFeedback(
    actionErrorFeedback ?? refreshErrorFeedback,
    language,
  );

  const value = useMemo<GitWorkspaceValue>(
    () => ({
      snapshot,
      selectedRepository,
      commitMessage,
      busyAction,
      cancellingOperation,
      generatingCommitMessage,
      notice,
      clearNotice: () => setNoticeFeedback(null),
      error,
      refresh,
      setCommitMessage: updateCommitMessage,
      generateCommitMessage,
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
      cancelOperation,
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
      cancelOperation,
      cancellingOperation,
      client,
      commitMessage,
      generateCommitMessage,
      generatingCommitMessage,
      error,
      notice,
      refresh,
      runMutation,
      selectedRepository,
      snapshot,
      updateCommitMessage,
    ],
  );

  return (
    <GitWorkspaceContext.Provider value={value}>
      {children}
    </GitWorkspaceContext.Provider>
  );
}
