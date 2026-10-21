param(
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$sourceRoot = $PSScriptRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $sourceRoot "manifest.json") | ConvertFrom-Json
$version = [string]$manifest.version
if ([string]::IsNullOrWhiteSpace($version)) {
  throw "Keine Versionsnummer in manifest.json gefunden."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $sourceRoot "release\Tagesplaner-$version.xpi"
}

$packageItems = @(
  "manifest.json",
  "background.js",
  "core.js",
  "tb-connect-module.json",
  "tb-connect-mobile.json",
  "README.md",
  "BEDIENUNG.md",
  "THIRD_PARTY_NOTICES.md",
  "api",
  "icons",
  "planner",
  "popup",
  "vendor"
)

foreach ($item in $packageItems) {
  if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $item))) {
    throw "Paketbestandteil fehlt: $item"
  }
}

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$zipPath = Join-Path $outputDirectory "Tagesplaner-$version.zip"
Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $OutputPath -Force -ErrorAction SilentlyContinue

Push-Location $sourceRoot
try {
  & tar.exe -a -c -f $zipPath @packageItems
  if ($LASTEXITCODE -ne 0) {
    throw "Das XPI-Paket konnte nicht erstellt werden."
  }
  Copy-Item -LiteralPath $zipPath -Destination $OutputPath
} finally {
  Pop-Location
}

Write-Output $OutputPath
