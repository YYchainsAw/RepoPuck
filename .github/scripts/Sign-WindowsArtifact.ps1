[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Path,

  [AllowEmptyString()]
  [string]$CertificateBase64 = "",

  [AllowEmptyString()]
  [string]$CertificatePassword = "",

  [string]$TimestampUrl = "http://timestamp.digicert.com"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$hasCertificate = -not [string]::IsNullOrWhiteSpace($CertificateBase64)
$hasPassword = -not [string]::IsNullOrWhiteSpace($CertificatePassword)

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
  throw "Windows artifact was not found: $Path"
}
if (-not $hasCertificate -and -not $hasPassword) {
  Write-Host "No Authenticode certificate configured; leaving '$Path' unsigned."
  return
}
if (-not $hasCertificate -or -not $hasPassword) {
  throw (
    "Configure both WINDOWS_CERTIFICATE_BASE64 and " +
    "WINDOWS_CERTIFICATE_PASSWORD, or remove both secrets."
  )
}
if ([string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
  throw "RUNNER_TEMP is required for temporary certificate storage."
}

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$signTool = Get-ChildItem `
  -Path "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" `
  -File |
  Sort-Object FullName -Descending |
  Select-Object -First 1
if ($null -eq $signTool) {
  throw "signtool.exe was not found on the Windows runner."
}

$certificatePath = Join-Path `
  $env:RUNNER_TEMP `
  "repopuck-signing-$([Guid]::NewGuid().ToString('N')).pfx"
$certificateBytes = $null
try {
  $certificateBytes = [Convert]::FromBase64String($CertificateBase64)
  [System.IO.File]::WriteAllBytes($certificatePath, $certificateBytes)

  & $signTool.FullName sign `
    /fd SHA256 `
    /td SHA256 `
    /tr $TimestampUrl `
    /f $certificatePath `
    /p $CertificatePassword `
    $resolvedPath
  if ($LASTEXITCODE -ne 0) {
    throw "Authenticode signing failed for '$resolvedPath'."
  }

  & $signTool.FullName verify /pa /all /v $resolvedPath
  if ($LASTEXITCODE -ne 0) {
    throw "Authenticode verification failed for '$resolvedPath'."
  }
}
finally {
  if ($null -ne $certificateBytes) {
    [Array]::Clear($certificateBytes, 0, $certificateBytes.Length)
  }
  if (Test-Path -LiteralPath $certificatePath) {
    Remove-Item -LiteralPath $certificatePath -Force
  }
}
