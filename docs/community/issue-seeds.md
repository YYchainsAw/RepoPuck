# Real issue seeds

These are genuine roadmap items that can be opened after v0.2.2 is published.
Do not open all of them merely to make the repository look busy. Start with the
items that have a maintainer or contributor available to respond.

## 1. Add an on-demand file diff preview

**Suggested labels:** `enhancement`, `help wanted`, `git`

### User problem

The change list shows paths and line counts, but users must leave RepoPuck to
review the exact change before committing.

### Smallest useful scope

- Open a read-only diff panel when a text file row is activated.
- Separate staged and unstaged content.
- Load on demand and enforce byte/line limits.
- Explain binary, oversized, deleted, and unavailable diffs.
- Do not add hunk staging in the first implementation.

### Acceptance

- Keyboard and pointer users can open and close the preview.
- The main change list remains responsive with 1,000 changed files.
- No repository content is persisted or sent to a network service.
- Temporary-repository tests cover staged, unstaged, binary, and truncated
  cases.

## 2. Virtualize and filter very large change lists

**Suggested labels:** `enhancement`, `performance`, `help wanted`

### User problem

Repositories with hundreds or thousands of changed/generated files can create
long render times and make selection difficult.

### Smallest useful scope

- Virtualize rendered file rows.
- Filter by path, status, and tracked/unversioned group.
- Add “select current filtered result”.
- Preserve selection while filters change.
- Keep Git status collection separate from rendering measurements.

### Acceptance

- Add a deterministic 1,000/5,000-row frontend fixture.
- Document p50/p95 render measurements and the test machine.
- Preserve keyboard navigation and accessible row names.

## 3. Add a configurable global show/hide shortcut

**Suggested labels:** `enhancement`, `windows`, `accessibility`

### User problem

Keyboard-first users must currently reach RepoPuck through the pointer or the
Windows notification area.

### Smallest useful scope

- Add one configurable show/hide shortcut.
- Detect conflicts and provide a clear fallback.
- Keep the feature disabled until the user chooses a shortcut.
- Never intercept keys while a text field is active unless the shortcut uses a
  global modifier combination.

### Acceptance

- Works with all three desktop entry modes.
- Setting persists across restart and can be cleared.
- Conflict and registration failure are localized in Chinese and English.

## 4. Add Traditional Chinese localization

**Suggested labels:** `good first issue`, `localization`, `documentation`

### Scope

- Add a `zh-TW` catalog for existing interface strings.
- Add the language to Settings without changing system-language fallback.
- Translate tray and native confirmation messages.
- Update localization tests and the language section of the README.

### Acceptance

- No hard-coded user-visible strings are introduced.
- Chinese and English behavior remains unchanged.
- Screenshots cover the default panel and Settings at the minimum size.

## 5. Improve unsigned-install troubleshooting

**Suggested labels:** `good first issue`, `documentation`, `windows`

### Scope

- Add a short, screenshot-free troubleshooting guide for downloading from the
  official Release, checking `SHA256SUMS.txt`, and verifying GitHub provenance.
- Explain what “Unknown publisher” means without telling users to disable
  SmartScreen globally.
- Link the guide from SUPPORT and the Release template.

### Acceptance

- Commands work in a clean PowerShell session.
- The guide never asks users to bypass security controls permanently.
- Chinese and English instructions contain the same steps.

## 6. Publish reproducible lightweight-performance measurements

**Suggested labels:** `help wanted`, `performance`, `documentation`

### Scope

- Measure cold launch to launcher-visible.
- Measure launcher click to panel-interactive.
- Record idle working set/CPU.
- Measure refresh with 500 and 5,000 changed-file fixtures.
- Publish the script, Windows version, hardware, display scaling, Git version,
  sample count, p50, and p95.

### Acceptance

- Results are reproducible and do not compare against competitors unless the
  same public fixture and method are used.
- README claims link to the raw methodology.

## 7. Validate and submit the WinGet manifest

**Suggested labels:** `help wanted`, `release`, `windows`

### Scope

- Download the manifest candidate from the current GitHub Release.
- Run `winget validate`.
- Test install, upgrade, and uninstall in Windows Sandbox.
- Submit the validated manifest to `microsoft/winget-pkgs`.

### Acceptance

- The installer URL points to an immutable tagged Release.
- Package identifier remains `YYchainsAw.RepoPuck`.
- README is updated only after the WinGet pull request is accepted.
