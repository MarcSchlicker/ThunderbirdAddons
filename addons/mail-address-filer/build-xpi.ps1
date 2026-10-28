param(
  [string]$OutputPath,
  [string]$ReleaseName = "release"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($ReleaseName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,69}$') {
  throw 'ReleaseName darf nur Buchstaben, Zahlen, Punkt, Unterstrich und Bindestrich enthalten.'
}
$sourceRoot = $PSScriptRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $sourceRoot 'manifest.json') | ConvertFrom-Json
$version = [string]$manifest.version
$packageName = 'Mail-Ablage'
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $sourceRoot "build/$packageName-$version-$ReleaseName.xpi"
}
$OutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$buildId = 'source'
if (Get-Command git -ErrorAction SilentlyContinue) {
  $revision = & git -C $sourceRoot rev-parse --short=12 HEAD 2>$null
  if ($LASTEXITCODE -eq 0 -and $revision -match '^[a-f0-9]{7,40}$') {
    $buildId = [string]$revision
    $changes = & git -C $sourceRoot status --porcelain -- .
    if ($changes) { $buildId += '-dirty' }
  }
}
$stagingParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$staging = Join-Path $stagingParent ('tb-addon-build-' + [Guid]::NewGuid().ToString('N'))
$archivePath = Join-Path $outputDirectory ('package-' + [Guid]::NewGuid().ToString('N') + '.zip')
$items = @('LICENSE','manifest.json','background.js','routing.js','README.md','BEDIENUNG.md','api','options','icons','diagnostics')
New-Item -ItemType Directory -Path $staging | Out-Null
try {
  foreach ($item in $items) {
    $source = Join-Path $sourceRoot $item
    if (-not (Test-Path -LiteralPath $source)) { throw "Paketbestandteil fehlt: $item" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $staging $item) -Recurse
  }
  $info = @{ releaseName = $ReleaseName; build = $buildId } | ConvertTo-Json
  [IO.File]::WriteAllText((Join-Path $staging 'diagnostics/build-info.json'), $info, [Text.UTF8Encoding]::new($false))
  if ($ReleaseName -cmatch '^test_[A-Za-z0-9._-]{1,64}$') {
    $manifest.name = "$($manifest.name) [$ReleaseName]"
    [IO.File]::WriteAllText((Join-Path $staging 'manifest.json'), ($manifest | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
  }
  Push-Location $staging
  try {
    & tar.exe -a -c -f $archivePath @items
    if ($LASTEXITCODE -ne 0) { throw 'XPI-Paket konnte nicht erstellt werden.' }
  } finally { Pop-Location }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    if (-not $archive.GetEntry('manifest.json') -or -not $archive.GetEntry('diagnostics/build-info.json')) {
      throw 'Manifest oder Buildkennung fehlt.'
    }
    if (@($archive.Entries | Where-Object { $_.FullName.Contains('\') }).Count) { throw 'UngÃ¼ltige Archivpfade.' }
  } finally { $archive.Dispose() }
  Copy-Item -LiteralPath $archivePath -Destination $OutputPath -Force
  Write-Output $OutputPath
} finally {
  if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
  $resolved = [IO.Path]::GetFullPath($staging)
  if (-not $resolved.StartsWith($stagingParent, [StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $resolved) -notmatch '^tb-addon-build-[a-f0-9]{32}$') { throw 'UngÃ¼ltiger temporÃ¤rer Buildpfad.' }
  if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
