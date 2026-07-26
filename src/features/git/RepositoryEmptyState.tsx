import { FileDirectoryIcon } from "@primer/octicons-react";
import { Button, Heading } from "@primer/react";
import { useI18n } from "../../i18n";
import { getGitCopy } from "../../i18n/git";

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
  const { language } = useI18n();
  const copy = getGitCopy(language);

  return (
    <div className="repository-empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <FileDirectoryIcon size={32} />
      </span>
      <Heading as="h1">{copy.chooseRepository}</Heading>
      <p>{copy.chooseRepositoryDescription}</p>
      <Button variant="primary" disabled={busy} onClick={onChoose}>
        {copy.chooseRepositoryButton}
      </Button>
      {recentRepositories.length > 0 && (
        <div
          className="empty-state-recents"
          aria-label={copy.recentRepositories}
        >
          <span>{copy.recent}</span>
          {recentRepositories.slice(0, 3).map((path) => (
            <button
              key={path}
              type="button"
              title={path}
              aria-label={copy.openRepository(path)}
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
