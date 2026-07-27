# Manual commit workflow smoke test

Use a disposable local repository for this test. Do not run it against the
RepoPuck source checkout or a repository containing private work.

## Test fixture

1. Create a temporary Git repository.
2. Commit one baseline text file.
3. Modify the tracked file and create one untracked text file.
4. Configure a disposable remote only when the Push path is under test.

Suggested commit message:

```text
test: verify RepoPuck commit flow
```

## Test steps

1. Open the disposable repository in RepoPuck.
2. Confirm tracked changes and unversioned files appear in separate groups.
3. Select only the intended files.
4. Enter the suggested commit message.
5. Choose **Commit** and confirm the selected files disappear from Changes.
6. When a disposable remote is configured, choose **Push** separately and
   confirm the remote receives the new commit.
7. Repeat with **Commit & Push** and simulate a rejected Push to verify that
   RepoPuck reports the committed and pushed stages separately.

## Expected result

- Selection counters and action availability follow the staged files.
- Commit creates exactly one local commit containing only the selected files.
- A failed Push does not cause a second Commit when Push is retried.
- Refreshing after a successful operation shows the current working tree.
- User-facing errors do not expose credential-bearing remote URLs.
