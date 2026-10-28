var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { Services } = ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs"
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

let cachedCal = null;

function serializedError(error) {
  return error?.message || String(error || "Unbekannter Fehler");
}

function calendarUtils() {
  if (!cachedCal) {
    cachedCal = ChromeUtils.importESModule(
      "resource:///modules/calendar/calUtils.sys.mjs"
    ).cal;
  }
  return cachedCal;
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
  return {
    id: String(calendar?.id || ""),
    name: String(calendar?.name || fallbackName),
    type: String(calendar?.type || ""),
    color: calendarColor(calendar),
    readOnly: Boolean(calendar?.readOnly),
    visible: !isDisabled(calendar) && isShownInCalendarView(calendar),
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
  return Array.from(calendarUtils().manager.getCalendars() || []);
}

function visibleCalendars() {
  return allCalendars().filter(
    calendar => !isDisabled(calendar) && supportsEvents(calendar) && isShownInCalendarView(calendar)
  );
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

  return {
    id: String(item.hashId || item.id || `${calendarInfo.id}:${item.title || ""}`),
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
  const calendars = visibleCalendars();
  const events = [];
  const errors = [];

  if (!calendars.length) {
    errors.push({
      calendarId: "",
      calendarName: "",
      message: "Thunderbird hat dem Add-on keine sichtbaren Kalender gemeldet."
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
    mergeCalendarSummaries(calendars.map(calendarSummary), calendarSummariesFromPrefs({ visibleOnly: true })),
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
    registryBranch: REGISTRY_BRANCH,
    prefChildCount: prefChildCount(),
    registryIds: [],
    registryCalendars: [],
    managerCalendars: [],
    visibleView: null,
    files: profileCalendarFiles(),
    errors: []
  };

  try {
    diagnostics.registryIds = calendarPrefIds();
    diagnostics.registryCalendars = calendarSummariesFromPrefs();
  } catch (error) {
    diagnostics.errors.push({
      step: "calendar.registry prefs",
      message: serializedError(error)
    });
  }

  try {
    diagnostics.managerCalendars = allCalendars().map(calendarSummary);
  } catch (error) {
    diagnostics.errors.push({
      step: "cal.manager.getCalendars",
      message: serializedError(error)
    });
  }

  try {
    diagnostics.visibleView = diagnoseVisibleCalendarView();
  } catch (error) {
    diagnostics.errors.push({
      step: "visible calendar view",
      message: serializedError(error)
    });
  }

  return diagnostics;
}

var calendarCustomizer = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      calendarCustomizer: {
        async listCalendars() {
          try {
            return mergeCalendarSummaries(
              visibleCalendars().map(calendarSummary),
              calendarSummariesFromPrefs()
            );
          } catch (error) {
            try {
              const visibleData = scrapeVisibleCalendarView(1970, 1, 1);
              return mergeCalendarSummaries(visibleData.calendars, calendarSummariesFromPrefs());
            } catch (fallbackError) {
              return calendarSummariesFromPrefs();
            }
          }
        },

        async diagnoseCalendars() {
          try {
            return diagnoseCalendarsNow();
          } catch (error) {
            return {
              generatedAt: new Date().toISOString(),
              registryBranch: REGISTRY_BRANCH,
              prefChildCount: 0,
              registryIds: [],
              registryCalendars: [],
              managerCalendars: [],
              visibleView: null,
              files: [],
              errors: [
                {
                  step: "diagnoseCalendars",
                  message: serializedError(error)
                }
              ]
            };
          }
        },

        async getMonthData(year, month, weekStartsOn = 1) {
          try {
            const internalData = await buildMonthData(year, month, weekStartsOn);
            if (internalData.ok || internalData.events.length) {
              return internalData;
            }

            const visibleData = scrapeVisibleCalendarView(year, month, weekStartsOn);
            return hasUsefulCalendarData(visibleData) ? visibleData : appendFallbackHint(internalData);
          } catch (error) {
            try {
              const visibleData = scrapeVisibleCalendarView(year, month, weekStartsOn);
              if (hasUsefulCalendarData(visibleData)) {
                return visibleData;
              }
            } catch (fallbackError) {
              return failedMonthData(year, month, weekStartsOn, fallbackError);
            }

            return failedMonthData(year, month, weekStartsOn, error);
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
