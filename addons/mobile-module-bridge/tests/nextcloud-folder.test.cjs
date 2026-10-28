const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ URL, btoa, messenger: {runtime: {getURL: x => x}} });
const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
vm.runInContext(source.slice(0, source.indexOf('tb.browserAction.onClicked')), context);
const calls = [];
context.request = async (url, user, password, options) => {
  calls.push({ url, method: options.method });
  return {status: context.statuses.shift()};
};
vm.runInContext('nextcloudFetch = request', context);
async function run(statuses) {
  context.statuses = statuses;
  calls.length = 0;
  return vm.runInContext("ensureNextcloudFolder({serverUrl:'https://cloud.test/sub',username:'test',appFolder:'Thunderbird'}, 'fixture')", context);
}
(async () => {
  await run([201]);
  assert.equal(calls[0].url, 'https://cloud.test/sub/remote.php/dav/files/test/Thunderbird/');
  assert.equal(calls[0].method, 'MKCOL');
  await run([405, 207]);
  assert.equal(calls[1].method, 'PROPFIND');
  await assert.rejects(run([405, 403]), /403/);
  await assert.rejects(run([403]), /Ordnerrechte/);
  await assert.rejects(run([401]), /Anmeldung/);
  console.log('PASS: Nextcloud folder creation, existing folder verification, forbidden and invalid credentials');
})().catch(error => { console.error(error); process.exitCode = 1; });
