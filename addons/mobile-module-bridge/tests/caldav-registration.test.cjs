const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const entries = [];
let reads = 0;
const manager = {
  getCalendars: () => entries,
  createCalendar(type, uri) { return {type,uri,wrappedJSObject:{},setProperty() {},refresh() {}}; },
  registerCalendar(calendar) {entries.push(calendar);},
};
const context = vm.createContext({URL, ExtensionAPI:class {},
  ChromeUtils:{generateQI:()=>()=>{}, importESModule:()=>({CalDavDetectionSession:class {constructor(username,password){this.username=username;this.password=password;}}})},
  Services:{io:{newURI:spec=>({spec})},uuid:{generateUUID:()=>'{test-calendar-id}'},wm:{getMostRecentWindow:()=>null}},
});
const source = fs.readFileSync(path.join(__dirname,'../api/moduleBridge/implementation.js'),'utf8');
vm.runInContext(source.slice(source.indexOf('const MAX_REQUEST_BYTES')), context);
context.manager = manager;
context.loadPassword = () => {reads++;return 'app-secret';};
vm.runInContext('calendarManager = () => manager; loadNextcloudCredential = async () => loadPassword();',context);
context.config = JSON.stringify({serverUrl:'https://cloud.test/nextcloud',username:'test'});
context.calendar = JSON.stringify({url:'https://cloud.test/nextcloud/remote.php/dav/calendars/test/personal/',name:'Personal',color:'#168a63'});
(async () => {
  const first = await vm.runInContext('registerNextcloudCalendar(config,calendar)',context);
  assert.equal(first.ok,true);
  assert.equal(entries.length,1);
  assert.equal(entries[0].type,'caldav');
  assert.equal(JSON.stringify(first).includes('app-secret'),false);
  assert.equal(entries[0].wrappedJSObject.session.password,'app-secret');
  const repeat = await vm.runInContext('registerNextcloudCalendar(config,calendar)',context);
  assert.equal(repeat.alreadyRegistered,true);
  assert.equal(reads,1);
  assert.equal(entries.length,1);
  context.calendar=JSON.stringify({url:'https://evil.test/nextcloud/remote.php/dav/calendars/test/personal/'});
  await assert.rejects(vm.runInContext('registerNextcloudCalendar(config,calendar)',context),/Unzulässige/);
  assert.equal(entries.length,1);
  console.log('PASS: native CalDAV registration reuses private credential, deduplicates calendars, rejects foreign origins and returns no password');
})().catch(error=>{console.error(error);process.exitCode=1;});
