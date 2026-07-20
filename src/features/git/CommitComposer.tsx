import { GitCommitIcon, UploadIcon } from "@primer/octicons-react";
import { Button, Spinner, TextInput } from "@primer/react";
import type { KeyboardEvent } from "react";
import type { GitAction } from "./useGitWorkspace";

interface CommitComposerProps {
  message: string;
  hasStaged: boolean;
  busyAction: GitAction | null;
  onMessageChange(message: string): void;
  onCommit(): void;
  onCommitAndPush(): void;
}

export function CommitComposer({
  message,
  hasStaged,
  busyAction,
  onMessageChange,
  onCommit,
  onCommitAndPush,
}: CommitComposerProps) {
  const ready = message.trim().length > 0 && hasStaged && !busyAction;
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || !ready) return;
    event.preventDefault();
    if (event.ctrlKey) onCommitAndPush();
    else onCommit();
  };

  return (
    <footer className="commit-composer">
      <div className="composer-input-row">
        <TextInput
          className="commit-message"
          aria-label="Commit message"
          placeholder="Commit message"
          value={message}
          maxLength={72}
          disabled={Boolean(busyAction)}
          onChange={(event) => onMessageChange(event.target.value)}
          onKeyDown={onKeyDown}
          block
        />
        <span className="message-count" aria-live="polite">
          {message.length} / 72
        </span>
      </div>
      <div className="composer-actions">
        <Button
          className="commit-button"
          variant="primary"
          leadingVisual={busyAction === "commit" ? Spinner : GitCommitIcon}
          disabled={!ready}
          onClick={onCommit}
        >
          Commit
        </Button>
        <Button
          className="commit-push-button"
          leadingVisual={busyAction === "commitAndPush" ? Spinner : UploadIcon}
          disabled={!ready}
          onClick={onCommitAndPush}
        >
          Commit &amp; Push
        </Button>
      </div>
      {!hasStaged && (
        <p className="composer-hint">Stage at least one file to commit.</p>
      )}
    </footer>
  );
}
