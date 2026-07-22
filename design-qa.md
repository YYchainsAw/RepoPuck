# RepoPuck design QA

## Comparison target

- Source visual truth:
  - `docs/references/floating-panel-light.png` (1487 × 1058 px) for the approved GitHub-style light surface, repository/branch hierarchy, file rows, and focused composer.
  - `docs/references/floating-panel-dark.png` (1487 × 1058 px) for the dark surface and control contrast.
  - `docs/references/jetbrains-change-groups.png` (681 × 1302 px) for distinct tracked/unversioned groups and separate Commit / Commit & Push actions.
- Primary implementation captures:
  - `docs/images/repopuck-panel-light.png` (420 × 720 px).
  - `docs/images/repopuck-panel-dark.png` (420 × 720 px).
  - `docs/images/repopuck-puck.png` (58 × 58 px).
- Viewport and density: the panel was captured from the production Tauri/WebView2 window at 420 × 720 CSS px, `deviceScaleFactor: 1`, producing a 420 × 720 image. The minimum state was captured at 360 × 560 CSS/image px. The puck was captured at its configured 58 × 58 CSS/image px.
- Normalization: the light source panel was cropped to its 556 × 710 px content region and scaled to 720 px high only inside the comparison board. The dark source panel was cropped to 479 × 978 px above the taskbar and scaled to 720 px high. The implementation captures were not scaled for panel review. The 58 px puck is enlarged only in its focused comparison so its asset edge and badge can be inspected.
- Primary state: light theme, pinned panel, `feature/quick-commit`, three staged tracked files, one unversioned file, and `Add quick commit panel` in a focused composer.

## Evidence

- Full-view light/grouping comparison: `docs/qa/design-qa-full-comparison.png`.
- Focused header comparison: `docs/qa/design-qa-header-comparison.png`.
- Focused composer/action comparison: `docs/qa/design-qa-composer-comparison.png`.
- Dark-theme comparison: `docs/qa/design-qa-dark-comparison.png`.
- Default/minimum responsive comparison: `docs/qa/design-qa-responsive-comparison.png`.
- Native puck comparison: `docs/qa/design-qa-puck-comparison.png`.
- Additional implementation states:
  - clean tree: `docs/qa/repopuck-panel-clean.png`;
  - remote-labelled overflow menu: `docs/qa/repopuck-panel-menu.png`;
  - guarded Amend dialog: `docs/qa/repopuck-panel-amend.png`;
  - dismissible success: `docs/qa/repopuck-panel-success.png`;
  - safe error with Copy details: `docs/qa/repopuck-panel-error.png`;
  - minimum viewport: `docs/qa/repopuck-panel-min-360x560.png`.

## Findings

No actionable P0, P1, or P2 differences remain.

- The final light panel preserves the source's repository/branch hierarchy, selectable file rows, compact commit composer, and clear primary action while implementing the user's requested tracked/unversioned grouping and split Commit / Commit & Push actions.
- The final dark panel uses resolved Primer dark tokens for buttons, inputs, counters, borders, and text. Primary repository identity and group counts remain readable.
- Persistent controls remain visible and usable at 360 × 560; no overlap, clipped action, or broken hierarchy was observed.
- Menu, Amend, clean, success, and error states use the same GitHub Primer visual language and maintain 44 px primary targets.

## Comparison history

### Iteration 1 — compact branch identity

- Earlier finding: **P2**, the 420 px branch row truncated `feature/quick-commit` because a zero-value `Ahead 0, behind 0` label consumed the remaining width.
- Fix: omit divergence text only when both values are zero; preserve the text for real divergence and cover both cases with tests (`d98c7b8`).
- Post-fix evidence: `docs/qa/design-qa-branch-fix-history.png` and `docs/qa/design-qa-header-comparison.png` show the full branch name at the same viewport.

### Iteration 2 — dark Primer tokens

- Earlier finding: **P1**, Primer components were falling back to light colors in dark mode, leaving the repository name and counters with insufficient contrast.
- Fix: add the matching Primer primitives package, load both functional theme styles, and synchronize document theme attributes (`88ba4c6`).
- Post-fix evidence: `docs/qa/design-qa-dark-fix-history.png` shows the before/after control and counter contrast; `docs/qa/design-qa-dark-comparison.png` shows the final source-to-implementation result.

### Iteration 3 — Amend action layout

- Earlier finding: **P2**, the Amend dialog's Cancel and confirmation actions stacked awkwardly at 420 px.
- Fix: add a right-aligned, wrapping action row with an 8 px gap and 44 px controls (`f656186`).
- Post-fix evidence: `docs/qa/design-qa-amend-fix-history.png` and `docs/qa/repopuck-panel-amend.png`.

