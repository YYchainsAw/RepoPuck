# RepoPuck Commit Test

This file is intentionally left uncommitted so it can be used to verify RepoPuck's real Git workflow.

## Test target

- Repository: `D:\VsCodeProjects\RepoPuck`
- Branch: `develop`
- File state: unversioned
- Suggested commit message: `test: verify RepoPuck commit flow`

## Test steps

1. Open RepoPuck and select `D:\VsCodeProjects\RepoPuck`.
2. Find this file under **Unversioned Files**.
3. Select `README-COMMIT-TEST.md`.
4. Enter the suggested commit message.
5. Click **Commit** first to verify the local commit.
6. After the file disappears from Changes, use **Push** from the more-actions menu if you want to publish the test commit.

## Expected result

- The selected-file counter increases when this file is checked.
- **Commit** creates one local commit containing only this file.
- Refreshing the panel shows a clean working tree.
- **Push** sends the new commit to `origin/develop` using the Git credentials already configured on this computer.

Created on 2026-07-22 for the first end-to-end RepoPuck commit test.
