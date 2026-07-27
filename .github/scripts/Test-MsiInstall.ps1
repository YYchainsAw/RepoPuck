[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$MsiPath,

  [string]$LogDirectory = (Join-Path ([System.IO.Path]::GetTempPath()) "repopuck-msi-smoke"),

  [ValidateRange(30, 900)]
  [int]$TimeoutSeconds = 180
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-MsiProperty {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Property
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
      if ($null -ne $comObject -and [System.Runtime.InteropServices.Marshal]::IsComObject($comObject)) {
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($comObject)
      }
    }
  }
}

function Invoke-MsiExec {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Install", "Uninstall")]
    [string]$Operation,

    [Parameter(Mandatory = $true)]
    [string]$Target,

    [Parameter(Mandatory = $true)]
    [string]$LogPath
  )

  $switch = if ($Operation -eq "Install") { "/i" } else { "/x" }
  $arguments = "$switch `"$Target`" /qn /norestart /L*v `"$LogPath`""
  Write-Host "$Operation MSI silently. Log: $LogPath"

  $process = Start-Process `
    -FilePath (Join-Path $env:SystemRoot "System32\msiexec.exe") `
    -ArgumentList $arguments `
    -PassThru `
    -NoNewWindow

  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "$Operation timed out after $TimeoutSeconds seconds."
  }

  $process.Refresh()
  if ($process.ExitCode -notin @(0, 3010)) {
    throw "$Operation failed with msiexec exit code $($process.ExitCode). See $LogPath"
  }

  if ($process.ExitCode -eq 3010) {
    Write-Warning "$Operation succeeded but requested a reboot (exit code 3010)."
  }
}

function Get-UninstallEntry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProductCode
  )

  $paths = @(
    "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$ProductCode",
    "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\$ProductCode",
    "Registry::HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$ProductCode"
  )

  foreach ($path in $paths) {
    if (Test-Path -LiteralPath $path) {
      return Get-ItemProperty -LiteralPath $path
    }
  }

  return $null
}

function Get-DisplayIconPath {
  param(
    [AllowNull()]
    [AllowEmptyString()]
    [string]$DisplayIcon
  )

  if ([string]::IsNullOrWhiteSpace($DisplayIcon)) {
    return $null
  }

  $expanded = [Environment]::ExpandEnvironmentVariables($DisplayIcon).Trim()
  if ($expanded.StartsWith('"')) {
    $closingQuote = $expanded.IndexOf('"', 1)
    if ($closingQuote -gt 1) {
      return $expanded.Substring(1, $closingQuote - 1)
    }
  }

  return ($expanded -replace ',\s*-?\d+\s*$', '').Trim('"')
}

$resolvedMsi = (Resolve-Path -LiteralPath $MsiPath).Path
if ([System.IO.Path]::GetExtension($resolvedMsi) -ne ".msi") {
  throw "Expected an MSI file, received '$resolvedMsi'."
}
if ((Get-Item -LiteralPath $resolvedMsi).Length -le 0) {
  throw "MSI is empty: $resolvedMsi"
}

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
$installLog = Join-Path $LogDirectory "msi-install.log"
$uninstallLog = Join-Path $LogDirectory "msi-uninstall.log"
$productCode = Get-MsiProperty -Path $resolvedMsi -Property "ProductCode"
$productName = Get-MsiProperty -Path $resolvedMsi -Property "ProductName"

if ($productCode -notmatch '^\{[0-9A-Fa-f-]{36}\}$') {
  throw "MSI has an invalid ProductCode: '$productCode'."
}
if ([string]::IsNullOrWhiteSpace($productName)) {
  throw "MSI has an empty ProductName."
}
if ($productName -ne "RepoPuck") {
  throw "Expected the RepoPuck MSI, received ProductName '$productName'."
}
if ($null -ne (Get-UninstallEntry -ProductCode $productCode)) {
  throw "$productName ($productCode) is already installed on the runner."
}

Write-Host "Smoke testing $productName ($productCode)"

$installSucceeded = $false
$installedExecutable = $null
$primaryError = $null

