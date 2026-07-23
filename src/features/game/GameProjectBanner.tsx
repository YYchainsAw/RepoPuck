import { AlertIcon, ProjectIcon, ShieldCheckIcon } from "@primer/octicons-react";
import { CounterLabel } from "@primer/react";
import { useId } from "react";
import styles from "./game.module.css";
import type { GameProjectSummary, GameSafetyIssue } from "./types";

const engineLabels = {
  unity: "Unity",
  unreal: "Unreal",
} as const;

export interface GameProjectBannerProps {
  profile: GameProjectSummary;
  issues: readonly GameSafetyIssue[];
  className?: string;
}

export function GameProjectBanner({
  profile,
  issues,
  className,
}: GameProjectBannerProps) {
  const titleId = useId();
  const engineLabel = engineLabels[profile.engine];
  const classNames = [styles.banner, className].filter(Boolean).join(" ");
  const issueLabel = `${issues.length} game safety ${
    issues.length === 1 ? "issue" : "issues"
  }`;

  return (
    <section
      className={classNames}
      aria-labelledby={titleId}
      data-engine={profile.engine}
      title={profile.descriptorPath}
    >
      <div className={styles.projectMark} aria-hidden="true">
        <ProjectIcon size={18} />
      </div>
      <div className={styles.projectIdentity}>
        <div className={styles.projectHeading}>
          <strong id={titleId} className={styles.projectName}>
            {profile.name}
          </strong>
          <span className={styles.engineBadge}>{engineLabel}</span>
        </div>
        <span className={styles.projectVersion}>
          {profile.version ? `${engineLabel} ${profile.version}` : `${engineLabel} project`}
        </span>
      </div>
      {issues.length > 0 ? (
        <div
          className={styles.issueSummary}
          data-has-issues="true"
          aria-label={issueLabel}
        >
          <AlertIcon size={16} aria-hidden="true" />
          <CounterLabel aria-hidden="true">{issues.length}</CounterLabel>
          <span>{issues.length === 1 ? "issue" : "issues"}</span>
        </div>
      ) : (
        <div
          className={styles.issueSummary}
          data-has-issues="false"
          aria-label="No game safety issues"
        >
          <ShieldCheckIcon size={16} aria-hidden="true" />
          <span>Checks clear</span>
        </div>
      )}
    </section>
  );
}
