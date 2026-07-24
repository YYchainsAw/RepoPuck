import { GitCommitIcon, UploadIcon } from "@primer/octicons-react";
import { Button, Spinner, TextInput } from "@primer/react";
import type { KeyboardEvent } from "react";
import { useI18n } from "../../i18n";
import { getGitCopy } from "../../i18n/git";
import type { GitAction } from "./useGitWorkspace";

interface CommitComposerProps {
  message: string;
  hasStaged: boolean;
  busyAction: GitAction | null;
  generating: boolean;
  onMessageChange(message: string): void;
  onGenerate(): void;
  onCommit(): void;
  onCommitAndPush(): void;
}

export function CommitComposer({
  message,
  hasStaged,
  busyAction,
  generating,
  onMessageChange,
  onGenerate,
  onCommit,
  onCommitAndPush,
}: CommitComposerProps) {
  const { language } = useI18n();
  const copy = getGitCopy(language);
  const ready = message.trim().length > 0 && hasStaged && !busyAction;
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.key !== "Enter" || !ready) return;
    event.preventDefault();
    if (event.ctrlKey) onCommitAndPush();
    else onCommit();
  };

  return (
    <footer className="commit-composer">
      <div className="composer-input-row">
        <div className="composer-input-control">
          <TextInput
            className="commit-message"
            aria-label={copy.commitMessage}
            placeholder={copy.commitMessage}
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
        <Button
          className="ai-generate-button"
          aria-label={copy.generateCommitMessage}
          aria-busy={generating}
          title={copy.generateFromStaged}
          disabled={!hasStaged || Boolean(busyAction) || generating}
          onClick={onGenerate}
        >
          {generating ? <Spinner size="small" /> : "AI"}
        </Button>
      </div>
      <div className="composer-actions">
        <Button
          className="commit-button"
          variant="primary"
          leadingVisual={busyAction === "commit" ? Spinner : GitCommitIcon}
          disabled={!ready}
          onClick={onCommit}
        >
          {copy.commit}
        </Button>
        <Button
          className="commit-push-button"
          leadingVisual={busyAction === "commitAndPush" ? Spinner : UploadIcon}
          disabled={!ready}
          onClick={onCommitAndPush}
        >
          {copy.commitAndPush}
        </Button>
      </div>
      {!hasStaged && (
        <p className="composer-hint">{copy.stageBeforeCommit}</p>
      )}
    </footer>
  );
}
