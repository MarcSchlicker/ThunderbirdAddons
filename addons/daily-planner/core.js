"use strict";

(function exposeDailyPlannerCore(root) {
  const DEFAULT_SETTINGS = Object.freeze({
    openOnStartup: true,
    reminderTimes: ["08:00"],
    showCompleted: true
  });

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function localDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function shiftDateKey(dateKey, days) {
    const [year, month, day] = String(dateKey).split("-").map(Number);
    const date = new Date(year, month - 1, day + Number(days || 0), 12, 0, 0, 0);
    return localDateKey(date);
  }

  function isValidTime(value) {
    if (!/^\d{2}:\d{2}$/.test(String(value))) {
      return false;
    }
    const [hours, minutes] = String(value).split(":").map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }

  function normalizeTimes(values) {
    const input = Array.isArray(values)
      ? values
      : String(values || "").split(/[\s,;]+/);
    return [...new Set(input.map(value => String(value).trim()).filter(isValidTime))].sort();
  }

  function nextReminderTimestamp(time, nowValue = new Date()) {
    if (!isValidTime(time)) {
      return null;
    }
    const now = nowValue instanceof Date ? new Date(nowValue) : new Date(nowValue);
    const [hours, minutes] = time.split(":").map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime();
  }

  function emptyState() {
    return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, reminderTimes: [...DEFAULT_SETTINGS.reminderTimes] },
      tasks: [],
      appointments: [],
      deletedTasks: [],
      deletedAppointments: [],
      emails: [],
      updatedAt: new Date(0).toISOString()
    };
  }

  function normalizeState(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const settings = source.settings && typeof source.settings === "object"
      ? source.settings
      : {};
    const reminderTimes = normalizeTimes(settings.reminderTimes);
    return {
      ...emptyState(),
      ...source,
      settings: {
        ...DEFAULT_SETTINGS,
        ...settings,
        reminderTimes: reminderTimes.length ? reminderTimes : ["08:00"]
      },
      tasks: Array.isArray(source.tasks)
        ? source.tasks.map((task, index) => ({
            ...task,
            order: Number.isFinite(Number(task?.order)) ? Number(task.order) : index
          }))
        : [],
      appointments: Array.isArray(source.appointments) ? source.appointments : [],
      deletedTasks: Array.isArray(source.deletedTasks) ? source.deletedTasks : [],
      deletedAppointments: Array.isArray(source.deletedAppointments) ? source.deletedAppointments : [],
      emails: Array.isArray(source.emails) ? source.emails : []
    };
  }

  function dueDateForTarget(target, todayKey = localDateKey()) {
    if (target === "today") {
      return todayKey;
    }
    if (target === "tomorrow") {
      return shiftDateKey(todayKey, 1);
    }
    return null;
  }

  function applyTaskDrop(tasks, { id, dueDate = null, targetId = null, position = "after" } = {}) {
    if (!Array.isArray(tasks)) {
      return { found: false, moved: false };
    }
    const task = tasks.find(item => item.id === id);
    if (!task) {
      return { found: false, moved: false };
    }
    const sameDate = (left, right) => (left || null) === (right || null);
    const compare = (left, right) => {
      const orderDifference = Number(left.order || 0) - Number(right.order || 0);
      return orderDifference || String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
    };
    const sourceDueDate = task.dueDate || null;
    const sourceGroup = tasks
      .filter(item => item.id !== id && sameDate(item.dueDate, sourceDueDate))
      .sort(compare);
    task.dueDate = dueDate || null;
    const destinationGroup = tasks
      .filter(item => item.id !== id && sameDate(item.dueDate, task.dueDate))
      .sort(compare);
    const targetIndex = targetId
      ? destinationGroup.findIndex(item => item.id === targetId)
      : -1;
    const insertIndex = targetIndex < 0
      ? destinationGroup.length
      : targetIndex + (position === "before" ? 0 : 1);
    destinationGroup.splice(insertIndex, 0, task);
    destinationGroup.forEach((item, order) => { item.order = order; });
    if (!sameDate(sourceDueDate, task.dueDate)) {
      sourceGroup.forEach((item, order) => { item.order = order; });
    }
    return { found: true, moved: true };
  }

  const api = {
    DEFAULT_SETTINGS,
    applyTaskDrop,
    dueDateForTarget,
    emptyState,
    isValidTime,
    localDateKey,
    nextReminderTimestamp,
    normalizeState,
    normalizeTimes,
    shiftDateKey
  };

  root.DailyPlannerCore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
