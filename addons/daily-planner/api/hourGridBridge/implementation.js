var { ExtensionCommon: { ExtensionAPI } } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);

const DEFAULT_CALENDAR_COLOR = "#006fd6";
const MAX_EVENT_COUNT = 2500;
const ITEM_FILTER_TYPE_EVENT = 1 << 3;
const ITEM_FILTER_CLASS_OCCURRENCES = 1 << 16;
const EVENT_BOX_SELECTOR =
  "calendar-month-day-box-item, calendar-event-box, calendar-editable-item";
const REGISTRY_BRANCH = "calendar.registry.";
const PREF_STRING = 32;
const PREF_INT = 64;
const PREF_BOOL = 128;
const IMPLEMENTATION_VERSION = "1.4.0";

let cachedCal = null;

function serializedError(error) {
  return error?.message || String(error || "Unbekannter Fehler");
}

function serializedStack(error) {
  return error?.stack ? String(error.stack).slice(0, 4000) : "";
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function bridgeStatus(extra = {}) {
  return jsonSafe({
    ok: true,
    implementationVersion: IMPLEMENTATION_VERSION,
    generatedAt: new Date().toISOString(),
    runtime: {
      hasChromeUtils: typeof ChromeUtils !== "undefined",
      hasComponents: typeof Components !== "undefined",
      hasCc: typeof Cc !== "undefined",
      hasCi: typeof Ci !== "undefined",
      hasServices: Boolean(Services)
    },
    ...extra
  });
}

function calendarUtils() {
  if (!cachedCal) {
    cachedCal = ChromeUtils.importESModule(
      "resource:///modules/calendar/calUtils.sys.mjs"
    ).cal;
  }
  return cachedCal;
}

function calendarManager() {
  try {
    if (typeof Cc !== "undefined" && typeof Ci !== "undefined") {
      return Cc["@mozilla.org/calendar/manager;1"].getService(Ci.calICalendarManager);
    }
  } catch (error) {
    // Fall back to calUtils below.
  }

  return calendarUtils().manager;
}

function safeProperty(calendar, propertyName, fallback = null) {
  if (!calendar || typeof calendar.getProperty !== "function") {
    return fallback;
  }

  try {
    const value = calendar.getProperty(propertyName);
    return value == null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function isDisabled(calendar) {
  const disabled = safeProperty(calendar, "disabled", false);
  return disabled === true || disabled === "true";
}

function supportsEvents(calendar) {
  return safeProperty(calendar, "capabilities.events.supported", true) !== false;
}

function isShownInCalendarView(calendar) {
  const inComposite = safeProperty(calendar, "calendar-main-in-composite", true);
  return inComposite !== false && inComposite !== "false";
}

function calendarColor(calendar) {
  const color = safeProperty(calendar, "color", DEFAULT_CALENDAR_COLOR);
  if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }
  return DEFAULT_CALENDAR_COLOR;
}

function calendarSummary(calendar, fallbackName = "(Ohne Namen)") {
  const removeModes = safeProperty(calendar, "capabilities.removeModes", ["unsubscribe"]);
  return {
    id: String(calendar?.id || ""),
    name: String(calendar?.name || fallbackName),
    type: String(calendar?.type || ""),
    color: calendarColor(calendar),
    readOnly: Boolean(calendar?.readOnly),
    disabled: isDisabled(calendar),
    visible: !isDisabled(calendar) && isShownInCalendarView(calendar),
    isDefault: safeProperty(calendar, "calendar-main-default", false) === true,
    supportsEvents: supportsEvents(calendar),
    removeModes: Array.isArray(removeModes) ? removeModes.map(String) : ["unsubscribe"],
    uri: String(calendar?.uri?.spec || "")
  };
}

function prefString(name, fallback = "") {
  try {
    return Services.prefs.getStringPref(name);
  } catch (error) {
    return fallback;
  }
}

function prefBool(name, fallback = false) {
  try {
    return Services.prefs.getBoolPref(name);
  } catch (error) {
    return fallback;
  }
}

function prefValue(name) {
  try {
    switch (Services.prefs.getPrefType(name)) {
      case PREF_STRING:
        return Services.prefs.getStringPref(name);
      case PREF_INT:
        return Services.prefs.getIntPref(name);
      case PREF_BOOL:
        return Services.prefs.getBoolPref(name);
      default:
        return null;
    }
  } catch (error) {
    return null;
  }
}

function calendarPrefIds() {
  const calendarBranches = {};
  for (const rawPrefName of Services.prefs.getChildList(REGISTRY_BRANCH)) {
    const prefName = rawPrefName.startsWith(REGISTRY_BRANCH)
      ? rawPrefName
      : `${REGISTRY_BRANCH}${rawPrefName}`;
    const nextDot = prefName.indexOf(".", REGISTRY_BRANCH.length);
    if (nextDot > REGISTRY_BRANCH.length) {
      calendarBranches[prefName.substring(0, nextDot)] = true;
    }
  }
  return Object.keys(calendarBranches).map(branch => branch.substring(REGISTRY_BRANCH.length));
}

function calendarSummaryFromPrefs(id) {
  const branch = `${REGISTRY_BRANCH}${id}.`;
  const color = prefString(`${branch}color`, DEFAULT_CALENDAR_COLOR);
  const disabled = prefBool(`${branch}disabled`, false);
  const inComposite = prefBool(`${branch}calendar-main-in-composite`, true);
  const uri = prefString(`${branch}uri`, "");
  const prefs = {};

  for (const rawPrefName of Services.prefs.getChildList(branch)) {
    const prefName = rawPrefName.startsWith(branch) ? rawPrefName : `${branch}${rawPrefName}`;
    const key = prefName.slice(branch.length);
    prefs[key] = prefValue(prefName);
  }

  return {
    id,
    name: prefString(`${branch}name`, "(Ohne Namen)"),
    type: prefString(`${branch}type`, ""),
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_CALENDAR_COLOR,
    readOnly: prefBool(`${branch}readOnly`, false),
    visible: !disabled && inComposite,
    uri,
    url: uri,
    source: "prefs",
    prefs
  };
}

function calendarSummariesFromPrefs({ visibleOnly = false } = {}) {
  try {
    return calendarPrefIds()
      .map(calendarSummaryFromPrefs)
      .filter(calendar => calendar.name || calendar.uri)
      .filter(calendar => !visibleOnly || calendar.visible);
  } catch (error) {
    return [];
  }
}

function mergeCalendarSummaries(...calendarGroups) {
  const merged = [];
  const seen = new Set();

  for (const group of calendarGroups) {
    for (const calendar of group || []) {
      const key = String(calendar.id || calendar.uri || calendar.name || "");
      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(calendar);
    }
  }

  return merged;
}

function allCalendars() {
  return Array.from(calendarManager().getCalendars() || []);
}

function visibleCalendars() {
  return allCalendars().filter(
    calendar => !isDisabled(calendar) && supportsEvents(calendar) && isShownInCalendarView(calendar)
  );
}

function readableCalendars() {
  return allCalendars().filter(calendar => !isDisabled(calendar) && supportsEvents(calendar));
}

function defaultTimezone() {
  try {
    return calendarUtils().dtz.defaultTimezone;
  } catch (error) {
    return null;
  }
}

function jsDateToCalDateTime(date) {
  const cal = calendarUtils();
  return cal.dtz.jsDateToDateTime(date, cal.dtz.defaultTimezone);
}

function visibleGridRange(year, month, weekStartsOn) {
  const normalizedWeekStart = Number.isInteger(weekStartsOn) ? weekStartsOn : 1;
  const firstDay = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const offset = (firstDay.getDay() - normalizedWeekStart + 7) % 7;
  const start = new Date(year, month - 1, 1 - offset, 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 42);
  return { start, end };
}

function dateTimePart(dateTime, timezone = null) {
  if (!dateTime) {
    return null;
  }

  let local = dateTime;
  try {
    const targetTimezone = timezone || defaultTimezone();
    if (targetTimezone && typeof dateTime.getInTimezone === "function") {
      local = dateTime.getInTimezone(targetTimezone);
    }
  } catch (error) {
    local = dateTime;
  }

  return {
    year: Number(local.year),
    month: Number(local.month) + 1,
    day: Number(local.day),
    hour: local.isDate ? 0 : Number(local.hour || 0),
    minute: local.isDate ? 0 : Number(local.minute || 0),
    second: local.isDate ? 0 : Number(local.second || 0),
    isDate: Boolean(local.isDate),
    epochMillis: !local.isDate && Number.isFinite(Number(local.nativeTime)) ? Number(local.nativeTime) / 1000 : null
  };
}

function datePartToJsDate(part) {
  if (!part) {
    return null;
  }

  return new Date(
    part.year,
    part.month - 1,
    part.day,
    part.hour || 0,
    part.minute || 0,
    part.second || 0,
    0
  );
}

function eventOverlapsRange(event, range) {
  const start = datePartToJsDate(event.start);
  const end = datePartToJsDate(event.end);
  return Boolean(start && end && end > range.start && start < range.end);
}

function itemTextProperty(item, propertyName) {
  try {
    const value = item.getProperty(propertyName);
    return value == null ? "" : String(value);
  } catch (error) {
    return "";
  }
}

function itemCategories(item) {
  try {
    const categories = item.getCategories ? item.getCategories() : [];
    return Array.from(categories || [], category => String(category));
  } catch (error) {
    return [];
  }
}

function serializeEvent(item, calendar, timezone = null) {
  if (!item || (item.isEvent && !item.isEvent())) {
    return null;
  }

  const start = dateTimePart(item.startDate, timezone);
  const end = dateTimePart(item.endDate, timezone);
  if (!start || !end) {
    return null;
  }

  const sourceCalendar = item.calendar || calendar || null;
  const calendarInfo = calendarSummary(sourceCalendar);
  const itemId = String(item.id || "");
  const parentItemId = String(item.parentItem?.id || item.id || "");
  const hashId = String(item.hashId || "");

  return {
    id: String(item.hashId || item.id || `${calendarInfo.id}:${item.title || ""}`),
    itemId,
    parentItemId,
    hashId,
    recurrenceId: String(item.recurrenceId?.icalString || ""),
    canEdit: Boolean(sourceCalendar && !sourceCalendar.readOnly),
    calendarId: calendarInfo.id || calendarInfo.name,
    calendarName: calendarInfo.name,
    calendarColor: calendarInfo.color,
    title: String(item.title || "(Ohne Titel)"),
    location: itemTextProperty(item, "LOCATION"),
    categories: itemCategories(item),
    allDay: Boolean(item.startDate?.isDate || item.endDate?.isDate),
    start,
    end
  };
}

async function getCalendarItems(calendar, rangeStart, rangeEnd) {
  if (typeof calendar.getItemsAsArray === "function") {
    return calendar.getItemsAsArray(
      ITEM_FILTER_TYPE_EVENT | ITEM_FILTER_CLASS_OCCURRENCES,
      0,
      rangeStart,
      rangeEnd
    );
  }

  throw new Error("Dieser Kalender stellt keine kompatible getItemsAsArray-Schnittstelle bereit.");
}

function addJsDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfJsDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function datePartMatchesMinute(left, right) {
  if (!left || !right) {
    return false;
  }

  return (
    Number(left.year) === Number(right.year) &&
    Number(left.month) === Number(right.month) &&
    Number(left.day) === Number(right.day) &&
    Number(left.hour || 0) === Number(right.hour || 0) &&
    Number(left.minute || 0) === Number(right.minute || 0)
  );
}

function calendarById(id) {
  const calendarId = String(id || "");
  if (!calendarId) {
    return null;
  }

  try {
    const calendar = calendarManager().getCalendarById(calendarId);
    if (calendar) {
      return calendar;
    }
  } catch (error) {
    // Some Thunderbird builds only expose getCalendars().
  }

  return allCalendars().find(calendar => String(calendar.id || "") === calendarId) || null;
}

function eventRefRange(eventRef) {
  const startDate = datePartToJsDate(eventRef?.start);
  const endDate = datePartToJsDate(eventRef?.end);
  const rangeStart = startOfJsDay(startDate || new Date());
  let rangeEnd = endDate ? addJsDays(startOfJsDay(endDate), 1) : addJsDays(rangeStart, 2);

  if (rangeEnd <= rangeStart) {
    rangeEnd = addJsDays(rangeStart, 2);
  }

  return {
    start: rangeStart,
    end: rangeEnd
  };
}

async function findEditorItem(eventRef) {
  const calendar = calendarById(eventRef?.calendarId);
  if (!calendar) {
    throw new Error("Der Kalender des Termins wurde in Thunderbird nicht gefunden.");
  }

  const wantedItemId = String(eventRef?.itemId || eventRef?.parentItemId || eventRef?.id || "");
  const wantedParentItemId = String(eventRef?.parentItemId || "");
  const wantedHashId = String(eventRef?.hashId || eventRef?.id || "");
  if (!wantedItemId && !wantedParentItemId && !wantedHashId) {
    throw new Error("Der Termin hat keine interne Thunderbird-Kennung.");
  }

  const range = eventRefRange(eventRef);
  const rangeStart = jsDateToCalDateTime(range.start);
  const rangeEnd = jsDateToCalDateTime(range.end);
  const candidates = await getCalendarItems(calendar, rangeStart, rangeEnd);
  let fallbackItem = null;

  for (const item of candidates) {
    const itemId = String(item.id || "");
    const parentItemId = String(item.parentItem?.id || "");
    const hashId = String(item.hashId || "");
    const start = dateTimePart(item.startDate);
    const idMatches =
      (wantedItemId && (itemId === wantedItemId || parentItemId === wantedItemId)) ||
      (wantedParentItemId && (itemId === wantedParentItemId || parentItemId === wantedParentItemId));

    if (wantedHashId && hashId && hashId === wantedHashId) {
      return item;
    }
    if (idMatches && datePartMatchesMinute(start, eventRef?.start)) {
      return item;
    }
    if (idMatches && !fallbackItem) {
      fallbackItem = item;
    }
  }

  if (fallbackItem) {
    return fallbackItem;
  }

  if (wantedItemId && typeof calendar.getItem === "function") {
    const item = await calendar.getItem(wantedItemId);
    if (item) {
      return item;
    }
  }

  throw new Error("Der Termin wurde im Kalender nicht wiedergefunden.");
}

function mainCalendarWindow() {
  return (
    Services.wm.getMostRecentWindow("mail:3pane") ||
    Services.wm.getMostRecentWindow("calendarMainWindow") ||
    Services.wm.getMostRecentWindow(null)
  );
}

function parseEventRefJson(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writableEventCalendars() {
  const cal = calendarUtils();
  return allCalendars().filter(calendar => {
    if (isDisabled(calendar) || !supportsEvents(calendar)) {
      return false;
    }

    try {
      return (
        cal.acl.isCalendarWritable(calendar) &&
        cal.acl.userCanAddItemsToCalendar(calendar)
      );
    } catch (error) {
      return !calendar.readOnly;
    }
  });
}

function selectedWritableCalendar(win, calendarId = "") {
  const requestedCalendar = calendarById(calendarId);
  let selectedCalendar = null;
  try {
    selectedCalendar =
      typeof win?.getSelectedCalendar === "function" ? win.getSelectedCalendar() : null;
  } catch (error) {
    selectedCalendar = null;
  }
  const candidates = [
    requestedCalendar,
    selectedCalendar,
    ...writableEventCalendars()
  ].filter(Boolean);

  const cal = calendarUtils();
  for (const calendar of candidates) {
    try {
      if (
        supportsEvents(calendar) &&
        cal.acl.isCalendarWritable(calendar) &&
        cal.acl.userCanAddItemsToCalendar(calendar)
      ) {
        return calendar;
      }
    } catch (error) {
      if (!calendar.readOnly && supportsEvents(calendar)) {
        return calendar;
      }
    }
  }

  return null;
}

function eventDateTime(part, forceAllDay = false) {
  const jsDate = datePartToJsDate(part);
  if (!jsDate || Number.isNaN(jsDate.getTime())) {
    throw new Error("Der Termin enthaelt kein gueltiges Datum.");
  }

  const dateTime = jsDateToCalDateTime(jsDate);
  if (forceAllDay) {
    dateTime.isDate = true;
    dateTime.timezone = calendarUtils().dtz.floating;
  }
  return dateTime;
}

function validateEventRange(start, end) {
  if (start.compare(end) >= 0) {
    throw new Error("Das Terminende muss nach dem Beginn liegen.");
  }
}

async function openEventEditorInThunderbird(eventRef) {
  const item = await findEditorItem(eventRef);
  const win = mainCalendarWindow();

  if (win?.modifyEventWithDialog) {
    win.modifyEventWithDialog(item, true);
    return { ok: true, editor: "modifyEventWithDialog" };
  }

  if (win?.calendarViewController?.modifyOccurrence) {
    win.calendarViewController.modifyOccurrence(item);
    return { ok: true, editor: "calendarViewController.modifyOccurrence" };
  }

  throw new Error("Thunderbirds Termin-Editor ist im Hauptfenster nicht verfuegbar.");
}

async function createEventInThunderbird(eventRef) {
  const win = mainCalendarWindow();
  if (!win?.createEventWithDialog) {
    throw new Error("Thunderbirds Dialog fuer neue Termine ist nicht verfuegbar.");
  }

  const allDay = Boolean(eventRef?.allDay);
  const start = eventDateTime(eventRef?.start, allDay);
  const end = eventDateTime(eventRef?.end, allDay);
  validateEventRange(start, end);

  const calendar = selectedWritableCalendar(win, eventRef?.calendarId);
  if (!calendar) {
    throw new Error("Es wurde kein beschreibbarer Kalender gefunden.");
  }

  win.createEventWithDialog(calendar, start, end, null, null, allDay);
  return {
    ok: true,
    editor: "createEventWithDialog",
    calendarId: String(calendar.id || "")
  };
}

async function moveEventInThunderbird(eventRef) {
  const item = await findEditorItem(eventRef);
  const win = mainCalendarWindow();
  if (!win?.calendarViewController?.modifyOccurrence) {
    throw new Error("Thunderbirds Kalender-Controller ist nicht verfuegbar.");
  }

  const cal = calendarUtils();
  try {
    if (
      !cal.acl.isCalendarWritable(item.calendar) ||
      !cal.acl.userCanModifyItem(item)
    ) {
      throw new Error("Dieser Termin kann in Thunderbird nicht verschoben werden.");
    }
  } catch (error) {
    if (error?.message?.startsWith("Dieser Termin")) {
      throw error;
    }
    if (item.calendar?.readOnly) {
      throw new Error("Dieser Termin liegt in einem schreibgeschuetzten Kalender.");
    }
  }

  const allDay = Boolean(eventRef?.allDay);
  const newStart = eventDateTime(eventRef?.newStart, allDay);
  const newEnd = eventDateTime(eventRef?.newEnd, allDay);
  validateEventRange(newStart, newEnd);

  win.calendarViewController.modifyOccurrence(item, newStart, newEnd);
  return { ok: true, editor: "calendarViewController.modifyOccurrence" };
}

async function duplicateEventInThunderbird(eventRef) {
  const item = await findEditorItem(eventRef);
  const win = mainCalendarWindow();
  if (!win?.createEventWithDialog) {
    throw new Error("Thunderbirds Dialog fuer neue Termine ist nicht verfuegbar.");
  }
  const calendar = selectedWritableCalendar(win, eventRef?.calendarId || item.calendar?.id);
  if (!calendar) {
    throw new Error("Es wurde kein beschreibbarer Kalender gefunden.");
  }
  const start = item.startDate?.clone?.() || eventDateTime(eventRef?.start, Boolean(eventRef?.allDay));
  const end = item.endDate?.clone?.() || eventDateTime(eventRef?.end, Boolean(eventRef?.allDay));
  win.createEventWithDialog(calendar, start, end, null, item, Boolean(start?.isDate));
  return { ok: true, editor: "createEventWithDialog", calendarId: String(calendar.id || "") };
}

async function moveEventToCalendarInThunderbird(eventRef) {
  const item = await findEditorItem(eventRef);
  const targetCalendar = calendarById(eventRef?.targetCalendarId);
  if (!targetCalendar) {
    throw new Error("Der Zielkalender wurde in Thunderbird nicht gefunden.");
  }
  if (String(targetCalendar.id) === String(item.calendar?.id)) {
    return {
      ok: true,
      calendarId: String(item.calendar?.id || ""),
      itemId: String(item.id || ""),
      parentItemId: String(item.parentItem?.id || item.id || ""),
      hashId: String(item.hashId || item.id || ""),
      id: String(item.id || "")
    };
  }
  const cal = calendarUtils();
  try {
    if (
      !cal.acl.isCalendarWritable(targetCalendar) ||
      !cal.acl.userCanAddItemsToCalendar(targetCalendar)
    ) {
      throw new Error("Der Zielkalender ist schreibgeschuetzt.");
    }
    if (
      !cal.acl.isCalendarWritable(item.calendar) ||
      (typeof cal.acl.userCanDeleteItemsFromCalendar === "function" &&
        !cal.acl.userCanDeleteItemsFromCalendar(item.calendar))
    ) {
      throw new Error("Der Ursprungs-Kalender erlaubt kein Entfernen des Termins.");
    }
  } catch (error) {
    if (
      error?.message === "Der Zielkalender ist schreibgeschuetzt." ||
      error?.message === "Der Ursprungs-Kalender erlaubt kein Entfernen des Termins."
    ) {
      throw error;
    }
    if (targetCalendar.readOnly || item.calendar?.readOnly) {
      throw new Error("Mindestens einer der Kalender ist schreibgeschuetzt.");
    }
  }
  if (item.parentItem && String(item.parentItem.id) !== String(item.id)) {
    throw new Error(
      "Ein einzelnes Vorkommnis einer Terminserie kann nicht sicher in einen anderen Kalender verschoben werden. Bitte die Serie im Thunderbird-Editor kopieren."
    );
  }

  const copy = item.clone();
  copy.calendar = targetCalendar;
  copy.id = null;
  const addedItem = await targetCalendar.addItem(copy);
  try {
    await item.calendar.deleteItem(item);
  } catch (error) {
    try {
      await targetCalendar.deleteItem(addedItem);
    } catch (rollbackError) {
      // The added copy is safer than silently losing the event. Report the original failure.
    }
    throw new Error(`Der Termin wurde kopiert, konnte aber nicht aus dem Ursprungs-Kalender entfernt werden: ${serializedError(error)}`);
  }

  return {
    ok: true,
    calendarId: String(targetCalendar.id || ""),
    itemId: String(addedItem?.id || copy.id || ""),
    parentItemId: String(addedItem?.parentItem?.id || addedItem?.id || copy.id || ""),
    hashId: String(addedItem?.hashId || addedItem?.id || copy.id || ""),
    id: String(addedItem?.id || copy.id || "")
  };
}

async function openCalendarWizardInThunderbird() {
  const win = mainCalendarWindow();
  const cal = calendarUtils();
  if (win && typeof cal?.window?.openCalendarWizard === "function") {
    cal.window.openCalendarWizard(win);
    return { ok: true, editor: "openCalendarWizard" };
  }
  throw new Error("Thunderbirds Kalender-Assistent ist im Hauptfenster nicht verfuegbar.");
}

function calendarManagementSummary(calendar) {
  const summary = calendarSummary(calendar);
  const removeModes = new Set(summary.removeModes || []);
  return {
    ...summary,
    canUnsubscribe: removeModes.has("unsubscribe"),
    canDeleteData: removeModes.has("delete")
  };
}

async function updateCalendarInThunderbird(details) {
  const calendar = calendarById(details?.calendarId);
  if (!calendar) {
    throw new Error("Der Kalender wurde in Thunderbird nicht gefunden.");
  }

  if (typeof details.name === "string") {
    const name = details.name.trim();
    if (!name) {
      throw new Error("Der Kalendername darf nicht leer sein.");
    }
    calendar.name = name.slice(0, 160);
  }
  if (typeof details.color === "string") {
    if (!/^#[0-9a-fA-F]{6}$/.test(details.color)) {
      throw new Error("Die Kalenderfarbe ist ungueltig.");
    }
    calendar.setProperty("color", details.color);
  }
  if (typeof details.enabled === "boolean") {
    calendar.setProperty("disabled", !details.enabled);
  }
  if (typeof details.visible === "boolean") {
    calendar.setProperty("calendar-main-in-composite", details.visible);
  }
  if (details.makeDefault === true) {
    const win = mainCalendarWindow();
    const composite = calendarUtils().view.getCompositeCalendar(win);
    composite.defaultCalendar = calendar;
    calendar.setProperty("calendar-main-default", true);
  }

  return calendarManagementSummary(calendar);
}

async function openCalendarPropertiesInThunderbird(calendarId) {
  const calendar = calendarById(calendarId);
  if (!calendar) {
    throw new Error("Der Kalender wurde in Thunderbird nicht gefunden.");
  }
  const win = mainCalendarWindow();
  const cal = calendarUtils();
  if (!win || typeof cal?.window?.openCalendarProperties !== "function") {
    throw new Error("Thunderbirds erweiterte Kalendereigenschaften sind nicht verfuegbar.");
  }
  cal.window.openCalendarProperties(win, { calendar });
  return { ok: true, calendarId: String(calendar.id || "") };
}

async function removeCalendarInThunderbird(details) {
  const calendar = calendarById(details?.calendarId);
  if (!calendar) {
    throw new Error("Der Kalender wurde in Thunderbird nicht gefunden.");
  }
  const calendars = allCalendars();
  if (calendars.length <= 1) {
    throw new Error("Der letzte Kalender kann nicht entfernt werden.");
  }

  const mode = details?.mode === "delete" ? "delete" : "unsubscribe";
  const removeModes = new Set(calendarManagementSummary(calendar).removeModes || []);
  if (!removeModes.has(mode)) {
    throw new Error(
      mode === "delete"
        ? "Dieser Kalenderanbieter erlaubt kein Loeschen der Kalenderdaten."
        : "Dieser Kalenderanbieter erlaubt kein Abmelden."
    );
  }

  if (calendarManagementSummary(calendar).isDefault) {
    const replacement = calendars.find(candidate => String(candidate.id) !== String(calendar.id));
    const win = mainCalendarWindow();
    if (replacement && win) {
      calendarUtils().view.getCompositeCalendar(win).defaultCalendar = replacement;
    }
  }

  const flags =
    mode === "unsubscribe" && typeof Ci !== "undefined"
      ? Ci.calICalendarManager.REMOVE_NO_DELETE
      : 0;
  await calendarManager().removeCalendar(calendar, flags);
  return { ok: true, calendarId: String(calendar.id || ""), mode };
}

function eventKey(event) {
  const start = event.start
    ? [
        event.start.year,
        event.start.month,
        event.start.day,
        event.start.hour,
        event.start.minute,
        event.start.second
      ].join("-")
    : "";
  return `${event.calendarId}:${event.id}:${start}`;
}

function addCalendarToMap(map, calendar) {
  const summary = calendarSummary(calendar);
  const id = summary.id || summary.name;
  if (!map.has(id)) {
    map.set(id, summary);
  }
}

function monthDataResult(source, year, month, weekStartsOn, range, calendars, events, errors) {
  return {
    ok: errors.length === 0,
    source,
    year,
    month,
    weekStartsOn,
    rangeStart: range.start.toISOString(),
    rangeEnd: range.end.toISOString(),
    calendars,
    events,
    errors,
    generatedAt: new Date().toISOString()
  };
}

async function buildMonthData(year, month, weekStartsOn = 1) {
  const range = visibleGridRange(year, month, weekStartsOn);
  const rangeStart = jsDateToCalDateTime(range.start);
  const rangeEnd = jsDateToCalDateTime(range.end);
  const calendars = readableCalendars();
  const events = [];
  const errors = [];

  if (!calendars.length) {
    errors.push({
      calendarId: "",
      calendarName: "",
      message: "Thunderbird hat dem Add-on keine aktivierten Kalender gemeldet."
    });
  }

  for (const calendar of calendars) {
    const summary = calendarSummary(calendar);
    try {
      const items = await getCalendarItems(calendar, rangeStart, rangeEnd);
      for (const item of items) {
        const event = serializeEvent(item, calendar);
        if (event) {
          events.push(event);
        }
        if (events.length >= MAX_EVENT_COUNT) {
          break;
        }
      }
    } catch (error) {
      errors.push({
        calendarId: summary.id,
        calendarName: summary.name,
        message: serializedError(error)
      });
    }

    if (events.length >= MAX_EVENT_COUNT) {
      errors.push({
        calendarId: "",
        calendarName: "",
        message: `Die Ansicht wurde auf ${MAX_EVENT_COUNT} Termine begrenzt.`
      });
      break;
    }
  }

  return monthDataResult(
    "internal",
    year,
    month,
    weekStartsOn,
    range,
    mergeCalendarSummaries(calendars.map(calendarSummary), calendarSummariesFromPrefs()),
    events,
    errors
  );
}

function shouldProcessWindow(win) {
  if (!win || win.closed) {
    return false;
  }

  const href = String(win.location?.href || "");
  return (
    href.startsWith("chrome://messenger/content/") ||
    href.startsWith("chrome://calendar/content/")
  );
}

function collectDocumentsFrom(doc, documents, seen, depth = 0) {
  if (!doc || seen.has(doc) || depth > 4) {
    return;
  }

  seen.add(doc);
  documents.push(doc);

  let frames = [];
  try {
    frames = doc.querySelectorAll("browser, iframe, frame");
  } catch (error) {
    return;
  }

  for (const frame of frames) {
    try {
      collectDocumentsFrom(frame.contentDocument, documents, seen, depth + 1);
    } catch (error) {
      // Some embedded documents are intentionally unreachable.
    }
  }
}

function openCalendarDocuments() {
  const documents = [];
  const seen = new Set();
  const windows = Services.wm.getEnumerator(null);

  while (windows.hasMoreElements()) {
    const win = windows.getNext();
    if (!shouldProcessWindow(win)) {
      continue;
    }

    try {
      collectDocumentsFrom(win.document, documents, seen);
    } catch (error) {
      // Ignore windows that are closing.
    }
  }

  return documents;
}

function collectItemElements(doc) {
  const elements = new Set();

  try {
    for (const dayBox of doc.querySelectorAll("calendar-month-day-box")) {
      const itemHash = dayBox.mItemHash || {};
      for (const itemId of Object.keys(itemHash)) {
        if (itemHash[itemId]) {
          elements.add(itemHash[itemId]);
        }
      }
    }
  } catch (error) {
    // Continue with direct event boxes.
  }

  try {
    for (const element of doc.querySelectorAll(EVENT_BOX_SELECTOR)) {
      elements.add(element);
    }
  } catch (error) {
    // No usable event boxes in this document.
  }

  return elements;
}

function elementTimezone(element) {
  try {
    const parentBox = element.parentBox || element.closest?.("calendar-month-day-box");
    return parentBox?.date?.timezone || parentBox?.mDate?.timezone || null;
  } catch (error) {
    return null;
  }
}

function scrapeVisibleCalendarView(year, month, weekStartsOn = 1) {
  const range = visibleGridRange(year, month, weekStartsOn);
  const calendars = new Map();
  const events = new Map();
  const errors = [];

  for (const doc of openCalendarDocuments()) {
    for (const element of collectItemElements(doc)) {
      let item = null;
      try {
        item = element.occurrence || element.item;
      } catch (error) {
        continue;
      }

      if (!item) {
        continue;
      }

      try {
        const event = serializeEvent(item, item.calendar || null, elementTimezone(element));
        if (!event || !eventOverlapsRange(event, range)) {
          continue;
        }

        if (item.calendar) {
          addCalendarToMap(calendars, item.calendar);
        }

        events.set(eventKey(event), event);
        if (events.size >= MAX_EVENT_COUNT) {
          errors.push({
            calendarId: "",
            calendarName: "",
            message: `Die Ansicht wurde auf ${MAX_EVENT_COUNT} Termine begrenzt.`
          });
          break;
        }
      } catch (error) {
        errors.push({
          calendarId: "",
          calendarName: "",
          message: serializedError(error)
        });
      }
    }

    if (events.size >= MAX_EVENT_COUNT) {
      break;
    }
  }

  return monthDataResult(
    "visible-view",
    year,
    month,
    weekStartsOn,
    range,
    Array.from(calendars.values()),
    Array.from(events.values()),
    errors
  );
}

function hasUsefulCalendarData(data) {
  return Boolean(data && (data.calendars.length || data.events.length));
}

function failedMonthData(year, month, weekStartsOn, error) {
  const range = visibleGridRange(year, month, weekStartsOn);
  return monthDataResult("none", year, month, weekStartsOn, range, calendarSummariesFromPrefs(), [], [
    {
      calendarId: "",
      calendarName: "",
      message: serializedError(error)
    }
  ]);
}

function appendFallbackHint(data) {
  if (hasUsefulCalendarData(data)) {
    return data;
  }

  return {
    ...data,
    errors: [
      ...data.errors,
      {
        calendarId: "",
        calendarName: "",
        message:
          "Auch in einer bereits geoeffneten Kalenderansicht wurden keine sichtbaren Termine gefunden."
      }
    ]
  };
}

function prefChildCount() {
  try {
    return Services.prefs.getChildList(REGISTRY_BRANCH).length;
  } catch (error) {
    return 0;
  }
}

function recordDiagnosticStep(diagnostics, step, action, fallback) {
  try {
    const value = action();
    diagnostics.steps.push({ step, ok: true });
    return value;
  } catch (error) {
    const entry = {
      step,
      ok: false,
      message: serializedError(error),
      name: error?.name || "",
      stack: serializedStack(error)
    };
    diagnostics.steps.push(entry);
    diagnostics.errors.push(entry);
    return fallback;
  }
}

function fileInfo(file) {
  try {
    return {
      path: file.path,
      exists: file.exists(),
      size: file.exists() && file.isFile() ? file.fileSize : 0,
      lastModified: file.exists() ? new Date(file.lastModifiedTime).toISOString() : ""
    };
  } catch (error) {
    return {
      path: "",
      exists: false,
      size: 0,
      lastModified: "",
      error: serializedError(error)
    };
  }
}

function profileCalendarFiles() {
  const files = [];
  try {
    const nsIFile = Components.interfaces.nsIFile;
    const profileDir = Services.dirsvc.get("ProfD", nsIFile);
    files.push({ label: "profile", ...fileInfo(profileDir) });

    const prefsFile = profileDir.clone();
    prefsFile.append("prefs.js");
    files.push({ label: "prefs.js", ...fileInfo(prefsFile) });

    const calendarDir = profileDir.clone();
    calendarDir.append("calendar-data");
    files.push({ label: "calendar-data", ...fileInfo(calendarDir) });

    const localSqlite = calendarDir.clone();
    localSqlite.append("local.sqlite");
    files.push({ label: "local.sqlite", ...fileInfo(localSqlite) });

    const cacheSqlite = calendarDir.clone();
    cacheSqlite.append("cache.sqlite");
    files.push({ label: "cache.sqlite", ...fileInfo(cacheSqlite) });
  } catch (error) {
    files.push({
      label: "profile-error",
      path: "",
      exists: false,
      size: 0,
      lastModified: "",
      error: serializedError(error)
    });
  }
  return files;
}

function diagnoseVisibleCalendarView() {
  const documents = openCalendarDocuments();
  let dayBoxCount = 0;
  let itemElementCount = 0;

  for (const doc of documents) {
    try {
      dayBoxCount += doc.querySelectorAll("calendar-month-day-box").length;
      itemElementCount += collectItemElements(doc).size;
    } catch (error) {
      // Keep diagnostics best-effort.
    }
  }

  return {
    documentCount: documents.length,
    dayBoxCount,
    itemElementCount
  };
}

function diagnoseCalendarsNow() {
  const diagnostics = {
    generatedAt: new Date().toISOString(),
    implementationVersion: IMPLEMENTATION_VERSION,
    registryBranch: REGISTRY_BRANCH,
    runtime: {
      hasChromeUtils: typeof ChromeUtils !== "undefined",
      hasComponents: typeof Components !== "undefined",
      hasCc: typeof Cc !== "undefined",
      hasCi: typeof Ci !== "undefined",
      hasServices: Boolean(Services)
    },
    prefChildCount: 0,
    registryIds: [],
    registryCalendars: [],
    managerCalendars: [],
    visibleView: null,
    files: [],
    steps: [],
    errors: []
  };

  diagnostics.prefChildCount = recordDiagnosticStep(
    diagnostics,
    "Services.prefs.getChildList(calendar.registry.)",
    prefChildCount,
    0
  );
  diagnostics.registryIds = recordDiagnosticStep(
    diagnostics,
    "calendar.registry ids",
    calendarPrefIds,
    []
  );
  diagnostics.registryCalendars = recordDiagnosticStep(
    diagnostics,
    "calendar.registry summaries",
    calendarSummariesFromPrefs,
    []
  );
  diagnostics.managerCalendars = recordDiagnosticStep(
    diagnostics,
    "calICalendarManager.getCalendars",
    () => allCalendars().map(calendarSummary),
    []
  );
  diagnostics.visibleView = recordDiagnosticStep(
    diagnostics,
    "visible calendar view",
    diagnoseVisibleCalendarView,
    { documentCount: 0, dayBoxCount: 0, itemElementCount: 0 }
  );
  diagnostics.files = recordDiagnosticStep(
    diagnostics,
    "profile files",
    profileCalendarFiles,
    []
  );

  return diagnostics;
}

// The mobile service intentionally lives in this already loaded experiment.
// Keeping it here prevents a second privileged script from affecting the
// calendar bridge's lifecycle.
const MOBILE_SYNC_MAX_REQUEST_BYTES = 1024 * 1024;
const MOBILE_SYNC_CONNECTED_MS = 45 * 1000;
const MOBILE_DISCOVERY_PORT = 47831;
const MOBILE_DISCOVERY_REQUEST = "ZEITKLAR_DISCOVER_V1";
const MOBILE_DISCOVERY_RESPONSE = "ZEITKLAR_HERE_V1";
const MOBILE_PAIRING_DISCOVERY_REQUEST = "ZEITKLAR_DISCOVER_V2";
const MOBILE_PAIRING_DISCOVERY_PROTOCOL = "zeitklar-discovery-v2";
const mobileAddressListeners = new Set();
let mobileSyncServer = null;

function mobileSyncSafeJson(value, fallback = null) {
  try {
    return JSON.parse(String(value || ""));
  } catch (error) {
    return fallback;
  }
}

function mobileSyncBytesToText(value) {
  const converter = Cc[
    "@mozilla.org/intl/scriptableunicodeconverter"
  ].createInstance(Ci.nsIScriptableUnicodeConverter);
  converter.charset = "UTF-8";
  return converter.ConvertToUnicode(value);
}

function mobileSyncTextToBytes(value) {
  const converter = Cc[
    "@mozilla.org/intl/scriptableunicodeconverter"
  ].createInstance(Ci.nsIScriptableUnicodeConverter);
  converter.charset = "UTF-8";
  return converter.ConvertFromUnicode(String(value)) + converter.Finish();
}

function mobileSyncHeaders(value) {
  const headers = {};
  for (const line of value.split("\r\n").slice(1)) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      headers[line.slice(0, separator).trim().toLowerCase()] = line
        .slice(separator + 1)
        .trim();
    }
  }
  return headers;
}

function mobileSyncIpv4Addresses(addresses) {
  const rawValues = [];
  if (Array.isArray(addresses)) {
    rawValues.push(...addresses);
  } else if (addresses && typeof addresses.length === "number") {
    for (let index = 0; index < addresses.length; index += 1) {
      rawValues.push(addresses[index]);
    }
  } else if (addresses && typeof addresses[Symbol.iterator] === "function") {
    rawValues.push(...addresses);
  }
  const values = rawValues
    .map(value => String(value || "").trim())
    .filter(value => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value))
    .filter(value => value.split(".").every(part => Number(part) >= 0 && Number(part) <= 255))
    .filter(value => value !== "127.0.0.1" && !value.startsWith("169.254."));
  return [...new Set(values)];
}

