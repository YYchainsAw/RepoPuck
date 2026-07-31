# WinGet submission checklist for RepoPuck v0.2.4

## Audit result

The public [v0.2.4 release](https://github.com/YYchainsAw/RepoPuck/releases/tag/v0.2.4)
publishes:

- `RepoPuck-0.2.4-windows-x64.msi`
- `RepoPuck-0.2.4-winget-manifests.zip`
- `SHA256SUMS.txt`
- a GitHub build-provenance attestation for the published assets

The downloaded MSI SHA-256 is:

```text
8eaa1db61e26edd96d99452e987847b3f561f4daf413c735045c577320c5ecc0
```

The WinGet candidate archive SHA-256 is:

```text
42e99ecf9dcd2730201889590de6fdf6b9f60a7a8602071683b490e4e901263d
```

The MSI value matches the installer manifest. Both values match
`SHA256SUMS.txt` and the verified GitHub attestation for tag `v0.2.4`. The
release URL is public and the package identifier was not present in
`microsoft/winget-pkgs` when checked on 2026-07-31.

The candidate uses:

- package identifier `YYchainsAw.RepoPuck`
- package version `0.2.4`
- manifest schema `1.12.0`
- x64 WiX/MSI installer
- machine scope
- MSI product code `{BD555E64-835E-41A3-AF3A-19D0B5145C7B}`

The MSI is not Authenticode-signed. This is disclosed in the RepoPuck release,
but SmartScreen or WinGet's binary validation may still require additional
review.

## Important v0.2.4 archive warning

The already-published v0.2.4 release archive contains four YAML manifests
**and** `SUBMISSION.md` in the same directory.
Do not copy the whole extracted directory into `winget-pkgs`.
Only these files belong in the manifest directory:

```text
YYchainsAw.RepoPuck.yaml
YYchainsAw.RepoPuck.installer.yaml
YYchainsAw.RepoPuck.locale.zh-CN.yaml
YYchainsAw.RepoPuck.locale.en-US.yaml
```

Putting `SUBMISSION.md` under `manifests/` can make the pull request invalid.

The generator on the current `develop` branch has been corrected for future
releases: `SUBMISSION.md` remains at the archive root and the four YAML files
are stored under `manifests/`, which can be passed directly to `winget
validate`.

## Validation result and remaining Sandbox test

The Windows App Installer copy of `winget.exe` was located during this audit.
After placing only the four YAML files in a clean directory, the official
`winget validate` command completed successfully on 2026-07-31. The extracted
root of the old v0.2.4 ZIP cannot be validated directly because it also
contains `SUBMISSION.md`.

To reproduce the successful schema validation, point `$candidate` to the
directory that contains only the four YAML files:

```powershell
$candidate = 'C:\path\to\four-yaml-manifests'

winget validate $candidate
```

The official Windows Sandbox install and uninstall test still remains. After
cloning `microsoft/winget-pkgs`, run:

```powershell
powershell .\Tools\SandboxTest.ps1 $candidate
```

Confirm all of the following inside Windows Sandbox:

- installation completes from the public GitHub Release URL;
- elevation behavior is understandable for a non-administrator;
- silent installation completes;
- RepoPuck appears in Installed apps with the expected name, version, and
  publisher;
- RepoPuck starts successfully when Git for Windows and WebView2 are present;
- uninstall completes and removes the installed application.

The official references are the
[submission guide](https://learn.microsoft.com/en-us/windows/package-manager/package/repository),
[manifest guide](https://learn.microsoft.com/en-us/windows/package-manager/package/manifest),
and [`winget-pkgs` contribution guide](https://github.com/microsoft/winget-pkgs/blob/master/CONTRIBUTING.md).

## Pull request preparation

The required repository path is:

```text
manifests/y/YYchainsAw/RepoPuck/0.2.4/
```

A maintainer can prepare the one-package, one-version pull request as follows:

```powershell
gh repo fork microsoft/winget-pkgs --clone=false
git clone --filter=blob:none --no-checkout https://github.com/YYchainsAw/winget-pkgs.git
Set-Location winget-pkgs
git sparse-checkout init --cone
git sparse-checkout set manifests/y/YYchainsAw
git checkout
git switch -c new-package-YYchainsAw.RepoPuck-0.2.4

$candidate = 'C:\path\to\extracted-winget-manifests'
$target = 'manifests/y/YYchainsAw/RepoPuck/0.2.4'
New-Item -ItemType Directory -Path $target -Force | Out-Null
Get-ChildItem -LiteralPath $candidate -Filter '*.yaml' -File |
  Copy-Item -Destination $target

winget validate $target
powershell .\Tools\SandboxTest.ps1 $target

git add -- $target
git commit -m "New package: YYchainsAw.RepoPuck version 0.2.4"
git push -u origin new-package-YYchainsAw.RepoPuck-0.2.4
```

Suggested PR metadata:

```text
Title: New package: YYchainsAw.RepoPuck version 0.2.4
Base repository: microsoft/winget-pkgs
Base branch: master
Head: YYchainsAw:new-package-YYchainsAw.RepoPuck-0.2.4
```

Microsoft's CLA bot may ask the GitHub account that opens the PR to accept the
[Microsoft Contributor License Agreement](https://cla.opensource.microsoft.com/).
This is a one-time, identity-bound action and must be completed by the account
owner. Automated checks and a moderator review follow the PR.

## Future-release improvement

The v0.2.4 MSI reports its publisher as `repopuck`, which is why the generated
manifest correctly uses that exact value. For a future version, consider
setting a deliberate, consistently cased MSI publisher before release. Do not
change only the WinGet metadata: the manifest publisher should continue to
match the Installed apps entry.
