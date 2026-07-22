# RepoPuck v0.1 Design Specification

## Product goal

RepoPuck is a lightweight Windows Git companion that stays available in the system tray or as a draggable desktop puck. Clicking the puck opens a compact, dockable panel for reviewing changes, selecting files, switching branches, committing, and pushing without returning to an IDE.

The first release optimizes the common local workflow. It does not require a GitHub login: local operations use the installed Git executable, while remote authentication is delegated to the user's existing Git Credential Manager or SSH configuration.

## Approved visual direction

The primary visual reference is [`docs/references/floating-panel-light.png`](../../references/floating-panel-light.png). It defines the compact floating-card proportions, light surface, repository and branch hierarchy, file rows, commit field, and circular launcher. [`docs/references/jetbrains-change-groups.png`](../../references/jetbrains-change-groups.png) defines two requested behavioral changes: files are grouped into `Changes` and `Unversioned files`, and `Commit` is separate from `Commit & Push`.

The implementation uses GitHub Primer light styling:

- Segoe UI/system font stack.
- Canvas `#ffffff`, subtle background `#f6f8fa`, border `#d0d7de`, foreground `#1f2328`, muted foreground `#656d76`.
- GitHub green `#1f883d` for the primary commit action, danger red `#cf222e`, additions green `#1a7f37`.
- Eight-pixel spacing rhythm, six-pixel control radius, twelve-pixel panel radius, restrained shadow.
- Primer React components and Primer Octicons; no handcrafted SVG or glyph icons.

## Product surfaces

### Floating puck

- A 58 px circular always-on-top window displaying the RepoPuck icon and a badge containing the number of changed files.
- Draggable by the user and restored to its previous monitor-relative position on launch.
- Single click toggles the main panel.
- Right click exposes `Open panel`, `Refresh`, `Settings`, and `Quit` through the native tray/menu surface.

### Main panel

- Default size 420 x 720 px, resizable down to 360 x 560 px.
- Opens next to the puck when practical, otherwise snaps inside the active monitor work area.
- Can be pinned always-on-top or allowed to hide when it loses focus.
- Header contains repository picker, branch picker, theme toggle, pin action, refresh action, and overflow menu.
- Body groups status rows under `Changes` and `Unversioned files`. Each row has a staging checkbox, Octicon/file icon, path, Git status, and additions/deletions when available.
- Footer contains the commit message input, character count, `Commit`, and `Commit & Push` as separate buttons. The footer remains visible while the file list scrolls.

### Empty, loading, success, and error states

- With no repository selected, show a concise explanation, `Choose repository`, and recent repositories.
- During status refresh or Git actions, disable conflicting actions and show an inline spinner.
- Successful commits and pushes show a dismissible confirmation and refresh status immediately.
- Git failures preserve the user's commit message and selection, and show the command's safe error text with a `Copy details` action.

## Git behavior

The Rust backend launches Git with `std::process::Command` and argument arrays; it never constructs shell command strings.

- Repository selection validates the directory with `git rev-parse --show-toplevel` and stores canonical paths.
- Status uses porcelain output plus `git diff --numstat`/`git diff --cached --numstat` to expose staged state and line counts.
- Selecting a row stages it with `git add -- <path>`; deselecting restores it from the index. Untracked files stay in their own group until staged.
- `Commit` commits staged files only.
- `Commit & Push` commits, then pushes the current branch. If the branch has no upstream, RepoPuck sets `origin/<branch>` using `git push -u origin <branch>`.
- The branch picker lists local branches and supports switching to an existing branch and creating a new branch.
- The overflow menu contains Fetch, Pull, Push, Amend last commit, Stash changes, Open in terminal, Open in Explorer, and Settings.
- Merge, rebase, cherry-pick, hard reset, conflict editing, remote management, and commit-history rewriting beyond amend are outside v0.1.

## Architecture

RepoPuck uses Tauri 2. The React/TypeScript frontend owns rendering and transient interaction state. The Rust backend owns filesystem access, Git invocation, repository persistence, and native windows/tray behavior.

- `src/features/git/`: frontend domain types, Tauri bridge, query/state hooks, and Git workflow components.
- `src/features/shell/`: puck/panel layout, menus, toasts, theme, and settings.
- `src-tauri/src/git/`: command runner, parsers, repository service, and Tauri commands.
- `src-tauri/src/windowing/`: panel positioning, persisted window state, and tray integration.

Frontend code talks to one typed `GitClient` interface so browser tests can use an in-memory implementation while the Tauri build uses `invoke`.

## Persistence

Local settings contain only theme, pin state, puck position, selected repository, and a bounded recent-repository list. They are stored through the Tauri store plugin. RepoPuck does not store GitHub tokens, passwords, SSH keys, or Git credential material.

## Testing and release criteria

- Rust unit tests cover porcelain/numstat parsing, command argument construction, repository validation, staging, committing, and upstream-push decisions using temporary Git repositories.
- Vitest and Testing Library cover file grouping, selection state, disabled actions, commit message retention, branch switching, menus, theme, and empty/error states.
- Type checking, ESLint, frontend tests, Rust formatting, Clippy, Rust tests, production web build, and `cargo tauri build` must pass.
- Visual QA compares the running 420 x 720 light panel and 58 x 58 puck against the approved references. The project-root `design-qa.md` must end with `final result: passed` before handoff.

## Decisions and constraints

- Windows is the supported v0.1 platform.
- Tauri 2 + Rust + React + TypeScript is the selected implementation, preferred over Electron for lower idle memory and smaller distribution size.
- Git is required on the user's PATH; a clear installation error is shown when it is missing.
- GitHub account login is intentionally absent from v0.1.
- The repository is developed on `develop` with small, coherent commits and infrequent pushes.
