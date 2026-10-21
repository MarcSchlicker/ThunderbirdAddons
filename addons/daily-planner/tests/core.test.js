"use strict";

const assert = require("node:assert/strict");
const Core = require("../core.js");

assert.equal(Core.localDateKey(new Date(2026, 6, 31, 23, 30)), "2026-07-31");
assert.equal(Core.shiftDateKey("2026-12-31", 1), "2027-01-01");
assert.equal(Core.shiftDateKey("2028-02-28", 1), "2028-02-29");
assert.deepEqual(Core.normalizeTimes("13:00, 08:00;13:00 25:00"), ["08:00", "13:00"]);
assert.deepEqual(Core.normalizeTimes([]), []);
assert.equal(Core.dueDateForTarget("today", "2026-07-31"), "2026-07-31");
assert.equal(Core.dueDateForTarget("tomorrow", "2026-07-31"), "2026-08-01");
assert.equal(Core.dueDateForTarget("someday", "2026-07-31"), null);

const beforeMorning = new Date(2026, 6, 31, 7, 55, 0, 0);
assert.equal(
  Core.nextReminderTimestamp("08:00", beforeMorning),
  new Date(2026, 6, 31, 8, 0, 0, 0).getTime()
);
const afterMorning = new Date(2026, 6, 31, 8, 5, 0, 0);
assert.equal(
  Core.nextReminderTimestamp("08:00", afterMorning),
  new Date(2026, 7, 1, 8, 0, 0, 0).getTime()
);

const normalized = Core.normalizeState({
  settings: { reminderTimes: "09:15, 17:45", openOnStartup: false },
  tasks: [{ id: "old" }, { id: "ordered", order: 8 }],
  emails: [{ id: "one" }]
});
assert.equal(normalized.settings.openOnStartup, false);
assert.deepEqual(normalized.settings.reminderTimes, ["09:15", "17:45"]);
assert.equal(normalized.tasks[0].order, 0);
assert.equal(normalized.tasks[1].order, 8);
assert.equal(normalized.emails.length, 1);

const droppedTasks = [
  { id: "a", dueDate: "2026-07-31", order: 0, createdAt: "1" },
  { id: "b", dueDate: "2026-07-31", order: 1, createdAt: "2" },
  { id: "c", dueDate: "2026-08-01", order: 0, createdAt: "3" }
];
assert.deepEqual(
  Core.applyTaskDrop(droppedTasks, {
    id: "b",
    dueDate: "2026-07-31",
    targetId: "a",
    position: "before"
  }),
  { found: true, moved: true }
);
assert.deepEqual(
  droppedTasks.filter(item => item.dueDate === "2026-07-31").sort((a, b) => a.order - b.order).map(item => item.id),
  ["b", "a"]
);
Core.applyTaskDrop(droppedTasks, {
  id: "a",
  dueDate: "2026-08-01",
  targetId: "c",
  position: "after"
});
assert.deepEqual(
  droppedTasks.filter(item => item.dueDate === "2026-08-01").sort((a, b) => a.order - b.order).map(item => item.id),
  ["c", "a"]
);
assert.equal(droppedTasks.find(item => item.id === "b").order, 0);

console.log("DailyPlannerCore: 18 assertions passed.");
