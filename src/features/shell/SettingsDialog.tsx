import { invoke } from "@tauri-apps/api/core";
import {
  KeyAsteriskIcon,
  PinIcon,
  RepoIcon,
  ShieldLockIcon,
  TrashIcon,
} from "@primer/octicons-react";
import { Button, Dialog } from "@primer/react";
import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { getShellCopy, localizeShellError } from "../../i18n/shell";
import {
  getAICommitPreferences,
  getLanguagePreference,
  type AICommitLanguage,
  type AICommitPreferences,
  type ConventionalCommitType,
  type LanguagePreference,
  type ShellSettings,
  type ThemePreference,
} from "./settings";
import { LocalizedDialogHeader } from "./LocalizedDialogHeader";
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
  const { language } = useI18n();
  const copy = getShellCopy(language);
  const { setAiCommitPreferences, setLanguage } = useShellSettings();
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
    <Dialog
      title={copy.settings.title}
      renderHeader={LocalizedDialogHeader}
      onClose={onClose}
    >
      <div className="settings-dialog-content">
        <label className="settings-field" htmlFor="interface-language">
          <span>{copy.settings.interfaceLanguage}</span>
          <select
            id="interface-language"
            aria-label={copy.settings.interfaceLanguage}
            value={getLanguagePreference(settings)}
            onChange={(event) =>
              setLanguage(event.target.value as LanguagePreference)
            }
          >
            <option value="system">{copy.settings.languageSystem}</option>
            <option value="zh-CN">{copy.settings.languageChinese}</option>
            <option value="en">{copy.settings.languageEnglish}</option>
          </select>
          <small>{copy.settings.interfaceLanguageHelp}</small>
        </label>

        <fieldset className="shell-mode-fieldset">
          <legend>{copy.settings.launchMode}</legend>
          <div
            className="shell-mode-options"
            role="radiogroup"
            aria-label={copy.settings.launchMode}
            aria-busy={shellModePending}
          >
            {(
              [
                {
                  value: "puck",
                  ...copy.settings.launchModes.puck,
                },
                {
                  value: "top-island",
                  ...copy.settings.launchModes["top-island"],
                },
                {
                  value: "top-drawer",
                  ...copy.settings.launchModes["top-drawer"],
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
              {copy.settings.applyingLaunchMode}
            </p>
          )}
          {shellModeError && (
            <p className="shell-mode-feedback shell-mode-feedback--error" role="alert">
              {localizeShellError(shellModeError, language)}
            </p>
          )}
        </fieldset>

        <label className="settings-field" htmlFor="shell-theme">
          <span>{copy.settings.theme}</span>
          <select
            id="shell-theme"
            value={settings.theme}
            onChange={(event) => onThemeChange(event.target.value as ThemePreference)}
          >
            <option value="system">{copy.settings.themeSystem}</option>
            <option value="light">{copy.settings.themeLight}</option>
            <option value="dark">{copy.settings.themeDark}</option>
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
            {copy.settings.keepPanelOnTop}
            {shellMode !== "puck" && (
              <small>{copy.settings.topModesStayAbove}</small>
            )}
          </span>
        </label>

        <section className="ai-commit-settings" aria-labelledby="ai-commit-settings-title">
          <div className="ai-commit-heading">
            <span className="ai-neutral-badge" aria-hidden="true">
              AI
            </span>
            <span>
              <h2 id="ai-commit-settings-title">{copy.settings.aiTitle}</h2>
              <small>{copy.settings.aiDescription}</small>
            </span>
          </div>

          <div className="ai-settings-grid">
            <label className="settings-field ai-settings-wide" htmlFor="ai-base-url">
              <span>{copy.settings.aiBaseUrl}</span>
              <input
                id="ai-base-url"
                type="url"
                aria-label={copy.settings.aiBaseUrl}
                aria-describedby="ai-base-url-help"
                inputMode="url"
                spellCheck={false}
                value={aiCommit.baseUrl}
                onChange={(event) => changeAiCommit({ baseUrl: event.target.value })}
              />
              <small id="ai-base-url-help">{copy.settings.aiBaseUrlHelp}</small>
            </label>

            <label className="settings-field ai-settings-wide" htmlFor="ai-model">
              <span>{copy.settings.aiModel}</span>
              <input
                id="ai-model"
                type="text"
                spellCheck={false}
                value={aiCommit.model}
                onChange={(event) => changeAiCommit({ model: event.target.value })}
              />
            </label>

            <label className="settings-field" htmlFor="ai-language">
              <span>{copy.settings.commitLanguage}</span>
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
              <span>{copy.settings.commitType}</span>
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
              <span>{copy.settings.scopeOptional}</span>
              <input
                id="ai-scope"
                type="text"
                aria-label={copy.settings.scopeOptional}
                maxLength={32}
                spellCheck={false}
                placeholder="ui"
                value={aiCommit.scope}
                onChange={(event) => changeAiCommit({ scope: event.target.value })}
              />
              <small>
                {copy.settings.preview}:{" "}
                <code>
                  {aiCommit.commitType}
                  {aiCommit.scope ? `(${aiCommit.scope})` : ""}:{" "}
                  {copy.settings.generatedSubject[aiCommit.language]}
                </code>
              </small>
            </label>
          </div>

          <div className="api-key-card">
            <div className="api-key-heading">
              <KeyAsteriskIcon size={18} aria-hidden="true" />
              <span>
                <strong>{copy.settings.apiKey}</strong>
                <small>{copy.settings.apiKeyDescription}</small>
              </span>
            </div>
            <div className="api-key-controls">
              <label className="sr-only" htmlFor="ai-api-key">
                {copy.settings.aiApiKey}
              </label>
              <input
                id="ai-api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  apiKeyState === "saved"
                    ? copy.settings.replaceKeyPlaceholder
                    : copy.settings.enterKeyPlaceholder
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
                {apiKeyState === "saving"
                  ? copy.settings.saving
                  : copy.settings.saveKey}
              </Button>
              <Button
                variant="danger"
                disabled={
                  apiKeyState !== "saved"
                }
                onClick={() => void deleteApiKey()}
              >
                {copy.settings.remove}
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
                {apiKeyState === "checking" && copy.settings.checkingKeyStorage}
                {apiKeyState === "saved" && (
                  <>
                    <ShieldLockIcon size={14} aria-hidden="true" />{" "}
                    {copy.settings.keySaved}
                  </>
                )}
                {apiKeyState === "missing" && copy.settings.noKeySaved}
                {apiKeyState === "saving" &&
                  copy.settings.savingToCredentialManager}
                {apiKeyState === "deleting" && copy.settings.removingKey}
                {apiKeyState === "unavailable" &&
                  copy.settings.secureStorageDesktopOnly}
              </p>
            )}
            {apiKeyError && (
              <p className="api-key-status api-key-status--error" role="alert">
                {localizeShellError(apiKeyError, language)}
              </p>
            )}
          </div>

          <p className="ai-privacy-notice">
            <ShieldLockIcon size={16} aria-hidden="true" />
            <span>
              <strong>{copy.settings.privacyTitle}</strong>{" "}
              {copy.settings.privacyDescription}
            </span>
          </p>
        </section>

        <section className="recent-repositories" aria-labelledby="recent-repositories-title">
          <div className="recent-repositories-heading">
            <h2 id="recent-repositories-title">{copy.settings.recentRepositories}</h2>
            <Button
              variant="invisible"
              leadingVisual={TrashIcon}
              disabled={settings.recentRepositories.length === 0}
              aria-label={copy.settings.clearRecentRepositories}
              onClick={onClearRecent}
            >
              {copy.settings.clear}
            </Button>
          </div>
          {settings.recentRepositories.length === 0 ? (
            <p>{copy.settings.noRecentRepositories}</p>
          ) : (
            <ul>
              {settings.recentRepositories.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    aria-label={copy.settings.openRepository(path)}
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
