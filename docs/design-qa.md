# RepoPuck v0.2.0 design QA

> Status: **local preview QA complete** for candidate `d256959`. `v0.2.0` remains unpublished; `v0.1.2` is still the stable release. GitHub Actions was not run during evidence capture and remains the required post-QA gate after a single `develop` push.

## Candidate and artifacts

| Item | Evidence |
| --- | --- |
| Candidate | `d256959` on `develop` |
| Review date | 2026-07-22 |
| Executable | `D:/VsCodeProjects/RepoPuck/src-tauri/target/release/repopuck.exe` |
| Executable size | 11,038,208 bytes |
| Executable SHA-256 | `5603B9A70F753481F8DB0F689C924C49903ADCF1960981FB2AE111B23F3D0F67` |
| MSI | `D:/VsCodeProjects/RepoPuck/src-tauri/target/release/bundle/msi/RepoPuck_0.2.0_x64_en-US.msi` |
| MSI size | 3,706,880 bytes |
| MSI SHA-256 | `586E07B0D39DFBD50BA119D26D42FA25EEAC62DBC13245EC87FB9A265C25EAD8` |

The executable and MSI size and checksum were verified from the local release artifacts before this record was finalized.

## Environment and coverage limits

| Item | Evidence |
| --- | --- |
| Operating system | Windows 11 Enterprise 10.0.26200, build 26200 |
| WebView2 | 150.0.4078.83 |
| Physical display | One display, 2560 × 1600 |
| Physical work area | 2560 × 1516 |
| Logical work area | 1463 × 866 at 175% scaling |

The packaged candidate was exercised on the single 175% display above. The following are explicitly outside this hardware evidence:

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
| Release packaging | EXE and MSI produced with the sizes and hashes recorded above |
| GitHub Actions | **Not run during evidence capture.** Frontend, Rust, and Windows MSI jobs remain the post-QA gate after one `develop` push. |

## Top Island evidence

At 175% scaling, the attached island launcher measured `1052,0–1507,91`, or 455 × 91 physical pixels. This corresponds to the intended 260 × 52 logical window. The visible 260 × 48 surface remained flush with the work-area top and retained its lower 4 px shadow region.

With the island expanded, the panel measured `926,91–1634,1158`. Its top edge exactly matched the launcher window's bottom edge at physical Y=91, leaving no gap.

Captured packaged-app evidence:

- [`island-collapsed.png`](qa/v020/island-collapsed.png)
- [`island-expanded-launcher.png`](qa/v020/island-expanded-launcher.png)
- [`island-panel.png`](qa/v020/island-panel.png)
- [`island-attached-composite.png`](qa/v020/island-attached-composite.png) — window-only packaged captures aligned to the measured native seam at Y=91

## Floating puck regression evidence

The candidate still rendered the 58 × 58 logical puck as a 102 × 102 physical launcher at 175% scaling. With the shared panel open at the saved bottom-right dock, the panel measured `1730,324–2438,1391` and the puck measured `2428,1381–2530,1483`, preserving the intended corner overlap while both remained inside the work area. A second launcher activation completed in `hidden` phase and removed the native panel window without moving the puck.

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

No transparent rectangular residue remained after those cycles. This verifies the candidate's removal of `clip-path` from drawer closing and the disabled native shadow on the tested Windows/WebView2 environment.

## Runtime and performance evidence

| Check | Measured result |
| --- | --- |
| Startup | Both WebViews reached CDP-ready state 569 ms after process start. |
| Drawer reveal | Hot-zone entry to visible panel was 151 ms, including the configured 120 ms dwell. |
| Hidden drawer | Over 10.048 seconds, the eight-process tree used 0.4688 CPU seconds; normalized across 16 logical processors this was 0.2916% of the machine. No Git process ran. |
| Refresh observation | During 4 seconds and 191 samples, four snapshots refreshed and zero visible `ConsoleWindowClass` windows appeared. |
| WebView runtime health | Five seconds of Runtime and Log observation across both WebViews recorded zero events. |

## Findings and fixes

Static review found two release-relevant P2 issues before the final candidate:

| Severity | Finding | Fix in `d256959` | Native verification |
| --- | --- | --- | --- |
| P2 | Controls could remain clickable while closing, and full-window `scaleY` created a compositor-risk path. | The closing surface disables pointer interaction and removes interactive handles; the native shadow is disabled and drawer closing no longer uses `clip-path`. | The local automated suite covered the closing interaction state, re-entry recovered through transitions 11 → 13, and repeated native close cycles left no visible rectangle. |
| P2 | The island shadow could be clipped at the bottom of its native bounds. | The launcher window is 260 × 52 while the solid surface is 260 × 48, reserving 4 px for the lower shadow. | The 455 × 91 launcher at 175% remained attached to the top edge and aligned with the panel at Y=91. |

No unresolved P0, P1, or P2 finding remains in this local preview QA scope.

## Release decision

Candidate `d256959` satisfies the local packaged-app design, transition, persistence, performance, and transparent-window checks documented above. This is approval of the local `v0.2.0` preview candidate, not publication of a stable release.

Before `v0.2.0` is published, push the collected changes once to `develop`, require all GitHub Actions jobs to complete successfully, and record the resulting run and final release artifact in the release notes. The unavailable hardware topologies remain declared coverage limits rather than claimed native results.

final result: passed
