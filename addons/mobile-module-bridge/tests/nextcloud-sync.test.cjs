const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

async function run() {
  let saved = {};
  const context = vm.createContext({ URL, btoa, crypto: webcrypto, messenger: {
    runtime: {getURL: x => x}, storage: {local: {
      async get() { return structuredClone(saved); },
      async set(value) { saved = structuredClone(value); },
    }},
  }});
  const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('tb.browserAction.onClicked')), context);
  vm.runInContext(`
    bridge = () => ({loadNextcloudCredential: async () => 'fixture'});
    verifyNextcloudAccess = async () => {};
    ensureNextcloudFolder = async () => {};
    persistIncomingStates = loadState;
    mobileCatalog = () => [];
    publishBridgeConfiguration = async () => {};
    var plannerId = DIAGNOSTIC_MODULE_ID;
    var oldTime = '2026-10-21T08:00:00Z';
    var editTime = '2026-10-21T09:00:00Z';
    var planner = tasks => ({updatedAt: oldTime, state: {updatedAt: oldTime, tasks, deletedTasks: []}});
    readNextcloudSnapshot = async () => ({exists: true, etag: 'remote-1', snapshot: {
      revision: 1, modules: {[plannerId]: planner([{id:'remote', updatedAt:oldTime}])}, clients: {}
    }});
    putNextcloudJson = async (config, password, filename, payload) => {
      if (filename === NEXTCLOUD_STATE_FILE) {
        await updateState({moduleStates: {[plannerId]: planner([
          {id:'local', updatedAt:oldTime}, {id:'during-upload', updatedAt:editTime}
        ])}});
      }
      return {ok:true, status:204};
    };
  `, context);
  await vm.runInContext(`updateState({nextcloud: {serverUrl:'https://cloud.test', username:'fixture', appFolder:'Thunderbird'},
    moduleStates: {[plannerId]: planner([{id:'local', updatedAt:oldTime}])}})`, context);
  await vm.runInContext('synchronizeNextcloud()', context);
  const tasks = saved.moduleBridgeState.moduleStates['de.tbconnect.modules.daily-planner'].state.tasks;
  assert.deepEqual(tasks.map(x => x.id).sort(), ['during-upload', 'local', 'remote'],
    'A local edit arriving during upload must survive along with the downloaded task');
  assert(saved.moduleBridgeState.nextcloud.lastSyncAt);
  assert.equal(vm.runInContext("timeOrEpoch('invalid')", context), 0);
  assert.equal(vm.runInContext("timeOrEpoch('2026-10-21T08:00:00Z')", context), Date.parse('2026-10-21T08:00:00Z'));
  vm.runInContext(`
    putNextcloudJson = async (config, password, filename, payload) => {
      if (filename === NEXTCLOUD_STATE_FILE) {
        var local = await loadState();
        var state = local.moduleStates[plannerId].state;
        state.tasks = state.tasks.filter(task => task.id !== 'remote');
        state.deletedTasks = [{id:'remote', deletedAt:editTime}];
        await updateState({moduleStates: local.moduleStates});
      }
      return {ok:true, status:204};
    };
  `, context);
  await vm.runInContext('synchronizeNextcloud()', context);
  const afterDeletion = saved.moduleBridgeState.moduleStates['de.tbconnect.modules.daily-planner'].state;
  assert(!afterDeletion.tasks.some(task => task.id === 'remote'), 'Concurrent deletion must not be resurrected');
  assert.equal(afterDeletion.deletedTasks[0].id, 'remote');
  console.log('PASS: cloud download and concurrent local edit both survive upload');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
