import type { AppLanguage } from ".";

export interface ShellCopy {
  settings: {
    title: string;
    close: string;
    interfaceLanguage: string;
    interfaceLanguageHelp: string;
    languageSystem: string;
    languageChinese: string;
    languageEnglish: string;
    launchMode: string;
    launchModes: Record<
      "puck" | "top-island" | "top-drawer",
      { label: string; description: string }
    >;
    applyingLaunchMode: string;
    theme: string;
    themeSystem: string;
    themeLight: string;
    themeDark: string;
    keepPanelOnTop: string;
    topModesStayAbove: string;
    aiTitle: string;
    aiDescription: string;
    aiBaseUrl: string;
    aiBaseUrlHelp: string;
    aiModel: string;
    commitLanguage: string;
    commitFormatAutomatic: string;
    apiKey: string;
    apiKeyDescription: string;
    providerKeyScope(provider: string): string;
    providerChanged(provider: string): string;
    legacyKeyAvailable(provider: string): string;
    useSavedKey: string;
    confirmLegacyKey: string;
    aiApiKey: string;
    replaceKeyPlaceholder: string;
    enterKeyPlaceholder: string;
    saveKey: string;
    saving: string;
    remove: string;
    checkingKeyStorage: string;
    keySaved: string;
    keySavedFor(provider: string): string;
    noKeySaved: string;
    noKeySavedFor(provider: string): string;
    savingToCredentialManager: string;
    removingKey: string;
    secureStorageDesktopOnly: string;
    privacyTitle: string;
    privacyDescription: string;
    contextTitle: string;
    contextDescription: string;
    contextLoading: string;
    contextReady(files: number, size: string): string;
    contextBinaryOmitted(files: number): string;
    contextExcluded(files: number): string;
    contextTruncated: string;
    contextUnavailable: string;
    recentRepositories: string;
    clear: string;
    clearRecentRepositories: string;
    noRecentRepositories: string;
    openRepository(path: string): string;
    errors: {
      readKeyStatus: string;
      enterKey: string;
      saveKey: string;
      removeKey: string;
      changeLaunchMode: string;
    };
  };
  panel: {
    ariaLabel: string;
    repositoryChanges: string;
    busy: Record<
      | "selectRepository"
      | "stage"
      | "unstage"
      | "commit"
      | "amendLastCommit"
      | "push"
      | "commitAndPush"
      | "switchBranch"
      | "createBranch"
      | "fetch"
      | "pull"
      | "stash"
      | "openTerminal"
      | "openExplorer",
      string
    >;
    generatingCommitMessage: string;
    createBranch: string;
    newBranchName: string;
    create: string;
    amendLastCommit: string;
    amendWarning: string;
    optionalCommitMessage: string;
    keepExistingMessage: string;
    amendFilesHelp: string;
    cancel: string;
    amendCommit: string;
  };
  header: {
    unpinPanel: string;
    pinPanel: string;
    useLightTheme: string;
    useDarkTheme: string;
    moreActions: string;
    branch: string;
    createBranch: string;
    remoteDivergence: string;
    aheadBehind(ahead: number, behind: number): string;
    refreshRepository: string;
  };
  menu: {
    repositoryActions: string;
    fetch: string;
    pull: string;
    push: string;
    stash: string;
    openTerminal: string;
    openExplorer: string;
    amendLastCommit: string;
    settings: string;
  };
  notice: {
    copied: string;
    copyFailed: string;
    copyErrorDetails: string;
    dismiss: string;
  };
  drawer: {
    move: string;
    moveTitle: string;
  };
  launcher: {
    surface: string;
    noChangedFiles: string;
    changedFiles(count: number): string;
    togglePanel(countLabel: string): string;
    showOrHide: string;
    topIsland: string;
    hidePanel(countLabel: string): string;
    showPanel(countLabel: string): string;
    hide: string;
    open: string;
  };
}

