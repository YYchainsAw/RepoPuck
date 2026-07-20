import { describe, expect, it } from "vitest";
import { createGitClient } from "./client";

describe("createGitClient", () => {
  it("returns a browser demo snapshot with separate tracked and untracked changes", async () => {
    const snapshot = await createGitClient({ runtime: "browser" }).getSnapshot();

    expect(snapshot.changes.some((entry) => !entry.untracked)).toBe(true);
    expect(snapshot.changes.some((entry) => entry.untracked)).toBe(true);
  });
});
