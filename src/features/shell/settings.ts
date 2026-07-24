import { load } from "@tauri-apps/plugin-store";

export type ThemePreference = "system" | "light" | "dark";
export type LanguagePreference = "system" | "zh-CN" | "en";
export type AICommitLanguage = "zh-CN" | "en";
export type ConventionalCommitType =
  | "feat"
  | "fix"
  | "docs"
  | "refactor"
  | "perf"
  | "test"
  | "build"
  | "ci"
  | "chore"
  | "style"
  | "revert";

export interface AICommitPreferences {
  baseUrl: string;
  model: string;
  language: AICommitLanguage;
  commitType: ConventionalCommitType;
  scope: string;
}

export interface ShellSettings {
  theme: ThemePreference;
  pinned: boolean;
  recentRepositories: string[];
  /**
   * Optional for backwards compatibility with settings written before the
   * localized UI was introduced. Loaded settings are always normalized.
   */
  language?: LanguagePreference;
  /**
   * Optional for backwards compatibility with settings written before AI
   * commit messages were introduced. Loaded settings are always normalized.
   */
  aiCommit?: AICommitPreferences;
}

export interface ShellSettingsPersistence {
  save(settings: ShellSettings): Promise<void>;
}

const SETTINGS_FILE = "settings.json";
const BROWSER_STORAGE_KEY = "repopuck.shell-settings";
export const MAX_RECENT_REPOSITORIES = 6;
export const DEFAULT_AI_COMMIT_PREFERENCES: AICommitPreferences = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  language: "zh-CN",
  commitType: "feat",
  scope: "",
};

export const DEFAULT_SHELL_SETTINGS: ShellSettings = {
  theme: "system",
  pinned: false,
  recentRepositories: [],
  language: "system",
  aiCommit: DEFAULT_AI_COMMIT_PREFERENCES,
};

const STORE_DEFAULTS: Record<string, unknown> = {
  theme: DEFAULT_SHELL_SETTINGS.theme,
  pinned: DEFAULT_SHELL_SETTINGS.pinned,
  recentRepositories: [],
  language: DEFAULT_SHELL_SETTINGS.language,
  aiCommit: DEFAULT_AI_COMMIT_PREFERENCES,
};

const CONVENTIONAL_COMMIT_TYPES = new Set<ConventionalCommitType>([
  "feat",
  "fix",
  "docs",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "style",
  "revert",
]);

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : DEFAULT_SHELL_SETTINGS.theme;
}

function normalizeRecentRepositories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((path): path is string => typeof path === "string" && path.length > 0))]
    .slice(0, MAX_RECENT_REPOSITORIES);
}

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  return value === "zh-CN" || value === "en" || value === "system"
    ? value
    : "system";
}

export function getLanguagePreference(settings: ShellSettings): LanguagePreference {
  return normalizeLanguagePreference(settings.language);
}

export function normalizeAICommitPreferences(value: unknown): AICommitPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_AI_COMMIT_PREFERENCES };
  }
  const candidate = value as Partial<AICommitPreferences>;
  const baseUrl =
    typeof candidate.baseUrl === "string" && candidate.baseUrl.trim().length > 0
      ? candidate.baseUrl.trim()
      : DEFAULT_AI_COMMIT_PREFERENCES.baseUrl;
  const model =
    typeof candidate.model === "string" && candidate.model.trim().length > 0
      ? candidate.model.trim()
      : DEFAULT_AI_COMMIT_PREFERENCES.model;
  const language: AICommitLanguage =
    candidate.language === "en" || candidate.language === "zh-CN"
      ? candidate.language
      : DEFAULT_AI_COMMIT_PREFERENCES.language;
  const commitType =
    typeof candidate.commitType === "string" &&
    CONVENTIONAL_COMMIT_TYPES.has(candidate.commitType as ConventionalCommitType)
      ? (candidate.commitType as ConventionalCommitType)
      : DEFAULT_AI_COMMIT_PREFERENCES.commitType;
  const scope =
    typeof candidate.scope === "string" ? candidate.scope.trim().slice(0, 32) : "";
  return { baseUrl, model, language, commitType, scope };
}

