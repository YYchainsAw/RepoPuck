# Pull Request / 合并请求

## 这项改动做了什么？ / What changed?

<!-- 用 2–5 句话说明用户可感知的结果和实现边界。Describe the user-visible outcome and implementation boundary in 2–5 sentences. -->

## 为什么需要它？ / Why?

<!-- 关联 Issue：Closes #123。若无 Issue，请解释真实问题和使用场景。Link an issue or explain the concrete problem and use case. -->

## 改动类型 / Change type

- [ ] Bug 修复 / Bug fix
- [ ] 新功能 / Feature
- [ ] 性能或可靠性 / Performance or reliability
- [ ] UI、无障碍或本地化 / UI, accessibility, or localization
- [ ] 文档或社区 / Documentation or community
- [ ] 构建、测试或维护 / Build, test, or maintenance

## 风险检查 / Risk review

- [ ] 不涉及 Git 写操作、凭据、持久化或历史改写 / No Git mutation, credentials, persistence, or history rewrite
- [ ] 涉及以上风险，已在下方解释失败恢复和安全边界 / Risks exist and recovery/safety boundaries are explained below

<!-- 若改动会执行 Git，请说明命令构造、路径边界、并发控制、失败恢复和测试仓库。For Git execution changes, explain command construction, path boundaries, serialization, recovery, and test repositories. -->

## 验证 / Verification

已运行的命令 / Commands run:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [ ] 已添加或更新自动化测试 / Tests added or updated
- [ ] 已在 Windows 原生环境进行冒烟测试 / Windows-native smoke test completed
- [ ] 不适用，并已说明原因 / Not applicable, with reason below

测试说明、未覆盖项和已知限制 / Test notes, gaps, and known limitations:

<!-- 请不要只写“通过”。Do not write only "passed". -->

## 界面改动 / UI changes

<!-- 如果有可见改动，请提供前后截图或短视频，并写明窗口尺寸、主题、缩放与键盘测试。For visible changes, attach before/after captures and note viewport, theme, scaling, and keyboard testing. -->

- [ ] 已检查浅色和深色主题 / Light and dark themes checked
- [ ] 已检查默认 `420 × 720` 和最小 `360 × 560` 面板 / Default and minimum panel sizes checked
- [ ] 已检查键盘操作、焦点和可访问名称 / Keyboard, focus, and accessible names checked
- [ ] 不包含界面改动 / No UI changes

## 提交前清单 / Final checklist

- [ ] PR 目标分支为 `develop` / Target branch is `develop`
- [ ] 改动范围集中，没有无关格式化或生成文件 / Changes are focused with no unrelated formatting or generated files
- [ ] 没有提交凭据、私有 URL、个人路径或真实仓库夹具 / No credentials, private URLs, personal paths, or real repository fixtures
- [ ] 文档、本地化和 Release Notes 已按需要更新 / Docs, localization, and release notes are updated when needed
- [ ] 我已阅读 `CONTRIBUTING.md` 和 `CODE_OF_CONDUCT.md` / I read `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`
