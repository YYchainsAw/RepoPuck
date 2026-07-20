import {
  ArchiveIcon,
  DownloadIcon,
  FileDirectoryIcon,
  GearIcon,
  GitCommitIcon,
  SyncIcon,
  TerminalIcon,
  UploadIcon,
} from "@primer/octicons-react";
import { Dialog } from "@primer/react";
import { useState, type ComponentType } from "react";

interface MenuAction {
  label: string;
  icon: ComponentType<{ size?: number }>;
  run(): void;
}

interface ActionMenuProps {
  open: boolean;
  busy: boolean;
  onClose(): void;
  actions: {
    fetch(): void;
    pull(): void;
    push(): void;
    stash(): void;
    openTerminal(): void;
    openExplorer(): void;
  };
}

export function ActionMenu({ open, busy, onClose, actions }: ActionMenuProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!open && !settingsOpen) return null;

  const items: MenuAction[] = [
    { label: "Fetch", icon: SyncIcon, run: actions.fetch },
    { label: "Pull", icon: DownloadIcon, run: actions.pull },
    { label: "Push", icon: UploadIcon, run: actions.push },
    { label: "Stash", icon: ArchiveIcon, run: actions.stash },
    { label: "Open terminal", icon: TerminalIcon, run: actions.openTerminal },
    { label: "Open Explorer", icon: FileDirectoryIcon, run: actions.openExplorer },
  ];

  return (
    <>
      {open && (
        <div className="action-menu" role="menu" aria-label="Repository actions">
          {items.map(({ label, icon: Icon, run }) => (
            <button
              key={label}
              className="action-menu-item"
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                run();
                onClose();
              }}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
          <div className="action-menu-divider" />
          <span id="amend-unavailable" className="sr-only">
            Not available in this version
          </span>
          <button
            className="action-menu-item"
            type="button"
            role="menuitem"
            disabled
            aria-describedby="amend-unavailable"
          >
            <GitCommitIcon size={16} aria-hidden="true" />
            Amend last commit
            <small>Unavailable</small>
          </button>
          <button
            className="action-menu-item"
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setSettingsOpen(true);
              onClose();
            }}
          >
            <GearIcon size={16} aria-hidden="true" />
            Settings
          </button>
        </div>
      )}
      {settingsOpen && (
        <Dialog title="Settings" onClose={() => setSettingsOpen(false)}>
          <p className="settings-placeholder">
            Repository preferences will be available in a future version.
          </p>
        </Dialog>
      )}
    </>
  );
}
