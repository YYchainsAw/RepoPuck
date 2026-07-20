import { PinIcon, RepoIcon, TrashIcon } from "@primer/octicons-react";
import { Button, Dialog } from "@primer/react";
import type { ShellSettings, ThemePreference } from "./settings";
import "./native-shell.css";

interface SettingsDialogProps {
  open: boolean;
  settings: ShellSettings;
  onThemeChange(theme: ThemePreference): void;
  onPinnedChange(pinned: boolean): void;
  onClearRecent(): void;
  onOpenRecent(path: string): void;
  onClose(): void;
}

export function SettingsDialog({
  open,
  settings,
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
            onChange={(event) => onPinnedChange(event.target.checked)}
          />
          <PinIcon size={16} aria-hidden="true" />
          <span>Keep panel on top</span>
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
