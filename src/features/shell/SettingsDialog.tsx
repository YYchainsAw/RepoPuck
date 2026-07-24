import { invoke } from "@tauri-apps/api/core";
import {
  CopilotIcon,
  KeyAsteriskIcon,
  PinIcon,
  RepoIcon,
  ShieldLockIcon,
  TrashIcon,
} from "@primer/octicons-react";
import { Button, Dialog } from "@primer/react";
import { useEffect, useState } from "react";
import {
  getAICommitPreferences,
  type AICommitLanguage,
  type AICommitPreferences,
  type ConventionalCommitType,
  type ShellSettings,
  type ThemePreference,
} from "./settings";
import { useShellSettings } from "./ShellSettingsProvider";
import type { ShellMode } from "./useNativeShellState";
import "./native-shell.css";

interface ApiKeyStatus {
  configured: boolean;
}

interface ApiKeyOperationResult {
  success: boolean;
  message?: string;
}

type ApiKeyState = "checking" | "saved" | "missing" | "unavailable" | "saving" | "deleting";

const COMMIT_TYPES: ConventionalCommitType[] = [
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
];

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface SettingsDialogProps {
  open: boolean;
  settings: ShellSettings;
  shellMode: ShellMode;
  shellModePending?: boolean;
  shellModeError?: string | null;
  onShellModeChange(mode: ShellMode): void;
  onThemeChange(theme: ThemePreference): void;
  onPinnedChange(pinned: boolean): void;
  onClearRecent(): void;
  onOpenRecent(path: string): void;
  onClose(): void;
}

