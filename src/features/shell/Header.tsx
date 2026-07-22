import {
  FileDirectoryIcon,
  GitBranchIcon,
  KebabHorizontalIcon,
  MoonIcon,
  PinIcon,
  PlusIcon,
  RepoIcon,
  SunIcon,
  SyncIcon,
} from "@primer/octicons-react";
import { Button, IconButton, Spinner } from "@primer/react";
import type { RefObject } from "react";
import type { RepositorySnapshot } from "../git/types";

interface HeaderProps {
  snapshot: RepositorySnapshot;
  busy: boolean;
  pinned: boolean;
  dark: boolean;
  menuOpen: boolean;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onChooseRepository(): void;
  onSwitchBranch(branch: string): void;
  onCreateBranch(): void;
  onRefresh(): void;
  onTogglePin(): void;
  onToggleTheme(): void;
  onToggleMenu(): void;
}

export function Header({
  snapshot,
  busy,
  pinned,
  dark,
  menuOpen,
  menuButtonRef,
  onChooseRepository,
  onSwitchBranch,
  onCreateBranch,
  onRefresh,
  onTogglePin,
  onToggleTheme,
  onToggleMenu,
}: HeaderProps) {
  return (
    <header className="panel-header">
      <div className="repository-row">
        <Button
          className="repository-picker"
          leadingVisual={RepoIcon}
          trailingVisual={FileDirectoryIcon}
          title={snapshot.repository.path}
          disabled={busy}
          onClick={onChooseRepository}
        >
          {snapshot.repository.name}
        </Button>
        <div className="header-actions">
          <IconButton
            icon={PinIcon}
            unsafeDisableTooltip
            aria-label={pinned ? "Unpin panel" : "Pin panel"}
            aria-pressed={pinned}
            variant={pinned ? "primary" : "invisible"}
            disabled={busy}
            onClick={onTogglePin}
          />
          <IconButton
            icon={dark ? SunIcon : MoonIcon}
            unsafeDisableTooltip
            aria-label={dark ? "Use light theme" : "Use dark theme"}
            variant="invisible"
            onClick={onToggleTheme}
          />
          <IconButton
            ref={menuButtonRef}
            icon={KebabHorizontalIcon}
            unsafeDisableTooltip
            aria-label="More actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            variant="invisible"
            disabled={busy}
            onClick={onToggleMenu}
          />
        </div>
      </div>
      <div className="branch-row">
        <GitBranchIcon size={16} aria-hidden="true" />
        <select
          className="branch-select"
          aria-label="Branch"
          value={snapshot.currentBranch}
          disabled={busy}
          onChange={(event) => onSwitchBranch(event.target.value)}
        >
          {snapshot.branches.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.name}
            </option>
          ))}
        </select>
        <IconButton
          icon={PlusIcon}
          unsafeDisableTooltip
          aria-label="Create branch"
          variant="invisible"
          disabled={busy}
          onClick={onCreateBranch}
        />
        {(snapshot.ahead > 0 || snapshot.behind > 0) && (
          <span className="branch-sync" title="Remote divergence">
            Ahead {snapshot.ahead}, behind {snapshot.behind}
          </span>
        )}
        <IconButton
          icon={busy ? Spinner : SyncIcon}
          unsafeDisableTooltip
          aria-label="Refresh repository"
          variant="invisible"
          disabled={busy}
          onClick={onRefresh}
        />
      </div>
    </header>
  );
}