const en: ShellCopy = {
  settings: {
    title: "Settings",
    close: "Close",
    interfaceLanguage: "Interface language",
    interfaceLanguageHelp: "Follow Windows by default, or choose a language for RepoPuck.",
    languageSystem: "System",
    languageChinese: "中文",
    languageEnglish: "English",
    launchMode: "Launch mode",
    launchModes: {
      puck: {
        label: "Floating puck",
        description: "Drag the puck anywhere and open the panel beside it.",
      },
      "top-island": {
        label: "Top island",
        description: "Keep a compact repository status at the top center.",
      },
      "top-drawer": {
        label: "Top drawer",
        description:
          "Reveal at the top edge; keyboard users can open it from the system tray.",
      },
    },
    applyingLaunchMode: "Applying launch mode…",
    theme: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    keepPanelOnTop: "Keep panel on top",
    topModesStayAbove: "Top modes stay above other windows by design.",
    aiTitle: "AI commit message",
    aiDescription:
      "Generate a complete Conventional Commit message from staged changes.",
    aiBaseUrl: "AI service base URL",
    aiBaseUrlHelp: "OpenAI-compatible; RepoPuck targets /chat/completions.",
    aiModel: "AI model",
    commitLanguage: "Commit language",
    commitFormatAutomatic:
      "AI chooses the commit type and optional scope from the staged diff.",
    apiKey: "API key",
    apiKeyDescription:
      "The key is stored in Windows Credential Manager and is never written to settings.json.",
    providerKeyScope: (provider) =>
      `Credentials are isolated to ${provider}; changing the provider never reuses this key automatically.`,
    providerChanged: (provider) =>
      `Provider changed to ${provider}. Confirm a key already saved for this host or save a new one.`,
    legacyKeyAvailable: (provider) =>
      `A key saved by an older RepoPuck version is available. Confirm before assigning it to ${provider}.`,
    useSavedKey: "Use saved key",
    confirmLegacyKey: "Confirm existing key",
    aiApiKey: "AI API key",
    replaceKeyPlaceholder: "Enter a new key to replace it",
    enterKeyPlaceholder: "Enter API key",
    saveKey: "Save key",
    saving: "Saving…",
    remove: "Remove",
    checkingKeyStorage: "Checking secure key storage…",
    keySaved: "API key saved securely.",
    keySavedFor: (provider) => `API key saved securely for ${provider}.`,
    noKeySaved: "No API key saved yet.",
    noKeySavedFor: (provider) => `No API key is saved for ${provider}.`,
    savingToCredentialManager: "Saving to Windows Credential Manager…",
    removingKey: "Removing the saved API key…",
    secureStorageDesktopOnly:
      "Secure API key storage is available in the RepoPuck desktop app.",
    privacyTitle: "Privacy:",
    privacyDescription:
      "only when you click AI, staged text differences are sent to the selected AI service. Known sensitive paths and binary contents are excluded, and common secret-looking lines are redacted.",
    contextTitle: "AI context preview",
    contextDescription: "This is the staged context RepoPuck will prepare before a request.",
    contextLoading: "Checking the staged context…",
    contextReady: (files, size) =>
      `${files} staged ${files === 1 ? "file" : "files"} · approximately ${size}`,
    contextBinaryOmitted: (files) =>
      `${files} binary ${files === 1 ? "file has" : "files have"} content omitted.`,
    contextExcluded: (files) =>
      `${files} sensitive ${files === 1 ? "file is" : "files are"} excluded.`,
    contextTruncated: "The context is truncated at RepoPuck's safe size limit.",
    contextUnavailable: "Stage files in an open repository to preview the AI context.",
    recentRepositories: "Recent repositories",
    clear: "Clear",
    clearRecentRepositories: "Clear recent repositories",
    noRecentRepositories: "No recent repositories.",
    openRepository: (path) => `Open ${path}`,
    errors: {
      readKeyStatus: "RepoPuck could not read the saved API key status.",
      enterKey: "Enter an API key before saving.",
      saveKey: "RepoPuck could not save the API key.",
      removeKey: "RepoPuck could not remove the API key.",
      changeLaunchMode: "RepoPuck could not change the launch mode.",
    },
  },
  panel: {
    ariaLabel: "RepoPuck Git panel",
    repositoryChanges: "Repository changes",
    busy: {
      selectRepository: "Choosing repository…",
      stage: "Staging…",
      unstage: "Unstaging…",
      commit: "Committing…",
      amendLastCommit: "Amending last commit…",
      push: "Pushing…",
      commitAndPush: "Committing and pushing…",
      switchBranch: "Switching branch…",
      createBranch: "Creating branch…",
      fetch: "Fetching…",
      pull: "Pulling…",
      stash: "Stashing…",
      openTerminal: "Opening terminal…",
      openExplorer: "Opening Explorer…",
    },
    generatingCommitMessage: "Generating commit message…",
    createBranch: "Create branch",
    newBranchName: "New branch name",
    create: "Create",
    amendLastCommit: "Amend last commit",
    amendWarning:
      "Amending rewrites the latest local commit. RepoPuck never force-pushes.",
    optionalCommitMessage: "Optional commit message",
    keepExistingMessage: "Keep the existing commit message",
    amendFilesHelp:
      "Staged files, if any, are included. Leave this blank to keep the existing message.",
    cancel: "Cancel",
    amendCommit: "Amend commit",
  },
  header: {
    unpinPanel: "Unpin panel",
    pinPanel: "Pin panel",
    useLightTheme: "Use light theme",
    useDarkTheme: "Use dark theme",
    moreActions: "More actions",
    branch: "Branch",
    createBranch: "Create branch",
    remoteDivergence: "Remote divergence",
    aheadBehind: (ahead, behind) => `Ahead ${ahead}, behind ${behind}`,
    refreshRepository: "Refresh repository",
  },
  menu: {
    repositoryActions: "Repository actions",
    fetch: "Fetch",
    pull: "Pull",
    push: "Push",
    stash: "Stash",
    openTerminal: "Open terminal",
    openExplorer: "Open Explorer",
    amendLastCommit: "Amend last commit",
    settings: "Settings",
  },
  notice: {
    copied: "Copied",
    copyFailed: "Copy failed",
    copyErrorDetails: "Copy error details",
    dismiss: "Dismiss notification",
  },
  drawer: {
    move: "Move top drawer",
    moveTitle: "Drag to move the top drawer",
  },
  launcher: {
    surface: "RepoPuck launcher",
    noChangedFiles: "no changed files",
    changedFiles: (count) => `${count} changed ${count === 1 ? "file" : "files"}`,
    togglePanel: (countLabel) => `Toggle Git panel, ${countLabel}`,
    showOrHide: "Show or hide RepoPuck",
    topIsland: "RepoPuck top island",
    hidePanel: (countLabel) => `Hide RepoPuck Git panel, ${countLabel.toLowerCase()}`,
    showPanel: (countLabel) => `Show RepoPuck Git panel, ${countLabel.toLowerCase()}`,
    hide: "Hide RepoPuck",
    open: "Open RepoPuck",
  },
};

