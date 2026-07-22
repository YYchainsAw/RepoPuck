import { CounterLabel, Heading } from "@primer/react";
import { useEffect, useRef } from "react";
import type { ChangeEntry } from "./types";
import { ChangeRow } from "./ChangeRow";

interface ChangeGroupsProps {
  changes: ChangeEntry[];
  busy: boolean;
  onSetStaged(paths: string[], staged: boolean): void;
}

interface ChangeGroupProps extends ChangeGroupsProps {
  title: string;
}

function ChangeGroup({ title, changes, busy, onSetStaged }: ChangeGroupProps) {
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
    <section className="change-group" aria-label={title}>
      <div className="change-group-heading">
        <input
          ref={selectAllRef}
          className="change-checkbox"
          type="checkbox"
          checked={allStaged}
          disabled={busy}
          aria-checked={partiallyStaged ? "mixed" : allStaged}
          aria-label={`${allStaged ? "Unstage" : "Stage"} all ${title}`}
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

export function ChangeGroups({ changes, busy, onSetStaged }: ChangeGroupsProps) {
  const tracked = changes.filter((change) => !change.untracked || change.staged);
  const unversioned = changes.filter((change) => change.untracked && !change.staged);

  if (changes.length === 0) {
    return (
      <div className="changes-empty">
        <Heading as="h2">Working tree clean</Heading>
        <p>There are no local changes.</p>
      </div>
    );
  }

  return (
    <div className="change-groups">
      {tracked.length > 0 && (
        <ChangeGroup
          title="Changes"
          changes={tracked}
          busy={busy}
          onSetStaged={onSetStaged}
        />
      )}
      {unversioned.length > 0 && (
        <ChangeGroup
          title="Unversioned files"
          changes={unversioned}
          busy={busy}
          onSetStaged={onSetStaged}
        />
      )}
    </div>
  );
}
