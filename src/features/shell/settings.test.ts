// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  createShellSettingsPersistence,
  DEFAULT_AI_COMMIT_PREFERENCES,
  getAICommitPreferences,
  getLanguagePreference,
  loadShellSettings,
  normalizeAICommitPreferences,
  normalizeLanguagePreference,
  normalizeShellSettings,
} from "./settings";

beforeEach(() => {
  window.localStorage.clear();
});

describe("AI commit preferences", () => {
  it("upgrades legacy settings with privacy-safe defaults", () => {
    const settings = normalizeShellSettings({
      theme: "dark",
      pinned: true,
      recentRepositories: ["C:\\work\\game"],
    });

    expect(settings.aiCommit).toEqual(DEFAULT_AI_COMMIT_PREFERENCES);
    expect(settings.language).toBe("system");
    expect(getAICommitPreferences(settings)).toEqual({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      language: "zh-CN",
      commitType: "feat",
      scope: "",
    });
  });

  it("migrates legacy and invalid UI language values to system", () => {
    expect(normalizeLanguagePreference(undefined)).toBe("system");
    expect(normalizeLanguagePreference("fr")).toBe("system");
    expect(getLanguagePreference({ theme: "light", pinned: false, recentRepositories: [] }))
      .toBe("system");
  });

  it.each(["system", "zh-CN", "en"] as const)(
    "accepts the persisted %s UI language preference",
    (language) => {
      expect(normalizeShellSettings({ language }).language).toBe(language);
    },
  );

  it("persists and reloads the UI language in the browser fallback", async () => {
    const persistence = createShellSettingsPersistence();
    await persistence.save({
      theme: "dark",
      pinned: true,
      recentRepositories: ["D:\\game"],
      language: "zh-CN",
      aiCommit: DEFAULT_AI_COMMIT_PREFERENCES,
    });

    await expect(loadShellSettings()).resolves.toMatchObject({
      theme: "dark",
      pinned: true,
      recentRepositories: ["D:\\game"],
      language: "zh-CN",
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
