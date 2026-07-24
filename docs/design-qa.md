# RepoPuck v0.2.0 design QA

> Status: **historical QA record for the current `v0.2.0` release**. This document preserves the local shell-mode measurements and game-project smoke evidence gathered during development. It is not the source of truth for downloadable artifacts or checksums; use the published [GitHub Release](https://github.com/YYchainsAw/RepoPuck/releases/tag/v0.2.0) for those values.

> [!IMPORTANT]
> The evidence below was collected across multiple pre-release builds and should be read as a historical validation log, not as a claim that one intermediate binary contained every later change. The synthetic game-project run covered nested-project restoration, single-instance CLI/URI activation, classification, and index-aware Git LFS checks. It did not import the optional bridges into real Unity or Unreal editor sessions; those bridges remain Beta features.

## Historical QA scope

| Item | Evidence |
| --- | --- |
| Shell-mode review date | 2026-07-22 |
| Game-project review date | 2026-07-23 |
| Scope | Packaged Windows shell behavior, local automated gates, synthetic game-project activation, and rendered safety UI |
| Published artifacts | See the [`v0.2.0` Release](https://github.com/YYchainsAw/RepoPuck/releases/tag/v0.2.0) |

Intermediate local paths, sizes, commit IDs, and checksums are intentionally omitted. Later icon, documentation, CI, or packaging changes can produce different binaries even when the product version is unchanged, so only the values attached to the published Release should be used for verification.

## Environment and coverage limits

| Item | Evidence |
| --- | --- |
| Operating system | Windows 11 Enterprise 10.0.26200, build 26200 |
| WebView2 | 150.0.4078.83 |
| Physical display | One display, 2560 × 1600 |
| Physical work area | 2560 × 1516 |
| Logical work area | 1463 × 866 at 175% scaling |

The historical packaged shell-mode build was exercised on the single 175% display above. The following are explicitly outside this hardware evidence:

- 100% display scaling: not available for a separate native run.
- Mixed-DPI multi-monitor placement: not available on the test hardware.
- Negative-coordinate monitor topology: not available on the test hardware.

Pure Rust geometry tests cover the calculations for 100%, mixed-DPI, and negative-coordinate scenarios. Those deterministic mathematical checks are not presented as physical hardware validation.

## Automated local gates

| Gate | Result |
| --- | --- |
| ESLint | Completed successfully |
| TypeScript (`tsc`) | Completed successfully |
| Frontend production build | Completed successfully |
| Vitest | 18 files, 134 tests completed successfully |
| Rust formatting | `cargo fmt --check` completed successfully |
| Rust lint | Clippy with `-D warnings` completed successfully |
| Rust tests | 72 tests completed successfully |
| Release packaging | Intermediate EXE and MSI produced successfully; these were not the published Release assets |
| GitHub Actions | Not run during the original capture; a later shell-mode follow-up passed the then-current frontend, Rust, and Windows MSI workflow |

## Game-project evidence

The game-project implementation was reviewed and validated locally on 2026-07-23.

| Item | Evidence |
| --- | --- |
| ESLint and TypeScript | Completed successfully |
| Vitest | 20 files, 147 tests completed successfully |
| Rust formatting and lint | `cargo fmt --check` and Clippy with `-D warnings` completed successfully |
| Rust tests | 131 tests completed successfully |
| Packaged application | Intermediate EXE and MSI produced and exercised locally; neither is presented here as the published Release artifact |

A synthetic Git repository contained a nested Unity 2022.3.56f1 project and a nested Unreal 5.4 Blueprint project. The historical packaged game-project build:

- restored the nested Unity `selectionPath` while keeping Git rooted at the enclosing repository;
- switched the already-running process to Unreal through a second `repopuck.exe open <path>` invocation;
- switched back to Unity through a second URI argument invocation;
- classified Unity code and scenes and Unreal Blueprint/configuration paths;
- surfaced a staged empty-folder `.meta` as an orphan danger, a prefab without `.meta` as a missing-meta danger, and an Unreal `.uasset` as a Git LFS candidate; and
- reported seven unique changed paths through the lightweight puck count.

This smoke run exercised startup restoration, second-instance forwarding, URI parsing, nested-project mapping, snapshot refresh, and rendered game-safety UI. It did not install the MSI, invoke the URI through Windows Shell registration, import the UPM package into Unity, or compile/load the Unreal plugin. Those real integration checks remain outstanding and are not implied by the synthetic runtime evidence.

## Top Island evidence

At 175% scaling, the attached island launcher measured `1052,0–1507,91`, or 455 × 91 physical pixels. This corresponds to the intended 260 × 52 logical window. The visible 260 × 48 surface remained flush with the work-area top and retained its lower 4 px shadow region.

With the island expanded, the panel measured `926,91–1634,1158`. Its top edge exactly matched the launcher window's bottom edge at physical Y=91, leaving no gap.

Captured packaged-app evidence:

- [`island-collapsed.png`](qa/v020/island-collapsed.png)
- [`island-expanded-launcher.png`](qa/v020/island-expanded-launcher.png)
- [`island-panel.png`](qa/v020/island-panel.png)
- [`island-attached-composite.png`](qa/v020/island-attached-composite.png) — window-only packaged captures aligned to the measured native seam at Y=91

## Floating puck regression evidence

The tested build rendered the 58 × 58 logical puck as a 102 × 102 physical launcher at 175% scaling. With the shared panel open at the saved bottom-right dock, the panel measured `1730,324–2438,1391` and the puck measured `2428,1381–2530,1483`, preserving the intended corner overlap while both remained inside the work area. A second launcher activation completed in `hidden` phase and removed the native panel window without moving the puck.

Captured packaged-app evidence:

- [`puck-launcher.png`](qa/v020/puck-launcher.png)
- [`puck-panel.png`](qa/v020/puck-panel.png)

## Top Drawer evidence

The drawer's default centered rectangle was `926,0–1634,1067`. Native dragging produced these observed placements:

- Left placement: X=110.
- Right-edge clamp: `1852,0–2560,1067`.
- Diagonal drag: Y remained locked at 0.
- Persisted anchor: `\\.\DISPLAY1:1.0`.

After moving to the right edge, the old centered hidden hot zone kept the drawer hidden while the new right-side hot zone opened it. A forced application restart restored X=1852. Reducing the drawer width to 630 physical pixels, equivalent to 360 logical pixels at 175%, kept its right edge at X=2560; restoring the width returned it to 708 physical pixels without losing the anchor.

A closing re-entry reversed transition 11 into transition 13 and returned the panel to `open`, confirming that the current transition superseded the stale close.

Captured packaged-app evidence:

- [`drawer-reference-comparison.png`](qa/v020/drawer-reference-comparison.png)
- [`drawer-open-center.png`](qa/v020/drawer-open-center.png)
- [`drawer-open-right.png`](qa/v020/drawer-open-right.png)
- [`drawer-close-sequence.png`](qa/v020/drawer-close-sequence.png)

## Transparent-window cleanup

Six consecutive expand and retract cycles were observed. The hidden baseline and final desktop region of interest had the same SHA-256:

`FA45C320E6DDEB1FCBB2C82CAA3E0C91D18E25AA65B0C2C58532EF2F70B635F5`

No transparent rectangular residue remained after those cycles. This verifies the tested build's removal of `clip-path` from drawer closing and the disabled native shadow on the tested Windows/WebView2 environment.

## Runtime and performance evidence

| Check | Measured result |
| --- | --- |
| Startup | Both WebViews reached CDP-ready state 569 ms after process start. |
| Drawer reveal | Hot-zone entry to visible panel was 151 ms, including the configured 120 ms dwell. |
| Hidden drawer | Over 10.048 seconds, the eight-process tree used 0.4688 CPU seconds; normalized across 16 logical processors this was 0.2916% of the machine. No Git process ran. |
| Refresh observation | During 4 seconds and 191 samples, four snapshots refreshed and zero visible `ConsoleWindowClass` windows appeared. |
| WebView runtime health | Five seconds of Runtime and Log observation across both WebViews recorded zero events. |

## Findings and fixes

Static review found two release-relevant P2 issues before the historical shell-mode build was accepted:

| Severity | Finding | Fix in the tested build | Native verification |
| --- | --- | --- | --- |
| P2 | Controls could remain clickable while closing, and full-window `scaleY` created a compositor-risk path. | The closing surface disables pointer interaction and removes interactive handles; the native shadow is disabled and drawer closing no longer uses `clip-path`. | The local automated suite covered the closing interaction state, re-entry recovered through transitions 11 → 13, and repeated native close cycles left no visible rectangle. |
| P2 | The island shadow could be clipped at the bottom of its native bounds. | The launcher window is 260 × 52 while the solid surface is 260 × 48, reserving 4 px for the lower shadow. | The 455 × 91 launcher at 175% remained attached to the top edge and aligned with the panel at Y=91. |

No unresolved P0, P1, or P2 finding remained in this historical local QA scope.

## Release interpretation

The historical shell-mode build satisfied the packaged-app design, transition, persistence, performance, and transparent-window checks documented above. The later game-project build passed the local automated and synthetic runtime checks recorded here. Together, this evidence supported the `v0.2.0` release without claiming that the intermediate artifacts were the published binaries.

The published Release notes and GitHub Actions history are the authoritative sources for final artifact checksums and release-commit automation. Real Unity and Unreal editor bridge coverage remains an ongoing Beta validation area. The unavailable hardware topologies above remain declared coverage limits rather than claimed native results.

final result: passed