export function SettingsDialog({
  open,
  settings,
  shellMode,
  shellModePending = false,
  shellModeError = null,
  onShellModeChange,
  onThemeChange,
  onPinnedChange,
  onClearRecent,
  onOpenRecent,
  onClose,
}: SettingsDialogProps) {
  const { setAiCommitPreferences } = useShellSettings();
  const aiCommit = getAICommitPreferences(settings);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyState, setApiKeyState] = useState<ApiKeyState>("checking");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  useEffect(() => {
    setApiKey("");
    setApiKeyError(null);
    if (!open) return;
    if (!isTauriRuntime()) {
      setApiKeyState("unavailable");
      return;
    }
    let cancelled = false;
    setApiKeyState("checking");
    void invoke<ApiKeyStatus>("get_ai_key_status")
      .then((status) => {
        if (!cancelled) setApiKeyState(status.configured ? "saved" : "missing");
      })
      .catch(() => {
        if (!cancelled) {
          setApiKeyState("missing");
          setApiKeyError("RepoPuck could not read the saved API key status.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const changeAiCommit = (change: Partial<AICommitPreferences>) => {
    setAiCommitPreferences({ ...aiCommit, ...change });
  };

  const saveApiKey = async () => {
    const value = apiKey.trim();
    if (!value) {
      setApiKeyError("Enter an API key before saving.");
      return;
    }
    const hadSavedKey = apiKeyState === "saved";
    setApiKeyError(null);
    setApiKeyState("saving");
    try {
      const result = await invoke<ApiKeyOperationResult>("save_ai_api_key", {
        apiKey: value,
      });
      if (!result.success) throw new Error(result.message);
      setApiKey("");
      setApiKeyState("saved");
    } catch (error) {
      setApiKeyState(hadSavedKey ? "saved" : "missing");
      setApiKeyError(
        error instanceof Error && error.message
          ? error.message
          : "RepoPuck could not save the API key.",
      );
    }
  };

  const deleteApiKey = async () => {
    setApiKeyError(null);
    setApiKeyState("deleting");
    try {
      const result = await invoke<ApiKeyOperationResult>("delete_ai_api_key");
      if (!result.success) throw new Error(result.message);
      setApiKey("");
      setApiKeyState("missing");
    } catch (error) {
      setApiKeyState("saved");
      setApiKeyError(
        error instanceof Error && error.message
          ? error.message
          : "RepoPuck could not remove the API key.",
      );
    }
  };

  if (!open) return null;
  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="settings-dialog-content">
        <fieldset className="shell-mode-fieldset">
          <legend>Launch mode</legend>
          <div
            className="shell-mode-options"
            role="radiogroup"
            aria-label="Launch mode"
            aria-busy={shellModePending}
          >
            {(
              [
                {
                  value: "puck",
                  label: "Floating puck",
                  description: "Drag the puck anywhere and open the panel beside it.",
                },
                {
                  value: "top-island",
                  label: "Top island",
                  description: "Keep a compact repository status at the top center.",
                },
                {
                  value: "top-drawer",
                  label: "Top drawer",
                  description:
                    "Reveal at the top edge; keyboard users can open it from the system tray.",
                },
              ] as const
            ).map((mode) => (
              <label
                className="shell-mode-option"
                data-selected={shellMode === mode.value}
                key={mode.value}
              >
                <input
                  type="radio"
                  name="shell-mode"
                  value={mode.value}
                  checked={shellMode === mode.value}
                  disabled={shellModePending}
                  onChange={() => onShellModeChange(mode.value)}
                />
                <span>
                  <strong>{mode.label}</strong>
                  <small>{mode.description}</small>
                </span>
              </label>
            ))}
          </div>
          {shellModePending && (
            <p className="shell-mode-feedback" role="status">
              Applying launch mode…
            </p>
          )}
          {shellModeError && (
            <p className="shell-mode-feedback shell-mode-feedback--error" role="alert">
              {shellModeError}
            </p>
          )}
        </fieldset>

        <label className="settings-field" htmlFor="shell-theme">
          <span>Theme</span>
          <select
            id="shell-theme"
            value={settings.theme}
            onChange={(event) => onThemeChange(event.target.value as ThemePreference)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.pinned}
            disabled={shellMode !== "puck"}
            onChange={(event) => onPinnedChange(event.target.checked)}
          />
          <PinIcon size={16} aria-hidden="true" />
          <span>
            Keep panel on top
            {shellMode !== "puck" && (
              <small>Top modes stay above other windows by design.</small>
            )}
          </span>
        </label>

        <section className="ai-commit-settings" aria-labelledby="ai-commit-settings-title">
          <div className="ai-commit-heading">
            <CopilotIcon size={20} aria-hidden="true" />
            <span>
              <h2 id="ai-commit-settings-title">AI commit message</h2>
              <small>Generate a Conventional Commit message from staged changes.</small>
            </span>
          </div>

          <div className="ai-settings-grid">
            <label className="settings-field ai-settings-wide" htmlFor="ai-base-url">
              <span>AI service base URL</span>
              <input
                id="ai-base-url"
                type="url"
                aria-label="AI service base URL"
                aria-describedby="ai-base-url-help"
                inputMode="url"
                spellCheck={false}
                value={aiCommit.baseUrl}
                onChange={(event) => changeAiCommit({ baseUrl: event.target.value })}
              />
              <small id="ai-base-url-help">
                OpenAI-compatible; RepoPuck targets <code>/chat/completions</code>.
              </small>
            </label>

            <label className="settings-field ai-settings-wide" htmlFor="ai-model">
              <span>AI model</span>
              <input
                id="ai-model"
                type="text"
                spellCheck={false}
                value={aiCommit.model}
                onChange={(event) => changeAiCommit({ model: event.target.value })}
              />
            </label>

            <label className="settings-field" htmlFor="ai-language">
              <span>Commit language</span>
              <select
                id="ai-language"
                value={aiCommit.language}
                onChange={(event) =>
                  changeAiCommit({ language: event.target.value as AICommitLanguage })
                }
              >
                <option value="zh-CN">中文</option>
                <option value="en">English</option>
              </select>
            </label>

            <label className="settings-field" htmlFor="ai-commit-type">
              <span>Commit type</span>
              <select
                id="ai-commit-type"
                value={aiCommit.commitType}
                onChange={(event) =>
                  changeAiCommit({
                    commitType: event.target.value as ConventionalCommitType,
                  })
                }
              >
                {COMMIT_TYPES.map((commitType) => (
                  <option value={commitType} key={commitType}>
                    {commitType}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field ai-settings-wide" htmlFor="ai-scope">
              <span>Scope (optional)</span>
              <input
                id="ai-scope"
                type="text"
                aria-label="Scope (optional)"
                maxLength={32}
                spellCheck={false}
                placeholder="ui"
                value={aiCommit.scope}
                onChange={(event) => changeAiCommit({ scope: event.target.value })}
              />
              <small>
                Preview:{" "}
                <code>
                  {aiCommit.commitType}
                  {aiCommit.scope ? `(${aiCommit.scope})` : ""}:{" "}
                  {aiCommit.language === "zh-CN" ? "生成的提交说明" : "generated subject"}
                </code>
              </small>
            </label>
          </div>

          <div className="api-key-card">
            <div className="api-key-heading">
              <KeyAsteriskIcon size={18} aria-hidden="true" />
              <span>
                <strong>API key</strong>
                <small>
                  The key is stored in Windows Credential Manager and is never written to
                  settings.json.
                </small>
              </span>
            </div>
            <div className="api-key-controls">
              <label className="sr-only" htmlFor="ai-api-key">
                AI API key
              </label>
              <input
                id="ai-api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  apiKeyState === "saved" ? "Enter a new key to replace it" : "Enter API key"
                }
                value={apiKey}
                disabled={
                  apiKeyState === "checking" ||
                  apiKeyState === "unavailable" ||
                  apiKeyState === "saving" ||
                  apiKeyState === "deleting"
                }
                onChange={(event) => setApiKey(event.target.value)}
              />
              <Button
                variant="primary"
                disabled={
                  apiKey.trim().length === 0 ||
                  apiKeyState === "checking" ||
                  apiKeyState === "unavailable" ||
                  apiKeyState === "saving" ||
                  apiKeyState === "deleting"
                }
                onClick={() => void saveApiKey()}
              >
                {apiKeyState === "saving" ? "Saving…" : "Save key"}
              </Button>
              <Button
                variant="danger"
                disabled={
                  apiKeyState !== "saved"
                }
                onClick={() => void deleteApiKey()}
              >
                Remove
              </Button>
            </div>
            {!apiKeyError && (
              <p
                className="api-key-status"
                role={
                  apiKeyState === "checking" ||
                  apiKeyState === "saving" ||
                  apiKeyState === "deleting"
                    ? "status"
                    : undefined
                }
              >
                {apiKeyState === "checking" && "Checking secure key storage…"}
                {apiKeyState === "saved" && (
                  <>
                    <ShieldLockIcon size={14} aria-hidden="true" /> API key saved securely.
                  </>
                )}
                {apiKeyState === "missing" && "No API key saved yet."}
                {apiKeyState === "saving" && "Saving to Windows Credential Manager…"}
                {apiKeyState === "deleting" && "Removing the saved API key…"}
                {apiKeyState === "unavailable" &&
                  "Secure API key storage is available in the RepoPuck desktop app."}
              </p>
            )}
            {apiKeyError && (
              <p className="api-key-status api-key-status--error" role="alert">
                {apiKeyError}
              </p>
            )}
          </div>

          <p className="ai-privacy-notice">
            <ShieldLockIcon size={16} aria-hidden="true" />
            <span>
              <strong>Privacy:</strong> only when you click Generate, staged text differences
              are sent to the selected AI service. Known sensitive paths and binary contents
              are excluded, and common secret-looking lines are redacted.
            </span>
          </p>
        </section>

        <section className="recent-repositories" aria-labelledby="recent-repositories-title">
          <div className="recent-repositories-heading">
            <h2 id="recent-repositories-title">Recent repositories</h2>
            <Button
              variant="invisible"
              leadingVisual={TrashIcon}
              disabled={settings.recentRepositories.length === 0}
              aria-label="Clear recent repositories"
              onClick={onClearRecent}
            >
              Clear
            </Button>
          </div>
          {settings.recentRepositories.length === 0 ? (
            <p>No recent repositories.</p>
          ) : (
            <ul>
              {settings.recentRepositories.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    aria-label={`Open ${path}`}
                    title={path}
                    onClick={() => onOpenRecent(path)}
                  >
                    <RepoIcon size={16} aria-hidden="true" />
                    <span>{path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}
