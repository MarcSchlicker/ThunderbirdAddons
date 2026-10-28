const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const context = vm.createContext({
  URL, Date, TextEncoder, ExtensionAPI: class {}, Services: {},
  ChromeUtils: { generateQI() { return () => {}; } }, Ci: { nsICryptoHash: {} },
  Cc: { '@mozilla.org/security/hash;1': { createInstance() {
    let hash;
    return { SHA256: 1, init() { hash = createHash('sha256'); }, update(bytes) { hash.update(bytes); }, finish() { return hash.digest('base64'); } };
  } } },
});
const source = fs.readFileSync(path.join(__dirname, '../api/moduleBridge/implementation.js'), 'utf8');
vm.runInContext(source.slice(source.indexOf('const MAX_REQUEST_BYTES')), context);
vm.runInContext(`
  function fakeDate(nativeTime) { return { nativeTime, isDate: false, clone() { return fakeDate(this.nativeTime); } }; }
  var writes = 0;
  var item = {
    id: 'event-1', title: 'Before', generation: 1, location: 'Office',
    startDate: fakeDate(1792141200000000), endDate: fakeDate(1792144800000000),
    get icalString() { return JSON.stringify([this.title, this.location, this.generation, this.startDate.nativeTime, this.endDate.nativeTime]); },
    clone() { return {...this, startDate: this.startDate.clone(), endDate: this.endDate.clone(), setProperty(name, value) { this.location = value; }}; }
  };
  var calendar = { id: 'calendar-1', readOnly: false,
    async getItem(id) { return id === item.id ? item : null; },
    async modifyItem(copy, original) { if (original.generation !== item.generation) throw Error('provider conflict'); writes++; item = copy; }
  };
  calendarManager = () => ({getCalendarById: id => id === calendar.id ? calendar : null});
  visibleCalendars = () => [calendar];
  calendarUtils = () => ({acl: {userCanModifyItem: () => true}});
  var request = { action: 'update', calendarId: 'calendar-1', itemId: 'event-1', expectedVersion: calendarEditVersion(item),
    title: 'After', location: 'New office', startMillis: 1792141200000, endMillis: 1792144800000 };
`, context);

(async () => {
  // Capture a version, then simulate an intervening Desktop edit.
  vm.runInContext("request.expectedVersion = calendarEditVersion(item); item.title = 'Desktop edit';", context);
  const conflict = await vm.runInContext('mobileCalendarEdit(request)', context);
  assert.equal(conflict.conflict, true);
  assert.equal(vm.runInContext('writes', context), 0);
  vm.runInContext('request.expectedVersion = calendarEditVersion(item)', context);
  assert.equal((await vm.runInContext('mobileCalendarEdit(request)', context)).ok, true);
  assert.equal(vm.runInContext('writes', context), 1);
  assert.equal(vm.runInContext('item.title', context), 'After');
  vm.runInContext('calendar.readOnly = true', context);
  await assert.rejects(vm.runInContext('mobileCalendarEdit(request)', context), /schreibgeschützt/);
  vm.runInContext('calendar.readOnly = false; item.recurrenceInfo = {}', context);
  await assert.rejects(vm.runInContext('mobileCalendarEdit(request)', context), /Serie/);
  vm.runInContext("item.recurrenceInfo = null; request.calendarId = 'another-desktop'", context);
  await assert.rejects(vm.runInContext('mobileCalendarEdit(request)', context), /Kalender nicht gefunden/);
  vm.runInContext("request.calendarId = calendar.id; request.expectedVersion = calendarEditVersion(item); request.endMillis = request.startMillis", context);
  await assert.rejects(vm.runInContext('mobileCalendarEdit(request)', context), /ungültig/);
  let response;
  context.connection = { respond(status) { response = status; } };
  context.httpRequest = {method: 'POST', path: '/v1/calendar-edit', headers: {}, body: JSON.stringify({protocol:'tb-connect-module-bridge/1',action:'update'})};
  vm.runInContext("bytesToUtf8 = value => value; var server = new ModuleBridgeServer(47832, 'test', 'secret'); server.handle(connection, httpRequest)", context);
  assert.equal(response, '401 Unauthorized', 'No unauthenticated calendar writes');
  assert.equal(vm.runInContext('writes', context), 1);
  console.log('PASS: Desktop conflict never overwrites; valid version writes once; readonly, series and unknown calendar are rejected');
})().catch(error => { console.error(error); process.exitCode = 1; });
