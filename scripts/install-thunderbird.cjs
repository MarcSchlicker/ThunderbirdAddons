"use strict";
// Client of the existing Projektpilot installer. Never writes Thunderbird profiles.
const fs = require('node:fs/promises');
const path = require('node:path');
const {setTimeout: delay} = require('node:timers/promises');
const ROOT = path.resolve(__dirname, '..');
const TERMINAL = new Set(['installed', 'failed', 'cancelled']);
function localEndpoint(value) {
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(value)) {
    throw new Error('Nur ein lokaler Projektpilot-Endpunkt auf 127.0.0.1 ist erlaubt.');
  }
  const url = new URL(value);
  if (!url.port) throw new Error('Lokaler Port fehlt.');
  return url.origin;
}
async function packagePath(file, root = ROOT) {
  const [resolved, base] = await Promise.all([fs.realpath(path.resolve(file)), fs.realpath(root)]);
  const relative = path.relative(base, resolved);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('Das Paket muss innerhalb dieses Projektordners liegen.');
  }
  const stat = await fs.stat(resolved);
  if (!stat.isFile() || path.extname(resolved).toLowerCase() !== '.xpi' || stat.size > 64 * 1024 * 1024) {
    throw new Error('Erwartet wird eine lokale XPI-Datei bis 64 MB.');
  }
  return resolved;
}
function createClient(endpoint, {fetchImpl = fetch, root = ROOT} = {}) {
  const base = localEndpoint(endpoint);
  async function request(route, body) {
    const response = await fetchImpl(base + route, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: {'content-type':'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Projektpilot HTTP ${response.status}`);
    return data;
  }
  return {
    async status() {
      const health = await request('/api/health');
      if (health.app !== 'projektpilot') throw new Error('Der Endpunkt ist kein Projektpilot.');
      return request('/api/installations/state');
    },
    async install(file) {
      const resolved = await packagePath(file, root);
      const status = await this.status();
      if (!status.connected) throw new Error('Thunderbird-Helfer nicht verbunden. Projektpilot und Thunderbird öffnen.');
      if (status.jobs?.some(job => job.kind === 'XPI' && ['queued','awaiting','installing'].includes(job.status))) {
        throw new Error('Ein XPI-Auftrag läuft bereits. Erst diesen abschließen; keinen zweiten Auftrag senden.');
      }
      // No automatic POST retry: a lost response may still have queued the installation.
      return request('/api/thunderbird/install', {path:resolved});
    },
    async wait(id, timeoutMs = 60000, intervalMs = 1000) {
      const deadline = Date.now() + timeoutMs;
      do {
        const state = await this.status();
        const job = state.jobs?.find(entry => entry.id === id);
        if (!job) throw new Error('Auftrag nicht im Installationsverlauf gefunden.');
        if (TERMINAL.has(job.status)) return job;
        if (Date.now() >= deadline) return {...job, waiting:true};
        await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
      } while (true);
    },
  };
}
function summary(job) {
  return {id:job.id, name:job.name, packageId:job.packageId, version:job.version,
    status:job.status, message:job.message, waiting:job.waiting === true};
}
async function main(args) {
  const [command, ...rest] = args;
  if (!['status','install','wait'].includes(command) || (command !== 'status' && rest.length !== 1)) {
    throw new Error('Aufruf: node scripts/install-thunderbird.cjs status | install <XPI-Pfad> | wait <Auftrags-ID>');
  }
  const endpointFile = process.env.TB_CONNECT_INSTALLER_ENDPOINT_FILE || path.join(
    process.env.LOCALAPPDATA || '', 'Projektpilot', 'data', 'endpoint.json');
  let endpoint;
  try { endpoint = JSON.parse(await fs.readFile(endpointFile, 'utf8')).url; }
  catch { throw new Error('Projektpilot-Endpunkt fehlt. Projektpilot öffnen; ggf. TB_CONNECT_INSTALLER_ENDPOINT_FILE setzen.'); }
  const client = createClient(endpoint);
  if (command === 'status') {
    const state = await client.status();
    console.log(JSON.stringify({connected:state.connected, helperPrepared:state.helperPrepared,
      jobs:(state.jobs || []).filter(job => job.kind === 'XPI').map(summary)}, null, 2));
  } else if (command === 'install') {
    const job = await client.install(rest[0]);
    console.log(JSON.stringify(summary(job), null, 2));
    console.log('Auftrag übergeben. Thunderbird-Bestätigung per Tastatur beantworten; danach wait <Auftrags-ID>.');
  } else {
    const job = await client.wait(rest[0]);
    console.log(JSON.stringify(summary(job), null, 2));
    process.exitCode = job.waiting ? 2 : job.status === 'installed' ? 0 : 1;
  }
}
module.exports = {localEndpoint, packagePath, createClient};
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(error.message);
  console.error('Bei unklarem Übertragungsausgang zuerst status prüfen; nicht blind erneut installieren.');
  process.exitCode = 1;
});