try {
  Invoke-MsiExec -Operation Install -Target $resolvedMsi -LogPath $installLog
  $installSucceeded = $true

  $uninstallEntry = $null
  for ($attempt = 0; $attempt -lt 20 -and $null -eq $uninstallEntry; $attempt++) {
    $uninstallEntry = Get-UninstallEntry -ProductCode $productCode
    if ($null -eq $uninstallEntry) {
      Start-Sleep -Milliseconds 250
    }
  }
  if ($null -eq $uninstallEntry) {
    throw "The uninstall registry entry was not created for $productCode."
  }

  $candidateExecutables = [System.Collections.Generic.List[string]]::new()
  $displayIconProperty = $uninstallEntry.PSObject.Properties["DisplayIcon"]
  $displayIconValue = if ($null -eq $displayIconProperty) {
    ""
  }
  else {
    [string]$displayIconProperty.Value
  }
  $displayIconPath = Get-DisplayIconPath -DisplayIcon $displayIconValue
  if (-not [string]::IsNullOrWhiteSpace($displayIconPath)) {
    $candidateExecutables.Add($displayIconPath)
  }

  $installLocationProperty = $uninstallEntry.PSObject.Properties["InstallLocation"]
  $installLocation = if ($null -eq $installLocationProperty) {
    ""
  }
  else {
    [string]$installLocationProperty.Value
  }
  if (-not [string]::IsNullOrWhiteSpace($installLocation)) {
    $candidateExecutables.Add((Join-Path $installLocation "RepoPuck.exe"))
    $candidateExecutables.Add((Join-Path $installLocation "repopuck.exe"))
  }

  foreach ($root in @(
    (Join-Path $env:ProgramFiles "RepoPuck"),
    (Join-Path $env:LOCALAPPDATA "RepoPuck"),
    (Join-Path $env:LOCALAPPDATA "Programs\RepoPuck")
  )) {
    $candidateExecutables.Add((Join-Path $root "RepoPuck.exe"))
    $candidateExecutables.Add((Join-Path $root "repopuck.exe"))
  }

  $installedExecutable = $candidateExecutables |
    Select-Object -Unique |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1

  if ([string]::IsNullOrWhiteSpace($installedExecutable)) {
    throw "Installation registry entry exists, but the RepoPuck executable was not found."
  }

  $startMenuRoots = @(
    (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs"),
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs")
  )
  $startMenuShortcut = $startMenuRoots |
    Where-Object { Test-Path -LiteralPath $_ -PathType Container } |
    ForEach-Object {
      Get-ChildItem -LiteralPath $_ -Filter "*RepoPuck*.lnk" -File -Recurse -ErrorAction SilentlyContinue
    } |
    Select-Object -First 1

  if ($null -ne $startMenuShortcut) {
    Write-Host "Start menu shortcut: $($startMenuShortcut.FullName)"
  }
  else {
    Write-Host "No RepoPuck start menu shortcut was installed; executable verification still passed."
  }

  $runningApp = Get-Process -Name "repopuck" -ErrorAction SilentlyContinue
  if ($null -ne $runningApp) {
    $runningApp | Stop-Process -Force -ErrorAction SilentlyContinue
    throw "The silent installer unexpectedly launched RepoPuck."
  }

  Write-Host "Installed executable: $installedExecutable"
}
catch {
  $primaryError = $_
}
finally {
  if ($installSucceeded) {
    try {
      Invoke-MsiExec -Operation Uninstall -Target $productCode -LogPath $uninstallLog

      $remainingEntry = Get-UninstallEntry -ProductCode $productCode
      if ($null -ne $remainingEntry) {
        throw "The uninstall registry entry still exists for $productCode."
      }
      if (
        -not [string]::IsNullOrWhiteSpace($installedExecutable) -and
        (Test-Path -LiteralPath $installedExecutable)
      ) {
        throw "The installed executable still exists after uninstall: $installedExecutable"
      }

      Write-Host "Silent uninstall verification passed."
    }
    catch {
      if ($null -eq $primaryError) {
        $primaryError = $_
      }
      else {
        Write-Warning "Cleanup also failed: $($_.Exception.Message)"
      }
    }
  }
}

if ($null -ne $primaryError) {
  throw $primaryError
}

Write-Host "MSI install/uninstall smoke test passed."
