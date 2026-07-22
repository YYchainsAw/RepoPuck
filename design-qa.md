# RepoPuck design QA

## Comparison target

- Source visual truth:
  - `docs/references/floating-panel-light.png` (1487 × 1058 px) for the approved GitHub-style light surface, repository/branch hierarchy, file rows, and focused composer.
  - `docs/references/floating-panel-dark.png` (1487 × 1058 px) for the dark surface and control contrast.
  - `docs/references/jetbrains-change-groups.png` (681 × 1302 px) for distinct tracked/unversioned groups and separate Commit / Commit & Push actions.
  - `docs/references/repopuck-icon-docked-node-reference.png` (1254 × 1254 px) for the selected v0.1.2 puck silhouette, teal/graphite palette, three-node Git mark, and corner notch.
- Primary implementation captures:
  - `docs/images/repopuck-panel-light.png` (420 × 720 px).
  - `docs/images/repopuck-panel-dark.png` (420 × 720 px).
  - `docs/images/repopuck-puck.png` (58 × 58 px).
  - `docs/qa/repopuck-v012-puck-actual.png` (102 × 102 physical px at 175% scaling) for the packaged v0.1.2 puck with a live change-count badge.
  - `docs/qa/repopuck-v012-panel-resized.png` (940 × 980 physical px at 175% scaling) for the resized packaged panel.
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
- v0.1.2 selected-source / packaged-asset / live-runtime icon comparison: `docs/qa/repopuck-v012-icon-reference-vs-actual.png`.
- v0.1.2 light/dark and 16–64 px asset checks: `docs/qa/repopuck-icon-light-dark-preview.png` and `docs/qa/repopuck-icon-small-sizes.png`.
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
- The v0.1.2 puck retains the selected circular mass, graphite border, three white branch nodes, teal fill, and top-right dock notch. The runtime badge intentionally overlaps the notch only when changed files exist; the underlying packaged asset remains faithful and readable down to 16 px.

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

### Iteration 4 — docked puck, native resize, and opening motion

- Earlier finding: **P2**, the native Windows minimum frame is wider than the visible 58 px puck at 175% scaling. Using the full transparent window bounds would leave a gap on left-side dock placements.
- Fix: derive geometry from the visible 58 logical-pixel puck content, reserve the remaining puck space at the chosen corner, and clamp the panel into that dock-safe work area. Native resizing now preserves a fully visible panel and puck together.
- Earlier finding: **P2**, showing the panel before the frontend received its corner could expose one fully rendered frame before the opening animation started.
- Fix: keep hidden panel content concealed, send `panel_opened` before the native show operation, then animate from the reported corner for 160 ms.
- Post-fix evidence: `docs/qa/repopuck-v012-icon-reference-vs-actual.png`, `docs/qa/repopuck-v012-puck-actual.png`, and `docs/qa/repopuck-v012-panel-resized.png`.

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
- The packaged v0.1.2 build was exercised at 175% scaling. Hidden content started at opacity 0; sampled opening opacity progressed from 0.105 at 10 ms to 0.912 at 50 ms and 0.998 at 110 ms, then reached a stable transform/opacity at 230 ms. No pre-animation flash was observed.
- `top-left`, `top-right`, `bottom-left`, and `bottom-right` placements were forced and measured independently. Every panel remained inside the 1463 × 867 logical work area, the visible puck remained inside it, and corner attachment differed by only 0–1 logical px after DPI rounding.
- A native resize was forced beyond the right work-area edge. RepoPuck clamped the 550 × 568 outer panel to x=860…1410, kept the visible puck at x=1405…1463, and preserved the 5–6 px logical overlap at 175% scaling. The panel stayed visible throughout.
- After hiding and restarting, the same 550 × 568 outer panel and docked puck positions were restored exactly, demonstrating logical inner-size persistence without frame-size drift.
- An 11-second CDP observation across both production WebViews recorded zero runtime exceptions, console warnings, or console errors. A separate 12-second Win32 scan observed 14 short-lived Git processes and zero new visible `ConsoleWindowClass` windows.
- Automated gates for v0.1.2: 15 frontend files / 111 tests, 52 Rust tests, TypeScript type-check, ESLint, Rustfmt, Clippy with warnings denied, frontend production build, and release MSI packaging all passed.

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
- [x] Verify serialized second-click close behavior and no opening flash.
- [x] Verify all four dock corners, 175% DPI rounding, resize-time work-area clamping, and restart persistence.
- [x] Compare the selected v0.1.2 icon source, packaged asset, and live runtime together.

## Follow-up polish

- **P3:** native edge resizing is pointer-operated. A future accessibility pass can add a discoverable keyboard size control in Settings without changing the compact default surface.
- **P3:** the dark reference uses a taller multi-line composer, while RepoPuck keeps the compact single-line GitHub-style composer selected for the lightweight workflow. A future optional expanded-message mode could be explored without changing the default density.

final result: passed
