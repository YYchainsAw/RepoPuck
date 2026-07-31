[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$MsiPath,

  [Parameter(Mandatory = $true)]
  [string]$PortableExePath,

  [Parameter(Mandatory = $true)]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,

  [Parameter(Mandatory = $true)]
  [string]$Repository,

  [Parameter(Mandatory = $true)]
  [string]$ReleaseTag,

  [string]$ReleaseNotesPath,

  [string]$LicensePath = "LICENSE",

  [string]$PackageIdentifier = "YYchainsAw.RepoPuck",

  [string]$GitHubOutputPath = $env:GITHUB_OUTPUT
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-ReleaseInput {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Description
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Description was not found: $Path"
  }

  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  if ((Get-Item -LiteralPath $resolvedPath).Length -le 0) {
    throw "$Description is empty: $resolvedPath"
  }

  return $resolvedPath
}

function Write-Utf8File {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Content
  )

  $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText(
    $Path,
    ($Content.TrimEnd() + [Environment]::NewLine),
    $utf8WithoutBom
  )
}

function Get-MsiProperty {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Property,

    [switch]$Optional
  )

  $installer = $null
  $database = $null
  $view = $null
  $record = $null

  try {
    $installer = New-Object -ComObject WindowsInstaller.Installer
    $database = $installer.GetType().InvokeMember(
      "OpenDatabase",
      "InvokeMethod",
      $null,
      $installer,
      @($Path, 0)
    )
    $query = "SELECT Value FROM Property WHERE Property = '$Property'"
    $view = $database.GetType().InvokeMember(
      "OpenView",
      "InvokeMethod",
      $null,
      $database,
      @($query)
    )
    $view.GetType().InvokeMember(
      "Execute",
      "InvokeMethod",
      $null,
      $view,
      $null
    ) | Out-Null
    $record = $view.GetType().InvokeMember(
      "Fetch",
      "InvokeMethod",
      $null,
      $view,
      $null
    )

    if ($null -eq $record) {
      if ($Optional) {
        return ""
      }
      throw "MSI property '$Property' was not found."
    }

    return [string]$record.GetType().InvokeMember(
      "StringData",
      "GetProperty",
      $null,
      $record,
      @(1)
    )
  }
  finally {
    foreach ($comObject in @($record, $view, $database, $installer)) {
      if (
        $null -ne $comObject -and
        [System.Runtime.InteropServices.Marshal]::IsComObject($comObject)
      ) {
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject(
          $comObject
        )
      }
    }
  }
}

function Assert-ZipEntries {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string[]]$ExpectedEntries
  )

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = $null
  try {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
    $actualEntries = @(
      $archive.Entries |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) } |
        ForEach-Object { $_.FullName.Replace('\', '/') } |
        Sort-Object
    )
    $expected = @($ExpectedEntries | Sort-Object)
    if (
      $actualEntries.Count -ne $expected.Count -or
      (Compare-Object -ReferenceObject $expected -DifferenceObject $actualEntries)
    ) {
      throw (
        "Unexpected entries in '$Path'. Expected: {0}. Actual: {1}." -f
        ($expected -join ", "),
        ($actualEntries -join ", ")
      )
    }
  }
  finally {
    if ($null -ne $archive) {
      $archive.Dispose()
    }
  }
}

if (
  $Version -notmatch
    '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$'
) {
  throw "Version must be a SemVer-compatible release version: '$Version'."
}
if ($ReleaseTag -ne "v$Version") {
  throw "Release tag '$ReleaseTag' does not match version '$Version'."
}
if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
  throw "Repository must use the owner/name format: '$Repository'."
}
if ($PackageIdentifier -notmatch '^[A-Za-z0-9.-]+$') {
  throw "Invalid WinGet package identifier: '$PackageIdentifier'."
}

$resolvedMsi = Resolve-ReleaseInput -Path $MsiPath -Description "MSI"
$resolvedPortableExe = Resolve-ReleaseInput `
  -Path $PortableExePath `
  -Description "portable executable"
$resolvedLicense = Resolve-ReleaseInput `
  -Path $LicensePath `
  -Description "license file"

if ([System.IO.Path]::GetExtension($resolvedMsi) -ne ".msi") {
  throw "Expected an .msi file, received '$resolvedMsi'."
}
if ([System.IO.Path]::GetExtension($resolvedPortableExe) -ne ".exe") {
  throw "Expected an .exe file, received '$resolvedPortableExe'."
}

$executableHeader = New-Object byte[] 2
$executableStream = [System.IO.File]::OpenRead($resolvedPortableExe)
try {
  if (
    $executableStream.Read($executableHeader, 0, 2) -ne 2 -or
    $executableHeader[0] -ne 0x4D -or
    $executableHeader[1] -ne 0x5A
  ) {
    throw "Portable executable does not have a valid PE header."
  }
}
finally {
  $executableStream.Dispose()
}

