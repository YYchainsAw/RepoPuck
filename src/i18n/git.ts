import type { AppLanguage } from "./index";
import type { GitAction } from "../features/git/useGitWorkspace";

export interface GitCopy {
  changes: string;
  unversionedFiles: string;
  categories: Record<
    "code" | "scene" | "asset" | "config" | "generated" | "other",
    string
  >;
  workingTreeClean: string;
  noLocalChanges: string;
  stage: string;
  unstage: string;
  stageAll(group: string): string;
  unstageAll(group: string): string;
  commitMessage: string;
  generateCommitMessage: string;
  generateFromStaged: string;
  commit: string;
  commitAndPush: string;
  stageBeforeCommit: string;
  chooseRepository: string;
  chooseRepositoryDescription: string;
  chooseRepositoryButton: string;
  recentRepositories: string;
  recent: string;
  openRepository(path: string): string;
  stagedDiffTruncated: string;
  sensitiveFilesExcluded(count: number): string;
  generated(details: string[]): string;
  actionFailed(action: GitAction): string;
  commitSucceededPushFailed(detail: string): string;
}

const en: GitCopy = {
  changes: "Changes",
  unversionedFiles: "Unversioned files",
  categories: {
    code: "Code",
    scene: "Scenes & Blueprints",
    asset: "Assets",
    config: "Configuration",
    generated: "Generated files",
    other: "Other changes",
  },
  workingTreeClean: "Working tree clean",
  noLocalChanges: "There are no local changes.",
  stage: "Stage",
  unstage: "Unstage",
  stageAll: (group: string) => `Stage all ${group}`,
  unstageAll: (group: string) => `Unstage all ${group}`,
  commitMessage: "Commit message",
  generateCommitMessage: "Generate commit message with AI",
  generateFromStaged: "Generate from staged changes",
  commit: "Commit",
  commitAndPush: "Commit & Push",
  stageBeforeCommit: "Stage at least one file to commit.",
  chooseRepository: "Choose a repository",
  chooseRepositoryDescription:
    "Select a local Git repository to review and commit its changes.",
  chooseRepositoryButton: "Choose repository",
  recentRepositories: "Recent repositories",
  recent: "Recent",
  openRepository: (path: string) => `Open ${path}`,
  stagedDiffTruncated: "The staged diff was truncated.",
  sensitiveFilesExcluded: (count: number) =>
    `${count} sensitive ${count === 1 ? "file was" : "files were"} excluded.`,
  generated: (details: string[]) =>
    details.length > 0
      ? `AI commit message generated. ${details.join(" ")}`
      : "AI commit message generated.",
  actionFailed: (action: GitAction) => `${action} failed`,
  commitSucceededPushFailed: (detail: string) =>
    `Commit succeeded, but Push failed. You can retry Push. ${detail}`,
};

const zhCN: GitCopy = {
  changes: "更改",
  unversionedFiles: "未版本控制的文件",
  categories: {
    code: "代码",
    scene: "场景与蓝图",
    asset: "资源",
    config: "配置",
    generated: "生成的文件",
    other: "其他更改",
  },
  workingTreeClean: "工作区干净",
  noLocalChanges: "当前没有本地更改。",
  stage: "暂存",
  unstage: "取消暂存",
  stageAll: (group: string) => `暂存“${group}”中的全部文件`,
  unstageAll: (group: string) => `取消暂存“${group}”中的全部文件`,
  commitMessage: "提交信息",
  generateCommitMessage: "使用 AI 生成提交信息",
  generateFromStaged: "根据已暂存的更改生成",
  commit: "提交",
  commitAndPush: "提交并推送",
  stageBeforeCommit: "请至少暂存一个文件后再提交。",
  chooseRepository: "选择仓库",
  chooseRepositoryDescription: "选择一个本地 Git 仓库以查看并提交更改。",
  chooseRepositoryButton: "选择仓库",
  recentRepositories: "最近使用的仓库",
  recent: "最近使用",
  openRepository: (path: string) => `打开 ${path}`,
  stagedDiffTruncated: "已暂存的差异内容已截断。",
  sensitiveFilesExcluded: (count: number) =>
    `已排除 ${count} 个可能包含敏感信息的文件。`,
  generated: (details: string[]) =>
    details.length > 0
      ? `AI 提交信息已生成。${details.join(" ")}`
      : "AI 提交信息已生成。",
  actionFailed: (action: GitAction) =>
    `${actionLabelsZhCN[action] ?? action}失败`,
  commitSucceededPushFailed: (detail: string) =>
    `提交成功，推送失败，可重试推送。${detail}`,
};