function mobileSyncAddresses() {
  return new Promise(resolve => {
    let settled = false;
    let listener = null;
    const finish = values => {
      if (settled) {
        return;
      }
      settled = true;
      if (listener) {
        mobileAddressListeners.delete(listener);
      }
      resolve(mobileSyncIpv4Addresses(values));
    };
    try {
      const service = Cc["@mozilla.org/network-info-service;1"].getService(
        Ci.nsINetworkInfoService
      );
      listener = {
        QueryInterface: ChromeUtils.generateQI(["nsIListNetworkAddressesListener"]),
        onListedNetworkAddresses(addresses) {
          finish(addresses);
        },
        onListNetworkAddressesFailed() {
          finish([]);
        }
      };
      mobileAddressListeners.add(listener);
      service.listNetworkAddresses(listener);
    } catch (error) {
      finish([]);
    }
  });
}

function MobileDiscoveryServer(server, port) {
  this.server = server;
  this.port = Number(port) || MOBILE_DISCOVERY_PORT;
  this.socket = null;
  this.error = "";
}

MobileDiscoveryServer.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIUDPSocketListener"]),

  start() {
    if (this.socket) {
      return;
    }
    const socket = Cc["@mozilla.org/network/udp-socket;1"].createInstance(
      Ci.nsIUDPSocket
    );
    socket.init(
      this.port,
      true,
      Services.scriptSecurityManager.getSystemPrincipal(),
      true
    );
    socket.asyncListen(this);
    this.socket = socket;
    this.port = socket.port;
  },

  stop() {
    if (this.socket) {
      try { this.socket.close(); } catch (error) {}
      this.socket = null;
    }
  },

  onPacketReceived(_socket, message) {
    const request = String(message?.data || "");
    if (request !== MOBILE_DISCOVERY_REQUEST && request !== MOBILE_PAIRING_DISCOVERY_REQUEST) {
      return;
    }
    try {
      const response = request === MOBILE_PAIRING_DISCOVERY_REQUEST
        ? mobileSyncTextToBytes(JSON.stringify({
          protocol: MOBILE_PAIRING_DISCOVERY_PROTOCOL,
          service: "tagesplaner",
          port: this.server.port,
          pairing: this.server.activePairingSession()
        }))
        : mobileSyncTextToBytes(MOBILE_DISCOVERY_RESPONSE);
      message.outputStream.write(response, response.length);
      message.outputStream.close();
    } catch (error) {}
  },

  onStopListening(_socket, status) {
    if (this.socket) {
      this.error = `UDP listener stopped (${status}).`;
    }
    this.socket = null;
  }
};

