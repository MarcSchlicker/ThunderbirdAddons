"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../background.js"), "utf8");
const start = source.indexOf("async function openPlannerSpace() {");
const end = source.indexOf("function requestPlannerOpen()", start);
assert.ok(start >= 0 && end > start);
const url = "moz-extension://planner/planner/index.html";
function subject(tabs = [], rejectCreate = false) {
  const writes = [], creates = [];
  const context = {
    SPACE_URL: url,
    ensurePlannerSpace: async () => ({ id: 7 }),
    errorText: error => error.message,
    tb: { tabs: {
      query: async () => tabs,
      update: async (id, changes) => { writes.push({ id, changes }); return { id }; },
      create: async changes => {
        creates.push(changes);
        if (rejectCreate) throw new Error("Create failed");
        return { id: 99 };
      }
    } }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + "globalThis.open = openPlannerSpace", context);
  return { open: context.open, writes, creates };
}
test("unrelated active calendar is never repurposed", async () => {
  const s = subject([{ id: 10, url: "moz-extension://calendar/space/month.html", active: true }]);
  const result = await s.open();
  assert.equal(result.ok, true);
  assert.equal(result.tabId, 99);
  assert.equal(s.writes.length, 0);
  assert.equal(s.creates.length, 1);
  assert.equal(s.creates[0].url, url);
});
test("existing planner is activated without changing its URL", async () => {
  const s = subject([{ id: 11, url }]);
  const result = await s.open();
  assert.equal(result.tabId, 11);
  assert.equal(s.creates.length, 0);
  assert.equal(s.writes.length, 1);
  assert.equal(s.writes[0].id, 11);
  assert.equal(s.writes[0].changes.active, true);
  assert.equal(Object.hasOwn(s.writes[0].changes, "url"), false);
});
test("foreign tabs returned by query cannot become the planner", async () => {
  const s = subject([{ id: 10, url: "about:3pane" }, { id: 11, url }]);
  const result = await s.open();
  assert.equal(result.tabId, 11);
  assert.equal(s.writes[0].id, 11);
});
test("opening without any restored tab creates a dedicated tab", async () => {
  const s = subject();
  assert.equal((await s.open()).ok, true);
  assert.equal(s.writes.length, 0);
  assert.equal(s.creates.length, 1);
});
test("creation failure never falls back to overwriting another tab", async () => {
  const s = subject([], true);
  const result = await s.open();
  assert.equal(result.ok, false);
  assert.equal(s.writes.length, 0);
});
