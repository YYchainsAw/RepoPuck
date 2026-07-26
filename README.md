<div align="center">
  <img src="src-tauri/icons/128x128.png" width="96" height="96" alt="RepoPuck 图标">

  <h1>RepoPuck</h1>

  <p><strong>随时在桌面，提交只需几秒。</strong></p>
  <p>轻量 Windows 桌面 Git 助手，让暂存、提交与推送更快一步。</p>

  <p>
    <strong>简体中文</strong>
    ·
    <a href="README.en.md">English</a>
  </p>

  <p>
    <a href="https://github.com/YYchainsAw/RepoPuck/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/YYchainsAw/RepoPuck?display_name=tag&style=flat-square&color=1f883d"></a>
    <a href="https://github.com/YYchainsAw/RepoPuck/releases"><img alt="下载次数" src="https://img.shields.io/github/downloads/YYchainsAw/RepoPuck/total?style=flat-square&color=0969da"></a>
    <a href="https://github.com/YYchainsAw/RepoPuck/actions/workflows/ci.yml"><img alt="CI 状态" src="https://img.shields.io/github/actions/workflow/status/YYchainsAw/RepoPuck/ci.yml?branch=main&style=flat-square&label=CI"></a>
    <a href="LICENSE"><img alt="MIT 许可证" src="https://img.shields.io/github/license/YYchainsAw/RepoPuck?style=flat-square&color=8250df"></a>
    <img alt="Windows 10 和 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0969da?style=flat-square&logo=windows11&logoColor=white">
  </p>

  <p>
    <a href="https://github.com/YYchainsAw/RepoPuck/releases/latest"><strong>⬇️ 下载最新版</strong></a>
    ·
    <a href="#-快速开始">快速开始</a>
    ·
    <a href="#-参与贡献">参与贡献</a>
  </p>
</div>

<br>

RepoPuck 把最常用的 Git 操作放在一个随叫随到的小面板里。你可以选择文件、切换分支、提交和推送，而不必为了一个小提交打开完整 Git 客户端。

<p align="center">
  <img src="docs/qa/v020/island-attached-composite.png" width="720" alt="RepoPuck 顶部灵动岛与 Git 面板">
</p>

## ✨ 为什么选择 RepoPuck？

- ⚡ **更短的提交路径**：勾选文件，输入说明，然后分别选择 **Commit** 或 **Commit & Push**。
- 🤖 **AI 提交信息草稿**：使用自己的 OpenAI 兼容 API，根据已暂存变更生成中文或英文的 Conventional Commit。
- 🧩 **三种桌面形态**：悬浮球、顶部灵动岛、顶部自动展开卷轴，按你的工作习惯切换。
- 🪶 **轻量而专注**：常用操作直接可见，次要操作收进更多菜单，不试图复制一个完整 IDE。
- 🌗 **熟悉的 GitHub 风格**：基于 GitHub Primer，支持浅色、深色和跟随系统主题。
- 🌐 **中文与 English**：默认跟随系统语言，也可随时在设置中手动切换。
- 🔐 **不绑定 GitHub 账号**：直接复用系统 Git、Git Credential Manager 或 SSH 配置。
- 🖥️ **Windows 原生体验**：系统托盘、置顶入口、无黑色控制台闪烁、DPI 与多显示器适配、窗口位置恢复。

界面默认跟随 Windows 语言。也可以在 **更多 → 设置 → 界面语言** 中选择 **跟随系统、中文或 English**；面板、悬浮球 / 灵动岛、托盘菜单和原生确认对话框会一起切换，无需重启。

## 🧭 三种桌面模式

在 **更多 → 设置 → 启动模式** 中选择模式。三种模式共享同一个 Git 工作区；切换外观不会改变当前仓库、暂存文件或提交草稿。

| 模式 | 交互方式 | 适合场景 |
| --- | --- | --- |
| 🟢 **悬浮球** | 可在桌面拖动。单击打开面板，再次单击关闭；面板会选择合适的悬浮球角落展开。 | 希望 Git 入口始终可见 |
| 🏝️ **顶部灵动岛** | 与屏幕工作区顶部融为一体，单击后面板紧贴其下方展开。 | 喜欢固定、稳定的顶部入口 |
| 📜 **顶部卷轴** | 收起时隐藏在顶部热区；鼠标靠近后向下展开，并可沿屏幕顶部水平移动和记忆位置。 | 希望平时完全不占桌面空间 |

