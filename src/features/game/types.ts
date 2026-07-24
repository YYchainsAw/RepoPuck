export type GameEngine = "unity" | "unreal";

export type GameFileCategory =
  | "code"
  | "scene"
  | "asset"
  | "config"
  | "generated"
  | "other";

export type GameSafetyIssueKind =
  | "missing-meta"
  | "orphan-meta"
  | "generated-file"
  | "large-file"
  | "lfs-recommended";

export type GameSafetyIssueSeverity = "warning" | "danger";

export interface GameProjectSummary {
  name: string;
  engine: GameEngine;
  version?: string;
  descriptorPath?: string;
}

export interface GameSafetyIssue {
  kind: GameSafetyIssueKind;
  severity: GameSafetyIssueSeverity;
  path: string;
  message: string;
}
