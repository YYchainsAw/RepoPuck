// @vitest-environment jsdom

import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitProvider } from "./GitProvider";
import type {
  CommitAndPushResult,
  GenerateCommitMessageResult,
  GitClient,
  OperationResult,
  RepositorySnapshot,
} from "./types";
import { useGitWorkspace } from "./useGitWorkspace";

const i18nState = vi.hoisted(() => ({
  language: "en" as "en" | "zh-CN",
}));

vi.mock("../../i18n", () => ({
  useI18n: () => ({
    language: i18nState.language,
    t: (text: Record<"en" | "zh-CN", string>) => text[i18nState.language],
  }),
}));

const snapshot: RepositorySnapshot = {
  repository: {
    name: "repopuck",
    path: "C:\\Projects\\repopuck",
  },
  currentBranch: "main",
  branches: [{ name: "main", isCurrent: true, upstream: "origin/main" }],
  ahead: 0,
  behind: 0,
  changes: [
    {
      path: "src/App.tsx",
      kind: "modified",
      staged: true,
      untracked: false,
      additions: 2,
      deletions: 1,
    },
  ],
};

const aiPreferences = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  language: "en" as const,
  commitType: "feat" as const,
  scope: "ui",
};

function createClient(): GitClient {
  const success = async (): Promise<OperationResult> => ({ success: true });
  const commitAndPushSuccess =
    async (): Promise<CommitAndPushResult> => ({
      success: true,
      committed: true,
      pushed: true,
      stage: "complete",
      message: "Changes committed and pushed",
    });
  return {
    selectRepository: vi.fn(success),
    getSnapshot: vi.fn(async () => structuredClone(snapshot)),
    stage: vi.fn(success),
    unstage: vi.fn(success),
    commit: vi.fn(success),
    generateCommitMessage: vi.fn(
      async (): Promise<GenerateCommitMessageResult> => ({
        message: "feat(ui): localize feedback",
        truncated: true,
        excludedFiles: [".env"],
      }),
    ),
    amendLastCommit: vi.fn(success),
    push: vi.fn(async () => ({ success: true, message: "Changes pushed" })),
    commitAndPush: vi.fn(commitAndPushSuccess),
    checkout: vi.fn(success),
    switchBranch: vi.fn(success),
    createBranch: vi.fn(success),
    fetch: vi.fn(success),
    pull: vi.fn(success),
    stash: vi.fn(success),
    cancelOperation: vi.fn(success),
    openTerminal: vi.fn(success),
    openExplorer: vi.fn(success),
  };
}

function createWrapper(client: GitClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <GitProvider client={client}>{children}</GitProvider>;
  };
}

afterEach(() => {
  i18nState.language = "en";
});

describe("GitProvider localized feedback", () => {
  it("reformats an existing operation notice when the UI language changes", async () => {
    const client = createClient();
    const { result, rerender } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    await act(async () => {
      await result.current.push();
    });
    expect(result.current.notice).toBe("Changes pushed");

    act(() => {
      i18nState.language = "zh-CN";
      rerender();
    });
    expect(result.current.notice).toBe("更改已推送");
  });

  it("reformats structured AI generation details without losing them", async () => {
    const client = createClient();
    const { result, rerender } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    await act(async () => {
      await result.current.generateCommitMessage(aiPreferences);
    });
    expect(result.current.notice).toContain("staged diff was truncated");
    expect(result.current.notice).toContain("1 sensitive file was excluded");

    act(() => {
      i18nState.language = "zh-CN";
      rerender();
    });
    expect(result.current.notice).toContain("已暂存的差异内容已截断");
    expect(result.current.notice).toContain("已排除 1 个");
  });

  it("reformats an existing operation error when the UI language changes", async () => {
    const client = createClient();
    vi.mocked(client.commit).mockResolvedValueOnce({
      success: false,
      message: "Git index is locked (exit code 128)",
    });
    const { result, rerender } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    act(() => result.current.setCommitMessage("test: locked index"));

    await act(async () => {
      await result.current.commit();
    });
    expect(result.current.error).toBe("Git index is locked (exit code 128)");

    act(() => {
      i18nState.language = "zh-CN";
      rerender();
    });
    expect(result.current.error).toContain("Git 索引已锁定");
    expect(result.current.error).toContain("退出代码 128");
  });

  it("localizes a partial commit-and-push failure without losing its cause", async () => {
    const client = createClient();
    vi.mocked(client.commitAndPush).mockResolvedValueOnce({
      success: false,
      committed: true,
      pushed: false,
      stage: "push",
      message: "Git authentication failed",
    });
    const { result, rerender } = renderHook(() => useGitWorkspace(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    act(() => result.current.setCommitMessage("fix: retry push"));

    await act(async () => {
      await result.current.commitAndPush();
    });
    expect(result.current.error).toBe(
      "Commit succeeded, but Push failed. You can retry Push. Git authentication failed",
    );

    act(() => {
      i18nState.language = "zh-CN";
      rerender();
    });
    expect(result.current.error).toBe(
      "提交成功，推送失败，可重试推送。Git 身份验证失败",
    );
  });
});
