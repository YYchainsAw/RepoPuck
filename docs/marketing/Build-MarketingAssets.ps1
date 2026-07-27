[CmdletBinding()]
param(
  [string]$ChromePath
)

$ErrorActionPreference = "Stop"

$marketingRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = Resolve-Path (Join-Path $marketingRoot "..\..")
$outputRoot = Join-Path $repositoryRoot "docs\images"
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) "repopuck-marketing-assets"

if (-not $ChromePath) {
  $browserCandidates = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )

  $ChromePath = $browserCandidates |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1
}

if (-not $ChromePath -or -not (Test-Path -LiteralPath $ChromePath)) {
  throw "Microsoft Edge or Google Chrome was not found. Pass -ChromePath explicitly."
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null

function ConvertTo-FileUrl {
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  $resolvedPath = (Resolve-Path $Path).Path
  return ([System.Uri]::new($resolvedPath)).AbsoluteUri
}

function Invoke-BrowserCapture {
  param(
    [Parameter(Mandatory)]
    [string]$Url,

    [Parameter(Mandatory)]
    [string]$OutputPath,

    [Parameter(Mandatory)]
    [string]$WindowSize
  )

  $arguments = @(
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=$WindowSize",
    "--screenshot=$OutputPath",
    $Url
  )

  $process = Start-Process `
    -FilePath $ChromePath `
    -ArgumentList $arguments `
    -NoNewWindow `
    -PassThru `
    -Wait

  if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $OutputPath)) {
    throw "Browser capture failed for $Url."
  }
}

$socialSource = ConvertTo-FileUrl (Join-Path $marketingRoot "social-preview.html")
$socialOutput = Join-Path $outputRoot "repopuck-social-preview.png"
Invoke-BrowserCapture `
  -Url $socialSource `
  -OutputPath $socialOutput `
  -WindowSize "1280,640"

$demoSource = ConvertTo-FileUrl (Join-Path $marketingRoot "demo-frame.html")
$framePaths = @()
for ($step = 1; $step -le 5; $step += 1) {
  $framePath = Join-Path $temporaryRoot ("frame-{0}.png" -f $step)
  Invoke-BrowserCapture `
    -Url "$demoSource`?step=$step" `
    -OutputPath $framePath `
    -WindowSize "960,540"
  $framePaths += $framePath
}

$demoOutput = Join-Path $outputRoot "repopuck-workflow-demo.gif"
$gifBuilder = Join-Path $marketingRoot "Build-AnimatedGif.mjs"
$gifDependency = Join-Path $marketingRoot "node_modules\gifenc"

if (-not (Test-Path -LiteralPath $gifDependency)) {
  & npm ci `
    --prefix $marketingRoot `
    --ignore-scripts `
    --no-audit `
    --no-fund

  if ($LASTEXITCODE -ne 0) {
    throw "Unable to install the deterministic GIF encoder dependencies."
  }
}

& node $gifBuilder $demoOutput @framePaths
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $demoOutput)) {
  throw "Animated GIF generation failed."
}

Get-Item $socialOutput, $demoOutput |
  Select-Object FullName, Length, LastWriteTime
