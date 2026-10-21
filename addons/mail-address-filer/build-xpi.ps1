param(
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $projectRoot "manifest.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = $manifest.version

if (-not $version) {
  throw "manifest.json contains no version."
}

$buildDirectory = Join-Path $projectRoot "build"
New-Item -ItemType Directory -Force -Path $buildDirectory | Out-Null

$temporaryArchive = Join-Path $buildDirectory (
  "mail-address-filer-$version-" + (Get-Date -Format "yyyyMMddHHmmssfff") + ".zip"
)
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $versionedXpi = Join-Path $projectRoot "mail-address-filer-$version.xpi"
  $latestXpi = Join-Path $projectRoot "mail-address-filer.xpi"
} else {
  $versionedXpi = $OutputPath
  $latestXpi = $null
  $outputDirectory = Split-Path -Parent $versionedXpi
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

Push-Location $projectRoot
try {
  & tar.exe -a -c -f $temporaryArchive `
    manifest.json `
    background.js `
    routing.js `
    README.md `
    BEDIENUNG.md `
    api/headerLayout `
    options `
    icons

  if ($LASTEXITCODE -ne 0) {
    throw "The XPI archive could not be created."
  }
} finally {
  Pop-Location
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($temporaryArchive)
try {
  $invalidEntries = @(
    $archive.Entries | Where-Object { $_.FullName.Contains("\") }
  )
  $manifestEntry = $archive.GetEntry("manifest.json")

  if ($invalidEntries.Count -gt 0) {
    throw "The archive contains Windows path separators and is invalid for Thunderbird."
  }
  if (-not $manifestEntry) {
    throw "manifest.json is not located at the root of the archive."
  }
} finally {
  $archive.Dispose()
}

Copy-Item -LiteralPath $temporaryArchive -Destination $versionedXpi -Force
if ($latestXpi) {
  Copy-Item -LiteralPath $temporaryArchive -Destination $latestXpi -Force
}

$writtenPackages = @($versionedXpi)
if ($latestXpi) {
  $writtenPackages += $latestXpi
}

Get-Item -LiteralPath $writtenPackages |
  Select-Object Name, Length, LastWriteTime
