param(
  [string]$BuildId = "source",
  [string]$GoogleCalendarClientId = $env:TB_GOOGLE_CALENDAR_CLIENT_ID,
  [string]$GoogleMailClientId = $env:TB_MAIL_GOOGLE_CLIENT_ID,
  [switch]$AllowIncompleteOAuth
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($BuildId -notmatch '^[A-Za-z0-9._-]{1,64}$') { throw 'Ungültige Buildkennung.' }
$root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $root 'apps/thunderbird-mobile'
if (!(Test-Path -LiteralPath (Join-Path $app '.signing/tb.release.signing.properties'))) {
  throw 'Eigener Release-Schlüssel fehlt. Siehe docs/ANDROID_RELEASE.md. Keine automatische Schlüsselrotation.'
}
if (!$AllowIncompleteOAuth -and (!$GoogleCalendarClientId -or !$GoogleMailClientId)) {
  throw 'Eigene Google-Mail- und Kalender-Clients fehlen. Unvollständige Kandidaten nur ausdrücklich mit -AllowIncompleteOAuth.'
}
$arguments = @('-p', $app,
  ':app-thunderbird:testFossDebugUnitTest', '--tests', '*TbProductionOAuthConfigurationTest', '--tests', '*TbCalendarOAuthConfigurationProviderTest',
  ':legacy:ui:legacy:testDebugUnitTest', '--tests', '*HubTlsTest',
  ':app-thunderbird:assembleFossRelease', '-Ptb.useUploadKey=false', '-Ptb.releaseName=release', "-Ptb.buildId=$BuildId")
if ($GoogleCalendarClientId) { $arguments += "-Ptb.googleCalendarClientId=$GoogleCalendarClientId" }
if ($GoogleMailClientId) { $arguments += "-Ptb.mailGoogleClientId=$GoogleMailClientId" }
& (Join-Path $app 'gradlew.bat') @arguments
if ($LASTEXITCODE -ne 0) { throw 'Tests oder Release-Build fehlgeschlagen; kein Paket übernommen.' }
$output = Join-Path $app 'app-thunderbird/build/outputs/apk/foss/release'
$metadata = Get-Content -Raw -LiteralPath (Join-Path $output 'output-metadata.json') | ConvertFrom-Json
if ($metadata.applicationId -ne 'eu.mschlicker.tbconnect' -or $metadata.elements.Count -ne 1) { throw 'Unerwartete Produktionskennung/Paketaufteilung.' }
$element = $metadata.elements[0]
$source = Join-Path $output $element.outputFile
$destination = Join-Path $root 'Testpakete/Release-Kandidaten'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
[IO.File]::WriteAllText((Join-Path $destination '.gitignore'), "*`n", [Text.UTF8Encoding]::new($false))
$target = Join-Path $destination "TB-Connect-$($element.versionName)-$BuildId.apk"
$hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
if ((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) {
  throw 'Kandidat mit anderer Prüfsumme vorhanden. Neue Buildkennung wählen; alte Pakete bleiben erhalten.'
}
if (!(Test-Path -LiteralPath $target)) { Copy-Item -LiteralPath $source -Destination $target }
$status = @{ applicationId = $metadata.applicationId; version = $element.versionName; versionCode = $element.versionCode;
  build = $BuildId; sha256 = $hash; file = [IO.Path]::GetFileName($target); releaseName = 'release';
  googleOAuthConfigured = [bool]($GoogleCalendarClientId -and $GoogleMailClientId); deviceApproved = $false; published = $false }
[IO.File]::WriteAllText(($target + '.json'), ($status | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
Write-Output "Geprüfter Buildkandidat: $target"
Write-Output 'Keine Geräteabnahme, Installation, Release/-Kopie oder Veröffentlichung vorgenommen.'