function MobileSyncConnection(server, transport) {
  this.server = server;
  this.transport = transport;
  this.input = transport
    .openInputStream(0, 0, 0)
    .QueryInterface(Ci.nsIAsyncInputStream);
  this.output = transport.openOutputStream(0, 0, 0);
  this.buffer = "";
  this.closed = false;
  this.input.asyncWait(this, 0, 0, Services.tm.mainThread);
}

MobileSyncConnection.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIInputStreamCallback"]),

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.server.connections.delete(this);
    try { this.input.close(); } catch (error) {}
    try { this.output.close(); } catch (error) {}
    try { this.transport.close(Cr.NS_OK); } catch (error) {}
  },

  respond(status, body) {
    if (this.closed) {
      return;
    }
    const json = JSON.stringify(body);
    const jsonBytes = mobileSyncTextToBytes(json);
    const response = mobileSyncTextToBytes(
      `HTTP/1.1 ${status}\r\n` +
      "Content-Type: application/json; charset=utf-8\r\n" +
      "Cache-Control: no-store\r\n" +
      "Access-Control-Allow-Origin: *\r\n" +
      "Access-Control-Allow-Headers: content-type, x-zeitklar-token\r\n" +
      "Connection: close\r\n" +
      `Content-Length: ${jsonBytes.length}\r\n\r\n` +
      json
    );
    try {
      this.output.write(response, response.length);
    } catch (error) {}
    this.close();
  },

  onInputStreamReady(stream) {
    if (this.closed) {
      return;
    }
    let available;
    try {
      available = stream.available();
    } catch (error) {
      this.close();
      return;
    }
    if (available <= 0) {
      stream.asyncWait(this, 0, 0, Services.tm.mainThread);
      return;
    }
    try {
      const readable = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );
      readable.init(stream);
      this.buffer += readable.read(available);
    } catch (error) {
      this.close();
      return;
    }
    if (this.buffer.length > MOBILE_SYNC_MAX_REQUEST_BYTES) {
      this.respond("413 Payload Too Large", { error: "Anfrage ist zu groß." });
      return;
    }
    const headersEnd = this.buffer.indexOf("\r\n\r\n");
    if (headersEnd < 0) {
      stream.asyncWait(this, 0, 0, Services.tm.mainThread);
      return;
    }
    const headerText = this.buffer.slice(0, headersEnd);
    const requestLine = headerText.split("\r\n", 1)[0] || "";
    const requestMatch = /^([A-Z]+)\s+(\S+)\s+HTTP\/\d\.\d$/.exec(requestLine);
    if (!requestMatch) {
      this.respond("400 Bad Request", { error: "Ungültige Anfrage." });
      return;
    }
    const headers = mobileSyncHeaders(headerText);
    const contentLength = Number(headers["content-length"] || 0);
    if (!Number.isInteger(contentLength) || contentLength < 0 || contentLength > MOBILE_SYNC_MAX_REQUEST_BYTES) {
      this.respond("400 Bad Request", { error: "Ungültige Datenlänge." });
      return;
    }
    const bodyStart = headersEnd + 4;
    if (this.buffer.length < bodyStart + contentLength) {
      stream.asyncWait(this, 0, 0, Services.tm.mainThread);
      return;
    }
    this.server.handle(this, {
      method: requestMatch[1],
      path: requestMatch[2].split("?", 1)[0],
      headers,
      body: this.buffer.slice(bodyStart, bodyStart + contentLength)
    });
  }
};

