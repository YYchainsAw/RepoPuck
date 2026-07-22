# Contributing to RepoPuck

Thanks for helping make the common Git workflow quieter and faster. RepoPuck v0.1 is intentionally narrow, so proposed changes should preserve its compact interface, safe Git boundary, and low-friction Windows experience.

## Before you start

1. Read the [v0.1 design specification](docs/superpowers/specs/2026-07-20-repopuck-design.md) and [architecture guide](docs/architecture.md).
2. Check that the change is inside the current scope. Open an issue before starting work on a large feature or a behavior that changes Git history.
3. Install the Windows prerequisites listed in [README.md](README.md#windows-prerequisites).

## Branch and commit workflow

- Base work on the latest `develop` branch. `main` is reserved for release-ready code.
- Use a focused branch such as `feat/puck-keyboard-access` or `fix/rename-unstage`.
- Prefer test-first changes: demonstrate the missing or incorrect behavior, then implement the smallest complete fix.
- Make small, coherent commits with imperative messages, for example `fix: preserve commit message after push failure`.
- Commit locally as the work becomes coherent; push less frequently, at review or release checkpoints.
- Keep generated output, local screenshots, credentials, repository fixtures, and build artifacts out of commits unless the change explicitly requires a reviewed asset.

## Set up the project

```powershell
git clone https://github.com/YYchainsAw/RepoPuck.git
Set-Location RepoPuck
git checkout develop
git pull --ff-only
git switch -c feat/your-change
pnpm install --frozen-lockfile
```

Run `pnpm tauri dev` for the native application or `pnpm dev` for the in-memory browser demo.

## Tests and checks

Before requesting review, run:

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

Changes to native windows, the tray, Git process behavior, or packaging should also receive a Windows-native smoke test. Interface changes should be checked at the default 420 × 720 panel size and the 360 × 560 minimum size, in light and dark modes, with keyboard-only navigation.

Run `pnpm tauri build --debug` when the change can affect native compilation or packaging. Do not present a release package as verified until the complete release gate and visual QA have passed.

## Git safety requirements

Code that launches Git has a higher review bar:

- Invoke `git` directly with an argument array; never interpolate repository data into a shell command.
- Put `--` before user-controlled file paths where the Git command supports it.
- Validate and canonicalize selected repositories before storing or using them.
- Treat stdout and stderr as untrusted text. User-facing diagnostics must not leak credentials, credential-bearing remote URLs, environment values, or sensitive process details.
- Preserve the user's selected files and commit message after a failed operation.
- Serialize conflicting mutations and refresh state after operations finish.
- Treat Amend as an explicit history rewrite: require confirmation, preserve a failed draft, and never add an automatic or forced push.
- Add temporary-repository tests for command construction and behavior. Never point tests at a contributor's working repository.

RepoPuck delegates remote authentication to system Git. Contributions must not add GitHub login, token storage, password storage, SSH-key storage, or custom credential handling without an approved security design.

## Product and interface requirements

- Keep `Changes` and `Unversioned files` separate.
- Keep `Commit` and `Commit & Push` as distinct actions.
- Use GitHub Primer components/tokens and Primer Octicons; do not add handcrafted SVG icons, emoji controls, gradients, or CSS-drawn brand marks.
- Keep common actions visible and place safe secondary actions in the overflow menu.
- Do not add merge, rebase, cherry-pick, destructive reset, conflict editing, remote management, or history-rewriting workflows beyond the approved single-commit Amend flow to v0.1.
- Maintain accessible names, visible focus states, keyboard behavior, ellipsis/title handling for long paths, and usable error feedback.

## Pull requests

A review-ready pull request should:

- Target `develop` and explain the user-visible outcome.
- Identify any Git safety, persistence, or authentication implications.
- Include the tests added or updated and list the commands run.
- Include implementation captures for a visible UI change and note the viewport/state used.
- Avoid unrelated formatting, dependency, lockfile, or generated-file changes.
- Leave the worktree free of accidental secrets and local paths.

Reviewers will prioritize correctness and recoverability first, then accessibility, product fit, visual fidelity, performance, and maintainability.
