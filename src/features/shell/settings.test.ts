import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_COMMIT_PREFERENCES,
  getAICommitPreferences,
  normalizeAICommitPreferences,
  normalizeShellSettings,
} from "./settings";

describe("AI commit preferences", () => {
  it("upgrades legacy settings with privacy-safe defaults", () => {
    const settings = normalizeShellSettings({
      theme: "dark",
      pinned: true,
      recentRepositories: ["C:\\work\\game"],
    });

    expect(settings.aiCommit).toEqual(DEFAULT_AI_COMMIT_PREFERENCES);
    expect(getAICommitPreferences(settings)).toEqual({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      language: "zh-CN",
      commitType: "feat",
      scope: "",
    });
  });

  it("normalizes invalid preferences and bounds the optional scope", () => {
    expect(
      normalizeAICommitPreferences({
        baseUrl: "  https://example.test/v1  ",
        model: "  custom-model  ",
        language: "unsupported",
        commitType: "breaking",
        scope: `  ${"a".repeat(40)}  `,
      }),
    ).toEqual({
      baseUrl: "https://example.test/v1",
      model: "custom-model",
      language: "zh-CN",
      commitType: "feat",
      scope: "a".repeat(32),
    });
  });

  it.each([
    "feat",
    "fix",
    "docs",
    "style",
    "refactor",
    "perf",
    "test",
    "build",
    "ci",
    "chore",
    "revert",
  ] as const)("accepts the persisted %s Conventional Commit choice", (commitType) => {
    expect(
      normalizeAICommitPreferences({
        baseUrl: "http://localhost:11434/v1",
        model: "local-model",
        language: "en",
        commitType,
        scope: "ui",
      }),
    ).toEqual({
      baseUrl: "http://localhost:11434/v1",
      model: "local-model",
      language: "en",
      commitType,
      scope: "ui",
    });
  });
});
