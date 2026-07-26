import { CounterLabel, Heading } from "@primer/react";
import { useEffect, useRef } from "react";
import { useI18n } from "../../i18n";
import { getGitCopy } from "../../i18n/git";
import type { ChangeEntry } from "./types";
import { ChangeRow } from "./ChangeRow";

interface ChangeGroupsProps {
  changes: ChangeEntry[];
  busy: boolean;
  gameProjectDetected?: boolean;
  onSetStaged(paths: string[], staged: boolean): void;
}

interface ChangeGroupProps extends ChangeGroupsProps {
  title: string;
  category?: ChangeEntry["gameCategory"];
}

function ChangeGroup({
  title,
  category,
  changes,
  busy,
  onSetStaged,
}: ChangeGroupProps) {
  const { language } = useI18n();
  const copy = getGitCopy(language);
  const allStaged = changes.length > 0 && changes.every((change) => change.staged);
  const someStaged = changes.some((change) => change.staged);
  const partiallyStaged = someStaged && !allStaged;
  const selectAllRef = useRef<HTMLInputElement>(null);
  const paths = [...new Set(changes.map((change) => change.path))];

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = partiallyStaged;
    }
  }, [partiallyStaged]);

  return (
    <section
      className="change-group"
      aria-label={title}
      data-game-category={category}
    >
      <div className="change-group-heading">
        <input
          ref={selectAllRef}
          className="change-checkbox"
          type="checkbox"
          checked={allStaged}
          disabled={busy}
          aria-checked={partiallyStaged ? "mixed" : allStaged}
          aria-label={
            allStaged ? copy.unstageAll(title) : copy.stageAll(title)
          }
          onChange={() => onSetStaged(paths, !allStaged)}
        />
        <Heading as="h2" className="change-group-title" aria-label={`${title} ${changes.length}`}>
          {title}
        </Heading>
        <CounterLabel aria-hidden="true">{changes.length}</CounterLabel>
      </div>
      <ul className="change-list">
        {changes.map((change) => (
          <ChangeRow
            key={`${change.path}:${change.staged ? "index" : "worktree"}:${change.untracked ? "untracked" : "tracked"}:${change.kind}`}
            change={change}
            busy={busy}
            onSetStaged={onSetStaged}
          />
        ))}
      </ul>
    </section>
  );
}

export function ChangeGroups({
  changes,
  busy,
  gameProjectDetected = false,
  onSetStaged,
}: ChangeGroupsProps) {
  const { language } = useI18n();
  const copy = getGitCopy(language);
  const tracked = changes.filter((change) => !change.untracked || change.staged);
  const unversioned = changes.filter((change) => change.untracked && !change.staged);
  const gameCategories = [
    ["code", copy.categories.code],
    ["scene", copy.categories.scene],
    ["asset", copy.categories.asset],
    ["config", copy.categories.config],
    ["generated", copy.categories.generated],
    ["other", copy.categories.other],
  ] as const;
  const gameMode = gameProjectDetected;

  if (changes.length === 0) {
    return (
      <div className="changes-empty">
        <Heading as="h2">{copy.workingTreeClean}</Heading>
        <p>{copy.noLocalChanges}</p>
      </div>
    );
  }

  return (
    <div className="change-groups">
      {gameMode
        ? gameCategories.map(([category, title]) => {
            const categoryChanges = tracked.filter(
              (change) =>
                change.gameCategory === category ||
                (category === "other" && change.gameCategory === undefined),
            );
            return categoryChanges.length > 0 ? (
              <ChangeGroup
                key={category}
                title={title}
                category={category}
                changes={categoryChanges}
                busy={busy}
                onSetStaged={onSetStaged}
              />
            ) : null;
          })
        : tracked.length > 0 && (
            <ChangeGroup
              title={copy.changes}
              changes={tracked}
              busy={busy}
              onSetStaged={onSetStaged}
            />
          )}
      {unversioned.length > 0 && (
        <ChangeGroup
          title={copy.unversionedFiles}
          changes={unversioned}
          busy={busy}
          onSetStaged={onSetStaged}
        />
      )}
    </div>
  );
}
