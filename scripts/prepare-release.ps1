Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$checksums = @()
foreach ($module in @('calendar-raster','daily-planner','mail-address-filer','mobile-module-bridge')) {
  $source = Join-Path $root "addons/$module"
  $manifest = Get-Content -Raw -LiteralPath (Join-Path $source 'manifest.json') | ConvertFrom-Json
  if ($manifest.experiment_apis -and (!$manifest.browser_specific_settings.gecko.strict_max_version -or $manifest.browser_specific_settings.gecko.strict_max_version -eq '*')) {
    throw "Experiment benoetigt eine begrenzte strict_max_version: $module"
  }
  $target = Join-Path $dist "$module-$($manifest.version).xpi"
  & (Join-Path $source 'build-xpi.ps1') -OutputPath $target
  $zip = [IO.Compression.ZipFile]::OpenRead($target)
  try {
    if (@($zip.Entries | Group-Object FullName | Where-Object Count -gt 1).Count) { throw "Doppelte Archivpfade: $module" }
    if (!$zip.GetEntry('LICENSE')) { throw "Lizenz fehlt: $module" }
    $info = $zip.GetEntry('diagnostics/build-info.json')
    if ($module -ne 'mobile-module-bridge') {
      if (!$info) { throw "Diagnosekennung fehlt: $module" }
      $reader = [IO.StreamReader]::new($info.Open())
      try { $build = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
      if ($build.releaseName -ne 'release') { throw "Kein normales Paket: $module" }
    }
    if ($module -in @('daily-planner','mobile-module-bridge') -and !$zip.GetEntry('THIRD_PARTY_NOTICES.md')) {
      throw "Drittanbieterhinweis fehlt: $module"
    }
  } finally { $zip.Dispose() }
  $checksums += "$((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLower())  $([IO.Path]::GetFileName($target))"
}
[IO.File]::WriteAllLines((Join-Path $dist 'SHA256SUMS.txt'), $checksums, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Join-Path $root 'docs/RELEASE.md') -Destination (Join-Path $dist 'RELEASE.md') -Force
Write-Output 'Vier XPI-Kandidaten vorbereitet. Keine Installation, Veröffentlichung oder APK-Release-Kopie.'
