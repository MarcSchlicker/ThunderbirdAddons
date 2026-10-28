const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

async function credentials(modern) {
  let entries = [];
  const search = (origin, realm) => entries.filter(x => x.origin === origin && x.httpRealm === realm);
  const add = login => entries.push(login);
  const modify = (old, login) => { entries[entries.indexOf(old)] = login; };
  const remove = login => { entries = entries.filter(x => x !== login); };
  const manager = modern ? {
    findLogins() { throw new Error('Removed in Thunderbird 153'); },
    async searchLoginsAsync({ origin, httpRealm }) { return search(origin, httpRealm); },
    async addLoginAsync(login) { add(login); },
    async modifyLoginAsync(old, login) { modify(old, login); },
    async removeLoginAsync(login) { remove(login); },
  } : { findLogins: (origin, unused, realm) => search(origin, realm), addLogin: add, modifyLogin: modify, removeLogin: remove };
  const context = vm.createContext({
    URL, ExtensionAPI: class {}, Services: { logins: manager },
    ChromeUtils: { generateQI() { return () => {}; } },
    Cc: { '@mozilla.org/login-manager/loginInfo;1': { createInstance() {
      return { init(origin, unused, httpRealm, username, password) {
        Object.assign(this, { origin, httpRealm, username, password });
      } };
    } } }, Ci: { nsILoginInfo: {} },
  });
  const source = fs.readFileSync(path.join(__dirname, '../api/moduleBridge/implementation.js'), 'utf8');
  assert(!source.includes('resource://gre/modules/Services.sys.mjs'));
  vm.runInContext(source.slice(source.indexOf('const MAX_REQUEST_BYTES')), context);
  await vm.runInContext("saveNextcloudCredential('https://cloud.test', 'alice', 'first')", context);
  assert.equal(await vm.runInContext("loadNextcloudCredential('https://cloud.test', 'alice')", context), 'first');
  await vm.runInContext("saveNextcloudCredential('https://cloud.test', 'alice', 'replacement')", context);
  assert.equal(entries.length, 1);
  assert.equal(await vm.runInContext("loadNextcloudCredential('https://cloud.test', 'alice')", context), 'replacement');
  assert.equal(await vm.runInContext("loadNextcloudCredential('https://cloud.test/other', 'alice')", context), '');
  await vm.runInContext("removeNextcloudCredential('https://cloud.test', 'alice')", context);
  assert.equal(entries.length, 0);
  vm.runInContext('bytesToUtf8 = value => value', context);
  vm.runInContext(`
    var testServer = new ModuleBridgeServer(47832, 'workspace-test', 'test-secret');
    testServer.states['module-test'] = {updatedAt: '2026-10-16T12:00:00Z', state: {}};
    testServer.peers['mobile-test'] = testServer.peerFromPayload({moduleId: 'module-test', client: {id: 'mobile-test', kind: 'mobile'}});
  `, context);
  assert.equal(vm.runInContext('testServer.status().connected', context), false, 'Contact alone cannot confirm receipt');
  assert.equal(vm.runInContext("testServer.peers['mobile-test'].moduleReceipts['module-test'].confirmedAt", context), undefined);
  let response;
  context.testConnection = { respond(status, body) { response = { status, body }; } };
  context.ack = {
    method: 'POST', path: '/v1/ack', headers: { 'x-tb-connect-module-token': 'test-secret' },
    body: JSON.stringify({protocol: 'tb-connect-module-bridge/1', moduleId: 'module-test', client: {id: 'mobile-test'}, receivedUpdatedAt: 'outdated'}),
  };
  vm.runInContext('testServer.handle(testConnection, ack)', context);
  assert.equal(response.status, '409 Conflict');
  context.ack.body = JSON.stringify({protocol: 'tb-connect-module-bridge/1', moduleId: 'module-test', client: {id: 'mobile-test'}, receivedUpdatedAt: '2026-10-16T12:00:00Z'});
  vm.runInContext('testServer.handle(testConnection, ack)', context);
  assert.equal(response.status, '200 OK');
  assert.equal(vm.runInContext('testServer.status().connected', context), true, 'Exact stored revision confirms receipt');
  vm.runInContext(`
    var plannerId = DAILY_PLANNER_MODULE_ID;
    var revision = '2026-10-16T12:00:00Z';
    testServer.states[plannerId] = {updatedAt: revision, state: {updatedAt: revision, tasks: [], deletedTasks: []}};
    var merged = testServer.mergeModuleState(plannerId, {
      updatedAt: '2026-10-15T12:00:00Z',
      state: {updatedAt: '2026-10-15T12:00:00Z', tasks: [{id:'offline-task', updatedAt:'2026-10-15T12:00:00Z'}]}
    }, {id:'offline-phone', kind:'mobile', lastSyncAt: revision});
  `, context);
  assert.equal(vm.runInContext('merged.state.tasks.length', context), 1);
  assert.notEqual(vm.runInContext('merged.updatedAt', context), '2026-10-16T12:00:00Z', 'Changed merged data must invalidate an old receipt');
  assert.equal(vm.runInContext(`testServer.mergeModuleState(plannerId, {updatedAt: '2026-10-15T12:00:00Z', state: merged.state}, {id:'offline-phone',kind:'mobile'}).updatedAt === merged.updatedAt`, context), true, 'Unchanged retry with an older clock keeps its revision');
  vm.runInContext(`
    testServer.states[CALENDAR_MODULE_ID] = {updatedAt: '2026-10-16T12:00:00Z', state: {events: [{title:'Freshly edited'}]}};
    testServer.mergeModuleState(plannerId, {updatedAt: '2026-10-16T13:00:00Z', state: {
      tasks: [], calendar: {updatedAt:'2026-10-15T12:00:00Z', events: [{title:'Cached old calendar'}]}
    }}, {id:'desktop-planner', kind:'desktop', lastSyncAt:'2026-10-16T13:00:00Z'});
  `, context);
  assert.equal(vm.runInContext("testServer.states[CALENDAR_MODULE_ID].state.events[0].title", context), 'Freshly edited', 'A newer task timestamp cannot roll back a freshly edited calendar with an old embedded snapshot');
}

async function updatesRetainLogin() {
  let saved = {};
  const messenger = { runtime: { getURL: x => x }, storage: { local: {
    async get() { return structuredClone(saved); },
    async set(value) { await new Promise(resolve => setTimeout(resolve, 2)); saved = structuredClone(value); },
  } } };
  const context = vm.createContext({ messenger, crypto: webcrypto, btoa, URL });
  const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('tb.browserAction.onClicked')), context);
  await vm.runInContext('loadState()', context);
  await vm.runInContext(`Promise.all([
    updateState({nextcloud: {serverUrl: 'https://cloud.test', username: 'alice', appFolder: 'Thunderbird'}, nextcloudLogin: null}),
    updateState({moduleStates: {test: {state: {title: 'Module refresh'}}}}),
    updateState({peers: [{id: 'phone'}]})
  ])`, context);
  assert.equal(saved.moduleBridgeState.nextcloud.username, 'alice');
  assert.equal(saved.moduleBridgeState.moduleStates.test.state.title, 'Module refresh');
  assert.equal(saved.moduleBridgeState.peers[0].id, 'phone');
}

(async () => {
  await credentials(true);
  await credentials(false);
  await updatesRetainLogin();
  console.log('PASS: modern/legacy credentials and concurrent module updates retain login');
})().catch(error => { console.error(error); process.exitCode = 1; });
