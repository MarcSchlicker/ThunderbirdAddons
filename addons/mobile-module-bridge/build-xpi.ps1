param(
  [string]$OutputPath,
  [string]$DownloadBaseUrl = "",
  [string]$XpiBaseUrl = ""
)

$ErrorActionPreference = "Stop"
$sourceRoot = $PSScriptRoot
foreach ($base in @($DownloadBaseUrl, $XpiBaseUrl)) {
  if (!$base) { continue }
  $downloadUri = [Uri]$base
  if (-not $downloadUri.IsAbsoluteUri -or $downloadUri.Scheme -ne 'https' -or $downloadUri.UserInfo -or $downloadUri.Query -or $downloadUri.Fragment) {
    throw 'Downloadadressen muessen HTTPS-Basisadressen ohne Zugangsdaten, Query oder Fragment sein.'
  }
}
$DownloadBaseUrl = $DownloadBaseUrl.TrimEnd('/')
$XpiBaseUrl = $XpiBaseUrl.TrimEnd('/')
$xpiUrls = [ordered]@{}
if ($XpiBaseUrl) {
  foreach ($module in @('daily-planner', 'calendar-raster', 'mail-address-filer')) {
    $moduleManifest = Get-Content -Raw -LiteralPath (Join-Path $sourceRoot "../$module/manifest.json") | ConvertFrom-Json
    $moduleVersion = [string]$moduleManifest.version
    if ($moduleVersion -notmatch '^\d+(\.\d+){0,3}$') { throw "Ungueltige Paketversion: $module" }
    $xpiUrls[$module] = "$XpiBaseUrl/$module-$moduleVersion.xpi"
  }
}
$manifest = Get-Content -Raw -LiteralPath (Join-Path $sourceRoot "manifest.json") | ConvertFrom-Json
$version = [string]$manifest.version
if ([string]::IsNullOrWhiteSpace($version)) {
  throw "Keine Versionsnummer in manifest.json gefunden."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $sourceRoot "build\TB-Connect-Modul-Hub-$version.xpi"
}

$packageItems = @(
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "manifest.json",
  "background.js",
  "module-catalog.js",
  "nextcloud-caldav.js",
  "README.md",
  "BEDIENUNG.md",
  "api",
  "vendor",
  "dashboard",
  "icons"
)
$qrCodeSource = Join-Path $sourceRoot "..\daily-planner\vendor\qrcode.min.js"

foreach ($item in $packageItems) {
  if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $item))) {
    throw "Paketbestandteil fehlt: $item"
  }
}
if (-not (Test-Path -LiteralPath $qrCodeSource)) {
  throw "QR-Code-Bibliothek fehlt: $qrCodeSource"
}

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$zipPath = Join-Path $outputDirectory "TB-Connect-Modul-Hub-$version.zip"
Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $OutputPath -Force -ErrorAction SilentlyContinue

$stagingDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("tb-connect-module-hub-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null
foreach ($item in $packageItems) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $item) -Destination (Join-Path $stagingDirectory $item) -Recurse
}
Copy-Item -LiteralPath $qrCodeSource -Destination (Join-Path $stagingDirectory "dashboard\qrcode.min.js")
$catalogPath = Join-Path $stagingDirectory 'module-catalog.js'
$catalog = [IO.File]::ReadAllText($catalogPath)
foreach ($marker in @('const TB_CONNECT_REPOSITORY = "";', 'const TB_CONNECT_XPI_URLS = {};')) {
  if (!$catalog.Contains($marker)) { throw 'Katalog-Buildmarker fehlt.' }
}
$catalog = $catalog.Replace('const TB_CONNECT_REPOSITORY = "";',
  ('const TB_CONNECT_REPOSITORY = ' + (ConvertTo-Json -InputObject $DownloadBaseUrl -Compress) + ';'))
$catalog = $catalog.Replace('const TB_CONNECT_XPI_URLS = {};',
  ('const TB_CONNECT_XPI_URLS = ' + (ConvertTo-Json -InputObject $xpiUrls -Compress) + ';'))
[IO.File]::WriteAllText($catalogPath, $catalog, [Text.UTF8Encoding]::new($false))

Push-Location $stagingDirectory
try {
  & tar.exe -a -c -f $zipPath @packageItems
  if ($LASTEXITCODE -ne 0) {
    throw "Das XPI-Paket konnte nicht erstellt werden."
  }
  Copy-Item -LiteralPath $zipPath -Destination $OutputPath
} finally {
  Pop-Location
  Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output $OutputPath