$msiProductCode = Get-MsiProperty -Path $resolvedMsi -Property "ProductCode"
$msiProductName = Get-MsiProperty -Path $resolvedMsi -Property "ProductName"
$msiProductVersion = Get-MsiProperty -Path $resolvedMsi -Property "ProductVersion"
$msiPublisher = Get-MsiProperty -Path $resolvedMsi -Property "Manufacturer"
$msiAllUsers = Get-MsiProperty `
  -Path $resolvedMsi `
  -Property "ALLUSERS" `
  -Optional

if ($msiProductName -ne "RepoPuck") {
  throw "Expected ProductName 'RepoPuck', received '$msiProductName'."
}
if ($msiProductVersion -ne $Version) {
  throw (
    "MSI ProductVersion '$msiProductVersion' does not match '$Version'."
  )
}
if ($msiProductCode -notmatch '^\{[0-9A-Fa-f-]{36}\}$') {
  throw "MSI has an invalid ProductCode: '$msiProductCode'."
}
if ([string]::IsNullOrWhiteSpace($msiPublisher)) {
  throw "MSI Manufacturer must not be empty."
}
if ($msiAllUsers -ne "1") {
  throw (
    "Expected a per-machine MSI (ALLUSERS=1), received '$msiAllUsers'."
  )
}

$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $outputRoot) {
  $existingItems = @(Get-ChildItem -LiteralPath $outputRoot -Force)
  if ($existingItems.Count -gt 0) {
    throw "Release output directory must be empty: $outputRoot"
  }
}
else {
  New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
}

$outputPrefix = $outputRoot.TrimEnd('\', '/') +
  [System.IO.Path]::DirectorySeparatorChar
$portableStage = [System.IO.Path]::GetFullPath(
  (Join-Path $outputRoot ".portable-stage")
)
$wingetStage = [System.IO.Path]::GetFullPath(
  (Join-Path $outputRoot ".winget-stage")
)
foreach ($stagePath in @($portableStage, $wingetStage)) {
  if (
    -not $stagePath.StartsWith(
      $outputPrefix,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "Refusing to use a staging path outside the output directory: $stagePath"
  }
  New-Item -ItemType Directory -Path $stagePath | Out-Null
}
$wingetManifestStage = Join-Path $wingetStage "manifests"
New-Item -ItemType Directory -Path $wingetManifestStage | Out-Null

$releaseMsiName = "RepoPuck-$Version-windows-x64.msi"
$portableZipName = "RepoPuck-$Version-windows-x64-portable.zip"
$wingetZipName = "RepoPuck-$Version-winget-manifests.zip"
$checksumName = "SHA256SUMS.txt"
$releaseMsiPath = Join-Path $outputRoot $releaseMsiName
$portableZipPath = Join-Path $outputRoot $portableZipName
$wingetZipPath = Join-Path $outputRoot $wingetZipName
$checksumPath = Join-Path $outputRoot $checksumName

Copy-Item -LiteralPath $resolvedMsi -Destination $releaseMsiPath
Copy-Item `
  -LiteralPath $resolvedPortableExe `
  -Destination (Join-Path $portableStage "RepoPuck.exe")
Copy-Item `
  -LiteralPath $resolvedLicense `
  -Destination (Join-Path $portableStage "LICENSE.txt")

$portableReadme = @(
  "RepoPuck $Version - Windows x64 portable package"
  ""
  "Run RepoPuck.exe directly; no installation is required."
  ""
  "Requirements:"
  "- Windows 10 or Windows 11 (x64)"
  "- Git for Windows available on PATH"
  "- Microsoft Edge WebView2 Runtime"
  ""
  "Portable-package notes:"
  "- This archive does not create Start menu shortcuts or an uninstall entry."
  "- RepoPuck preferences remain in the Windows user profile."
  "- AI credentials remain in Windows Credential Manager."
  ""
  "Official source and releases:"
  "https://github.com/$Repository"
) -join [Environment]::NewLine
Write-Utf8File `
  -Path (Join-Path $portableStage "README.txt") `
  -Content $portableReadme

$portableFiles = @(
  Get-ChildItem -LiteralPath $portableStage -File |
    Sort-Object Name
)
Compress-Archive `
  -LiteralPath $portableFiles.FullName `
  -DestinationPath $portableZipPath `
  -CompressionLevel Optimal
Assert-ZipEntries `
  -Path $portableZipPath `
  -ExpectedEntries @("LICENSE.txt", "README.txt", "RepoPuck.exe")

$msiDigest = (
  Get-FileHash -LiteralPath $releaseMsiPath -Algorithm SHA256
).Hash.ToUpperInvariant()
$installerUrl = (
  "https://github.com/{0}/releases/download/{1}/{2}" -f
  $Repository,
  $ReleaseTag,
  $releaseMsiName
)

