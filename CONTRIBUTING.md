# 为 RepoPuck 贡献 / Contributing to RepoPuck

感谢你愿意帮助 RepoPuck 变得更稳定、更易用。RepoPuck 的定位是**轻量、常驻、以 Windows 为先的 Git 桌面工具**：让查看变更、选择文件、提交和推送保持快速、安全且低干扰。

Thanks for helping RepoPuck become more stable and useful. RepoPuck is a **lightweight, always-ready, Windows-first Git companion** focused on fast, safe, low-friction change review, staging, committing, and pushing.

参与项目即表示你同意遵守 [社区行为准则](CODE_OF_CONDUCT.md)。发现安全问题时，请不要创建公开 Issue，改为遵循 [安全策略](SECURITY.md)。

By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md). Do not open a public issue for a vulnerability; follow the [Security Policy](SECURITY.md).

## 开始之前 / Before you start

1. 阅读[当前架构说明](docs/architecture.md)。[v0.1 设计规范](docs/superpowers/specs/2026-07-20-repopuck-design.md)仅作为历史产品背景保留。
2. 搜索现有 [Issues](https://github.com/YYchainsAw/RepoPuck/issues) 和 Pull Requests，避免重复工作。
3. 小修复可以直接开始；大型功能、Git 行为变化、新依赖和任何历史改写能力应先创建 Issue 讨论。
4. 保持产品聚焦。完整历史浏览器、复杂合并/rebase、凭据管理等能力需要单独的产品和安全评审。
5. 如果只是需要使用帮助，请先阅读 [SUPPORT.md](SUPPORT.md)。

1. Read the [architecture guide](docs/architecture.md). The [v0.1 design specification](docs/superpowers/specs/2026-07-20-repopuck-design.md) is retained as historical context.
2. Search existing [Issues](https://github.com/YYchainsAw/RepoPuck/issues) and pull requests to avoid duplicate work.
3. Small fixes can start directly. Discuss large features, Git behavior changes, new dependencies, and history rewriting in an issue first.
4. Preserve product focus. Full history browsers, complex merge/rebase flows, credential management, and similar expansions require product and security review.
5. For usage help, start with [SUPPORT.md](SUPPORT.md).

## 分支与提交 / Branches and commits

- 从最新的 `develop` 创建工作分支；`main` 仅用于可发布代码。
- 使用范围明确的名称，例如 `feat/diff-preview`、`fix/puck-toggle` 或 `docs/support-guide`。
- 优先用测试证明缺失或错误行为，再完成最小且完整的修复。
- 提交应小而连贯，使用 Conventional Commit 风格的祈使句，例如 `fix: preserve commit message after push failure`。
- 工作形成清晰单元时在本地提交；只在评审或发布检查点推送。
- 不要提交本地产物、真实仓库夹具、凭据、API Key、个人路径或未经评审的构建输出。

- Branch from the latest `develop`; `main` is reserved for release-ready code.
- Use focused names such as `feat/diff-preview`, `fix/puck-toggle`, or `docs/support-guide`.
- Prefer a test that demonstrates missing or incorrect behavior before implementing the smallest complete fix.
- Keep commits small and coherent, with imperative Conventional Commit messages such as `fix: preserve commit message after push failure`.
- Commit locally at coherent checkpoints and push at review or release checkpoints.
- Do not commit local artifacts, real repository fixtures, credentials, API keys, personal paths, or unreviewed build output.

## 配置开发环境 / Development setup

需要 Windows、系统 Git、Node.js、pnpm、Rust 和 Tauri 的 Windows 构建依赖。安装细节以 [README.md](README.md) 为准。

You need Windows, system Git, Node.js, pnpm, Rust, and Tauri's Windows build prerequisites. See [README.md](README.md) for current details.

```powershell
git clone https://github.com/YYchainsAw/RepoPuck.git
Set-Location RepoPuck
git checkout develop
git pull --ff-only
git switch -c feat/your-change
pnpm install --frozen-lockfile
```

运行原生应用：

```powershell
pnpm tauri dev
```

只调试前端内存演示：

```powershell
pnpm dev
```

## 测试与检查 / Tests and checks

发起评审前，请运行与改动相关的检查。完整检查集为：

Run all checks relevant to your change before requesting review. The complete set is:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build

Push-Location src-tauri
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
Pop-Location
```

影响原生窗口、托盘、Git 进程、文件持久化、安装或打包的改动，还必须在 Windows 原生环境执行冒烟测试。可能影响原生编译或打包时，运行：

Changes to native windows, tray behavior, Git processes, persistence, installation, or packaging also require a Windows-native smoke test. When native compilation or packaging may be affected, run:

```powershell
pnpm tauri build --debug
```

在完整发布门禁和视觉 QA 完成前，不要声称发布包已经验证。

Do not claim that a release package is verified until the complete release gate and visual QA pass.

## Git 安全要求 / Git safety requirements

任何启动 Git 或修改工作树、索引、引用的代码都有更高评审要求：

Code that launches Git or mutates the worktree, index, or refs has a higher review bar:

- 直接用参数数组调用 `git`，绝不把仓库数据插值进 shell 命令。
- Git 子命令支持时，在用户控制的文件路径前添加 `--`。
- 存储或使用仓库路径前进行验证和规范化。
- 将 stdout 和 stderr 视为不可信文本；错误信息不得泄露凭据、带凭据的远程 URL、环境变量、API Key 或敏感进程信息。
- 失败后保留用户选择的文件和提交信息。
- 串行化互相冲突的写操作，并在操作结束后刷新状态。
- Amend 是明确的历史改写：必须确认、保留失败草稿，绝不自动或强制推送。
- 使用临时仓库测试命令构造和行为；测试不得指向贡献者正在使用的仓库。

- Invoke `git` directly with an argument array; never interpolate repository data into a shell command.
- Add `--` before user-controlled file paths when the Git subcommand supports it.
- Validate and canonicalize repository paths before storing or using them.
- Treat stdout and stderr as untrusted. Errors must not expose credentials, credential-bearing remote URLs, environment values, API keys, or sensitive process data.
- Preserve selected files and the commit message after failure.
- Serialize conflicting mutations and refresh state when operations finish.
- Treat Amend as explicit history rewriting: require confirmation, preserve failed drafts, and never push automatically or forcibly.
- Test command construction and behavior with temporary repositories, never a contributor's active repository.

RepoPuck 将远程认证交给系统 Git。未经批准的安全设计，不得加入 GitHub 登录、密码、Personal Access Token、SSH Key 或自定义凭据存储。

RepoPuck delegates remote authentication to system Git. Do not add GitHub login, password, personal access token, SSH key, or custom credential storage without an approved security design.

## 产品、界面与隐私 / Product, UI, and privacy

- 将 `Changes` 和 `Unversioned files` 清晰分组。
- 将 `Commit` 和 `Commit & Push` 保持为两个独立动作。
- 使用 GitHub Primer 组件/Token 和 Primer Octicons；不要加入手绘 SVG、emoji 控件、渐变或 CSS 绘制的品牌图形。
- 高频动作保持可见；安全的次级动作放入更多菜单。
- 未经明确产品和安全评审，不要加入 merge、rebase、cherry-pick、破坏性 reset、冲突编辑、远程管理或 Amend 之外的历史改写。
- 保持可访问名称、可见焦点、完整键盘行为、长路径省略/标题提示和可恢复的错误反馈。
- 不要向遥测、日志或 AI 服务发送超出用户明确选择范围的仓库内容。
- AI 功能必须保持可选，并明确显示服务商、模型、语言、格式和数据边界。

- Keep `Changes` and `Unversioned files` visibly separate.
- Keep `Commit` and `Commit & Push` as distinct actions.
- Use GitHub Primer components/tokens and Primer Octicons. Do not add handcrafted SVGs, emoji controls, gradients, or CSS-drawn brand marks.
- Keep common actions visible and safe secondary actions in the overflow menu.
- Do not add merge, rebase, cherry-pick, destructive reset, conflict editing, remote management, or history rewriting beyond Amend without explicit product and security review.
- Preserve accessible names, visible focus, complete keyboard behavior, long-path truncation/tooltips, and recoverable error feedback.
- Do not send repository content beyond the user's explicit selection to telemetry, logs, or AI providers.
- AI features must remain optional and clearly communicate provider, model, language, format, and data boundaries.

界面改动至少检查：

UI changes must be checked at:

- 默认 `420 × 720` 和最小 `360 × 560` 面板尺寸；
- 浅色与深色主题；
- Windows 100%、125%、150% 显示缩放；
- 仅键盘导航、焦点顺序和屏幕阅读器可访问名称；
- 长仓库名、长分支名、深层路径、空状态、加载、失败和成功状态。

- default `420 × 720` and minimum `360 × 560` panel sizes;
- light and dark themes;
- Windows 100%, 125%, and 150% display scaling;
- keyboard-only navigation, focus order, and screen-reader accessible names;
- long repository and branch names, deep paths, empty, loading, error, and success states.

## 文档与本地化 / Documentation and localization

- 用户可见行为、设置或限制发生变化时，更新相关文档和 Release Notes。
- 中文和英文界面应表达相同含义；避免难以翻译的拼接字符串。
- 新文案保持简短、具体，优先说明用户结果。
- 文档链接应使用仓库内相对路径，外部事实尽量引用一手资料。

- Update relevant documentation and release notes when user-visible behavior, settings, or limitations change.
- Chinese and English UI should communicate the same meaning; avoid concatenated strings that are difficult to translate.
- Keep new copy concise, specific, and outcome-oriented.
- Use repository-relative links for local documentation and prefer primary sources for external facts.

## Pull Request 要求 / Pull request requirements

可评审的 Pull Request 应：

- 目标分支为 `develop`，并清楚描述用户可感知的结果；
- 关联 Issue，或解释为什么不需要预先讨论；
- 说明 Git 安全、持久化、认证、隐私和失败恢复影响；
- 列出实际运行的检查，而不是只写“测试通过”；
- 对可见改动提供实现截图或短视频，并写明窗口尺寸、主题和缩放；
- 避免无关格式化、依赖、锁文件、生成文件或版本号改动；
- 不包含凭据、私有 URL、个人路径和真实仓库内容；
- 完成 `.github/PULL_REQUEST_TEMPLATE.md` 中适用的检查项。

A review-ready pull request should:

- target `develop` and clearly describe the user-visible outcome;
- link an issue or explain why prior discussion was unnecessary;
- explain Git safety, persistence, authentication, privacy, and failure-recovery implications;
- list the checks actually run instead of saying only “tests pass”;
- include captures for visible changes with viewport, theme, and scaling details;
- avoid unrelated formatting, dependency, lockfile, generated-file, or version changes;
- contain no credentials, private URLs, personal paths, or real repository content;
- complete applicable items in `.github/PULL_REQUEST_TEMPLATE.md`.

评审顺序通常是：正确性与可恢复性、安全与隐私、无障碍与产品契合度、视觉质量、性能、可维护性。

Reviewers generally prioritize correctness and recoverability, security and privacy, accessibility and product fit, visual quality, performance, then maintainability.

## 许可证 / License

提交贡献即表示你同意按照项目的 [MIT License](LICENSE) 许可你的贡献，并确认你有权提交这些内容。

By contributing, you agree to license your contribution under the project's [MIT License](LICENSE) and confirm that you have the right to submit it.
