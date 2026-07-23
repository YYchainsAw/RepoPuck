import {
  AlertIcon,
  ChevronDownIcon,
  DatabaseIcon,
  FileBinaryIcon,
  FileDirectoryIcon,
  FileRemovedIcon,
  ShieldCheckIcon,
  UnlinkIcon,
} from "@primer/octicons-react";
import { CounterLabel } from "@primer/react";
import { useId, useState } from "react";
import styles from "./game.module.css";
import type { GameSafetyIssue, GameSafetyIssueKind } from "./types";

const issueLabels: Record<GameSafetyIssueKind, string> = {
  "missing-meta": "Missing .meta file",
  "orphan-meta": "Orphan .meta file",
  "generated-file": "Generated file",
  "large-file": "Large file",
  "lfs-recommended": "Git LFS recommended",
};

const issueIcons = {
  "missing-meta": FileRemovedIcon,
  "orphan-meta": UnlinkIcon,
  "generated-file": FileDirectoryIcon,
  "large-file": FileBinaryIcon,
  "lfs-recommended": DatabaseIcon,
} satisfies Record<GameSafetyIssueKind, typeof AlertIcon>;

export interface GameSafetyPanelProps {
  issues: readonly GameSafetyIssue[];
  expanded?: boolean;
  defaultExpanded?: boolean;
  className?: string;
  onExpandedChange?(expanded: boolean): void;
}

export function GameSafetyPanel({
  issues,
  expanded,
  defaultExpanded,
  className,
  onExpandedChange,
}: GameSafetyPanelProps) {
  const [internalExpanded, setInternalExpanded] = useState(
    defaultExpanded ?? issues.length > 0,
  );
  const isExpanded = expanded ?? internalExpanded;
  const headingId = useId();
  const contentId = useId();
  const classNames = [styles.safetyPanel, className].filter(Boolean).join(" ");

  const toggleExpanded = () => {
    const nextExpanded = !isExpanded;
    if (expanded === undefined) {
      setInternalExpanded(nextExpanded);
    }
    onExpandedChange?.(nextExpanded);
  };

  return (
    <section className={classNames}>
      <button
        id={headingId}
        className={styles.safetyToggle}
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={toggleExpanded}
      >
        <span
          className={styles.safetyHeadingIcon}
          data-has-issues={issues.length > 0}
          aria-hidden="true"
        >
          {issues.length > 0 ? <AlertIcon size={16} /> : <ShieldCheckIcon size={16} />}
        </span>
        <span className={styles.safetyHeading}>Game project checks</span>
        <CounterLabel aria-hidden="true">{issues.length}</CounterLabel>
        <ChevronDownIcon
          className={styles.safetyChevron}
          data-expanded={isExpanded}
          size={16}
          aria-hidden="true"
        />
      </button>

      {isExpanded && (
        <div
          id={contentId}
          className={styles.safetyContent}
          role="region"
          aria-labelledby={headingId}
        >
          {issues.length === 0 ? (
            <div className={styles.safetyEmpty}>
              <ShieldCheckIcon size={18} aria-hidden="true" />
              <span>No game project safety issues.</span>
            </div>
          ) : (
            <ul className={styles.issueList}>
              {issues.map((issue, index) => {
                const Icon = issueIcons[issue.kind];
                const label = issueLabels[issue.kind];

                return (
                  <li
                    className={styles.issue}
                    data-severity={issue.severity}
                    key={`${issue.kind}:${issue.path}:${index}`}
                  >
                    <span className={styles.issueIcon} aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    <div className={styles.issueBody}>
                      <div className={styles.issueTitleRow}>
                        <strong>{label}</strong>
                        <span className={styles.severity}>{issue.severity}</span>
                      </div>
                      <p>{issue.message}</p>
                      <code title={issue.path}>{issue.path}</code>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