$versionManifestName = "$PackageIdentifier.yaml"
$installerManifestName = "$PackageIdentifier.installer.yaml"
$zhLocaleManifestName = "$PackageIdentifier.locale.zh-CN.yaml"
$enLocaleManifestName = "$PackageIdentifier.locale.en-US.yaml"

$versionManifest = @(
  "# yaml-language-server: `$schema=https://aka.ms/winget-manifest.version.1.12.0.schema.json"
  "PackageIdentifier: $PackageIdentifier"
  "PackageVersion: $Version"
  "DefaultLocale: zh-CN"
  "ManifestType: version"
  "ManifestVersion: 1.12.0"
) -join [Environment]::NewLine

$installerManifest = @(
  "# yaml-language-server: `$schema=https://aka.ms/winget-manifest.installer.1.12.0.schema.json"
  "PackageIdentifier: $PackageIdentifier"
  "PackageVersion: $Version"
  "InstallerType: wix"
  "InstallerLocale: en-US"
  "Scope: machine"
  "InstallModes:"
  "  - interactive"
  "  - silent"
  "  - silentWithProgress"
  "UpgradeBehavior: install"
  "Installers:"
  "  - Architecture: x64"
  "    InstallerUrl: $installerUrl"
  "    InstallerSha256: $msiDigest"
  "    ProductCode: '$msiProductCode'"
  "ManifestType: installer"
  "ManifestVersion: 1.12.0"
) -join [Environment]::NewLine

$zhLocaleManifest = @(
  "# yaml-language-server: `$schema=https://aka.ms/winget-manifest.defaultLocale.1.12.0.schema.json"
  "PackageIdentifier: $PackageIdentifier"
  "PackageVersion: $Version"
  "PackageLocale: zh-CN"
  "Publisher: '$msiPublisher'"
  "PublisherUrl: https://github.com/$($Repository.Split('/')[0])"
  "PublisherSupportUrl: https://github.com/$Repository/issues"
  "PackageName: RepoPuck"
  "PackageUrl: https://github.com/$Repository"
  "License: MIT"
  "LicenseUrl: https://github.com/$Repository/blob/$ReleaseTag/LICENSE"
  "ShortDescription: 常驻桌面的轻量级 Windows Git 助手"
  "Description: 从桌面快速选择改动、提交和推送，并可选使用自有 API Key 生成提交信息。"
  "Moniker: repopuck"
  "Tags:"
  "  - git"
  "  - git-client"
  "  - developer-tools"
  "  - productivity"
  "  - tauri"
  "  - windows"
  "ManifestType: defaultLocale"
  "ManifestVersion: 1.12.0"
) -join [Environment]::NewLine

$enLocaleManifest = @(
  "# yaml-language-server: `$schema=https://aka.ms/winget-manifest.locale.1.12.0.schema.json"
  "PackageIdentifier: $PackageIdentifier"
  "PackageVersion: $Version"
  "PackageLocale: en-US"
  "Publisher: '$msiPublisher'"
  "PackageName: RepoPuck"
  "ShortDescription: An always-ready lightweight Git companion for Windows"
  "Description: Select changes, commit, and push from the desktop, with optional BYOK AI commit messages."
  "ManifestType: locale"
  "ManifestVersion: 1.12.0"
) -join [Environment]::NewLine

Write-Utf8File `
  -Path (Join-Path $wingetManifestStage $versionManifestName) `
  -Content $versionManifest
Write-Utf8File `
  -Path (Join-Path $wingetManifestStage $installerManifestName) `
  -Content $installerManifest
Write-Utf8File `
  -Path (Join-Path $wingetManifestStage $zhLocaleManifestName) `
  -Content $zhLocaleManifest
Write-Utf8File `
  -Path (Join-Path $wingetManifestStage $enLocaleManifestName) `
  -Content $enLocaleManifest

$wingetSubmissionNotes = @(
  "# RepoPuck WinGet manifest candidate"
  ""
  "These files are maintainer metadata, not an end-user download."
  ""
  "Before submitting them to microsoft/winget-pkgs:"
  ""
  "1. Confirm the GitHub Release and MSI URL are publicly available."
  "2. Extract this archive to an empty directory."
  "3. Run ``winget validate .\manifests``."
  "4. Run ``winget install --manifest .\manifests`` in Windows Sandbox."
  "5. Submit only the four YAML files under ``manifests`` to microsoft/winget-pkgs."
  ""
  "Generated for $Repository at tag $ReleaseTag."
) -join [Environment]::NewLine
Write-Utf8File `
  -Path (Join-Path $wingetStage "SUBMISSION.md") `
  -Content $wingetSubmissionNotes