function MobileSyncServer(port, token) {
  this.port = Number(port) || 47830;
  this.token = String(token || "");
  this.socket = null;
  this.discovery = new MobileDiscoveryServer(this, MOBILE_DISCOVERY_PORT);
  this.discoveryError = "";
  this.pairingSession = null;
  this.addresses = [];
  this.snapshotJson = "";
  this.pendingPhoneSnapshotJson = "";
  this.lastSeenAt = null;
  this.lastRemoteAddress = "";
  this.connections = new Set();
}

MobileSyncServer.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIServerSocketListener"]),

  async start() {
    if (!this.socket) {
      const socket = Cc["@mozilla.org/network/server-socket;1"].createInstance(
        Ci.nsIServerSocket
      );
      socket.init(this.port, true, -1);
      socket.asyncListen(this);
      this.socket = socket;
      this.port = socket.port;
    }
    // Retained API compatibility is local only. Mobile connections use the TLS Hub.
    this.addresses = ["127.0.0.1"];
    return this.status();
  },

  stop() {
    for (const connection of this.connections) {
      connection.close();
    }
    if (this.socket) {
      try { this.socket.close(); } catch (error) {}
      this.socket = null;
    }
    this.discovery.stop();
  },

  activePairingSession() {
    const session = this.pairingSession;
    if (!session || Date.parse(session.expiresAt || "") <= Date.now()) {
      this.pairingSession = null;
      return null;
    }
    return {
      sessionId: session.sessionId,
      secret: session.secret,
      expiresAt: session.expiresAt
    };
  },

  setPairingSession(sessionJson) {
    const session = mobileSyncSafeJson(sessionJson);
    if (!session || typeof session !== "object" || !session.sessionId || !session.secret) {
      this.pairingSession = null;
      return;
    }
    if (Date.parse(session.expiresAt || "") <= Date.now()) {
      this.pairingSession = null;
      return;
    }
    this.pairingSession = {
      sessionId: String(session.sessionId),
      secret: String(session.secret),
      expiresAt: String(session.expiresAt)
    };
  },

  status() {
    return jsonSafe({
      running: Boolean(this.socket),
      port: this.port,
      addresses: this.addresses,
      discoveryRunning: Boolean(this.discovery?.socket),
      discoveryPort: this.discovery?.port || MOBILE_DISCOVERY_PORT,
      discoveryError: this.discovery.error || this.discoveryError,
      pairingMode: Boolean(this.activePairingSession()),
      lastSeenAt: this.lastSeenAt,
      lastRemoteAddress: this.lastRemoteAddress,
      connected: Boolean(this.lastSeenAt && Date.now() - Date.parse(this.lastSeenAt) < MOBILE_SYNC_CONNECTED_MS)
    });
  },

  onSocketAccepted(_socket, transport) {
    const connection = new MobileSyncConnection(this, transport);
    this.connections.add(connection);
  },

  onStopListening() {
    this.socket = null;
  },

  handle(connection, request) {
    if (request.method === "OPTIONS") {
      connection.respond("204 No Content", {});
      return;
    }
    if (request.method === "GET" && request.path === "/health") {
      connection.respond("200 OK", { ok: true, service: "tagesplaner", ...this.status() });
      return;
    }
    if (request.method === "GET" && request.path === "/discover") {
      const pairing = this.activePairingSession();
      if (!pairing) {
        connection.respond("404 Not Found", { error: "Keine aktive Handy-Verbindung." });
        return;
      }
      connection.respond("200 OK", {
        protocol: MOBILE_PAIRING_DISCOVERY_PROTOCOL,
        service: "tagesplaner",
        port: this.port,
        pairing
      });
      return;
    }
    if (request.method !== "POST" || (request.path !== "/pair" && request.path !== "/sync")) {
      connection.respond("404 Not Found", { error: "Nicht gefunden." });
      return;
    }
    const payload = mobileSyncSafeJson(mobileSyncBytesToText(request.body));
    const suppliedToken = request.headers["x-zeitklar-token"] || payload?.token;
    const session = this.activePairingSession();
    const sessionAuthorized = request.path === "/pair"
      && Boolean(session)
      && payload?.sessionId === session.sessionId
      && payload?.pairingSecret === session.secret;
    if (!payload || (!sessionAuthorized && suppliedToken !== this.token)) {
      connection.respond("401 Unauthorized", { error: "Ungültiger Kopplungscode." });
      return;
    }
    const phoneSnapshot = payload.snapshot || payload.state;
    if (!phoneSnapshot || typeof phoneSnapshot !== "object") {
      connection.respond("400 Bad Request", { error: "Ungültige Tagesplaner-Daten." });
      return;
    }
    this.lastSeenAt = new Date().toISOString();
    this.lastRemoteAddress = String(connection.transport?.host || "");
    this.pendingPhoneSnapshotJson = JSON.stringify(phoneSnapshot);
    const snapshot = mobileSyncSafeJson(this.snapshotJson);
    if (!snapshot) {
      connection.respond("503 Service Unavailable", { error: "Tagesplaner wird gestartet." });
      return;
    }
    if (sessionAuthorized) {
      this.pairingSession = null;
      connection.respond("200 OK", { snapshot, token: this.token });
      return;
    }
    connection.respond("200 OK", { snapshot });
  }
};

