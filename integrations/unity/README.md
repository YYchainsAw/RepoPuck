# RepoPuck Unity bridge

This Beta, editor-only UPM package asks RepoPuck to select the current Unity project once per editor session. It does not run Git inside Unity, and it is not required for RepoPuck's Unity detection or Git workflow.

## Requirements

- Unity 2021.3 or newer.
- RepoPuck `v0.2.0` or newer installed, or a development build with the `repopuck` protocol registered.
- A local Unity project contained in a Git working tree. The Unity project may be the Git root or a nested directory inside a larger repository.

Earlier releases, including `v0.1.2`, do not register the protocol and cannot receive bridge requests.

## Install from this repository

1. Install and start RepoPuck `v0.2.0` or newer.
2. In Unity, open **Window → Package Manager**.
3. Choose **+ → Add package from disk**.
4. Select [`com.repopuck.editor/package.json`](com.repopuck.editor/package.json).
5. Open or restart the Unity project.

The package uses `InitializeOnLoad`, waits for the editor's delayed callback, resolves the project directory from `Application.dataPath`, and opens:

```text
repopuck://open?path=<percent-encoded-project-directory>
```

The protocol accepts absolute Windows drive-letter paths and rejects direct UNC spellings such as `\\server\share`. Mapped drive letters remain subject to normal Windows resolution. On the first request for a project that is not already in RepoPuck's recent list, RepoPuck displays the exact path and asks you to confirm it. After the accepted project is validated and remembered, later editor launches can open it automatically.

RepoPuck starts if necessary. If it is already running, its single-instance handler selects the project in the existing process and requests a refresh. For a Unity project nested inside a larger repository, Git operations run from the enclosing Git root while the Unity directory is retained as `selectionPath` and in recent-project history. Batch-mode Unity sessions are ignored, and `SessionState` limits the bridge to one request per editor session.

## Safety and removal

RepoPuck remains the single owner of repository validation, staging, commits, pushes, and safety checks. The package does not read Git credentials, change project files, or invoke `git`.

Remove **RepoPuck Editor Bridge** in Package Manager to disable the integration. Removing it does not alter the repository or RepoPuck settings.