$wingetEntries = @(
  Get-ChildItem -LiteralPath $wingetStage -Force |
    Sort-Object Name
)
Compress-Archive `
  -LiteralPath $wingetEntries.FullName `
  -DestinationPath $wingetZipPath `
  -CompressionLevel Optimal
Assert-ZipEntries `
  -Path $wingetZipPath `
  -ExpectedEntries @(
    "manifests/$versionManifestName"
    "manifests/$installerManifestName"
    "manifests/$zhLocaleManifestName"
    "manifests/$enLocaleManifestName"
    "SUBMISSION.md"
  )

$releaseAssets = @(
  Get-Item -LiteralPath $releaseMsiPath
  Get-Item -LiteralPath $portableZipPath
  Get-Item -LiteralPath $wingetZipPath
) | Sort-Object Name
$checksumLines = foreach ($asset in $releaseAssets) {
  $digest = (
    Get-FileHash -LiteralPath $asset.FullName -Algorithm SHA256
  ).Hash.ToLowerInvariant()
  "$digest  $($asset.Name)"
}
[System.IO.File]::WriteAllLines(
  $checksumPath,
  $checksumLines,
  [System.Text.Encoding]::ASCII
)

foreach ($asset in $releaseAssets) {
  $checksumLine = $checksumLines |
    Where-Object { $_.EndsWith("  $($asset.Name)") } |
    Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($checksumLine)) {
    throw "Checksum entry is missing for '$($asset.Name)'."
  }
  $expectedDigest = $checksumLine.Substring(0, 64)
  $actualDigest = (
    Get-FileHash -LiteralPath $asset.FullName -Algorithm SHA256
  ).Hash.ToLowerInvariant()
  if ($actualDigest -ne $expectedDigest) {
    throw "Checksum verification failed for '$($asset.Name)'."
  }
}

$generatedNotesPath = ""
if (-not [string]::IsNullOrWhiteSpace($ReleaseNotesPath)) {
  $resolvedNotes = Resolve-ReleaseInput `
    -Path $ReleaseNotesPath `
    -Description "release notes"
  $sourceNotes = Get-Content -LiteralPath $resolvedNotes -Raw -Encoding utf8
  $verificationSection = @(
    ""
    ""
    "---"
    ""
    "## 📦 Assets and verification / 下载与校验"
    ""
    ('- `{0}` — Windows x64 installer / 安装包' -f $releaseMsiName)
    ('- `{0}` — Portable package / 免安装包' -f $portableZipName)
    ('- `{0}` — WinGet submission candidate for maintainers / 供维护者提交 WinGet' -f $wingetZipName)
    ('- `{0}` — SHA-256 digest list / 文件校验汇总' -f $checksumName)
    ""
    "Verify SHA-256 in PowerShell / 使用 PowerShell 校验："
    ""
    '```powershell'
    ('Get-FileHash .\{0} -Algorithm SHA256' -f $releaseMsiName)
    ('Get-FileHash .\{0} -Algorithm SHA256' -f $portableZipName)
    '```'
    ""
    "Verify GitHub build provenance / 验证 GitHub 构建来源："
    ""
    '```powershell'
    ('gh attestation verify .\{0} --repo {1}' -f $releaseMsiName, $Repository)
    ('gh attestation verify .\{0} --repo {1}' -f $portableZipName, $Repository)
    '```'
  ) -join [Environment]::NewLine
  $generatedNotesPath = Join-Path $outputRoot "release-notes.generated.md"
  Write-Utf8File `
    -Path $generatedNotesPath `
    -Content ($sourceNotes.TrimEnd() + $verificationSection)
}

foreach ($stagePath in @($portableStage, $wingetStage)) {
  if (
    -not $stagePath.StartsWith(
      $outputPrefix,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "Refusing to remove an unexpected staging path: $stagePath"
  }
  Remove-Item -LiteralPath $stagePath -Recurse -Force
}

$outputs = [ordered]@{
  msi_path = $releaseMsiPath
  portable_zip_path = $portableZipPath
  winget_manifest_zip_path = $wingetZipPath
  checksum_path = $checksumPath
}
if (-not [string]::IsNullOrWhiteSpace($generatedNotesPath)) {
  $outputs["generated_notes_path"] = $generatedNotesPath
}

if (-not [string]::IsNullOrWhiteSpace($GitHubOutputPath)) {
  foreach ($entry in $outputs.GetEnumerator()) {
    "$($entry.Key)=$($entry.Value)" |
      Out-File `
        -LiteralPath $GitHubOutputPath `
        -Encoding utf8 `
        -Append
  }
}

$releaseAssets |
  Select-Object Name, Length |
  Format-Table -AutoSize
Write-Host "Checksums: $checksumPath"
if (-not [string]::IsNullOrWhiteSpace($generatedNotesPath)) {
  Write-Host "Generated release notes: $generatedNotesPath"
}
