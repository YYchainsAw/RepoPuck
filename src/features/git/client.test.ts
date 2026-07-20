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

  it("maps Git client methods to their exact Tauri commands and arguments", async () => {
    vi.mocked(invoke).mockResolvedValue({ success: true });
    const client = createGitClient({ runtime: "tauri" });

    await client.selectRepository("C:\\Projects\\repo");
    await client.getSnapshot();
    await client.stage(["src/App.tsx"]);
    await client.unstage(["src/App.tsx"]);
    await client.commit("Commit only");
    await client.push();
    await client.commitAndPush("Ship it");
    await client.checkout("main");
    await client.switchBranch("develop");
    await client.createBranch("feature/panel");
    await client.fetch();
    await client.pull();
    await client.stash();
    await client.openTerminal();
    await client.openExplorer();

    expect(vi.mocked(invoke).mock.calls).toEqual([
      ["select_repository", { path: "C:\\Projects\\repo" }],
      ["get_snapshot"],
      ["set_staged", { paths: ["src/App.tsx"], staged: true }],
      ["set_staged", { paths: ["src/App.tsx"], staged: false }],
      ["commit", { message: "Commit only" }],
      ["push"],
      ["commit_and_push", { message: "Ship it" }],
      ["switch_branch", { branch: "main" }],
      ["switch_branch", { branch: "develop" }],
      ["create_branch", { branch: "feature/panel" }],
      ["fetch"],
      ["pull"],
      ["stash"],
      ["open_terminal"],
      ["open_explorer"],
    ]);
  });
});