async function startMobileSyncServer(port, token) {
  if (!mobileSyncServer) {
    mobileSyncServer = new MobileSyncServer(port, token);
  } else {
    mobileSyncServer.token = String(token || "");
    mobileSyncServer.lastSeenAt = null;
    mobileSyncServer.lastRemoteAddress = "";
  }
  return mobileSyncServer.start();
}

function setMobileSyncSnapshot(snapshotJson) {
  const parsed = mobileSyncSafeJson(snapshotJson);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Ungültige Tagesplaner-Daten.");
  }
  if (!mobileSyncServer) {
    throw new Error("Der mobile Tagesplaner wurde noch nicht gestartet.");
  }
  mobileSyncServer.snapshotJson = JSON.stringify(parsed);
}

function setMobilePairingSession(sessionJson) {
  if (!mobileSyncServer) {
    throw new Error("Der mobile Tagesplaner wurde noch nicht gestartet.");
  }
  mobileSyncServer.setPairingSession(sessionJson);
}

function takeMobileSyncSnapshot() {
  if (!mobileSyncServer) {
    return "";
  }
  const value = mobileSyncServer.pendingPhoneSnapshotJson;
  mobileSyncServer.pendingPhoneSnapshotJson = "";
  return value;
}

const MODULE_BRIDGE_OBSERVER_REQUEST = "tb-connect-module-bridge:desktop-state";
const MODULE_BRIDGE_OBSERVER_RESPONSE = "tb-connect-module-bridge:desktop-state-response";