| 悬浮球面板 | 顶部灵动岛 | 可移动顶部卷轴 |
| --- | --- | --- |
| <img src="docs/qa/v020/puck-panel.png" alt="RepoPuck 悬浮球面板" width="260"> | <img src="docs/qa/v020/island-attached-composite.png" alt="RepoPuck 顶部灵动岛" width="260"> | <img src="docs/qa/v020/drawer-open-right.png" alt="RepoPuck 顶部卷轴" width="260"> |

面板可调整大小并分别记忆三种模式的尺寸。顶部卷轴使用原生鼠标热区，而不是覆盖桌面的透明网页窗口；隐藏后不会挡住顶部区域的点击。

## ✅ Git 工作流

- 📂 选择本地仓库，或从最近使用列表重新打开。
- 👀 分开查看 **Changes** 与 **Unversioned files**。
- ☑️ 暂存/取消暂存单个文件或整个分组。
- 🌿 切换本地分支，或创建新分支。
- 💬 手动编写提交说明，或让 AI 根据已暂存变更生成 72 字符以内的草稿。
- ✅ 只在本地提交。
- 🚀 独立执行 **Commit & Push**，或稍后单独 Push。
- ✏️ 在确认后 Amend 最近一次本地提交，不自动执行强制推送。
- 🔄 Fetch、Pull、Push、Stash 与刷新状态。
- 🗂️ 在资源管理器或终端中打开仓库。

快捷键：

- `Enter`：Commit
- `Ctrl + Enter`：Commit & Push
- `Win + B`：通过 Windows 通知区域找到 RepoPuck 托盘菜单，可在顶部卷轴隐藏时用键盘打开面板

RepoPuck 有意不提供 Merge、Rebase、Cherry-pick、破坏性 Reset、冲突编辑器、远端管理和 Force Push。这些高风险或低频操作请继续在 IDE 或终端中完成。

## 🤖 AI 生成提交信息

AI 功能完全可选，不影响手动提交：

1. 打开 **更多 → 设置 → AI 提交信息**。
2. 填写 OpenAI 兼容服务的 Base URL、模型名称和 API Key。
3. 选择中文或英文、提交类型（例如 `feat`、`fix`、`docs`），并按需填写 scope。
4. 暂存文件后，点击提交框旁紧凑的 **AI** 按钮。生成结果只会填入草稿，不会自动 Commit 或 Push。

RepoPuck 在本地强制组装 Conventional Commit 格式，因此可以稳定得到 `feat: 说明` 或 `feat(ui): 说明`。你仍可在提交前自由编辑结果。

> [!IMPORTANT]
> API Key 只保存在当前 Windows 用户的**凭据管理器**中，不会写入 `settings.json`、前端存储、日志或仓库。只有主动点击生成时，RepoPuck 才会把有大小上限的**已暂存文本差异**直接发送到你配置的服务；已知敏感路径和二进制正文会被排除，常见疑似密钥行会被脱敏。自动过滤无法识别所有秘密，请在使用第三方服务前阅读其隐私政策，并检查即将发送的暂存内容。

## 🚀 快速开始

### 安装

