import { FileDirectoryIcon } from "@primer/octicons-react";
import { Button, Heading } from "@primer/react";

interface RepositoryEmptyStateProps {
  busy: boolean;
  onChoose(): void;
}

export function RepositoryEmptyState({ busy, onChoose }: RepositoryEmptyStateProps) {
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
    </div>
  );
}
