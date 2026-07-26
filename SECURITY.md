# 安全策略 / Security Policy

RepoPuck 是一个在本机调用系统 Git 的轻量 Windows 桌面工具。我们认真对待命令边界、仓库路径、凭据、AI API Key、安装包和更新链路中的安全问题。

RepoPuck is a lightweight Windows desktop application that invokes the user's system Git. We take command boundaries, repository paths, credentials, AI API keys, installers, and update paths seriously.

## 支持范围 / Supported versions

- **最新稳定版**会优先获得安全修复。/ The **latest stable release** receives security fixes first.
- `develop` 和预发布构建仅用于测试，不建议用于敏感仓库。/ `develop` and prerelease builds are for testing and are not recommended for sensitive repositories.
- 旧版本通常不会单独维护；必要时我们会说明受影响版本和升级路径。/ Older releases are generally not maintained separately; advisories will identify affected versions and upgrade paths when possible.

请先在 [Releases](https://github.com/YYchainsAw/RepoPuck/releases) 中确认你使用的版本。

Check your installed version against the [Releases](https://github.com/YYchainsAw/RepoPuck/releases) page before reporting.

## 私下报告漏洞 / Report a vulnerability privately

**请不要为安全漏洞创建公开 Issue、Discussion 或 Pull Request。**

**Do not open a public issue, discussion, or pull request for a security vulnerability.**

1. 使用 GitHub 的[私密漏洞报告](https://github.com/YYchainsAw/RepoPuck/security/advisories/new)。
2. 如果该入口暂不可用，请只创建一个不含漏洞细节的普通 Issue，请求维护者提供私密联系方式。
3. 在收到维护者确认前，不要公开利用方式、日志、PoC 或受影响仓库信息。

1. Use GitHub's [private vulnerability reporting](https://github.com/YYchainsAw/RepoPuck/security/advisories/new).
2. If that entry point is unavailable, open a regular issue containing no vulnerability details and ask for a private contact channel.
3. Do not disclose exploitation steps, logs, proof-of-concept code, or affected repository information before the maintainers acknowledge the report.

报告应尽量包含 / Please include:

- 受影响的 RepoPuck 版本、Windows 版本和安装方式；
- 漏洞类型、影响和所需前置条件；
- 最小复现步骤或经过脱敏的 PoC；
- 是否涉及私有仓库、凭据、API Key、远程 URL 或本地文件；
- 你建议的披露时间，以及是否愿意在修复后署名。

- affected RepoPuck version, Windows version, and installation method;
- vulnerability class, impact, and prerequisites;
- minimal reproduction steps or a sanitized proof of concept;
- whether private repositories, credentials, API keys, remote URLs, or local files are involved;
- your proposed disclosure timeline and attribution preference.

**切勿发送真实凭据、完整 API Key、私有仓库副本或不必要的个人数据。**

**Never send real credentials, complete API keys, copies of private repositories, or unnecessary personal data.**

## 我们的处理方式 / What to expect

维护者会尽力：

- 在 3 个工作日内确认收到；
- 在 7 个工作日内给出初步分类和后续计划；
- 在修复准备好之前通过私密渠道同步重要进展；
- 与报告者协调修复、公告、CVE（如适用）和署名；
- 通常以 90 天作为协调披露的最长目标，但严重风险可能需要更快处理。

Maintainers aim to:

- acknowledge reports within 3 business days;
- provide an initial assessment and next-step plan within 7 business days;
- share material progress privately until a fix is ready;
- coordinate remediation, advisories, CVEs when applicable, and attribution;
- use 90 days as a general maximum coordinated-disclosure target, while critical risks may require faster action.

这些是志愿维护目标，不是服务等级协议。/ These are volunteer-maintainer targets, not a service-level agreement.

## 安全问题示例 / Examples of security issues

- Git 参数注入、命令执行或仓库路径越界；
- 恶意仓库内容导致读取或修改预期目录之外的文件；
- 凭据、远程 URL、环境变量、AI API Key 或敏感日志泄露；
- 未经确认的危险 Git 操作或可绕过的历史改写保护；
- 安装包、更新链路或发布校验被篡改；
- 应用权限边界或本地 IPC 中可被利用的问题。

- Git argument injection, command execution, or repository path traversal;
- malicious repository content causing access outside the intended directory;
- exposure of credentials, remote URLs, environment variables, AI API keys, or sensitive logs;
- dangerous Git mutations without confirmation or bypassable history-rewrite safeguards;
- tampering with installers, update paths, or release verification;
- exploitable application permission boundaries or local IPC behavior.

普通崩溃、视觉问题、性能下降以及不跨越安全边界的功能错误，请使用 Bug Issue Form。第三方 Git、AI 服务商或操作系统本身的问题，应优先报告给对应维护方。

Use the Bug Issue Form for ordinary crashes, visual defects, performance regressions, and functional bugs that do not cross a security boundary. Report issues solely within Git, an AI provider, or Windows to the relevant upstream project.

## 善意研究 / Good-faith research

如果你遵守本策略、避免隐私侵犯和数据破坏、只访问你有权使用的系统，并给我们合理的修复时间，我们会将你的研究视为善意行为。当前项目不提供漏洞赏金。

We consider research conducted under this policy to be in good faith when it avoids privacy violations and data destruction, targets only systems you are authorized to use, and allows reasonable remediation time. This project does not currently offer a bug bounty.
