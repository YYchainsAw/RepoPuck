# RepoPuck marketing assets

This directory contains deterministic, reproducible source files for the public
RepoPuck product visuals. The exports use only the checked-in application icon
and QA captures with fictional repository data.

## Build

Run from the repository root:

```powershell
.\docs\marketing\Build-MarketingAssets.ps1
```

The script uses an installed Microsoft Edge or Google Chrome. On the first run,
it installs the two pinned pure-JavaScript image encoders declared in this
directory, then creates:

- `docs/images/repopuck-social-preview.png` — 1280×640 GitHub social preview.
- `docs/images/repopuck-workflow-demo.gif` — short README workflow animation.

Do not replace the screenshots with captures containing real repository names,
paths, remotes, email addresses, API keys, or private source code.