export function getAICommitPreferences(settings: ShellSettings): AICommitPreferences {
  return normalizeAICommitPreferences(settings.aiCommit);
}

export function normalizeShellSettings(value: unknown): ShellSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_SHELL_SETTINGS };
  const candidate = value as Partial<ShellSettings>;
  return {
    theme: normalizeTheme(candidate.theme),
    pinned: typeof candidate.pinned === "boolean" ? candidate.pinned : false,
    recentRepositories: normalizeRecentRepositories(candidate.recentRepositories),
    language: normalizeLanguagePreference(candidate.language),
    aiCommit: normalizeAICommitPreferences(candidate.aiCommit),
  };
}

export function addRecentRepository(settings: ShellSettings, path: string): ShellSettings {
  const normalizedPath = path.trim();
  if (!normalizedPath) return settings;
  if (
    settings.recentRepositories[0] === normalizedPath &&
    settings.recentRepositories.filter((recent) => recent === normalizedPath).length === 1
  ) {
    return settings;
  }
  return {
    ...settings,
    recentRepositories: [
      normalizedPath,
      ...settings.recentRepositories.filter((recent) => recent !== normalizedPath),
    ].slice(0, MAX_RECENT_REPOSITORIES),
  };
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark = typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches,
): "light" | "dark" {
  return preference === "system" ? (prefersDark ? "dark" : "light") : preference;
}

export function applyThemePreference(
  preference: ThemePreference,
  prefersDark?: boolean,
): "light" | "dark" {
  const resolved = resolveTheme(preference, prefersDark);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.lightTheme = "light";
    document.documentElement.dataset.darkTheme = "dark";
    document.documentElement.dataset.colorMode = resolved;
    document.documentElement.style.colorScheme = resolved;
  }
  return resolved;
}

async function loadTauriSettings(): Promise<ShellSettings> {
  const store = await load(SETTINGS_FILE, {
    autoSave: 100,
    defaults: STORE_DEFAULTS,
  });
  const [theme, pinned, recentRepositories, language, aiCommit] = await Promise.all([
    store.get<unknown>("theme"),
    store.get<unknown>("pinned"),
    store.get<unknown>("recentRepositories"),
    store.get<unknown>("language"),
    store.get<unknown>("aiCommit"),
  ]);
  return normalizeShellSettings({ theme, pinned, recentRepositories, language, aiCommit });
}

function loadBrowserSettings(): ShellSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SHELL_SETTINGS };
  try {
    const saved = window.localStorage.getItem(BROWSER_STORAGE_KEY);
    return saved ? normalizeShellSettings(JSON.parse(saved)) : { ...DEFAULT_SHELL_SETTINGS };
  } catch {
    return { ...DEFAULT_SHELL_SETTINGS };
  }
}

export async function loadShellSettings(): Promise<ShellSettings> {
  if (!isTauriRuntime()) return loadBrowserSettings();
  try {
    return await loadTauriSettings();
  } catch {
    return { ...DEFAULT_SHELL_SETTINGS };
  }
}

export function createShellSettingsPersistence(): ShellSettingsPersistence {
  return {
    async save(settings) {
      if (!isTauriRuntime()) {
        try {
          window.localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(settings));
        } catch {
          // The UI remains usable when storage is disabled.
        }
        return;
      }

      const store = await load(SETTINGS_FILE, {
        autoSave: 100,
        defaults: STORE_DEFAULTS,
      });
      await Promise.all([
        store.set("theme", settings.theme),
        store.set("pinned", settings.pinned),
        store.set("recentRepositories", settings.recentRepositories),
        store.set("language", getLanguagePreference(settings)),
        store.set("aiCommit", getAICommitPreferences(settings)),
      ]);
      await store.save();
    },
  };
}
