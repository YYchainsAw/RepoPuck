import type { AppLanguage } from "./index";
import type {
  GameSafetyIssueKind,
  GameSafetyIssueSeverity,
} from "../features/game";

export interface GameCopy {
  project(engine: string): string;
  issueCount(count: number): string;
  issueShort(count: number): string;
  noIssues: string;
  checksClear: string;
  checksHeading: string;
  noProjectIssues: string;
  issueLabels: Record<GameSafetyIssueKind, string>;
  severity: Record<GameSafetyIssueSeverity, string>;
}

const en: GameCopy = {
  project: (engine: string) => `${engine} project`,
  issueCount: (count: number) =>
    `${count} game safety ${count === 1 ? "issue" : "issues"}`,
  issueShort: (count: number) => (count === 1 ? "issue" : "issues"),
  noIssues: "No game safety issues",
  checksClear: "Checks clear",
  checksHeading: "Game project checks",
  noProjectIssues: "No game project safety issues.",
  issueLabels: {
    "missing-meta": "Missing .meta file",
    "orphan-meta": "Orphan .meta file",
    "generated-file": "Generated file",
    "large-file": "Large file",
    "lfs-recommended": "Git LFS recommended",
  },
  severity: {
    warning: "warning",
    danger: "danger",
  },
};

const zhCN: GameCopy = {
  project: (engine: string) => `${engine} 项目`,
  issueCount: (count: number) => `${count} 个游戏项目安全问题`,
  issueShort: () => "个问题",
  noIssues: "没有游戏项目安全问题",
  checksClear: "检查通过",
  checksHeading: "游戏项目检查",
  noProjectIssues: "未发现游戏项目安全问题。",
  issueLabels: {
    "missing-meta": "缺少 .meta 文件",
    "orphan-meta": "孤立的 .meta 文件",
    "generated-file": "引擎生成的文件",
    "large-file": "大文件",
    "lfs-recommended": "建议使用 Git LFS",
  },
  severity: {
    warning: "警告",
    danger: "危险",
  },
};

export function getGameCopy(language: AppLanguage): GameCopy {
  return language === "zh-CN" ? zhCN : en;
}

const issueMessagesZhCN: Record<string, string> = {
  "This Unity asset is missing its .meta file.":
    "此 Unity 资源缺少对应的 .meta 文件。",
  "This Unity .meta file has no matching asset.":
    "此 Unity .meta 文件没有对应的资源。",
  "The staged Unity asset would be committed without its .meta file.":
    "已暂存的 Unity 资源将缺少对应的 .meta 文件，暂不建议提交。",
  "The staged Unity .meta file would be committed without its asset.":
    "已暂存的 Unity .meta 文件将缺少对应资源，暂不建议提交。",
  "Deleting this Unity asset would leave its .meta file behind.":
    "删除此 Unity 资源后会留下孤立的 .meta 文件。",
  "The matching Unity .meta file is changed but not selected.":
    "对应的 Unity .meta 文件已更改，但尚未选择。",
  "The matching Unity asset is changed but not selected.":
    "对应的 Unity 资源已更改，但尚未选择。",
  "This file is inside an engine-generated directory.":
    "此文件位于引擎生成的目录中。",
  "This binary game asset is a good Git LFS candidate.":
    "建议使用 Git LFS 管理此二进制游戏资源。",
  "This file is at least 100 MiB and may be rejected by the Git host.":
    "此文件至少为 100 MiB，Git 托管平台可能拒绝接收。",
  "This file is at least 50 MiB and will make the repository heavier.":
    "此文件至少为 50 MiB，会显著增加仓库体积。",
  "This staged Git LFS pointer needs a matching staged filter=lfs rule.":
    "此已暂存的 Git LFS 指针需要同时暂存对应的 filter=lfs 规则。",
};

export function localizeGameIssueMessage(
  message: string,
  language: AppLanguage,
): string {
  return language === "zh-CN" ? (issueMessagesZhCN[message] ?? message) : message;
}

export function getLocalizedIssueLabel(
  kind: GameSafetyIssueKind,
  language: AppLanguage,
): string {
  return getGameCopy(language).issueLabels[kind];
}

export function getLocalizedSeverity(
  severity: GameSafetyIssueSeverity,
  language: AppLanguage,
): string {
  return getGameCopy(language).severity[severity];
}