1. 前往 [GitHub Releases](https://github.com/YYchainsAw/RepoPuck/releases/latest) 下载最新 Windows MSI。
2. 运行安装程序。
3. 从开始菜单启动 RepoPuck；应用会常驻系统托盘。
4. 选择一个本地 Git 仓库。
5. 勾选要提交的文件，填写提交说明，然后选择 **Commit** 或 **Commit & Push**。

> [!WARNING]
> 当前安装包尚未进行 Windows 代码签名，Windows 可能显示 **Unknown publisher** 或 Microsoft Defender SmartScreen 提示。请只从本仓库的 GitHub Release 下载，并用 Release notes 中提供的 SHA-256 校验文件。

### 运行要求

- Windows 10 或 Windows 11
- [Git for Windows](https://gitforwindows.org/) 已安装并加入 `PATH`
- Microsoft Edge WebView2 Runtime（受支持的 Windows 通常已内置）
- 远端操作所需的 Git Credential Manager 凭据，或已配置的 SSH agent / key

RepoPuck 不提供单独的终端登录窗口。建议先在仓库终端中确认 `git fetch` 或 `git push` 能正常工作。

## 🧩 可选的项目感知增强

RepoPuck 对普通仓库始终保持纯粹的通用 Git 界面。只有在明确识别到受支持的项目结构后，才会按需显示语义文件分组与额外的只读安全提示；这些能力不会改变、暂存或阻止你的文件。

## 🔗 可选：随编辑器自动启动

不安装桥接也能完整使用 RepoPuck。只有希望“打开项目时自动启动 RepoPuck 并选中当前项目”时，才需要下面的轻量桥接。

| 编辑器 | 安装方式 | 行为 |
| --- | --- | --- |
| 🟦 **Unity 2021.3+** | 在 Unity Package Manager 中选择 **Add package from disk**，打开 [`integrations/unity/com.repopuck.editor/package.json`](integrations/unity/com.repopuck.editor/package.json)。 | 每个编辑器会话发送一次唤醒请求；Batch Mode 不执行。 |
| 🟪 **Unreal Editor / Win64** | 把 [`integrations/unreal/RepoPuckEditor`](integrations/unreal/RepoPuckEditor) 复制到 `<YourProject>/Plugins/RepoPuckEditor`，启用插件并重启编辑器。 | 引擎初始化后唤醒 RepoPuck；Commandlet 和 Unattended 模式不执行，支持纯蓝图项目。 |

桥接只请求 RepoPuck 打开项目，不会在编辑器内部运行 Git、读取凭据或修改项目资源。当前桥接仍属于 Beta 功能；详细安装和移除步骤请查看 [Unity 指南](integrations/unity/README.md) 与 [Unreal 指南](integrations/unreal/README.md)。

RepoPuck 也支持显式命令行启动：

```powershell
.\repopuck.exe open "D:\Games\OrbitTactics"
.\repopuck.exe --repo "D:\Games\OrbitTactics"
```

安装版还会注册本地 `repopuck://open?path=...` 协议。首次由协议打开未记忆的项目时，RepoPuck 会展示准确路径并要求确认；协议不能执行 Git 操作或更改设置。

## 🔐 认证、隐私与安全边界

### 不需要 GitHub 登录

RepoPuck 不要求登录 GitHub，也不保存 GitHub Token、密码、SSH 私钥或 Git 凭据。远端操作直接交给系统 Git：

- HTTPS 使用现有 Git Credential Manager。
- SSH 使用现有 agent 与 key。
- 同样适用于 GitLab、自建服务器和其他标准 Git 远端。

### 本地数据

只保存非敏感的便捷设置：主题、固定状态、桌面模式、面板尺寸、入口位置、显示器选择、顶部卷轴位置、有限数量的最近仓库路径，以及 AI 服务地址、模型、语言和提交格式偏好。不保存提交内容、仓库文件内容或鼠标历史；可选的 AI API Key 单独保存在 Windows 凭据管理器。

### Git 进程

Rust 核心使用参数数组直接启动 `git`，不会把仓库数据拼接成 shell 命令。Windows 下的 Git 进程隐藏控制台窗口、限制输出与执行时间，并使用 Job Object 在超时时结束完整进程树。错误信息在显示前经过保守处理，避免泄露带凭据的远端 URL 或进程环境。

## 🛠️ 技术栈

| 层级 | 技术 | 用途 |
| --- | --- | --- |
| 桌面外壳 | **Tauri 2 + WebView2** | 原生窗口、系统托盘、IPC、深链接与 MSI 打包 |
| 原生核心 | **Rust 2021** | Git 编排、项目分析、输入验证、窗口几何与进程安全 |
| 用户界面 | **React 19.2 + TypeScript 5.8** | Git 面板、桌面入口、设置、状态与类型边界 |
| 设计系统 | **GitHub Primer + Octicons** | 控件、图标、主题与 GitHub 风格视觉语言 |
| 构建工具 | **Vite 6.4 + pnpm 10** | 前端开发、锁定依赖与生产构建 |
| 测试 | **Vitest 3 + Testing Library + Rust tests** | UI、Git 服务、窗口状态机、几何与可访问性 |
| Git 引擎 | **系统 Git CLI** | 仓库状态、本地操作和远端操作 |
| AI 接口 | **OpenAI 兼容 Chat Completions** | 使用用户自备服务，根据已暂存文本差异生成提交草稿 |
| 自动化 | **GitHub Actions** | 前端检查、Rust 检查与 Windows MSI 构建 |

架构由一个轻量入口 WebView 和一个共享 Git 面板 WebView 组成。React 只调用有类型的 Tauri 命令；仓库验证、Git 操作、游戏项目分析和窗口状态都留在 Rust 边界内。

详见 [架构文档](docs/architecture.md) 与 [v0.2.0 设计 QA 记录](docs/design-qa.md)。

## 👩‍💻 本地开发

### 前置环境

- Node.js 22
- pnpm 10.18.3
- Rust 1.97.1 + MSVC toolchain
- Microsoft C++ Build Tools（**Desktop development with C++** 与 Windows SDK）
- Git for Windows
- WebView2 Runtime
- 打包 MSI 时启用 Windows **VBSCRIPT** 可选功能

### 克隆与运行

```powershell
git clone https://github.com/YYchainsAw/RepoPuck.git
Set-Location RepoPuck
git checkout develop
pnpm install --frozen-lockfile
pnpm tauri dev
```

只开发界面、使用确定性演示数据且不写入真实仓库：

```powershell
pnpm dev
```

### 质量检查

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

构建 Windows MSI：

```powershell
pnpm tauri build --bundles msi
```

## 🗺️ 路线图

- [x] 🟢 四角附着的桌面悬浮球
- [x] 🏝️ 与屏幕顶部融合的灵动岛
- [x] 📜 可移动、自动展开的顶部卷轴
- [x] 📐 可调整并按模式记忆的面板尺寸
- [x] 🌗 浅色、深色和跟随系统主题
- [x] 🌍 跟随系统或手动切换的简体中文 / English 界面
- [x] ✅ 常用 Git 提交、推送、同步和分支工作流
- [x] 🎮 Unity / Unreal 项目识别与语义文件分组
- [x] 🛡️ `.meta`、生成文件、大文件和 Git LFS 风险提示
- [x] 🔗 单实例 CLI、深链接与可选编辑器桥接源码
- [x] 🤖 可选的中英文 AI Conventional Commit 草稿
- [ ] 🎮 在更多真实 Unity / Unreal 编辑器版本中验证桥接
- [ ] 🔏 Windows 代码签名
- [ ] ⌨️ 可配置的全局快捷键
- [ ] 🔔 可选 Push / Fetch 通知

路线图会根据真实工作流反馈调整。欢迎通过 [Issues](https://github.com/YYchainsAw/RepoPuck/issues) 提交聚焦的需求和问题。

## ❓ 常见问题

<details>
<summary><strong>需要登录 GitHub 吗？</strong></summary>

不需要。RepoPuck 复用系统 Git 的 HTTPS 或 SSH 认证，也能连接 GitLab、自建 Git 服务和其他标准远端。
</details>

<details>
<summary><strong>Unity 或 Unreal 项目必须安装插件吗？</strong></summary>

不需要。手动选择项目即可获得识别、分类和安全提示。桥接仅用于编辑器启动时自动唤醒 RepoPuck。
</details>

<details>
<summary><strong>为什么没有 Merge、Rebase 或冲突编辑器？</strong></summary>

RepoPuck 专注于高频、低摩擦的提交路径。复杂历史操作继续交给 IDE 或终端，可以让桌面面板保持轻量，也减少误操作风险。
</details>

<details>
<summary><strong>为什么 Windows 提示 Unknown publisher？</strong></summary>

当前安装包尚未购买并应用代码签名证书。请只从本仓库 Releases 下载，并核对 Release notes 中的 SHA-256。
</details>

## 🤝 参与贡献

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。开发基于 `develop` 分支，推荐使用小而完整的提交，并在提交 Pull Request 前运行完整质量检查。

提交窗口、托盘、Git 进程或打包相关改动时，请同时进行 Windows 原生冒烟测试；可见界面改动请附浅色/深色以及最小面板尺寸下的截图。

如果 RepoPuck 让你的提交工作流更顺手：

- ⭐ 给仓库一个 Star，让更多 Windows 开发者看到它。
- 🐛 提交可复现的 Issue。
- 💡 分享真实项目中的工作流需求。
- 🧑‍💻 修复问题或提交聚焦的 Pull Request。

## 🙏 致谢

RepoPuck 的界面语言建立在 [GitHub Primer](https://primer.style/) 与 [Octicons](https://primer.style/octicons/) 之上；桌面能力由 [Tauri](https://tauri.app/) 和 Rust 生态提供。感谢所有测试、反馈和贡献者。

## 📄 License

RepoPuck 采用 [MIT License](LICENSE) 开源。你可以按照许可证条款自由使用、复制、修改、合并、发布和分发本项目。

Copyright © 2026 YYchainsAw.

---

<div align="center">
  <strong>Small on screen. Fast in flow.</strong><br>
  如果 RepoPuck 对你有帮助，欢迎点亮 ⭐ Star。
</div>
