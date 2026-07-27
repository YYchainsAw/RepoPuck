# 获取帮助 / Support

感谢你使用 RepoPuck。为了让问题更快到达正确位置，请按下面的方式选择渠道。

Thanks for using RepoPuck. Choose the route below so your request reaches the right place quickly.

## 先做这几步 / Before asking

1. 在 [Releases](https://github.com/YYchainsAw/RepoPuck/releases) 确认自己使用的是最新稳定版。
2. 搜索现有 [Issues](https://github.com/YYchainsAw/RepoPuck/issues)，包括已关闭的问题。
3. 重新启动 RepoPuck，并确认相同 Git 操作可以在该仓库的终端中完成。
4. 记录 RepoPuck 版本、Windows 版本、安装方式、Git 版本和最短复现步骤。
5. 从截图和日志中删除 API Key、令牌、带凭据的远程 URL、用户名、个人路径和私有仓库内容。

1. Confirm that you use the latest stable version on [Releases](https://github.com/YYchainsAw/RepoPuck/releases).
2. Search existing [Issues](https://github.com/YYchainsAw/RepoPuck/issues), including closed ones.
3. Restart RepoPuck and confirm whether the same Git operation works in that repository's terminal.
4. Note the RepoPuck version, Windows version, installation method, Git version, and shortest reproduction path.
5. Remove API keys, tokens, credential-bearing remote URLs, usernames, personal paths, and private repository content from captures and logs.

## 应该去哪里？ / Where should I go?

| 需求 / Request | 渠道 / Channel |
| --- | --- |
| 可复现的错误、崩溃、显示或性能问题 / Reproducible bug, crash, visual, or performance issue | [Bug 报告 / Bug report](https://github.com/YYchainsAw/RepoPuck/issues/new?template=bug_report.yml) |
| 新能力或交互建议 / New capability or interaction | [功能建议 / Feature request](https://github.com/YYchainsAw/RepoPuck/issues/new?template=feature_request.yml) |
| 分享真实 Git 流程和阻力 / Real-world Git workflow feedback | [工作流反馈 / Workflow feedback](https://github.com/YYchainsAw/RepoPuck/issues/new?template=workflow_feedback.yml) |
| 安装、配置、使用方法或想法讨论 / Installation, configuration, usage, or open-ended ideas | [Discussions](https://github.com/YYchainsAw/RepoPuck/discussions) |
| 安全漏洞或凭据暴露 / Security vulnerability or credential exposure | 按 [SECURITY.md](SECURITY.md) 私下报告 / Report privately through [SECURITY.md](SECURITY.md) |
| 行为准则问题 / Code of Conduct concern | 按 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 私下报告 / Report privately through [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |

如果 Discussions 暂未启用，可以创建一个不含敏感信息的 Issue，请维护者帮助分流。请不要用 Bug 表单提交一般性的 Git 教程问题或第三方 AI 服务计费问题。

If Discussions are not yet enabled, open a non-sensitive issue and ask the maintainers to route it. Please do not use the Bug form for general Git tutorials or third-party AI provider billing questions.

## 提供有效诊断信息 / Useful diagnostics

请尽量提供：

- 问题发生前后的实际操作；
- RepoPuck 的入口模式、主题、显示缩放和多显示器情况；
- 仓库大致规模、变更文件数量、是否使用 Git LFS 或子模块；
- 同等 Git 命令在终端是否成功；
- 已脱敏的完整错误文本，而不只是“不能用”；
- 对 UI 问题提供短录屏通常比多张截图更有效。

Helpful details include:

- exact actions immediately before and after the problem;
- RepoPuck entry mode, theme, display scaling, and multi-monitor setup;
- approximate repository size, changed-file count, Git LFS, or submodules;
- whether the equivalent Git operation succeeds in a terminal;
- complete sanitized error text rather than only “it doesn't work”;
- a short recording for interaction defects when possible.

对于 AI 提交信息问题，可填写服务商、模型、语言和格式设置，但**不要提交 API Key、完整请求头或包含私有代码的原始请求体**。

For AI commit-message issues, include the provider, model, language, and format settings, but **never submit API keys, complete request headers, or raw request bodies containing private code**.

## 支持边界 / Support boundaries

- RepoPuck 复用系统 Git 和现有凭据管理，不保存 GitHub 密码、Personal Access Token 或 SSH Key。
- 社区维护者无法恢复丢失的 Git 历史、访问你的私有仓库，或代替 AI 服务商处理账户和计费。
- 请先备份重要工作，并在尝试历史改写或破坏性 Git 命令前理解其影响。
- 本项目由社区维护，不提供固定响应时间；清晰、可复现且经过脱敏的问题通常最容易获得帮助。

- RepoPuck reuses system Git and existing credential management; it does not store GitHub passwords, personal access tokens, or SSH keys.
- Community maintainers cannot recover lost Git history, access your private repositories, or resolve third-party AI account and billing matters.
- Back up important work and understand the impact before running history-rewriting or destructive Git commands.
- This is a community-maintained project with no guaranteed response time; clear, reproducible, sanitized reports are the easiest to help with.

中文和英文都欢迎。其他语言的报告也可以提交，但回复时间可能更长。

Chinese and English are both welcome. Reports in other languages are accepted, although responses may take longer.