const actionLabelsZhCN: Record<GitAction, string> = {
  selectRepository: "选择仓库",
  stage: "暂存",
  unstage: "取消暂存",
  commit: "提交",
  amendLastCommit: "修改上次提交",
  push: "推送",
  commitAndPush: "提交并推送",
  switchBranch: "切换分支",
  createBranch: "创建分支",
  fetch: "获取远程更新",
  pull: "拉取",
  stash: "储藏更改",
  openTerminal: "打开终端",
  openExplorer: "打开文件资源管理器",
};

export function getGitCopy(language: AppLanguage): GitCopy {
  return language === "zh-CN" ? zhCN : en;
}

const exactMessagesZhCN: Record<string, string> = {
  "Repository selected": "已选择仓库",
  "Repository selected, but recent history could not be saved":
    "已选择仓库，但无法保存最近使用记录",
  "Changes staged": "已暂存更改",
  "Changes unstaged": "已取消暂存更改",
  "Staging updated": "暂存状态已更新",
  "Enter a commit message": "请输入提交信息",
  "Commit message cannot be empty": "提交信息不能为空",
  "Nothing staged to commit": "没有可提交的已暂存更改",
  "Nothing to commit": "没有可提交的更改",
  "Commit created": "提交已创建",
  "Changes committed": "更改已提交",
  "Last commit amended": "上次提交已修改",
  "Last commit amended with a new message": "已使用新信息修改上次提交",
  "Pushed to remote": "已推送到远程仓库",
  "Changes pushed": "更改已推送",
  "Committed and pushed": "已提交并推送",
  "Changes committed and pushed": "更改已提交并推送",
  "Branch switched": "分支已切换",
  "Branch created": "分支已创建",
  "Fetched from remote": "已从远程仓库获取更新",
  "Fetch complete": "获取远程更新完成",
  "Pulled from remote": "已从远程仓库拉取",
  "Pull complete": "拉取完成",
  "Changes stashed": "更改已储藏",
  "Opened terminal": "终端已打开",
  "Terminal opened": "终端已打开",
  "Opened Explorer": "文件资源管理器已打开",
  "Explorer opened": "文件资源管理器已打开",
  "No repository is selected": "尚未选择仓库",
  "No repository is selected.": "尚未选择仓库。",
  "Repository state is unavailable": "仓库状态不可用",
  "Configured Git remote is unavailable": "配置的 Git 远程仓库不可用",
  "Cannot amend without an existing commit": "没有已有提交，无法修改",
  "Cannot push a detached HEAD": "无法在分离头指针状态下推送",
  "Invalid branch name": "分支名称无效",
  "Native bridge unavailable": "本地通信桥接不可用",
  "AI API key is not configured": "尚未配置 AI API 密钥",
  "Stage at least one file before generating a message.":
    "请至少暂存一个文件后再生成提交信息。",
  "AI client could not be initialized": "无法初始化 AI 客户端",
  "AI provider response could not be read": "无法读取 AI 服务响应",
  "AI provider returned an invalid response": "AI 服务返回了无效响应",
  "AI provider returned an empty commit subject": "AI 服务返回了空的提交主题",
  "AI provider returned an unexpectedly large response":
    "AI 服务返回的内容异常过大",
  "Generated commit message exceeded 72 characters":
    "生成的提交信息超过了 72 个字符",
  "Repository changed while staged changes were being collected":
    "收集已暂存更改时仓库发生了变化",
  "Repository changed while the commit message was being generated":
    "生成提交信息时仓库发生了变化",
  "Staged changes could not be collected": "无法收集已暂存的更改",
  "Git operation could not be scheduled": "无法安排 Git 操作",
  "Git process input could not be written": "无法写入 Git 进程输入",
  "Git process output could not be read": "无法读取 Git 进程输出",
  "Git process could not be monitored": "无法监控 Git 进程",
  "Git process input is too large": "Git 进程输入过大",
  "Git is unavailable on PATH": "在 PATH 中找不到 Git",
  "Git process could not be isolated safely": "无法安全隔离 Git 进程",
  "Git operation timed out and was stopped": "Git 操作超时，已停止",
  "Git operation produced too much output": "Git 操作产生的输出过多",
  "Git index is locked": "Git 索引已锁定，请确认没有其他 Git 进程正在运行",
  "Git authentication failed": "Git 身份验证失败",
  "Git repository was not found": "未找到 Git 仓库",
  "Current Git branch has no upstream": "当前 Git 分支没有上游分支",
  "Current Git branch has an invalid upstream": "当前 Git 分支的上游配置无效",
  "Git push was rejected": "Git 推送被拒绝，请先同步远程更改",
  "Local changes prevent this Git operation": "本地更改阻止了此 Git 操作",
  "There is nothing to commit": "没有可提交的更改",
  "Git operation has conflicts": "Git 操作存在冲突，请先解决冲突",
  "Git operation failed": "Git 操作失败",
  "Could not open a terminal": "无法打开终端",
  "Could not open Explorer": "无法打开文件资源管理器",
  "Save an AI API key in Settings before generating":
    "请先在设置中保存 AI API 密钥",
  "Save or confirm an AI API key for this provider in Settings before generating":
    "请先在设置中为当前 AI 服务保存或确认 API 密钥",
  "Stored AI API key is invalid; save it again":
    "已保存的 AI API 密钥无效，请重新保存",
  "AI provider request timed out": "AI 服务请求超时",
  "Could not connect to the AI provider": "无法连接到 AI 服务",
  "AI provider request failed": "AI 服务请求失败",
  "AI provider rejected the API key": "AI 服务拒绝了此 API 密钥",
  "AI provider rate limit was reached": "已达到 AI 服务的请求频率限制",
  "AI provider is temporarily unavailable": "AI 服务暂时不可用",
  "AI provider returned no commit message": "AI 服务没有返回提交信息",
};

