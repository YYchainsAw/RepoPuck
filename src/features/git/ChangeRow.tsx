import {
  DiffAddedIcon,
  DiffModifiedIcon,
  DiffRemovedIcon,
  DiffRenamedIcon,
} from "@primer/octicons-react";
import type { ComponentType } from "react";
import type { ChangeEntry } from "./types";

const kindLabels = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
} as const;

const kindIcons: Record<ChangeEntry["kind"], ComponentType<{ size?: number }>> = {
  added: DiffAddedIcon,
  modified: DiffModifiedIcon,
  deleted: DiffRemovedIcon,
  renamed: DiffRenamedIcon,
};

interface ChangeRowProps {
  change: ChangeEntry;
  busy: boolean;
  onSetStaged(paths: string[], staged: boolean): void;
}

export function ChangeRow({ change, busy, onSetStaged }: ChangeRowProps) {
  const ChangeIcon = kindIcons[change.kind];

  return (
    <li className="change-row">
      <input
        className="change-checkbox"
        type="checkbox"
        checked={change.staged}
        disabled={busy}
        aria-label={`${change.staged ? "Unstage" : "Stage"} ${change.path}`}
        onChange={(event) => onSetStaged([change.path], event.target.checked)}
      />
      <span className={`change-icon change-icon--${change.kind}`} aria-hidden="true">
        <ChangeIcon size={16} />
      </span>
      <span className="change-path" title={change.path}>
        {change.path}
      </span>
      <span className={`change-kind change-kind--${change.kind}`}>
        {kindLabels[change.kind]}
      </span>
      {change.additions > 0 && (
        <span className="change-additions">+{change.additions}</span>
      )}
      {change.deletions > 0 && (
        <span className="change-deletions">−{change.deletions}</span>
      )}
    </li>
  );
}