function syncModuleBridgeWithObserver(payload) {
  if (typeof Services === "undefined" || !Services.obs) {
    return Promise.reject(new Error("Thunderbirds interne Modul-Schnittstelle ist nicht verfügbar."));
  }
  const requestId = `desktop-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    let completed = false;
    const finish = (callback, value) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      try { Services.obs.removeObserver(observer, MODULE_BRIDGE_OBSERVER_RESPONSE); } catch (error) {}
      callback(value);
    };
    const observer = {
      observe(_subject, topic, data) {
        if (topic !== MODULE_BRIDGE_OBSERVER_RESPONSE) return;
        const response = mobileSyncSafeJson(data);
        if (!response || response.requestId !== requestId) return;
        if (!response.ok || !response.result || typeof response.result !== "object") {
          finish(reject, new Error(response?.error || "Der TB-Connect Modul-Hub hat die Daten nicht übernommen."));
          return;
        }
        finish(resolve, response.result);
      }
    };
    const timeout = setTimeout(
      () => finish(reject, new Error("Der TB-Connect Modul-Hub antwortet nicht über die interne Schnittstelle.")),
      1500
    );
    try {
      Services.obs.addObserver(observer, MODULE_BRIDGE_OBSERVER_RESPONSE);
      Services.obs.notifyObservers(null, MODULE_BRIDGE_OBSERVER_REQUEST, JSON.stringify({ requestId, payload }));
    } catch (error) {
      finish(reject, error);
    }
  });
}

/**
 * Compatibility fallback for an older Hub that has not yet registered the
 * internal Thunderbird observer transport.
 */
function syncModuleBridgeWithSocket(payload) {

  const body = mobileSyncTextToBytes(JSON.stringify(payload));
  const request = mobileSyncTextToBytes(
    "POST /v1/desktop-sync HTTP/1.1\r\n" +
    "Host: 127.0.0.1:47832\r\n" +
    "Content-Type: application/json\r\n" +
    "Connection: close\r\n" +
    `Content-Length: ${body.length}\r\n\r\n` +
    body
  );

  return new Promise((resolve, reject) => {
    let transport;
    let input;
    let output;
    let buffer = "";
    let completed = false;
    const timeout = setTimeout(() => fail(new Error("Der TB-Connect Modul-Hub antwortet nicht rechtzeitig.")), 8_000);

    const close = () => {
      clearTimeout(timeout);
      try { input?.close(); } catch (error) {}
      try { output?.close(); } catch (error) {}
      try { transport?.close(Cr.NS_OK); } catch (error) {}
    };
    const fail = error => {
      if (completed) {
        return;
      }
      completed = true;
      close();
      reject(error);
    };
    const succeed = value => {
      if (completed) {
        return;
      }
      completed = true;
      close();
      resolve(value);
    };
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIInputStreamCallback"]),
      onInputStreamReady(stream) {
        if (completed) {
          return;
        }
        let available;
        try {
          available = stream.available();
        } catch (error) {
          fail(error);
          return;
        }
        if (available <= 0) {
          stream.asyncWait(listener, 0, 0, Services.tm.mainThread);
          return;
        }
        try {
          const readable = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
            Ci.nsIScriptableInputStream
          );
          readable.init(stream);
          buffer += readable.read(available);
        } catch (error) {
          fail(error);
          return;
        }

        const headersEnd = buffer.indexOf("\r\n\r\n");
        if (headersEnd < 0) {
          stream.asyncWait(listener, 0, 0, Services.tm.mainThread);
          return;
        }
        const headerText = buffer.slice(0, headersEnd);
        const statusMatch = /^HTTP\/\d\.\d\s+(\d{3})/.exec(headerText);
        const headers = mobileSyncHeaders(headerText);
        const contentLength = Number(headers["content-length"] || 0);
        if (!statusMatch || !Number.isInteger(contentLength) || contentLength < 0 || contentLength > MOBILE_SYNC_MAX_REQUEST_BYTES) {
          fail(new Error("Der TB-Connect Modul-Hub hat eine ungültige Antwort geliefert."));
          return;
        }
        const bodyStart = headersEnd + 4;
        if (buffer.length < bodyStart + contentLength) {
          stream.asyncWait(listener, 0, 0, Services.tm.mainThread);
          return;
        }
        const response = mobileSyncSafeJson(
          mobileSyncBytesToText(buffer.slice(bodyStart, bodyStart + contentLength))
        );
        if (Number(statusMatch[1]) < 200 || Number(statusMatch[1]) >= 300) {
          fail(new Error(response?.error || `Modul-Hub antwortet mit ${statusMatch[1]}.`));
          return;
        }
        if (!response || typeof response !== "object") {
          fail(new Error("Der TB-Connect Modul-Hub hat keine gültigen Daten geliefert."));
          return;
        }
        succeed(response);
      }
    };

    try {
      const service = Cc["@mozilla.org/network/socket-transport-service;1"].getService(
        Ci.nsISocketTransportService
      );
      transport = service.createTransport([], "127.0.0.1", 47832, null, null);
      transport.setTimeout(Ci.nsISocketTransport.TIMEOUT_CONNECT, 8);
      transport.setTimeout(Ci.nsISocketTransport.TIMEOUT_READ_WRITE, 8);
      input = transport.openInputStream(0, 0, 0).QueryInterface(Ci.nsIAsyncInputStream);
      output = transport.openOutputStream(0, 0, 0);
      // nsIOutputStream may accept only part of the request. Keep the stream
      // open until the Hub has answered: closing it immediately can cancel an
      // as-yet unconnected Thunderbird socket before the POST is transmitted.
      let written = 0;
      while (written < request.length) {
        const count = output.write(request.slice(written), request.length - written);
        if (!Number.isInteger(count) || count <= 0) {
          throw new Error("Der Modulzustand konnte nicht an den Hub gesendet werden.");
        }
        written += count;
      }
      input.asyncWait(listener, 0, 0, Services.tm.mainThread);
    } catch (error) {
      fail(error);
    }
  });
}

function syncModuleBridge(payloadJson) {
  const payload = mobileSyncSafeJson(payloadJson);
  if (!payload || typeof payload !== "object") {
    throw new Error("Ungültiger Modulzustand.");
  }
  return syncModuleBridgeWithObserver(payload).catch(() => syncModuleBridgeWithSocket(payload));
}

function mobileSyncServerStatus() {
  return mobileSyncServer ? mobileSyncServer.status() : {
    running: false,
    port: 47830,
    addresses: [],
    discoveryRunning: false,
    discoveryPort: MOBILE_DISCOVERY_PORT,
    discoveryError: "",
    pairingMode: false,
    lastSeenAt: null,
    lastRemoteAddress: "",
    connected: false
  };
}

this.hour_grid_bridge = class extends ExtensionAPI {
  getAPI(context) {
    return {
      hourGridBridge: {
        async listCalendars() {
          try {
            return jsonSafe(mergeCalendarSummaries(
              readableCalendars().map(calendarSummary),
              calendarSummariesFromPrefs()
            ));
          } catch (error) {
            try {
              const visibleData = scrapeVisibleCalendarView(1970, 1, 1);
              return jsonSafe(mergeCalendarSummaries(visibleData.calendars, calendarSummariesFromPrefs()));
            } catch (fallbackError) {
              return jsonSafe(calendarSummariesFromPrefs());
            }
          }
        },

        async getBridgeStatus() {
          return bridgeStatus();
        },

        async startMobileSync(port, token) {
          return jsonSafe(await startMobileSyncServer(port, token));
        },

        async setMobileSnapshot(snapshotJson) {
          setMobileSyncSnapshot(snapshotJson);
        },

        async setMobilePairingSession(sessionJson) {
          setMobilePairingSession(sessionJson);
        },

        async getMobileSyncStatus() {
          return jsonSafe(mobileSyncServerStatus());
        },

        async takeMobileSnapshot() {
          return takeMobileSyncSnapshot();
        },

        async syncModuleBridge(payloadJson) {
          return jsonSafe(await syncModuleBridge(payloadJson));
        },

        async diagnoseCalendars() {
          try {
            return jsonSafe(diagnoseCalendarsNow());
          } catch (error) {
            return jsonSafe({
              generatedAt: new Date().toISOString(),
              implementationVersion: IMPLEMENTATION_VERSION,
              registryBranch: REGISTRY_BRANCH,
              runtime: {
                hasChromeUtils: typeof ChromeUtils !== "undefined",
                hasComponents: typeof Components !== "undefined",
                hasCc: typeof Cc !== "undefined",
                hasCi: typeof Ci !== "undefined",
                hasServices: Boolean(Services)
              },
              prefChildCount: 0,
              registryIds: [],
              registryCalendars: [],
              managerCalendars: [],
              visibleView: null,
              files: [],
              steps: [],
              errors: [
                {
                  step: "diagnoseCalendars",
                  message: serializedError(error),
                  name: error?.name || "",
                  stack: serializedStack(error)
                }
              ]
            });
          }
        },

        async openEventEditor(eventRefJson) {
          return jsonSafe(await openEventEditorInThunderbird(parseEventRefJson(eventRefJson)));
        },

        async createEvent(eventRefJson) {
          return jsonSafe(await createEventInThunderbird(parseEventRefJson(eventRefJson)));
        },

        async moveEvent(eventRefJson) {
          return jsonSafe(await moveEventInThunderbird(parseEventRefJson(eventRefJson)));
        },

        async duplicateEvent(eventRefJson) {
          return jsonSafe(await duplicateEventInThunderbird(parseEventRefJson(eventRefJson)));
        },

        async moveEventToCalendar(eventRefJson) {
          return jsonSafe(await moveEventToCalendarInThunderbird(parseEventRefJson(eventRefJson)));
        },

        async openCalendarWizard() {
          return jsonSafe(await openCalendarWizardInThunderbird());
        },

        async getCalendarManagementData() {
          return jsonSafe(allCalendars().map(calendarManagementSummary));
        },

        async updateCalendar(calendarJson) {
          return jsonSafe(await updateCalendarInThunderbird(parseEventRefJson(calendarJson)));
        },

        async openCalendarProperties(calendarId) {
          return jsonSafe(await openCalendarPropertiesInThunderbird(calendarId));
        },

        async removeCalendar(calendarJson) {
          return jsonSafe(await removeCalendarInThunderbird(parseEventRefJson(calendarJson)));
        },

        async getMonthData(year, month, weekStartsOn = 1) {
          try {
            const internalData = await buildMonthData(year, month, weekStartsOn);
            if (internalData.ok || internalData.events.length) {
              return jsonSafe(internalData);
            }

            const visibleData = scrapeVisibleCalendarView(year, month, weekStartsOn);
            return jsonSafe(
              hasUsefulCalendarData(visibleData) ? visibleData : appendFallbackHint(internalData)
            );
          } catch (error) {
            try {
              const visibleData = scrapeVisibleCalendarView(year, month, weekStartsOn);
              if (hasUsefulCalendarData(visibleData)) {
                return jsonSafe(visibleData);
              }
            } catch (fallbackError) {
              return jsonSafe(failedMonthData(year, month, weekStartsOn, fallbackError));
            }

            return jsonSafe(failedMonthData(year, month, weekStartsOn, error));
          }
        }
      }
    };
  }

  onShutdown(isAppShutdown) {
    mobileSyncServer?.stop();
    mobileSyncServer = null;
    if (!isAppShutdown) {
      Services.obs.notifyObservers(null, "startupcache-invalidate", null);
    }
  }
};