## Required fidelity surfaces

- **Fonts and typography:** source and implementation use the Windows/system UI family with comparable optical weight. The implementation uses Primer's system stack, 14–16 px UI text, compact 12 px metadata, stable line height, ellipsis only for genuinely constrained dynamic paths, and a fully visible common branch name. The focused composer has a clear GitHub-blue outline instead of the concept's teal/purple accent by design.
- **Spacing and layout rhythm:** the 420 × 720 frame uses 16 px header/composer padding, 8–12 px gaps, 44 px controls, 8 px internal radii, a 12 px outer radius, compact 48 px change rows, and a sticky composer. The 360 × 560 comparison preserves all persistent controls and file hierarchy.
- **Colors and visual tokens:** light and dark states resolve through GitHub Primer tokens. GitHub green is intentionally used for selected checkboxes and primary commit actions; semantic additions/deletions retain green/red contrast. The concept teal/purple is not carried forward because the user selected the GitHub direction.
- **Image quality and asset fidelity:** standard controls use the approved Primer Octicons library. The puck uses the supplied raster application asset rather than CSS art, glyphs, emoji, or handcrafted SVG. Its native 58 px capture is sharp; the comparison enlargement is inspection-only.
- **Copy and content:** `Changes`, `Unversioned files`, `Commit`, `Commit & Push`, guarded Amend copy, clean state, remote label, success feedback, and safe error copy all match the requested product model. Repository, branch, and file names are realistic disposable-repository data rather than prompt leakage.

## Interaction, accessibility, and runtime evidence

- Captures came from the actual packaged Tauri/WebView2 targets backed by the Rust Git service, not the browser demo client.
- Theme toggling, pin persistence, menu open/close, Amend open/cancel, staging, success dismissal, safe push failure, and error copying were exercised. The WebView clipboard readback returned the exact safe error text after the Copy details action.
- Branch switching/creation, grouped staging, both commit actions, Amend confirmation, menu roving focus, Escape/outside dismissal, and puck Enter/Space activation are covered by interaction tests.
- The puck window is focusable without taking initial focus. Visible focus treatment, accessible names, live status/alert roles, 44 px controls, and menu separator semantics are covered.
- Clean, dark, error, success, menu, Amend, default, and minimum-size states were inspected.
- Every final CDP capture reported no runtime exception or log event. The production WebView rendered successfully with the restrictive CSP enabled.
- The final release ran through multiple automatic refresh cycles while a 10 ms Win32 scan detected zero visible `ConsoleWindowClass` windows.
- The v0.1.0 baseline launched 31 direct child Git processes during an eight-second hidden-window sample and consumed 2.109 CPU seconds. The v0.1.1 hidden-panel build launched zero direct child Git processes during a 12-second sample, consumed no measurable CPU time in that sample, remained responsive, and used 42.3 MB of working set.
- The final v0.1.1 executable exposed its first native window 559 ms after process start while restoring the recent repository in the background. A real physical puck click showed the panel in 46 ms after the input event; a double-click left it visible. The visibility lifecycle was also sampled for 32 seconds with only 0.031 CPU seconds consumed by the process.
- The packaged v0.1.1 dark panel and its open native branch selector were inspected at 175% Windows display scaling. Selected and unselected options retained distinct, readable foreground/background contrast.
- Automated gates at this pass: 15 frontend files / 109 tests, 45 Rust tests, TypeScript type-check, ESLint, Rustfmt, Clippy with warnings denied, frontend production build, and release MSI packaging all passed.

## Open questions

- None blocking. Signing and SmartScreen reputation remain release/distribution work rather than interface fidelity work.

## Implementation checklist

- [x] Preserve full branch identity at compact widths.
- [x] Resolve Primer light/dark theme tokens.
- [x] Align Amend actions and verify overflow states.
- [x] Verify success/error feedback and actual Copy details behavior.
- [x] Verify 420 × 720, 360 × 560, clean, dark, and puck states.
- [x] Compare source and implementation together at full-view and focused-region levels.
- [x] Verify hidden-panel refresh suspension, native puck open latency, and dark branch-selector contrast in the packaged v0.1.1 build.

## Follow-up polish

- **P3:** the production puck is flatter and greener than the teal, shadowed concept puck. It is accepted for v0.1 because it is the approved raster app asset and remains clear at 58 px; a future brand pass can refine the raster asset without changing the shell interaction.
- **P3:** the dark reference uses a taller multi-line composer, while RepoPuck keeps the compact single-line GitHub-style composer selected for the lightweight workflow. A future optional expanded-message mode could be explored without changing the default density.

final result: passed
