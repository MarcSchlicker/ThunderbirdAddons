param(
  [string]$ThunderbirdExe = "$env:LOCALAPPDATA/Mozilla Thunderbird/thunderbird.exe",
  [int]$Port = 47852
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Ungültiger Testport.' }
$module = Split-Path -Parent $PSScriptRoot
$profile = Join-Path ([IO.Path]::GetTempPath()) ('tb-planner-loopback-' + [guid]::NewGuid().ToString('N'))
$extension = Join-Path $profile 'extensions/loopback-smoke@tbconnect.local'
New-Item -ItemType Directory -Force -Path $extension | Out-Null
Copy-Item -LiteralPath (Join-Path $module 'api') -Destination (Join-Path $extension 'api') -Recurse
$manifest = @{manifest_version=2;name='Synthetic planner loopback proof';version='1.0';
 browser_specific_settings=@{gecko=@{id='loopback-smoke@tbconnect.local';strict_min_version='128.0'}};
 background=@{scripts=@('background.js')};experiment_apis=@{hour_grid_bridge=@{schema='api/hourGridBridge/schema.json';
 parent=@{scopes=@('addon_parent');paths=@(,@('hourGridBridge'));script='api/hourGridBridge/implementation.js'}}}}
[IO.File]::WriteAllText((Join-Path $extension 'manifest.json'), ($manifest | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $extension 'background.js'), "browser.hourGridBridge.startMobileSync($Port, 'synthetic-token').catch(console.error);", [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllLines((Join-Path $profile 'user.js'), @('user_pref("extensions.autoDisableScopes",0);','user_pref("extensions.enabledScopes",15);','user_pref("extensions.experiments.enabled",true);','user_pref("mail.shell.checkDefaultClient",false);'), [Text.UTF8Encoding]::new($false))
$implementation = Join-Path $extension 'api/hourGridBridge/implementation.js'
$hook = @"
const OriginalLoopbackApi = this.hour_grid_bridge;
this.hour_grid_bridge = class extends OriginalLoopbackApi {
 getAPI(context) {
  const api = super.getAPI(context), start = api.hourGridBridge.startMobileSync;
  api.hourGridBridge.startMobileSync = async (...args) => {
   const status = await start(...args);
   await IOUtils.writeJSON(PathUtils.join(PathUtils.profileDir,"loopback-proof.json"),status);
   return status;
  };
  return api;
 }
};
"@
[IO.File]::AppendAllText($implementation, "`n" + $hook, [Text.UTF8Encoding]::new($false))
$process = $null
try {
 $process = Start-Process -FilePath $ThunderbirdExe -ArgumentList ('-headless -no-remote -profile "' + $profile + '"') -WindowStyle Hidden -RedirectStandardError (Join-Path $profile 'native.stderr.log') -RedirectStandardOutput (Join-Path $profile 'native.stdout.log') -PassThru
 $proof = Join-Path $profile 'loopback-proof.json'
 $deadline = [DateTime]::UtcNow.AddSeconds(40)
 while (!(Test-Path -LiteralPath $proof) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 250 }
 if (!(Test-Path -LiteralPath $proof)) { Get-Content -LiteralPath (Join-Path $profile 'native.stderr.log') -Tail 12; throw 'Kein nativer Loopback-Nachweis erstellt.' }
 $status = Get-Content -Raw -LiteralPath $proof | ConvertFrom-Json
 if (!$status.running -or $status.discoveryRunning -or @($status.addresses).Count -ne 1 -or $status.addresses[0] -ne '127.0.0.1') { throw 'Legacy-Dienst ist nicht ausschließlich lokal.' }
 $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $status.port -ErrorAction Stop)
 if (!$listeners.Count -or @($listeners | Where-Object LocalAddress -notin @('127.0.0.1','::1')).Count) { throw 'Nichtlokaler TCP-Listener gefunden.' }
 $health = Invoke-RestMethod -Uri "http://127.0.0.1:$($status.port)/health" -TimeoutSec 8
 if (!$health.ok) { throw 'Lokaler synthetischer Dienst antwortet nicht.' }
 $report = @{synthetic=$true;nativeThunderbird=$true;loopbackOnly=$true;discoveryRunning=$false;httpHealth=$true;port=$status.port}
 $output = Join-Path $module 'build/native-legacy-loopback-smoke.json'
 New-Item -ItemType Directory -Force -Path (Split-Path -Parent $output) | Out-Null
 [IO.File]::WriteAllText($output, ($report | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
 Write-Output ($report | ConvertTo-Json -Compress)
} finally {
 if ($process -and !$process.HasExited) {
  $observed = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
  if ($observed.CommandLine -notlike "*$profile*") { throw 'Kein fremdes Thunderbird-Profil beenden.' }
  Stop-Process -Id $process.Id -Force
 }
}
# The isolated disposable profile is retained locally. No personal profile or account was used.