const zhCN: ShellCopy = {
  settings: {
    title: "设置",
    close: "关闭",
    interfaceLanguage: "界面语言",
    interfaceLanguageHelp: "默认跟随 Windows，也可以单独设置 RepoPuck 的界面语言。",
    languageSystem: "跟随系统",
    languageChinese: "中文",
    languageEnglish: "English",
    launchMode: "启动模式",
    launchModes: {
      puck: {
        label: "悬浮球",
        description: "可拖动到桌面任意位置，并在旁边打开 Git 面板。",
      },
      "top-island": {
        label: "顶部灵动岛",
        description: "与屏幕顶部融为一体，并显示紧凑的仓库状态。",
      },
      "top-drawer": {
        label: "顶部卷轴",
        description: "从屏幕顶边展开；键盘用户也可从系统托盘打开。",
      },
    },
    applyingLaunchMode: "正在应用启动模式…",
    theme: "主题",
    themeSystem: "跟随系统",
    themeLight: "浅色",
    themeDark: "深色",
    keepPanelOnTop: "面板保持置顶",
    topModesStayAbove: "顶部模式默认显示在其他窗口上方。",
    aiTitle: "AI 提交信息",
    aiDescription: "根据已暂存的更改生成完整的 Conventional Commit 提交信息。",
    aiBaseUrl: "AI 服务基础 URL",
    aiBaseUrlHelp: "兼容 OpenAI 接口；RepoPuck 请求 /chat/completions。",
    aiModel: "AI 模型",
    commitLanguage: "提交信息语言",
    commitFormatAutomatic: "AI 会根据已暂存的改动自动判断提交类型和可选作用域。",
    apiKey: "API 密钥",
    apiKeyDescription:
      "密钥保存在 Windows 凭据管理器中，不会写入 settings.json。",
    providerKeyScope: (provider) =>
      `凭据仅用于 ${provider}；更换服务主机时绝不会自动复用此密钥。`,
    providerChanged: (provider) =>
      `服务主机已更改为 ${provider}。请确认该主机已有的密钥，或保存一个新密钥。`,
    legacyKeyAvailable: (provider) =>
      `检测到旧版 RepoPuck 保存的密钥。将它分配给 ${provider} 前需要你的明确确认。`,
    useSavedKey: "使用已保存密钥",
    confirmLegacyKey: "确认使用旧密钥",
    aiApiKey: "AI API 密钥",
    replaceKeyPlaceholder: "输入新密钥以替换",
    enterKeyPlaceholder: "输入 API 密钥",
    saveKey: "保存密钥",
    saving: "正在保存…",
    remove: "移除",
    checkingKeyStorage: "正在检查安全密钥存储…",
    keySaved: "API 密钥已安全保存。",
    keySavedFor: (provider) => `已为 ${provider} 安全保存 API 密钥。`,
    noKeySaved: "尚未保存 API 密钥。",
    noKeySavedFor: (provider) => `尚未为 ${provider} 保存 API 密钥。`,
    savingToCredentialManager: "正在保存到 Windows 凭据管理器…",
    removingKey: "正在移除已保存的 API 密钥…",
    secureStorageDesktopOnly: "安全 API 密钥存储仅在 RepoPuck 桌面应用中可用。",
    privacyTitle: "隐私说明：",
    privacyDescription:
      "只有点击 AI 按钮时，已暂存文件的文本差异才会发送到所选 AI 服务。敏感路径和二进制内容会被排除，疑似密钥的常见文本行会被脱敏。",
    contextTitle: "AI 上下文预览",
    contextDescription: "这是 RepoPuck 在请求前准备的已暂存上下文。",
    contextLoading: "正在检查已暂存上下文…",
    contextReady: (files, size) => `${files} 个已暂存文件 · 约 ${size}`,
    contextBinaryOmitted: (files) => `${files} 个二进制文件的内容不会发送。`,
    contextExcluded: (files) => `${files} 个敏感文件已排除。`,
    contextTruncated: "上下文已按 RepoPuck 的安全大小限制截断。",
    contextUnavailable: "请在已打开的仓库中暂存文件，以预览 AI 上下文。",
    recentRepositories: "最近使用的仓库",
    clear: "清空",
    clearRecentRepositories: "清空最近使用的仓库",
    noRecentRepositories: "暂无最近使用的仓库。",
    openRepository: (path) => `打开 ${path}`,
    errors: {
      readKeyStatus: "RepoPuck 无法读取已保存 API 密钥的状态。",
      enterKey: "请先输入 API 密钥再保存。",
      saveKey: "RepoPuck 无法保存 API 密钥。",
      removeKey: "RepoPuck 无法移除 API 密钥。",
      changeLaunchMode: "RepoPuck 无法切换启动模式。",
    },
  },
  panel: {
    ariaLabel: "RepoPuck Git 面板",
    repositoryChanges: "仓库更改",
    busy: {
      selectRepository: "正在选择仓库…",
      stage: "正在暂存…",
      unstage: "正在取消暂存…",
      commit: "正在提交…",
      amendLastCommit: "正在修订上次提交…",
      push: "正在推送…",
      commitAndPush: "正在提交并推送…",
      switchBranch: "正在切换分支…",
      createBranch: "正在创建分支…",
      fetch: "正在获取远程更新…",
      pull: "正在拉取…",
      stash: "正在储藏更改…",
      openTerminal: "正在打开终端…",
      openExplorer: "正在打开文件资源管理器…",
    },
    generatingCommitMessage: "正在生成提交信息…",
    createBranch: "创建分支",
    newBranchName: "新分支名称",
    create: "创建",
    amendLastCommit: "修订上次提交",
    amendWarning: "修订会重写最新的本地提交。RepoPuck 不会执行强制推送。",
    optionalCommitMessage: "提交信息（可选）",
    keepExistingMessage: "保留现有提交信息",
    amendFilesHelp: "已暂存的文件会一并提交。留空可保留现有提交信息。",
    cancel: "取消",
    amendCommit: "修订提交",
  },
  header: {
    unpinPanel: "取消固定面板",
    pinPanel: "固定面板",
    useLightTheme: "切换为浅色主题",
    useDarkTheme: "切换为深色主题",
    moreActions: "更多操作",
    branch: "分支",
    createBranch: "创建分支",
    remoteDivergence: "与远程分支的差异",
    aheadBehind: (ahead, behind) => `领先 ${ahead}，落后 ${behind}`,
    refreshRepository: "刷新仓库",
  },
  menu: {
    repositoryActions: "仓库操作",
    fetch: "获取远程更新",
    pull: "拉取",
    push: "推送",
    stash: "储藏更改",
    openTerminal: "打开终端",
    openExplorer: "在文件资源管理器中打开",
    amendLastCommit: "修订上次提交",
    settings: "设置",
  },
  notice: {
    copied: "已复制",
    copyFailed: "复制失败",
    copyErrorDetails: "复制错误详情",
    dismiss: "关闭通知",
  },
  drawer: {
    move: "移动顶部卷轴",
    moveTitle: "拖动以移动顶部卷轴",
  },
  launcher: {
    surface: "RepoPuck 启动器",
    noChangedFiles: "无文件更改",
    changedFiles: (count) => `${count} 个文件有更改`,
    togglePanel: (countLabel) => `切换 Git 面板，${countLabel}`,
    showOrHide: "显示或隐藏 RepoPuck",
    topIsland: "RepoPuck 顶部灵动岛",
    hidePanel: (countLabel) => `隐藏 RepoPuck Git 面板，${countLabel}`,
    showPanel: (countLabel) => `显示 RepoPuck Git 面板，${countLabel}`,
    hide: "隐藏 RepoPuck",
    open: "打开 RepoPuck",
  },
};

