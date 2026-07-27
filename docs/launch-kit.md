# RepoPuck launch kit

This kit keeps public messaging focused on RepoPuck as a lightweight Windows
Git companion. Adapt each post to the community instead of publishing identical
copy everywhere.

## Core positioning

### 中文短介绍

RepoPuck 是一个常驻桌面的轻量 Windows Git 助手：选择改动、提交和推送，
不必为了一个小改动切回 IDE 或打开完整 Git 客户端。

### 中文长介绍

RepoPuck 把高频 Git 操作放进一个随叫随到的 Windows 桌面面板。它支持按
文件暂存、分支切换、独立的 Commit 与 Commit & Push、浅色/深色主题，以及
完全可选的自带密钥 AI 提交信息草稿。它复用系统 Git 和现有凭据，不要求
登录 GitHub，也不试图替代 IDE 中的复杂 Git 工具。

### English tagline

Stage, commit, and push from an always-ready Windows desktop panel.

### English description

RepoPuck is an open-source, Windows-first Git companion for small, frequent
commits. Select changes, switch branches, commit locally, or commit and push
without opening a full Git client. It reuses system Git authentication, requires
no GitHub sign-in, and keeps BYOK AI commit-message drafts completely optional.

## Tester invitation

### 中文

> 我做了一个常驻桌面的轻量 Git 面板。能否用一个真实但不敏感的仓库完成
> 一次 Commit 或 Commit & Push？我最想知道：你在哪一步不敢继续，或者
> 觉得比原来的工具更麻烦。请不用为了帮忙而点 Star，真实反馈更有价值。

### English

> I built a lightweight Git panel that stays one click away on Windows. Could
> you try one real Commit or Commit & Push in a non-sensitive repository? I
> most want to know where you hesitate or where the flow feels slower than your
> current tool. Honest feedback is more useful than a courtesy star.

## V2EX 分享创造

### 标题

```text
[开源] 我把高频 Git 提交做成了 Windows 桌面小面板：RepoPuck
```

### 正文草稿

```markdown
我经常只是想选择几个文件、写一句提交信息然后 Push，但为了这件小事在
编辑器、终端和完整 Git 客户端之间来回切换，工作流很容易被打断。

所以我做了 RepoPuck：一个常驻桌面的轻量 Windows Git 助手。

[在这里放 5 步演示 GIF]

目前支持：

- 按文件暂存，并区分 Changes 与 Unversioned files
- Commit 与 Commit & Push 分开
- 切换/创建本地分支
- Fetch、Pull、Push、Stash 和可取消 Fetch
- 浅色、深色和跟随系统主题
- 可选的自带 API Key AI 提交信息草稿
- 不需要登录 GitHub，复用系统 Git 凭据或 SSH

它不是 GitHub Desktop 或 IDE Git 工具的替代品。Merge、Rebase、冲突编辑
等低频复杂操作仍然交给 IDE/终端，RepoPuck 只把高频提交路径做短。

项目目前仅支持 Windows，安装包暂未代码签名，Release 中提供 SHA-256 和
GitHub 构建来源证明。欢迎用真实工作流试一次，我最想听到的是：哪个环节
仍然让你不放心或感觉多余？

源码与下载：
https://github.com/YYchainsAw/RepoPuck
```

## 掘金技术文章

### 标题

```text
用 Tauri 2 + Rust 做一个常驻桌面的 Git 面板：窗口、进程树与凭据安全
```

### 建议结构

1. 为什么选择“Git companion”而不是完整 Git GUI。
2. Tauri 双窗口/多入口架构和面板状态共享。
3. Windows 下隐藏 Git 控制台与 Job Object 进程树回收。
4. 状态指纹、过期刷新取消和大仓库性能边界。
5. Commit 成功但 Push 失败时如何建模部分成功。
6. AI Key 的 Windows Credential Manager 存储与 Provider Origin 隔离。
7. MSI 安装生命周期测试、SHA-256 与构建来源证明。
8. 当前限制、公开仓库和希望获得的工程反馈。

## Show HN

### Title

```text
Show HN: RepoPuck – an always-ready Git panel for Windows
```

### Draft

```text
RepoPuck is a small open-source Git companion I built for Windows. It keeps
staging, branch switching, commit, and push one click away from the desktop,
without trying to replace a full Git client.

It delegates authentication to system Git, so there is no RepoPuck account or
GitHub sign-in. AI commit-message drafts are optional and use the user's own
OpenAI-compatible endpoint; generated text is always editable and nothing is
committed automatically.

The native shell is Tauri 2/Rust and the UI is React/TypeScript with GitHub
Primer. Recent work focused on cancelling complete Git process trees, avoiding
stale refreshes, handling Commit-success/Push-failure safely, and isolating AI
credentials by provider origin.

Windows x64 downloads, SHA-256 sums, build provenance, source, and the current
limitations are here:
https://github.com/YYchainsAw/RepoPuck

I would especially value feedback from people who make frequent small commits:
where does this still feel slower or less trustworthy than your current flow?
```

## Product Hunt metadata

- **Name:** RepoPuck
- **Tagline:** Stage, commit and push from an always-ready Windows panel.
- **Thumbnail:** the checked-in RepoPuck application icon.
- **Gallery lead:** `docs/images/repopuck-social-preview.png`
- **Demo:** `docs/images/repopuck-workflow-demo.gif`
- **Primary link:** `https://github.com/YYchainsAw/RepoPuck/releases/latest`
- **Source link:** `https://github.com/YYchainsAw/RepoPuck`

Do not launch on Product Hunt until the current Release installs cleanly on a
fresh machine and the maintainer can stay available to answer questions.

## Publishing sequence

1. Ask 10–15 Windows Git users for an installation and first-commit test.
2. Fix repeated installation, first-open, and error-message problems.
3. Publish one Chinese product post.
4. Publish one Chinese technical article 24–48 hours later.
5. Publish Show HN only when downloads are stable and the maintainer is
   available for discussion.
6. Adapt, rather than copy, a post for one or two relevant Reddit communities
   after reading their current rules.
7. Consider Product Hunt after the installation trust path is stronger.

Never buy stars, exchange rewards for stars/upvotes, mass-message developers,
or post identical promotions across unrelated communities.

## Privacy checklist for media

- Use fictional repository, branch, and file names.
- Hide local paths, usernames, email addresses, remotes, tokens, and API keys.
- Do not show private source code or notification content.
- Confirm every visible capability exists in the published version.
- Mention Windows-only and unsigned-installer limitations until they change.
