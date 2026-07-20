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
import type { RepositorySnapshot } from "../git/types";

interface HeaderProps {
  snapshot: RepositorySnapshot;
  busy: boolean;
  pinned: boolean;
  dark: boolean;
  menuOpen: boolean;
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
            icon={KebabHorizontalIcon}
            unsafeDisableTooltip
            aria-label="More actions"
            aria-expanded={menuOpen}
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
        <span className="branch-sync" title="Remote divergence">
          ↑{snapshot.ahead} ↓{snapshot.behind}
        </span>
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
