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
  promise: Promise<void>;
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

type Feedback =
  | { kind: "message"; message: string }
  | { kind: "actionFailed"; action: GitAction }
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
  const [generatingCommitMessage, setGeneratingCommitMessage] = useState(false);
  const [noticeFeedback, setNoticeFeedback] = useState<Feedback | null>(null);
  const [actionErrorFeedback, setActionErrorFeedback] =
    useState<Feedback | null>(null);
  const [refreshErrorFeedback, setRefreshErrorFeedback] =
    useState<Feedback | null>(null);
  const mutationRef = useRef<MutationFlight | null>(null);
  const aiGenerationRef = useRef<AiGenerationFlight | null>(null);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const inFlightRef = useRef<RefreshFlight | null>(null);
  const pendingRefreshRef = useRef<PendingRefresh | null>(null);
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
          const nextSnapshot = normalizeGameMetadata(
            await targetClient.getSnapshot(),
          );
          if (!isCurrent()) return;
          setSnapshot((current) =>
            snapshotsEqual(current, nextSnapshot) ? current : nextSnapshot,
          );
          setSelectedRepository((current) =>
            repositoriesEqual(current, nextSnapshot.repository)
              ? current
              : nextSnapshot.repository,
          );
          setRefreshErrorFeedback(null);
        } catch (reason) {
          if (!isCurrent()) return;
          const message = getErrorMessage(reason);
          if (/^No repository is selected[.!]?$/i.test(message)) {
            setSnapshot(null);
            setSelectedRepository(null);
            setRefreshErrorFeedback(null);
          } else {
            setRefreshErrorFeedback({ kind: "message", message });
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

  const refresh = useCallback(async (): Promise<void> => {
    if (!mountedRef.current || !visibleRef.current) {
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
    await performRefresh(targetClient, generation);
  }, [performRefresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      inFlightRef.current = null;
      pendingRefreshRef.current = null;
      mutationRef.current = null;
      aiGenerationRef.current = null;
    };
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    pendingRefreshRef.current = null;
    if (mutationRef.current) {
      mutationRef.current = null;
      setBusyAction(null);
    }
    if (aiGenerationRef.current) {
      aiGenerationRef.current = null;
      setGeneratingCommitMessage(false);
    }
    setActionErrorFeedback(null);
    setNoticeFeedback(null);
    if (!visible) return;

    void performRefresh(client, generation);

    const timer = window.setInterval(() => {
      if (!mutationRef.current) void performRefresh(client, generation);
    }, pollIntervalMs);
    return () => {
      window.clearInterval(timer);
      if (generationRef.current === generation) {
        generationRef.current += 1;
      }
    };
  }, [client, performRefresh, pollIntervalMs, visible]);

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
      setBusyAction(action);
      setActionErrorFeedback(null);
      setNoticeFeedback(null);

      try {
        const result = await operation(targetClient);
        if (!isCurrent()) return false;

        if (!result.success) {
          const feedback: Feedback = result.message
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
          setBusyAction(null);
        }
      }
    },
    [refreshAfterMutation],
  );

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
