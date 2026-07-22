import { PinIcon, RepoIcon, TrashIcon } from "@primer/octicons-react";
import { Button, Dialog } from "@primer/react";
import type { ShellSettings, ThemePreference } from "./settings";
import type { ShellMode } from "./useNativeShellState";
import "./native-shell.css";

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