export function localizeGitMessage(
  message: string,
  language: AppLanguage,
): string {
  if (language !== "zh-CN") return message;

  const exact = exactMessagesZhCN[message];
  if (exact) return exact;

  const branchDoesNotExist = /^Branch (.+) does not exist$/u.exec(message);
  if (branchDoesNotExist) {
    return `分支 ${branchDoesNotExist[1]} 不存在`;
  }
  const branchExists = /^Branch (.+) already exists$/u.exec(message);
  if (branchExists) {
    return `分支 ${branchExists[1]} 已存在`;
  }
  const switched = /^Switched to (.+)$/u.exec(message);
  if (switched) return `已切换到 ${switched[1]}`;
  const created = /^Created (.+)$/u.exec(message);
  if (created) return `已创建 ${created[1]}`;

  const exitCode = /^(.+) \(exit code (.+)\)$/u.exec(message);
  if (exitCode) {
    const localizedClassification = exactMessagesZhCN[exitCode[1]];
    if (localizedClassification) {
      return `${localizedClassification}（退出代码 ${exitCode[2]}）`;
    }
  }

  const aiHttpError =
    /^AI provider rejected the request \(HTTP (\d{3})\)$/u.exec(message);
  if (aiHttpError) {
    return `AI 服务拒绝了请求（HTTP ${aiHttpError[1]}）`;
  }

  return message;
}
