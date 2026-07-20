import { FileDirectoryIcon } from "@primer/octicons-react";
import { Button, Heading } from "@primer/react";

interface RepositoryEmptyStateProps {
  busy: boolean;
  recentRepositories?: string[];
  onChoose(): void;
  onOpenRecent?(path: string): void;
}

export function RepositoryEmptyState({
  busy,
  recentRepositories = [],
  onChoose,
  onOpenRecent,
}: RepositoryEmptyStateProps) {
  return (
    <div className="repository-empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <FileDirectoryIcon size={32} />
      </span>
      <Heading as="h1">Choose a repository</Heading>
      <p>Select a local Git repository to review and commit its changes.</p>
      <Button variant="primary" disabled={busy} onClick={onChoose}>
        Choose repository
      </Button>
      {recentRepositories.length > 0 && (
        <div className="empty-state-recents" aria-label="Recent repositories">
          <span>Recent</span>
          {recentRepositories.slice(0, 3).map((path) => (
            <button
              key={path}
              type="button"
              title={path}
              aria-label={`Open ${path}`}
              disabled={busy}
              onClick={() => onOpenRecent?.(path)}
            >
              {path}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
