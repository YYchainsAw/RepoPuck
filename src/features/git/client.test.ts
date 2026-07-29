import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGitClient } from "./client";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("createGitClient", () => {
  it("returns a browser demo snapshot with separate tracked and untracked changes", async () => {
    const snapshot = await createGitClient({ runtime: "browser" }).getSnapshot();

    expect(snapshot.changes.some((entry) => !entry.untracked)).toBe(true);
    expect(snapshot.changes.some((entry) => entry.untracked)).toBe(true);
  });

  it("keeps browser staging and commit state observable in later snapshots", async () => {
    const client = createGitClient({ runtime: "browser" });
    const path = (await client.getSnapshot()).changes[0].path;

    await client.stage([path]);
    expect(
      (await client.getSnapshot()).changes.find((change) => change.path === path)
        ?.staged,
    ).toBe(true);

    await client.commit("Test demo commit");
    expect(
      (await client.getSnapshot()).changes.some((change) => change.path === path),
    ).toBe(false);
  });

  it("generates a deterministic conventional message in the browser demo", async () => {
    const client = createGitClient({ runtime: "browser" });
    const path = (await client.getSnapshot()).changes[0].path;
    await client.stage([path]);

    await expect(
      client.generateCommitMessage({
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1-mini",
        language: "zh-CN",
        useScope: false,
      }),
    ).resolves.toEqual({
      message: "fix: 更新暂存的项目文件",
      truncated: false,
      excludedFiles: [],
    });

    await expect(
      client.generateCommitMessage({
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1-mini",
        language: "en",
        useScope: true,
      }),
    ).resolves.toEqual({
      message: "fix(project): update staged project files",
      truncated: false,
      excludedFiles: [],
    });
  });

  it("maps Git client methods to their exact Tauri commands and arguments", async () => {
    vi.mocked(invoke).mockResolvedValue({ success: true });
    const client = createGitClient({ runtime: "tauri" });

    await client.selectRepository("C:\\Projects\\repo");
    await client.getSnapshot();
    await client.getRefreshToken?.();
    await client.stage(["src/App.tsx"]);
    await client.unstage(["src/App.tsx"]);
    await client.commit("Commit only");
    await client.generateCommitMessage({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      language: "en",
      useScope: true,
    });
    await client.amendLastCommit("Revised commit");
    await client.amendLastCommit();
    await client.push();
    await client.commitAndPush("Ship it");
    await client.checkout("main");
    await client.switchBranch("develop");
    await client.createBranch("feature/panel");
    await client.fetch();
    await client.pull();
    await client.stash();
    await client.cancelOperation();
    await client.openTerminal();
    await client.openExplorer();

    expect(vi.mocked(invoke).mock.calls).toEqual([
      ["select_repository", { path: "C:\\Projects\\repo" }],
      ["get_snapshot"],
      ["get_refresh_token"],
      ["set_staged", { paths: ["src/App.tsx"], staged: true }],
      ["set_staged", { paths: ["src/App.tsx"], staged: false }],
      ["commit", { message: "Commit only" }],
      [
        "generate_commit_message",
        {
          request: {
            baseUrl: "https://api.openai.com/v1",
            model: "gpt-4.1-mini",
            language: "en",
            useScope: true,
          },
        },
      ],
      ["amend_last_commit", { message: "Revised commit" }],
      ["amend_last_commit", { message: undefined }],
      ["push"],
      ["commit_and_push", { message: "Ship it" }],
      ["switch_branch", { branch: "main" }],
      ["switch_branch", { branch: "develop" }],
      ["create_branch", { branch: "feature/panel" }],
      ["fetch"],
      ["pull"],
      ["stash"],
      ["cancel_git_operation"],
      ["open_terminal"],
      ["open_explorer"],
    ]);
  });
});
