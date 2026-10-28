"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = name => fs.readFileSync(path.join(__dirname, name), "utf8").replace(/\r\n/g, "\n");

test("provider notifications contain no event data and unsubscribe cleanly", async () => {
  let observer;
  const calls = [];
  const manager = {
    addCalendarObserver(value) { observer = value; },
    removeCalendarObserver(value) { assert.equal(value, observer); observer = null; }
  };
  const context = vm.createContext({
    ChromeUtils: {
      generateQI: () => () => {},
      importESModule: name => name.includes("ExtensionCommon") ? {
        ExtensionCommon: { ExtensionAPI: class {}, EventManager: class {
          constructor(config) { this.config = config; }
          api() { return this.config; }
        } }
      } : { cal: { manager } }
    }
  });
  vm.runInContext(source("api/hourGridBridge/implementation.js"), context);
  const api = new context.hour_grid_bridge().getAPI({}).hourGridBridge;
  assert.ok(api.onCalendarChanged);
  const stop = api.onCalendarChanged.register({ async: async (...args) => calls.push(args) });
  observer.onModifyItem({ title: "PRIVATE TEST", token: "DO NOT FORWARD" });
  observer.onLoad({ name: "PRIVATE ACCOUNT" });
  await Promise.resolve();
  assert.equal(calls.length, 2);
  assert.ok(calls.every(args => args.length === 0));
  stop();
  assert.equal(observer, null);
});

test("background coalesces provider batches into one local revision", async () => {
  let listener, next = 0;
  const timers = new Map(), writes = [];
  const context = vm.createContext({
    console, URL, Date,
    setTimeout: callback => { const id = ++next; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    messenger: {
      runtime: { getURL: p => "moz-extension://calendar/" + p, onMessage: { addListener() {} } },
      storage: { local: { set: async value => writes.push(value) }, onChanged: { addListener() {} } },
      hourGridBridge: { onCalendarChanged: { addListener(value) { listener = value; } } }
    }
  });
  vm.runInContext(source("background.js").replace(/safeEnsureHourGridSpace\(\);\s*scheduleBackupAlarm\(\);\s*$/, ""), context);
  assert.equal(typeof listener, "function");
  listener(); listener(); listener();
  assert.equal(timers.size, 1);
  await [...timers.values()][0]();
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0]), ["calendarDataRevision"]);
});

test("a provider change during loading is queued instead of racing stale results", async () => {
  let release, reads = 0, concurrent = 0, maximum = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const context = vm.createContext({
    state: { isLoading: false, reloadPending: false, currentDate: new Date(2026, 9, 10), settings: { weekStartsOn: 1 } },
    statusText: {}, renderMonth() {},
    dataRequestsForCurrentView: () => [{ year: 2026, month: 10 }],
    loadInternalMonthPart: async () => {
      reads++; concurrent++; maximum = Math.max(maximum, concurrent);
      const data = reads === 1 ? await pending : { end: "20:30" };
      concurrent--; return data;
    },
    combineMonthData: parts => parts[0], isFourWeekView: () => false,
    loadExternalMonthData: async () => ({}), mergeMonthData: data => data
  });
  const code = source("space/month.js");
  vm.runInContext(code.slice(code.indexOf("async function loadMonth()"), code.indexOf("function dateForPeriod(")), context);
  const first = context.loadMonth();
  await context.loadMonth();
  assert.equal(reads, 1);
  release({ end: "18:30" });
  await first;
  assert.equal(reads, 2);
  assert.equal(maximum, 1);
  assert.equal(context.state.data.end, "20:30");
});


test("sidebar can rebuild while the people panel is detached", () => {
  const elements = new Map();
  let connected = true;
  function element() {
    return new Proxy({
      value: "", hidden: false, open: false, checked: false, dataset: {},
      style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, appendChild() {}, append() {}, replaceChildren() {},
      querySelectorAll() { return []; }, querySelector() { return element(); }
    }, { get(target, name) { return name in target ? target[name] : () => {}; } });
  }
  const count = element(), panel = element(), list = element();
  elements.set("calendar-people-count", count);
  elements.set("calendar-people-panel", panel);
  elements.set("calendar-list", list);
  list.replaceChildren = () => { connected = false; };
  list.appendChild = child => { if (child === panel) connected = true; };
  const document = {
    getElementById(id) {
      if (id === "calendar-people-count" && !connected) return null;
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    querySelector: () => element(), querySelectorAll: () => [], createElement: () => element(),
    body: element(), documentElement: element(), addEventListener() {}
  };
  const context = vm.createContext({
    document, URL, URLSearchParams, console, setTimeout, clearTimeout, Date, Intl,
    window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
    messenger: { storage: { onChanged: { addListener() {} } }, runtime: { onMessage: { addListener() {} } } }
  });
  vm.runInContext(source("space/month.js").replace(/\ninit\(\);\s*$/, "\n"), context);
  vm.runInContext("state.settings.calendarTypes = [normalizeCalendarType({id:'test-person', name:'Testperson', kind:'person', color:'#168a63'})]", context);
  vm.runInContext("renderCalendarSidebar(null)", context);
  assert.equal(count.textContent, "1");
  assert.equal(connected, true);
  vm.runInContext("renderCalendarSidebar({ calendars: [] })", context);
  assert.equal(count.textContent, "1");
  assert.equal(connected, true);
});