export function getShellCopy(language: AppLanguage): ShellCopy {
  return language === "zh-CN" ? zhCN : en;
}

export function localizeShellError(
  message: string | null | undefined,
  language: AppLanguage,
): string | null {
  if (!message) return null;
  const copy = getShellCopy(language);
  const known: Record<string, string> = {
    "RepoPuck could not change the launch mode.": copy.settings.errors.changeLaunchMode,
    "RepoPuck could not read the saved API key status.":
      copy.settings.errors.readKeyStatus,
    "Enter an API key before saving.": copy.settings.errors.enterKey,
    "RepoPuck could not save the API key.": copy.settings.errors.saveKey,
    "RepoPuck could not remove the API key.": copy.settings.errors.removeKey,
    "API key must contain 1-2048 visible ASCII characters without spaces":
      language === "zh-CN"
        ? "API 密钥必须包含 1–2048 个不含空格的可见 ASCII 字符。"
        : "API key must contain 1–2048 visible ASCII characters without spaces.",
    "Windows Credential Manager could not read the AI API key":
      language === "zh-CN"
        ? "Windows 凭据管理器无法读取 AI API 密钥。"
        : "Windows Credential Manager could not read the AI API key.",
    "Windows Credential Manager returned an invalid credential":
      language === "zh-CN"
        ? "Windows 凭据管理器返回了无效凭据。"
        : "Windows Credential Manager returned an invalid credential.",
    "Stored AI API key is invalid; save it again":
      language === "zh-CN"
        ? "已保存的 AI API 密钥无效，请重新保存。"
        : "Stored AI API key is invalid; save it again.",
    "Windows Credential Manager could not save the AI API key":
      language === "zh-CN"
        ? "Windows 凭据管理器无法保存 AI API 密钥。"
        : "Windows Credential Manager could not save the AI API key.",
    "Windows Credential Manager could not remove the AI API key":
      language === "zh-CN"
        ? "Windows 凭据管理器无法移除 AI API 密钥。"
        : "Windows Credential Manager could not remove the AI API key.",
    "Secure AI API key storage is supported on Windows only":
      language === "zh-CN"
        ? "安全的 AI API 密钥存储仅支持 Windows。"
        : "Secure AI API key storage is supported on Windows only.",
    "Enter a valid AI base URL":
      language === "zh-CN" ? "请输入有效的 AI 服务基础 URL。" : "Enter a valid AI base URL.",
    "AI base URL must not contain credentials":
      language === "zh-CN"
        ? "AI 服务基础 URL 不能包含用户名或密码。"
        : "AI base URL must not contain credentials.",
    "AI base URL must use HTTPS (HTTP is allowed only for localhost)":
      language === "zh-CN"
        ? "AI 服务基础 URL 必须使用 HTTPS（仅 localhost 可使用 HTTP）。"
        : "AI base URL must use HTTPS (HTTP is allowed only for localhost).",
    "AI base URL must include a host":
      language === "zh-CN"
        ? "AI 服务基础 URL 必须包含主机。"
        : "AI base URL must include a host.",
    "No legacy AI API key is available to confirm":
      language === "zh-CN"
        ? "没有可供确认的旧版 AI API 密钥。"
        : "No legacy AI API key is available to confirm.",
  };
  return known[message] ?? message;
}
