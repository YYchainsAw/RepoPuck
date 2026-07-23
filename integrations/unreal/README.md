# RepoPuck Unreal bridge

This preview, editor-only plugin asks RepoPuck to select the current Unreal project after the editor starts. It supports Blueprint-only projects and does not run Git inside Unreal.

## Requirements

- Unreal Editor on Win64.
- An installed RepoPuck `v0.2.0` preview build, or a development build with the `repopuck` protocol registered.
- A local Unreal project contained in a Git working tree. The Unreal project may be the Git root or a nested directory inside a larger repository.

The stable RepoPuck `v0.1.2` installer does not register the protocol and cannot receive bridge requests.

## Install per project

1. Install and start a compatible RepoPuck preview build.
2. Copy [`RepoPuckEditor`](RepoPuckEditor) to `<YourProject>/Plugins/RepoPuckEditor`.
3. In Unreal Editor, enable **RepoPuck Editor Bridge** in the Plugins window.
4. Restart the editor and allow Unreal Build Tool to compile the editor plugin if prompted.

The editor module loads at `PostEngineInit`, resolves `FPaths::ProjectDir()`, URL-encodes the absolute directory, and opens:

```text
repopuck://open?path=<percent-encoded-project-directory>
```

The protocol accepts absolute Windows drive-letter paths and rejects direct UNC spellings such as `\\server\share`. Mapped drive letters remain subject to normal Windows resolution. On the first request for a project that is not already in RepoPuck's recent list, RepoPuck displays the exact path and asks you to confirm it. After the accepted project is validated and remembered, later editor launches can open it automatically.

RepoPuck starts if necessary. If it is already running, its single-instance handler selects the project in the existing process and requests a refresh. For an Unreal project nested inside a larger repository, Git operations run from the enclosing Git root while the Unreal directory is retained as `selectionPath` and in recent-project history. Commandlet and unattended Unreal runs are ignored.

## Safety and removal

RepoPuck remains the single owner of repository validation, staging, commits, pushes, and safety checks. The plugin does not read Git credentials, change assets or Blueprints, or invoke `git`.

Disable the plugin and remove `<YourProject>/Plugins/RepoPuckEditor` to uninstall it. Removing the bridge does not alter the repository or RepoPuck settings.
