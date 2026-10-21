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
const IMPLEMENTATION_VERSION = "1.4.9";

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
    isDate: Boolean(local.isDate)
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
    if (!isAppShutdown) {
      Services.obs.notifyObservers(null, "startupcache-invalidate", null);
    }
  }
};
