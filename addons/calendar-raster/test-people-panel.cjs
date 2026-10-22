'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'space/month.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
const clone = value => JSON.parse(JSON.stringify(value));
let saved = {};
function openCalendar() {
  const elements = new Map();
  function element() {
    return new Proxy({
      value:'', open:false, dataset:{}, listeners:{}, children:[],
      style:{setProperty(){}}, classList:{add(){},remove(){},toggle(){}},
      addEventListener(name, fn) { this.listeners[name] = fn; },
      appendChild(child){this.children.push(child);}, append(...children){this.children.push(...children);}, replaceChildren(...children){this.children=children;},
      querySelectorAll(){return [];}, querySelector(){return element();}, closest(){return element();},
    }, {get:(target,name)=>name in target ? target[name] : () => {}});
  }
  const document = {
    getElementById(id) { if(!elements.has(id)) elements.set(id,element()); return elements.get(id); },
    querySelector:()=>element(), querySelectorAll:()=>[], createElement:()=>element(),
    body:element(), documentElement:element(), addEventListener(){},
  };
  const context = vm.createContext({document, URL, URLSearchParams, console, setTimeout, clearTimeout, Date, Intl,
    window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},
    messenger:{storage:{local:{
      async get(defaults) { return {...clone(defaults),...clone(saved)}; },
      async set(values) { saved = {...saved,...clone(values)}; },
    },onChanged:{addListener(){}}},runtime:{onMessage:{addListener(){}}}},
  });
  vm.runInContext(source,context);
  return {context,elements};
}
(async()=>{
  let page = openCalendar();
  await vm.runInContext('loadSettings()',page.context);
  const panel = page.elements.get('calendar-people-panel');
  assert.equal(vm.runInContext("state.settings.peoplePanelOpen",page.context),true,"People are visible by default");
  panel.open = false;
  panel.listeners.toggle();
  await Promise.resolve();
  panel.open = true;
  panel.listeners.toggle();
  await Promise.resolve();
  assert.equal(saved.peoplePanelOpen,true);
  page = openCalendar();
  await vm.runInContext('loadSettings();',page.context);
  vm.runInContext('renderCalendarPeopleSidebar()',page.context);
  assert.equal(page.elements.get('calendar-people-panel').open,true,'Reopening restores the expanded panel');
  page.elements.get('calendar-people-panel').open = false;
  page.elements.get('calendar-people-panel').listeners.toggle();
  await Promise.resolve();
  page = openCalendar();
  await vm.runInContext('loadSettings()',page.context);
  vm.runInContext('renderCalendarPeopleSidebar()',page.context);
  assert.equal(page.elements.get('calendar-people-panel').open,false,'Reopening restores the collapsed panel');
  // Existing records survive the visibility recovery unchanged, including IDs,
  // calendar ownership, colours, disabled eyes and work/holiday configuration.
  saved = {
    peoplePanelOpen:false, peopleSearch:'does-not-match',
    calendarTypes:[{id:'saved-person',name:'Saved person',kind:'person',relationship:'friend',
      color:'#386dc1',enabled:false,workCalendarEnabled:false,workStartHour:9,workEndHour:16}],
    calendarPersonAssignments:{'shared-calendar':['saved-person']},
    externalCalendars:[{id:'holidays-saved-person',name:'Region',url:'https://example.invalid/holidays'}],
  };
  page=openCalendar();
  await vm.runInContext('loadSettings()',page.context);
  vm.runInContext('renderCalendarPeopleSidebar()',page.context);
  const before=vm.runInContext('JSON.stringify({types:state.settings.calendarTypes,assignments:state.settings.calendarPersonAssignments,external:state.externalCalendars})',page.context);
  assert.equal(page.elements.get('settings-people-list').children.length,2,'Settings list includes saved and self persons even when search excludes them');
  const edit=page.elements.get('settings-people-list').children.find(x=>x.textContent.startsWith('Saved person'));
  edit.listeners.click({});
  assert.equal(page.elements.get('calendar-type-id').value,'saved-person','Edit opens original record');
  await page.elements.get('settings-show-people').listeners.click();
  assert.equal(page.elements.get('calendar-people-panel').open,true);
  assert.equal(saved.peopleSearch,'');
  assert.equal(vm.runInContext('JSON.stringify({types:state.settings.calendarTypes,assignments:state.settings.calendarPersonAssignments,external:state.externalCalendars})',page.context),before,'Visibility recovery preserves all person records and ownership');
  page=openCalendar();
  await vm.runInContext('loadSettings()',page.context);
  vm.runInContext('renderCalendarPeopleSidebar()',page.context);
  assert.equal(page.elements.get('calendar-people-panel').open,true,'Recovered visibility persists after reopening');
  assert.equal(page.elements.get('settings-people-list').children.length,2);
  console.log('PASS: persisted panel state, settings editing and person recovery without data loss');
})().catch(error=>{console.error(error);process.exitCode=1;});
