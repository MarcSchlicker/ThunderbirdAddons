param([string]$ThunderbirdExe, [string]$ReportPath, [switch]$KeepRunning)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$module = Split-Path -Parent $PSScriptRoot
if (!$ThunderbirdExe) {
  foreach ($candidate in @((Join-Path $env:LOCALAPPDATA 'Mozilla Thunderbird/thunderbird.exe'), (Join-Path $env:ProgramFiles 'Mozilla Thunderbird/thunderbird.exe'))) {
    if (Test-Path -LiteralPath $candidate) { $ThunderbirdExe = $candidate; break }
  }
}
if (!$ThunderbirdExe -or !(Test-Path -LiteralPath $ThunderbirdExe)) { throw 'ThunderbirdExe fehlt.' }
if (!$ReportPath) { $ReportPath = Join-Path $module 'build/native-tls-smoke.json' }
$ReportPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReportPath)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ReportPath) | Out-Null
$profile = Join-Path ([IO.Path]::GetTempPath()) ('tb-connect-tls-smoke-' + [guid]::NewGuid().ToString('N'))
$extension = Join-Path $profile 'extensions/tls-smoke@tbconnect.local'
New-Item -ItemType Directory -Force -Path $extension | Out-Null
Copy-Item -LiteralPath (Join-Path $module 'api') -Destination (Join-Path $extension 'api') -Recurse
Copy-Item -LiteralPath (Join-Path $module 'vendor') -Destination (Join-Path $extension 'vendor') -Recurse
$manifest = @{manifest_version=2;name='TB-Connect synthetic TLS smoke test';version='1.0';
 browser_specific_settings=@{gecko=@{id='tls-smoke@tbconnect.local';strict_min_version='128.0'}};
 background=@{scripts=@('background.js')};
 experiment_apis=@{module_bridge=@{schema='api/moduleBridge/schema.json';parent=@{scopes=@('addon_parent');paths=@(,@('moduleBridge'));script='api/moduleBridge/implementation.js'}}}}
[IO.File]::WriteAllText((Join-Path $extension 'manifest.json'), ($manifest | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $extension 'background.js'), 'browser.moduleBridge.start(47842,"synthetic-workspace","synthetic-token").then(() => {
 const now=new Date().toISOString();
 const state={version:1,updatedAt:now,tasks:[{id:"synthetic-desktop-tls-task",text:"Synthetic desktop task",emailAddress:"",done:false,createdAt:now,updatedAt:now}],emails:[],deletedTaskIds:[],settings:{}};
 return browser.moduleBridge.setStates(JSON.stringify({"de.tbconnect.modules.daily-planner":{state,updatedAt:now}}));
}).catch(console.error);', [Text.UTF8Encoding]::new($false))
$preferences = @('user_pref("extensions.autoDisableScopes",0);','user_pref("extensions.enabledScopes",15);',
 'user_pref("extensions.experiments.enabled",true);','user_pref("mail.provider.suppress_dialog_on_startup",true);','user_pref("mail.shell.checkDefaultClient",false);')
[IO.File]::WriteAllLines((Join-Path $profile 'user.js'), $preferences, [Text.UTF8Encoding]::new($false))
$implementation = Join-Path $extension 'api/moduleBridge/implementation.js'
$hook = @"
ModuleBridgeServer.prototype.listAddresses = async () => ["127.0.0.1"];
const OriginalTlsTestApi = this.module_bridge;
this.module_bridge = class extends OriginalTlsTestApi {
 getAPI(context) {
  const api = super.getAPI(context), start = api.moduleBridge.start;
  api.moduleBridge.start = async (...args) => {
   const result = await start(...args);
   await IOUtils.writeJSON(PathUtils.join(PathUtils.profileDir,"tb-connect-tls-proof.json"),result);
   return result;
  };
  return api;
 }
};
"@
[IO.File]::AppendAllText($implementation, "`n" + $hook, [Text.UTF8Encoding]::new($false))
$process = $null
$succeeded = $false
try {
  $process = Start-Process -FilePath $ThunderbirdExe -ArgumentList ('-headless -no-remote -profile "' + $profile + '"') -WindowStyle Hidden -PassThru
  $proof = Join-Path $profile 'tb-connect-tls-proof.json'
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while (!(Test-Path -LiteralPath $proof) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 250 }
  if (!(Test-Path -LiteralPath $proof)) { throw 'Isolierter Thunderbird-Test hat kein Ergebnis geliefert.' }
  & node (Join-Path $PSScriptRoot 'native-tls-probe.cjs') $proof $ReportPath
  if ($LASTEXITCODE -ne 0) { throw 'Native TLS-Prüfung fehlgeschlagen.' }
  $succeeded = $true
} finally {
  if ($process -and !$process.HasExited) {
    $observed = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
    if ($observed.CommandLine -notlike "*$profile*") { throw 'Beende kein fremdes Thunderbird-Profil.' }
    if (!$KeepRunning -or !$succeeded) { Stop-Process -Id $process.Id -Force }
    else {
      $state = Get-Content -Raw -LiteralPath $proof | ConvertFrom-Json
      $fixture = @{ pid=$process.Id; profile=$profile; port=$state.port; tlsPort=$state.tlsPort; tlsFingerprint=$state.tlsFingerprint }
      [IO.File]::WriteAllText(($ReportPath + '.fixture.json'), ($fixture | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
      Write-Output "Isolierter Testserver bleibt aktiv, PID $($process.Id)."
    }
  }
}
Write-Output "Synthetischer TLS-Nachweis: $ReportPath"
# Disposable profile is retained locally; no user profile or account was changed.
