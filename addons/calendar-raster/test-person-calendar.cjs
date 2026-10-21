const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const elements = new Map();
function element() {
  return new Proxy({
    value: '', hidden: false, open: false, checked: false, dataset: {},
    style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {}, append() {}, replaceChildren() {},
    querySelectorAll() { return []; }, querySelector() { return element(); },
  }, { get(target, name) { return name in target ? target[name] : () => {}; } });
}
const document = {
  getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
  querySelector: () => element(), querySelectorAll: () => [], createElement: () => element(),
  body: element(), documentElement: element(), addEventListener() {},
};
const context = vm.createContext({
  document, URL, URLSearchParams, console, setTimeout, clearTimeout, Date, Intl,
  window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  messenger: { storage: { onChanged: { addListener() {} } }, runtime: { onMessage: { addListener() {} } } },
});
const source = fs.readFileSync(path.join(__dirname, 'space/month.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
vm.runInContext(source, context);
vm.runInContext(`
  state.settings.calendarTypes = [...DEFAULT_CALENDAR_TYPES,
    normalizeCalendarType({id:'person-a', name:'A', kind:'person', color:'#168a63'}),
    normalizeCalendarType({id:'person-b', name:'B', kind:'person', color:'#168a63'})];
  state.settings.calendarPersonAssignments = {'external:holidays-person-a': ['person-a']};
  var fixture = 'BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nBEGIN:VEVENT\\r\\nUID:holiday-test\\r\\nDTSTART;VALUE=DATE:20261016\\r\\nDTEND;VALUE=DATE:20261017\\r\\nSUMMARY:Testfeiertag\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR';
  var calendar = normalizeExternalCalendar({id:'holidays-person-a', name:'Feiertage A', sourceType:'url', url:'https://openholidaysapi.org/PublicHolidays'});
  var events = parseIcsEvents(fixture, calendar, monthRange(2026,10,1));
  state.data = {events};
`, context);
assert.equal(vm.runInContext('events.length', context), 1);
assert.equal(vm.runInContext("personVacationOnDate(calendarTypeById('person-a'), new Date(2026,9,16))", context), true);
assert.equal(vm.runInContext("personVacationOnDate(calendarTypeById('person-b'), new Date(2026,9,16))", context), false);
assert.equal(vm.runInContext("personVacationOnDate(calendarTypeById('person-a'), new Date(2026,9,17))", context), false);
vm.runInContext("state.settings.calendarTypes = state.settings.calendarTypes.map(person => person.id === 'person-a' ? {...person, enabled:false} : person)", context);
assert.equal(vm.runInContext("personVacationOnDate(calendarTypeById('person-a'), new Date(2026,9,16))", context), true);
console.log('PASS: real calendar script loads; iCal holiday is person-specific, ends exclusively, and remains relevant with person eye off');
