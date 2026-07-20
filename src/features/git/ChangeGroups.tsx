import { CounterLabel, Heading } from "@primer/react";
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

  return (
    <section className="change-group" aria-label={title}>
      <div className="change-group-heading">
        <input
          className="change-checkbox"
          type="checkbox"
          checked={allStaged}
          disabled={busy}
          aria-label={`${allStaged ? "Unstage" : "Stage"} all ${title}`}
          onChange={() => onSetStaged(changes.map((change) => change.path), !allStaged)}
        />
        <Heading as="h2" className="change-group-title" aria-label={`${title} ${changes.length}`}>
          {title}
        </Heading>
        <CounterLabel aria-hidden="true">{changes.length}</CounterLabel>
      </div>
      <ul className="change-list">
        {changes.map((change) => (
          <ChangeRow
            key={change.path}
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
  const tracked = changes.filter((change) => !change.untracked);
  const unversioned = changes.filter((change) => change.untracked);

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
