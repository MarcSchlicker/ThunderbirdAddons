const tb = globalThis.messenger || globalThis.browser;
const t = globalThis.calendarI18n?.t || (key => key);
const UI_LOCALE = globalThis.calendarI18n?.locale || "de-DE";

const PERSON_RELATIONSHIPS = ["self", "partner", "friend", "colleague", "other"];
const PERSON_RELATIONSHIP_ORDER = new Map(
  PERSON_RELATIONSHIPS.map((relationship, index) => [relationship, index])
);
const PERSON_RELATIONSHIP_COLORS = {
  self: "#168a63",
  partner: "#ad4f91",
  friend: "#386dc1",
  colleague: "#b56528",
  other: "#637083"
};

const DEFAULT_CALENDAR_TYPES = [
  {
    id: "own",
    name: t("myself"),
    icon: "●",
    color: "#168a63",
    kind: "person",
    relationship: "self",
    workStartHour: 8,
    workEndHour: 17,
    displayMode: "normal",
    enabled: true,
    builtIn: true
  },
  {
    id: "own-calendars",
    name: t("ownCalendars"),
    icon: "●",
    color: "#168a63",
    kind: "category",
    displayMode: "normal",
    enabled: true,
    builtIn: true
  },
  {
    id: "birthday",
    name: t("birthdayCalendar"),
    icon: "🕯",
    color: "#c6538c",
    kind: "category",
    displayMode: "birthday",
    enabled: true,
    builtIn: true
  },
  {
    id: "vacation",
    name: t("vacationCalendar"),
    icon: "☀",
    color: "#168a63",
    kind: "category",
    displayMode: "vacation",
    enabled: true,
    builtIn: true
  }
];

const DEFAULT_VIEW_PROFILES = [
  {
    id: "standard",
    name: t("profileStandard"),
    effect: "none",
    workStartHour: 8,
    workEndHour: 17,
    viewMode: "full",
    customStartHour: 8,
    customEndHour: 22,
    hiddenWeekdays: [],
    compactWeekends: false,
    builtIn: true
  },
  {
    id: "work",
    name: t("profileWork"),
    effect: "work",
    workStartHour: 8,
    workEndHour: 17,
    viewMode: "full",
    customStartHour: 8,
    customEndHour: 22,
    hiddenWeekdays: [],
    compactWeekends: false,
    builtIn: true
  },
  {
    id: "leisure",
    name: t("profileLeisure"),
    effect: "leisure",
    workStartHour: 8,
    workEndHour: 17,
    viewMode: "full",
    customStartHour: 8,
    customEndHour: 22,
    hiddenWeekdays: [],
    compactWeekends: false,
    builtIn: true
  }
];

const DEFAULT_SETTINGS = {
  accentColor: "#006fd6",
  weekStartsOn: 1,
  periodMode: "month",
  hiddenWeekdays: [],
  hiddenCalendarIds: [],
  removedCalendarIds: [],
  collapsedCalendarTypeIds: [],
  peoplePanelOpen: true,
  peopleSearch: "",
  profileSettingsVersion: 0,
  calendarVisibilityOverrides: {},
  compactWeekends: false,
  shiftDayZoom: true,
  dragCalendarMove: true,
  themeMode: "system",
  calendarTypes: DEFAULT_CALENDAR_TYPES,
  calendarTypeAssignments: {},
  calendarPersonAssignments: {},
  viewProfiles: DEFAULT_VIEW_PROFILES,
  activeViewProfileId: "standard"
};

const EXTERNAL_CALENDAR_KEY = "externalCalendars";
const EXTERNAL_SOURCE_PREFIX = "external:";
const RECURRENCE_SCAN_LIMIT = 1600;
const PROFILE_SETTINGS_VERSION = 3;
const DEFAULT_EXTERNAL_COLORS = [
  "#1a73e8",
  "#188038",
  "#d93025",
  "#b06000",
  "#9334e6",
  "#c5221f",
  "#0b8043"
];

const WEEKDAYS = [
  { value: 1, short: "Mo", sampleDate: new Date(2024, 0, 1) },
  { value: 2, short: "Di", sampleDate: new Date(2024, 0, 2) },
  { value: 3, short: "Mi", sampleDate: new Date(2024, 0, 3) },
  { value: 4, short: "Do", sampleDate: new Date(2024, 0, 4) },
  { value: 5, short: "Fr", sampleDate: new Date(2024, 0, 5) },
  { value: 6, short: "Sa", sampleDate: new Date(2024, 0, 6) },
  { value: 0, short: "So", sampleDate: new Date(2024, 0, 7) }
];

const state = {
  currentDate: new Date(),
  settings: { ...DEFAULT_SETTINGS },
  data: null,
  externalCalendars: [],
  isLoading: false,
  reloadPending: false,
  draggedEvent: null,
  refreshAfterEditor: false,
  dragPreviewKey: "",
  sidebarDrag: null,
  dragZoomTimer: 0,
  dragZoomKey: "",
  dragZoomActive: false,
  dayZoomMode: "",
  shiftZoomHeld: false,
  shiftZoomKey: "",
  shiftZoomBlockedUntilRelease: false,
  lastPointer: null,
  timeSelection: null,
  sidebarCalendarDropId: "",
  history: [],
  contextEvent: null,
  filters: {
    query: "",
    eventKind: "all",
    calendarIds: [],
    typeIds: [],
    personColorMode: false
  }
};

const grid = document.getElementById("calendar-grid");
const statusText = document.getElementById("status");
const monthTitle = document.getElementById("month-title");
const legend = document.getElementById("calendar-legend");
const messageBar = document.getElementById("message-bar");
const periodMode = document.getElementById("period-mode");
const eventSearch = document.getElementById("event-search");
const filterToggle = document.getElementById("filter-toggle");
const filterCount = document.getElementById("filter-count");
const filterPanel = document.getElementById("filter-panel");
const filterEventKind = document.getElementById("filter-event-kind");
const filterPersonOptions = document.getElementById("filter-person-options");
const filterCalendarOptions = document.getElementById("filter-calendar-options");
const filterTypeOptions = document.getElementById("filter-type-options");
const resetFiltersButton = document.getElementById("reset-filters");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");
const calendarList = document.getElementById("calendar-list");
const calendarSidebar = document.querySelector(".calendar-sidebar");
const leadingEdgeDays = document.getElementById("leading-edge-days");
const trailingEdgeDays = document.getElementById("trailing-edge-days");
const calendarPeoplePanel = document.getElementById("calendar-people-panel");
const calendarPeopleCount = document.getElementById("calendar-people-count");
const calendarPeopleList = document.getElementById("calendar-people-list");
const calendarPeopleSearch = document.getElementById("calendar-people-search");
const settingsPeopleList = document.getElementById("settings-people-list");
const settingsAddPerson = document.getElementById("settings-add-person");
const settingsShowPeople = document.getElementById("settings-show-people");
settingsAddPerson.addEventListener("click", () => openCalendarTypeDialog());
settingsShowPeople.addEventListener("click", async () => {
  state.settings.peoplePanelOpen = true;
  state.settings.peopleSearch = "";
  await saveSettings();
  renderCalendarPeopleSidebar();
  calendarPeoplePanel.scrollIntoView({ block: "nearest" });
});

calendarPeopleSearch.addEventListener("input", () => {
  state.settings.peopleSearch = calendarPeopleSearch.value.trim().slice(0, 100);
  renderCalendarPeopleSidebar();
  saveSettings().catch(error => setDialogStatus(`Personensuche konnte nicht gespeichert werden: ${error.message}`, true));
});
calendarPeoplePanel.addEventListener("toggle", () => {
  if (state.settings.peoplePanelOpen === calendarPeoplePanel.open) return;
  state.settings.peoplePanelOpen = calendarPeoplePanel.open;
  saveSettings().catch(error => setDialogStatus(`Personenansicht konnte nicht gespeichert werden: ${error.message}`, true));
});
const addCalendarTypeButton = document.getElementById("add-calendar-type");
const manageCalendarsButton = document.getElementById("manage-calendars");
const manageCalendarsSettingsButton = document.getElementById("manage-calendars-settings");
const viewProfile = document.getElementById("view-profile");
const settingsProfileList = document.getElementById("settings-profile-list");
const newViewProfileButton = document.getElementById("new-view-profile");
const themeMode = document.getElementById("theme-mode");
const accentColor = document.getElementById("accent-color");
const dragCalendarMove = document.getElementById("drag-calendar-move");
const restoreRemovedCalendarsButton = document.getElementById("restore-removed-calendars");
const exportPdfButton = document.getElementById("export-pdf");
const calendarTypeDialogBackdrop = document.getElementById("calendar-type-dialog-backdrop");
const calendarTypeDialog = document.getElementById("calendar-type-dialog");
const calendarTypeDialogTitle = document.getElementById("calendar-type-dialog-title");
const calendarTypeId = document.getElementById("calendar-type-id");
const calendarTypeName = document.getElementById("calendar-type-name");
const calendarTypeIcon = document.getElementById("calendar-type-icon");
const calendarTypeColor = document.getElementById("calendar-type-color");
const calendarTypeKind = document.getElementById("calendar-type-kind");
const calendarTypeRelationship = document.getElementById("calendar-type-relationship");
const calendarTypeRelationshipField = document.getElementById("calendar-type-relationship-field");
const calendarTypeDisplayMode = document.getElementById("calendar-type-display-mode");
const calendarTypeWorkHours = document.getElementById("calendar-type-work-hours");
const calendarTypeWorkStart = document.getElementById("calendar-type-work-start");
const calendarTypeWorkEnd = document.getElementById("calendar-type-work-end");
const calendarTypeWeekdayHours = document.getElementById("calendar-type-weekday-hours");
const calendarTypeWeekdayOptions = document.getElementById("calendar-type-weekday-options");
const closeCalendarTypeDialog = document.getElementById("close-calendar-type-dialog");
const deleteCalendarType = document.getElementById("delete-calendar-type");
const calendarPersonDialogBackdrop = document.getElementById("calendar-person-dialog-backdrop");
const calendarPersonDialog = document.getElementById("calendar-person-dialog");
const calendarPersonDialogCalendar = document.getElementById("calendar-person-dialog-calendar");
const calendarPersonOptions = document.getElementById("calendar-person-options");
const closeCalendarPersonDialog = document.getElementById("close-calendar-person-dialog");
const cancelCalendarPersonDialog = document.getElementById("cancel-calendar-person-dialog");
const dayZoomBackdrop = document.getElementById("day-zoom-backdrop");
const dayZoomDialog = document.querySelector(".day-zoom-dialog");
const dayZoomTitle = document.getElementById("day-zoom-title");
const dayZoomContent = document.getElementById("day-zoom-content");
const closeDayZoom = document.getElementById("close-day-zoom");
const dialogBackdrop = document.getElementById("calendar-dialog-backdrop");
const calendarDialog = document.getElementById("calendar-dialog");
const closeCalendarDialog = document.getElementById("close-calendar-dialog");
const calendarNameInput = document.getElementById("calendar-name");
const calendarColorInput = document.getElementById("calendar-color");
const calendarUrlInput = document.getElementById("calendar-url");
const importFileButton = document.getElementById("import-file-calendar");
const calendarFileInput = document.getElementById("calendar-file");
const detectThunderbirdButton = document.getElementById("detect-thunderbird-calendars");
const thunderbirdCalendarList = document.getElementById("thunderbird-calendar-list");
const dialogStatus = document.getElementById("calendar-dialog-status");
const diagnoseButton = document.getElementById("diagnose");
const diagnoseBackdrop = document.getElementById("diagnose-dialog-backdrop");
const closeDiagnoseDialog = document.getElementById("close-diagnose-dialog");
const diagnoseOutput = document.getElementById("diagnose-output");
const addCalendarButton = document.getElementById("add-calendar");
const eventContextMenu = document.getElementById("event-context-menu");
const contextEditEvent = document.getElementById("context-edit-event");
const contextDuplicateEvent = document.getElementById("context-duplicate-event");
const contextCalendarTargets = document.getElementById("context-calendar-targets");
const actionToast = document.getElementById("action-toast");
const eventTooltipEl = document.createElement("div");
eventTooltipEl.className = "event-tooltip";
eventTooltipEl.hidden = true;
document.body.appendChild(eventTooltipEl);

const monthFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  month: "long",
  year: "numeric"
});
const periodFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric"
});
const weekdayFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  weekday: "short"
});
const longDateFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric"
});

function makeId(prefix = "calendar") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeColor(value, fallback = DEFAULT_SETTINGS.accentColor) {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  return fallback;
}

function normalizeCalendarUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.toLowerCase().startsWith("webcal://")) {
    return `https://${trimmed.slice("webcal://".length)}`;
  }

  return trimmed;
}

function safeCalendarName(value, fallback = t("calendar")) {
  const name = String(value || "").trim();
  return name || fallback;
}

function externalCalendarId(calendar) {
  return `${EXTERNAL_SOURCE_PREFIX}${calendar.id}`;
}

function normalizeExternalCalendar(calendar, index = 0) {
  const fallbackColor = DEFAULT_EXTERNAL_COLORS[index % DEFAULT_EXTERNAL_COLORS.length];
  return {
    id: String(calendar.id || makeId("external")),
    name: safeCalendarName(calendar.name, "Importierter Kalender"),
    color: sanitizeColor(calendar.color, fallbackColor),
    sourceType: calendar.sourceType === "file" ? "file" : "url",
    url: String(calendar.url || ""),
    icsText: String(calendar.icsText || ""),
    cachedIcsText: String(calendar.cachedIcsText || ""),
    lastFetchedAt: String(calendar.lastFetchedAt || ""),
    lastError: String(calendar.lastError || "")
  };
}

function normalizeExternalCalendars(calendars) {
  return Array.isArray(calendars)
    ? calendars.map(normalizeExternalCalendar).filter(calendar => calendar.url || calendar.icsText)
    : [];
}

function unfoldIcsLines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .reduce((lines, line) => {
      if (/^[ \t]/.test(line) && lines.length) {
        lines[lines.length - 1] += line.slice(1);
      } else {
        lines.push(line);
      }
      return lines;
    }, []);
}

function parseIcsLine(line) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const head = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  const [rawName, ...rawParams] = head.split(";");
  const params = {};

  for (const rawParam of rawParams) {
    const equalsIndex = rawParam.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    params[rawParam.slice(0, equalsIndex).toUpperCase()] = rawParam
      .slice(equalsIndex + 1)
      .replace(/^"|"$/g, "");
  }

  return {
    name: rawName.toUpperCase(),
    params,
    value
  };
}

function unescapeIcsText(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDuration(value) {
  const match = String(value || "").match(
    /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i
  );
  if (!match) {
    return 0;
  }

  const weeks = Number(match[1] || 0);
  const days = Number(match[2] || 0);
  const hours = Number(match[3] || 0);
  const minutes = Number(match[4] || 0);
  const seconds = Number(match[5] || 0);
  return (((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60000 + seconds * 1000;
}

function parseIcsDate(value, params = {}) {
  const raw = String(value || "").trim();
  const isDate = params.VALUE === "DATE" || /^\d{8}$/.test(raw);

  if (isDate) {
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6)) - 1;
    const day = Number(raw.slice(6, 8));
    return { date: new Date(year, month, day, 0, 0, 0, 0), isDate: true };
  }

  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);
  const date = match[7]
    ? new Date(Date.UTC(year, month, day, hour, minute, second, 0))
    : new Date(year, month, day, hour, minute, second, 0);

  return { date, isDate: false };
}

function toDatePart(date, isDate = false) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: isDate ? 0 : date.getHours(),
    minute: isDate ? 0 : date.getMinutes(),
    second: isDate ? 0 : date.getSeconds(),
    isDate
  };
}

function parseRRule(value) {
  const rule = {};
  for (const part of String(value || "").split(";")) {
    const [key, rawValue] = part.split("=");
    if (key && rawValue) {
      rule[key.toUpperCase()] = rawValue;
    }
  }
  return rule;
}

function parseDateList(values) {
  const dates = [];
  for (const entry of values) {
    for (const rawDate of String(entry.value || "").split(",")) {
      const parsed = parseIcsDate(rawDate, entry.params);
      if (parsed) {
        dates.push(parsed);
      }
    }
  }
  return dates;
}

function dateStamp(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function minuteStamp(date) {
  return `${dateStamp(date)}T${String(date.getHours()).padStart(2, "0")}${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function addMonthsClamped(date, months) {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
}

function addFrequency(date, frequency, interval) {
  const next = new Date(date);
  switch (frequency) {
    case "DAILY":
      next.setDate(next.getDate() + interval);
      return next;
    case "WEEKLY":
      next.setDate(next.getDate() + interval * 7);
      return next;
    case "MONTHLY":
      return addMonthsClamped(next, interval);
    case "YEARLY":
      next.setFullYear(next.getFullYear() + interval);
      return next;
    default:
      return null;
  }
}

function dayCode(date) {
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][date.getDay()];
}

function byDayMatches(date, byDay) {
  if (!byDay) {
    return true;
  }

  const codes = byDay.split(",").map(part => part.replace(/^[+-]?\d+/, ""));
  return codes.includes(dayCode(date));
}

function createExternalEvent(rawEvent, occurrenceStart, duration, calendar, index) {
  const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
  return {
    id: `${externalCalendarId(calendar)}:${rawEvent.uid || index}:${minuteStamp(occurrenceStart)}`,
    calendarId: externalCalendarId(calendar),
    calendarName: calendar.name,
    calendarColor: calendar.color,
    title: rawEvent.summary || "(Ohne Titel)",
    location: rawEvent.location || "",
    categories: rawEvent.categories || [],
    allDay: Boolean(rawEvent.allDay),
    start: toDatePart(occurrenceStart, rawEvent.allDay),
    end: toDatePart(occurrenceEnd, rawEvent.allDay)
  };
}

function expandRecurringEvent(rawEvent, calendar, index, range) {
  const events = [];
  const rule = rawEvent.rrule;
  const frequency = String(rule.FREQ || "").toUpperCase();
  const interval = Math.max(1, Number(rule.INTERVAL || 1));
  const count = Number(rule.COUNT || 0);
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL, {})?.date : null;
  const exdates = new Set(parseDateList(rawEvent.exdates).map(item => minuteStamp(item.date)));

  if (!frequency) {
    return events;
  }

  if (frequency === "WEEKLY" && rule.BYDAY) {
    const scanStart = addDays(range.start, -7);
    const scanEnd = addDays(range.end, 7);
    let occurrenceIndex = 0;

    for (let day = startOfDay(rawEvent.start); day < scanEnd; day = addDays(day, 1)) {
      if (occurrenceIndex > RECURRENCE_SCAN_LIMIT) {
        break;
      }

      const weeks = Math.floor((startOfDay(day) - startOfDay(rawEvent.start)) / 604800000);
      if (
        day >= scanStart &&
        weeks >= 0 &&
        weeks % interval === 0 &&
        byDayMatches(day, rule.BYDAY)
      ) {
        const occurrenceStart = new Date(day);
        occurrenceStart.setHours(
          rawEvent.start.getHours(),
          rawEvent.start.getMinutes(),
          rawEvent.start.getSeconds(),
          0
        );
        occurrenceIndex += 1;
        if ((!count || occurrenceIndex <= count) && (!until || occurrenceStart <= until)) {
          if (!exdates.has(minuteStamp(occurrenceStart))) {
            const event = createExternalEvent(rawEvent, occurrenceStart, rawEvent.duration, calendar, index);
            if (eventOverlapsMonthRange(event, range)) {
              events.push(event);
            }
          }
        }
      }
    }

    return events;
  }

  let occurrenceStart = new Date(rawEvent.start);
  for (let occurrenceIndex = 1; occurrenceIndex <= RECURRENCE_SCAN_LIMIT; occurrenceIndex++) {
    if (count && occurrenceIndex > count) {
      break;
    }
    if (until && occurrenceStart > until) {
      break;
    }
    if (occurrenceStart >= range.end) {
      break;
    }

    if (byDayMatches(occurrenceStart, rule.BYDAY) && !exdates.has(minuteStamp(occurrenceStart))) {
      const event = createExternalEvent(rawEvent, occurrenceStart, rawEvent.duration, calendar, index);
      if (eventOverlapsMonthRange(event, range)) {
        events.push(event);
      }
    }

    const next = addFrequency(occurrenceStart, frequency, interval);
    if (!next || next <= occurrenceStart) {
      break;
    }
    occurrenceStart = next;
  }

  return events;
}

function eventOverlapsMonthRange(event, range) {
  const eventStart = datePartToDate(event.start);
  const eventEnd = datePartToDate(event.end, event.allDay);
  return Boolean(eventStart && eventEnd && eventEnd > range.start && eventStart < range.end);
}

function parseIcsEvents(text, calendar, range) {
  if (!/BEGIN:VEVENT/i.test(String(text || ""))) {
    throw new Error("In der iCalendar-Datei wurden keine Termine gefunden.");
  }

  const lines = unfoldIcsLines(text);
  const rawEvents = [];
  let current = null;

  for (const line of lines) {
    const parsed = parseIcsLine(line);
    if (!parsed) {
      continue;
    }

    if (parsed.name === "BEGIN" && parsed.value === "VEVENT") {
      current = {
        exdates: []
      };
      continue;
    }

    if (parsed.name === "END" && parsed.value === "VEVENT") {
      if (current) {
        rawEvents.push(current);
      }
      current = null;
      continue;
    }

    if (!current) {
      continue;
    }

    switch (parsed.name) {
      case "UID":
        current.uid = parsed.value;
        break;
      case "SUMMARY":
        current.summary = unescapeIcsText(parsed.value);
        break;
      case "LOCATION":
        current.location = unescapeIcsText(parsed.value);
        break;
      case "CATEGORIES":
        current.categories = parsed.value.split(",").map(unescapeIcsText);
        break;
      case "DTSTART":
        current.dtstart = parsed;
        break;
      case "DTEND":
        current.dtend = parsed;
        break;
      case "DURATION":
        current.durationValue = parsed.value;
        break;
      case "RRULE":
        current.rrule = parseRRule(parsed.value);
        break;
      case "EXDATE":
        current.exdates.push(parsed);
        break;
      default:
        break;
    }
  }

  const events = [];
  for (let index = 0; index < rawEvents.length; index++) {
    const rawEvent = rawEvents[index];
    const start = parseIcsDate(rawEvent.dtstart?.value, rawEvent.dtstart?.params);
    if (!start) {
      continue;
    }

    const explicitEnd = parseIcsDate(rawEvent.dtend?.value, rawEvent.dtend?.params);
    let endDate = explicitEnd?.date || null;
    if (!endDate && rawEvent.durationValue) {
      endDate = new Date(start.date.getTime() + parseIcsDuration(rawEvent.durationValue));
    }
    if (!endDate) {
      endDate = addDays(start.date, start.isDate ? 1 : 0);
      if (!start.isDate) {
        endDate = new Date(start.date.getTime() + 60 * 60000);
      }
    }

    const duration = Math.max(1, endDate.getTime() - start.date.getTime());
    const normalized = {
      ...rawEvent,
      start: start.date,
      allDay: start.isDate,
      duration
    };

    if (rawEvent.rrule) {
      events.push(...expandRecurringEvent(normalized, calendar, index, range));
      continue;
    }

    const event = createExternalEvent(normalized, start.date, duration, calendar, index);
    if (eventOverlapsMonthRange(event, range)) {
      events.push(event);
    }
  }

  return events;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function emptyMonthData(year, month, weekStartsOn, error) {
  return {
    ok: false,
    source: "none",
    year,
    month,
    weekStartsOn,
    rangeStart: "",
    rangeEnd: "",
    calendars: [],
    events: [],
    errors: error
      ? [
          {
            calendarId: "",
            calendarName: "",
            message: error?.message || String(error)
          }
        ]
      : [],
    generatedAt: new Date().toISOString()
  };
}

function normalizeMonthData(data, year, month) {
  if (!data || typeof data !== "object") {
    return emptyMonthData(year, month, state.settings.weekStartsOn, "Keine Kalenderdaten erhalten.");
  }

  return {
    ok: Boolean(data.ok),
    source: String(data.source || "internal"),
    year: Number(data.year || year),
    month: Number(data.month || month),
    weekStartsOn: Number(data.weekStartsOn ?? state.settings.weekStartsOn),
    rangeStart: String(data.rangeStart || ""),
    rangeEnd: String(data.rangeEnd || ""),
    calendars: Array.isArray(data.calendars) ? data.calendars : [],
    events: Array.isArray(data.events) ? data.events : [],
    errors: Array.isArray(data.errors) ? data.errors : [],
    generatedAt: String(data.generatedAt || "")
  };
}

function eventDataKey(event) {
  return `${event.calendarId}:${event.id}:${event.start?.year}-${event.start?.month}-${
    event.start?.day
  }-${event.start?.hour}-${event.start?.minute}`;
}

function combineMonthData(parts, year, month) {
  if (parts.length === 1) {
    return parts[0];
  }

  const calendars = [];
  const events = [];
  const errors = [];
  const calendarKeys = new Set();
  const eventKeys = new Set();
  const errorKeys = new Set();
  const sources = new Set();

  for (const part of parts) {
    if (part.source && part.source !== "none") {
      sources.add(part.source);
    }

    for (const calendar of part.calendars) {
      const key = calendarKey(calendar);
      if (!calendarKeys.has(key)) {
        calendarKeys.add(key);
        calendars.push(calendar);
      }
    }

    for (const event of part.events) {
      const key = eventDataKey(event);
      if (!eventKeys.has(key)) {
        eventKeys.add(key);
        events.push(event);
      }
    }

    for (const error of part.errors) {
      const key = `${error.calendarId || ""}:${error.message || ""}`;
      if (!errorKeys.has(key)) {
        errorKeys.add(key);
        errors.push(error);
      }
    }
  }

  const rangeStarts = parts.map(part => part.rangeStart).filter(Boolean).sort();
  const rangeEnds = parts.map(part => part.rangeEnd).filter(Boolean).sort();
  const source = sources.has("mixed") || sources.size > 1 ? "mixed" : [...sources][0] || "none";

  return {
    ok: parts.every(part => part.ok),
    source,
    year,
    month,
    weekStartsOn: state.settings.weekStartsOn,
    rangeStart: rangeStarts[0] || "",
    rangeEnd: rangeEnds.at(-1) || "",
    calendars,
    events,
    errors,
    generatedAt: new Date().toISOString()
  };
}

function monthRange(year, month, weekStartsOn) {
  const firstDay = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const offset = (firstDay.getDay() - weekStartsOn + 7) % 7;
  const start = addDays(firstDay, -offset);
  const end = addDays(start, 42);
  return { start, end };
}

function externalCalendarSummary(calendar) {
  return {
    id: externalCalendarId(calendar),
    name: calendar.name,
    type: calendar.sourceType,
    color: calendar.color,
    readOnly: true,
    source: "external",
    url: calendar.url
  };
}

async function loadExternalCalendars() {
  const saved = await tb.storage.local.get({ [EXTERNAL_CALENDAR_KEY]: [] });
  state.externalCalendars = normalizeExternalCalendars(saved[EXTERNAL_CALENDAR_KEY]);
}

async function saveExternalCalendars() {
  state.externalCalendars = normalizeExternalCalendars(state.externalCalendars);
  await tb.storage.local.set({ [EXTERNAL_CALENDAR_KEY]: state.externalCalendars });
}

async function calendarText(calendar) {
  if (calendar.sourceType === "file") {
    return calendar.icsText;
  }

  const calendarUrl = new URL(normalizeCalendarUrl(calendar.url));
  const isHolidayFeed = calendarUrl.hostname === "openholidaysapi.org" && calendarUrl.pathname === "/PublicHolidays";
  if (isHolidayFeed) {
    const year = state.currentDate.getFullYear();
    calendarUrl.searchParams.set("validFrom", `${year - 1}-01-01`);
    calendarUrl.searchParams.set("validTo", `${year + 1}-12-31`);
  }
  const response = await fetch(calendarUrl.href, {
    cache: "no-store",
    credentials: "omit",
    headers: { Accept: "text/calendar" }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  if (isHolidayFeed && !text.includes("BEGIN:VCALENDAR")) throw new Error("OpenHolidays hat keinen iCal-Kalender geliefert.");
  calendar.cachedIcsText = text;
  calendar.lastFetchedAt = new Date().toISOString();
  calendar.lastError = "";
  return text;
}

async function loadExternalMonthData(year, month, weekStartsOn, explicitRange = null) {
  const range = explicitRange || monthRange(year, month, weekStartsOn);
  const calendars = [];
  const events = [];
  const errors = [];

  for (const calendar of state.externalCalendars) {
    calendars.push(externalCalendarSummary(calendar));

    try {
      const text = await calendarText(calendar);
      events.push(...parseIcsEvents(text, calendar, range));
    } catch (error) {
      if (calendar.cachedIcsText) {
        try {
          events.push(...parseIcsEvents(calendar.cachedIcsText, calendar, range));
          errors.push({
            calendarId: externalCalendarId(calendar),
            calendarName: calendar.name,
            message: `Aktualisierung fehlgeschlagen, Cache verwendet: ${error.message || error}`
          });
          continue;
        } catch (cacheError) {
          // Fall through to the visible error below.
        }
      }

      calendar.lastError = error?.message || String(error);
      errors.push({
        calendarId: externalCalendarId(calendar),
        calendarName: calendar.name,
        message: `Kalender konnte nicht geladen werden: ${calendar.lastError}`
      });
    }
  }

  return {
    ok: errors.length === 0,
    source: "external",
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

function mergeMonthData(internalData, externalData) {
  const calendars = [];
  const seenCalendars = new Set();
  for (const calendar of [...externalData.calendars, ...internalData.calendars]) {
    const id = calendarKey(calendar);
    if (!seenCalendars.has(id)) {
      calendars.push(calendar);
      seenCalendars.add(id);
    }
  }

  const events = [];
  const seenEvents = new Set();
  for (const event of [...externalData.events, ...internalData.events]) {
    const key = eventDataKey(event);
    if (!seenEvents.has(key)) {
      events.push(event);
      seenEvents.add(key);
    }
  }

  const hasExternalCalendars = externalData.calendars.length > 0;
  const errors = hasExternalCalendars
    ? externalData.errors
    : [...internalData.errors, ...externalData.errors];

  let source = "none";
  if (externalData.calendars.length && internalData.events.length) {
    source = "mixed";
  } else if (externalData.calendars.length) {
    source = "external";
  } else {
    source = internalData.source;
  }

  return {
    ...internalData,
    ok: errors.length === 0,
    source,
    calendars,
    events,
    errors,
    generatedAt: new Date().toISOString()
  };
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function dateFromDayKey(value) {
  const [year, month, day] = String(value)
    .split("-")
    .map(Number);
  return new Date(year, month - 1, day);
}

function clampHour(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.max(0, Math.min(24, Math.round(numericValue)));
}

function getTimeRange() {
  const profile = activeViewProfile();
  if (profile.viewMode !== "custom") {
    return { start: 0, end: 1440 };
  }

  let start = clampHour(profile.customStartHour, 8);
  let end = clampHour(profile.customEndHour, 22);

  if (end <= start) {
    end = Math.min(24, start + 1);
  }

  return {
    start: start * 60,
    end: end * 60
  };
}

function getHiddenWeekdays() {
  const profile = activeViewProfile();
  return new Set(
    Array.isArray(profile?.hiddenWeekdays)
      ? profile.hiddenWeekdays.map(Number)
      : []
  );
}

function calendarKey(calendar) {
  return String(calendar?.calendarId || calendar?.id || calendar?.calendarName || calendar?.name || "");
}

function normalizeCalendarType(type) {
  const defaultType = DEFAULT_CALENDAR_TYPES.find(entry => entry.id === type?.id);
  const fallback = defaultType || {};
  const suppliedName = safeCalendarName(type?.name, "");
  // 1.4.4 used "Meine Kalender" as the built-in person name. It is now a
  // category, so migrate that untouched default to the clearer person "Ich".
  const name = defaultType?.id === "own" && ["Meine Kalender", "My calendars"].includes(suppliedName)
    ? defaultType.name
    : safeCalendarName(type?.name, fallback.name || "Eigener Typ");
  const kind = defaultType?.kind || (["person", "category"].includes(type?.kind)
    ? type.kind
    : fallback.kind || "category");
  const relationship = kind === "person"
    ? normalizePersonRelationship(type?.relationship, fallback.relationship || "other")
    : null;
  let workStartHour = clampHour(type?.workStartHour, fallback.workStartHour ?? 8);
  let workEndHour = clampHour(type?.workEndHour, fallback.workEndHour ?? 17);
  if (workEndHour <= workStartHour) {
    workEndHour = Math.min(24, workStartHour + 1);
  }
  const weekdayHours = normalizeWeekdayHours(
    type?.weekdayHours,
    workStartHour,
    workEndHour
  );
  return {
    id: String(type?.id || makeId("type")),
    name,
    icon: String(type?.icon || fallback.icon || "★").slice(0, 4),
    color: sanitizeColor(type?.color, fallback.color || DEFAULT_SETTINGS.accentColor),
    kind,
    relationship,
    workStartHour,
    workEndHour,
    weekdayHours,
    displayMode: kind === "person"
      ? "normal"
      : ["normal", "birthday", "vacation"].includes(type?.displayMode)
      ? type.displayMode
      : fallback.displayMode || "normal",
    workCalendarEnabled: kind === "person" ? type?.workCalendarEnabled !== false : false,
    enabled: type?.enabled !== false,
    builtIn: Boolean(defaultType || type?.builtIn)
  };
}

function normalizePersonRelationship(value, fallback = "other") {
  const normalizedFallback = PERSON_RELATIONSHIPS.includes(fallback) ? fallback : "other";
  return PERSON_RELATIONSHIPS.includes(value) ? value : normalizedFallback;
}

function personRelationshipLabel(person) {
  return t(`personRelationship${normalizePersonRelationship(person?.relationship)}`);
}

function personRelationshipSort(person) {
  return PERSON_RELATIONSHIP_ORDER.get(normalizePersonRelationship(person?.relationship)) ?? 99;
}

function defaultPersonColor(relationship) {
  return PERSON_RELATIONSHIP_COLORS[normalizePersonRelationship(relationship)] || "#637083";
}

function normalizeWeekdayHours(value, genericStartHour, genericEndHour) {
  const supplied = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(WEEKDAYS.map(day => {
    const configured = supplied[String(day.value)];
    const enabledByDefault = day.value >= 1 && day.value <= 5;
    const startHour = clampHour(configured?.startHour, genericStartHour);
    let endHour = clampHour(configured?.endHour, genericEndHour);
    if (endHour <= startHour) endHour = Math.min(24, startHour + 1);
    return [String(day.value), {
      enabled: configured?.enabled ?? enabledByDefault,
      startHour,
      endHour
    }];
  }));
}

function normalizeCalendarTypes(types) {
  const normalized = Array.isArray(types) ? types.map(normalizeCalendarType) : [];
  for (const defaultType of DEFAULT_CALENDAR_TYPES) {
    if (!normalized.some(type => type.id === defaultType.id)) {
      normalized.push(normalizeCalendarType(defaultType));
    }
  }
  return normalized;
}

function normalizeViewProfile(profile) {
  const defaultProfile = DEFAULT_VIEW_PROFILES.find(entry => entry.id === profile?.id);
  const fallback = defaultProfile || {
    name: "Ansicht",
    effect: "none",
    workStartHour: 8,
    workEndHour: 17,
    viewMode: "full",
    customStartHour: 8,
    customEndHour: 22,
    hiddenWeekdays: [],
    compactWeekends: false
  };
  const effect = ["work", "leisure", "none"].includes(profile?.effect)
    ? profile.effect
    : fallback.effect;
  let start = clampHour(profile?.workStartHour, fallback.workStartHour);
  let end = clampHour(profile?.workEndHour, fallback.workEndHour);
  if (end <= start) {
    end = Math.min(24, start + 1);
  }
  const viewMode = profile?.viewMode === "custom" ? "custom" : fallback.viewMode || "full";
  let customStart = clampHour(profile?.customStartHour, fallback.customStartHour);
  let customEnd = clampHour(profile?.customEndHour, fallback.customEndHour);
  if (customEnd <= customStart) {
    customEnd = Math.min(24, customStart + 1);
  }
  const hiddenWeekdays = Array.isArray(profile?.hiddenWeekdays)
    ? [...new Set(profile.hiddenWeekdays.map(Number).filter(day => day >= 0 && day <= 6))]
    : [...fallback.hiddenWeekdays];

  return {
    id: String(profile?.id || makeId("profile")),
    name: safeCalendarName(profile?.name, fallback.name || "Ansicht"),
    effect,
    workStartHour: start,
    workEndHour: end,
    viewMode,
    customStartHour: customStart,
    customEndHour: customEnd,
    hiddenWeekdays,
    compactWeekends: Boolean(profile?.compactWeekends ?? fallback.compactWeekends),
    builtIn: Boolean(defaultProfile || profile?.builtIn)
  };
}

function normalizeViewProfiles(profiles) {
  const supplied = Array.isArray(profiles) ? profiles.map(normalizeViewProfile) : [];
  const defaults = DEFAULT_VIEW_PROFILES.map(defaultProfile => {
    const existing = supplied.find(profile => profile.id === defaultProfile.id);
    return normalizeViewProfile(existing || defaultProfile);
  });
  const customProfiles = supplied.filter(
    profile => !DEFAULT_VIEW_PROFILES.some(defaultProfile => defaultProfile.id === profile.id)
  );
  return [...defaults, ...customProfiles];
}

function getCalendarTypes() {
  return Array.isArray(state.settings.calendarTypes) ? state.settings.calendarTypes : [];
}

function calendarTypeById(typeId) {
  return getCalendarTypes().find(type => type.id === typeId) || null;
}

function calendarTypeFor(calendarOrEvent) {
  const assignments = state.settings.calendarTypeAssignments || {};
  return calendarTypeById(assignments[calendarKey(calendarOrEvent)]) || null;
}

function personTypes() {
  return getCalendarTypes().filter(type => type.kind === "person");
}

function categoryTypeFor(calendarOrEvent) {
  const type = calendarTypeFor(calendarOrEvent);
  return type?.kind === "category" ? type : calendarTypeById("own-calendars");
}

function personTypeIdsFor(calendarOrEvent) {
  const key = calendarKey(calendarOrEvent);
  const configured = state.settings.calendarPersonAssignments?.[key];
  const validIds = (Array.isArray(configured) ? configured : [])
    .map(String)
    .filter(id => calendarTypeById(id)?.kind === "person");
  if (validIds.length) {
    return [...new Set(validIds)];
  }
  // Migrate a person assigned by the older single-group interaction.
  const legacyType = calendarTypeFor(calendarOrEvent);
  if (legacyType?.kind === "person") {
    return [legacyType.id];
  }
  // Every unassigned calendar starts as the user's calendar, including a
  // calendar placed in the Urlaub or Feiertage category. The category controls
  // its presentation; people answer the independent ownership question.
  return ["own"];
}

function personTypesFor(calendarOrEvent) {
  return personTypeIdsFor(calendarOrEvent)
    .map(calendarTypeById)
    .filter(Boolean);
}

function personInitial(person) {
  const label = String(person?.name || "?").trim();
  return [...label][0]?.toLocaleUpperCase(UI_LOCALE) || "?";
}

function workScheduleSummary(person) {
  const hours = normalizeWeekdayHours(
    person?.weekdayHours,
    person?.workStartHour ?? 8,
    person?.workEndHour ?? 17
  );
  const activeDays = WEEKDAYS.filter(day => hours[String(day.value)]?.enabled);
  if (!activeDays.length) return "Keine Arbeitszeit";
  const days = activeDays.map(day => day.short).join(", ");
  const ranges = [...new Set(activeDays.map(day => {
    const item = hours[String(day.value)];
    return `${item.startHour}:00–${item.endHour}:00`;
  }))];
  return `${days} · ${ranges.join(", ")}`;
}

/** Every calendar that has not deliberately been assigned to somebody else is
 * the user's own calendar. This makes the comparison view useful immediately,
 * without first sorting every personal calendar by hand. */
function effectiveCalendarTypeFor(calendarOrEvent) {
  return categoryTypeFor(calendarOrEvent) || personTypesFor(calendarOrEvent)[0] || calendarTypeById("own-calendars");
}

function calendarTypeDisplayModeFor(calendarOrEvent) {
  return categoryTypeFor(calendarOrEvent)?.displayMode || "normal";
}

/**
 * Outside an active person/category filter, the original calendar colours
 * always win. Filtering explicitly activates comparison colours: calendars
 * assigned to a normal group (own, partner, colleagues, ...) use that group's
 * colour so the groups remain easy to distinguish.
 */
function groupColorFilterIsActive() {
  return state.filters.personColorMode === true || hasSelectedPersonFilter();
}

function hasSelectedPersonFilter() {
  return Array.isArray(state.filters.typeIds) && state.filters.typeIds.some(
    id => calendarTypeById(id)?.kind === "person"
  );
}

function eventDisplayColor(event) {
  const people = personTypesFor(event);
  if (groupColorFilterIsActive() && people.length > 1) {
    // A shared calendar belongs to more than one person. Give it a neutral
    // comparison colour rather than silently presenting it as only one person.
    return "#8656c7";
  }
  if (groupColorFilterIsActive() && people[0]) {
    return sanitizeColor(people[0].color, DEFAULT_SETTINGS.accentColor);
  }
  return sanitizeColor(event.calendarColor, DEFAULT_SETTINGS.accentColor);
}

function isCalendarTypeEnabled(calendarOrEvent) {
  const category = categoryTypeFor(calendarOrEvent);
  if (category?.enabled === false) {
    return false;
  }
  const people = personTypesFor(calendarOrEvent);
  if (!people.length) {
    return true;
  }
  // A comparison is intentionally independent from the normal-view eye
  // switches. This lets the user compare two people even when one is hidden
  // in the everyday calendar view.
  if (groupColorFilterIsActive()) {
    return true;
  }
  return people.some(type => type.enabled !== false);
}

function activeViewProfile() {
  return (
    state.settings.viewProfiles.find(
      profile => profile.id === state.settings.activeViewProfileId
    ) || state.settings.viewProfiles[0]
  );
}

function getCalendarVisibilityOverrides() {
  const overrides = state.settings.calendarVisibilityOverrides;
  return overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {};
}

function hasOwnValue(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function calendarForKey(id) {
  return (state.data?.calendars || []).find(calendar => calendarKey(calendar) === id) || null;
}

function defaultCalendarVisible(calendarOrEvent) {
  const id = calendarKey(calendarOrEvent);
  const calendar = calendarOrEvent?.visible !== undefined ? calendarOrEvent : calendarForKey(id);
  return calendar?.visible !== false;
}

function isCalendarIndividuallyVisible(calendarOrEvent) {
  const id = calendarKey(calendarOrEvent);
  const overrides = getCalendarVisibilityOverrides();
  if (hasOwnValue(overrides, id)) {
    return Boolean(overrides[id]);
  }
  return defaultCalendarVisible(calendarOrEvent);
}

function isCalendarVisible(calendarOrEvent) {
  return (
    !state.settings.removedCalendarIds.includes(calendarKey(calendarOrEvent)) &&
    isCalendarIndividuallyVisible(calendarOrEvent) &&
    isCalendarTypeEnabled(calendarOrEvent)
  );
}

function isCalendarRemoved(calendarOrEvent) {
  return state.settings.removedCalendarIds.includes(calendarKey(calendarOrEvent));
}

function isCalendarTypeCollapsed(typeId) {
  return state.settings.collapsedCalendarTypeIds.includes(typeId || "__unassigned__");
}

async function removeCalendarFromView(calendarId, calendarName = t("calendar")) {
  if (
    !window.confirm(
      t("removeCalendarConfirm", { calendar: calendarName })
    )
  ) {
    return;
  }
  if (!state.settings.removedCalendarIds.includes(calendarId)) {
    state.settings.removedCalendarIds = [
      ...state.settings.removedCalendarIds,
      calendarId
    ];
  }
  await saveSettings();
  syncControls();
  renderMonth();
  pushHistory({ kind: "hide-calendar", calendarId, label: `${calendarName} ausgeblendet` });
}

async function restoreRemovedCalendars() {
  state.settings.removedCalendarIds = [];
  await saveSettings();
  syncControls();
  renderMonth();
}

async function toggleCalendarTypeCollapsed(typeId) {
  const key = typeId || "__unassigned__";
  const collapsed = new Set(state.settings.collapsedCalendarTypeIds);
  if (collapsed.has(key)) {
    collapsed.delete(key);
  } else {
    collapsed.add(key);
  }
  state.settings.collapsedCalendarTypeIds = [...collapsed];
  await saveSettings();
  renderMonth();
}

function getHiddenCalendars() {
  const hidden = new Set();
  for (const calendar of state.data?.calendars || []) {
    if (!isCalendarVisible(calendar)) {
      hidden.add(calendarKey(calendar));
    }
  }
  return hidden;
}

function eventMatchesFilters(event) {
  const filters = state.filters;
  if (filters.eventKind === "timed" && event.allDay) {
    return false;
  }
  if (filters.eventKind === "all-day" && !event.allDay) {
    return false;
  }
  if (filters.calendarIds.length && !filters.calendarIds.includes(calendarKey(event))) {
    return false;
  }
  if (filters.typeIds.length) {
    const selectedPeople = filters.typeIds.filter(id => calendarTypeById(id)?.kind === "person");
    const selectedCategories = filters.typeIds.filter(id => calendarTypeById(id)?.kind === "category");
    if (selectedPeople.length && !personTypeIdsFor(event).some(id => selectedPeople.includes(id))) {
      return false;
    }
    if (selectedCategories.length && !selectedCategories.includes(categoryTypeFor(event)?.id || "")) {
      return false;
    }
  }
  const query = filters.query.trim().toLocaleLowerCase();
  if (!query) {
    return true;
  }
  const haystack = [
    event.title,
    event.location,
    event.calendarName,
    ...(Array.isArray(event.categories) ? event.categories : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query);
}

function filteredEvents(data = state.data) {
  return (data?.events || []).filter(isCalendarVisible).filter(eventMatchesFilters);
}

function filterOption(labelText, id, selected, onChange) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = id;
  input.checked = selected;
  input.addEventListener("change", () => onChange(input.checked));
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(input, text);
  return label;
}

function personFilterOption(person) {
  const label = document.createElement("label");
  label.className = "filter-person-option";
  label.style.setProperty("--person-color", sanitizeColor(person.color, DEFAULT_SETTINGS.accentColor));
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = person.id;
  input.checked = state.filters.typeIds.includes(person.id);
  input.addEventListener("change", () => {
    const selected = new Set(state.filters.typeIds);
    input.checked ? selected.add(person.id) : selected.delete(person.id);
    state.filters.typeIds = [...selected];
    // Selecting people is the comparison mode. A legacy stored checkbox is
    // deliberately cleared so the visual state has one obvious source.
    state.filters.personColorMode = false;
    renderFilterControls();
    renderMonth();
  });
  const badge = document.createElement("span");
  badge.className = "calendar-owner-badge";
  badge.textContent = personInitial(person);
  badge.style.background = sanitizeColor(person.color, DEFAULT_SETTINGS.accentColor);
  const text = document.createElement("span");
  text.textContent = `${person.name} · ${personRelationshipLabel(person)}`;
  label.title = `${person.name} (${personRelationshipLabel(person)}) vergleichen`;
  label.append(input, badge, text);
  return label;
}

function renderFilterControls(data = state.data) {
  filterCalendarOptions.replaceChildren();
  filterTypeOptions.replaceChildren();
  filterPersonOptions.replaceChildren();
  const calendars = data?.calendars || [];
  for (const calendar of calendars) {
    const id = calendarKey(calendar);
    filterCalendarOptions.appendChild(
      filterOption(
        calendar.name || "(Ohne Namen)",
        id,
        state.filters.calendarIds.includes(id),
        checked => {
          const selected = new Set(state.filters.calendarIds);
          checked ? selected.add(id) : selected.delete(id);
          state.filters.calendarIds = [...selected];
          renderFilterControls();
          renderMonth();
        }
      )
    );
  }
  const people = getCalendarTypes()
    .filter(type => type.kind === "person")
    .sort((left, right) => personRelationshipSort(left) - personRelationshipSort(right) || left.name.localeCompare(right.name, UI_LOCALE));
  const categories = getCalendarTypes().filter(type => type.kind === "category");
  for (const relationship of PERSON_RELATIONSHIPS) {
    const matchingPeople = people.filter(person => normalizePersonRelationship(person.relationship) === relationship);
    if (!matchingPeople.length) continue;
    const group = document.createElement("div");
    group.className = "filter-person-group";
    const heading = document.createElement("span");
    heading.className = "filter-person-group-title";
    heading.textContent = t(`personRelationship${relationship}`);
    const options = document.createElement("div");
    options.className = "filter-person-group-options";
    for (const person of matchingPeople) {
      options.appendChild(personFilterOption(person));
    }
    group.append(heading, options);
    filterPersonOptions.appendChild(group);
  }
  for (const type of categories) {
    filterTypeOptions.appendChild(
      filterOption(
        type.name,
        type.id,
        state.filters.typeIds.includes(type.id),
        checked => {
          const selected = new Set(state.filters.typeIds);
          checked ? selected.add(type.id) : selected.delete(type.id);
          state.filters.typeIds = [...selected];
          renderFilterControls();
          renderMonth();
        }
      )
    );
  }
  filterEventKind.value = state.filters.eventKind;
  eventSearch.value = state.filters.query;
  const activeFilterCount =
    Number(Boolean(state.filters.query.trim())) +
    Number(state.filters.eventKind !== "all") +
    state.filters.calendarIds.length +
    state.filters.typeIds.length;
  filterCount.hidden = activeFilterCount === 0;
  filterCount.textContent = String(activeFilterCount);
}

function resetFilters() {
  state.filters = { query: "", eventKind: "all", calendarIds: [], typeIds: [], personColorMode: false };
  renderFilterControls();
  renderMonth();
}

function getVisibleWeekdays() {
  const hidden = getHiddenWeekdays();
  const ordered = [];

  for (let offset = 0; offset < 7; offset++) {
    const value = (state.settings.weekStartsOn + offset) % 7;
    if (!hidden.has(value)) {
      ordered.push(value);
    }
  }

  return ordered.length ? ordered : WEEKDAYS.map(day => day.value);
}

function applyAppearance() {
  document.documentElement.dataset.themeMode = state.settings.themeMode;
  document.documentElement.style.setProperty("--accent", state.settings.accentColor);
}

function datePartToDate(part, forceEndOfDay = false) {
  if (!part) {
    return null;
  }

  if (part.isDate && forceEndOfDay) {
    return new Date(part.year, part.month - 1, part.day, 0, 0, 0, 0);
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

function eventRange(event) {
  return {
    start: datePartToDate(event.start),
    end: datePartToDate(event.end, event.allDay)
  };
}

function dateToPart(date, isDate = false) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: isDate ? 0 : date.getHours(),
    minute: isDate ? 0 : date.getMinutes(),
    second: isDate ? 0 : date.getSeconds(),
    isDate
  };
}

function overlapsDay(event, date) {
  const { start, end } = eventRange(event);
  if (!start || !end) {
    return false;
  }
  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);
  return end > dayStart && start < dayEnd;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function minutesOnDay(event, date) {
  const { start, end } = eventRange(event);
  if (!start || !end) {
    return null;
  }

  const range = getTimeRange();
  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);
  const clampedStart = start < dayStart ? dayStart : start;
  const clampedEnd = end > dayEnd ? dayEnd : end;
  let startMinute = clampedStart.getHours() * 60 + clampedStart.getMinutes();
  let endMinute = clampedEnd.getHours() * 60 + clampedEnd.getMinutes();

  if (clampedEnd.getTime() === dayEnd.getTime()) {
    endMinute = 1440;
  }

  startMinute = Math.max(startMinute, range.start);
  endMinute = Math.min(endMinute, range.end);

  if (endMinute <= startMinute) {
    return null;
  }

  return { startMinute, endMinute };
}

function splitSegments(event) {
  const range = getTimeRange();
  const splitPoint = range.start + (range.end - range.start) / 2;
  const halves = [
    { start: range.start, end: splitPoint },
    { start: splitPoint, end: range.end }
  ];
  const segments = [];

  for (let halfIndex = 0; halfIndex < halves.length; halfIndex++) {
    const half = halves[halfIndex];
    const segmentStart = Math.max(event.startMinute, half.start);
    const segmentEnd = Math.min(event.endMinute, half.end);

    if (segmentEnd <= segmentStart) {
      continue;
    }

    segments.push({
      ...event,
      halfIndex,
      halfStart: half.start,
      halfEnd: half.end,
      segmentStart,
      segmentEnd
    });
  }

  return segments;
}

function formatMinute(minuteOfDay) {
  if (minuteOfDay >= 1440) {
    return "24:00";
  }

  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function assignLanes(items) {
  items.sort((a, b) => {
    const aStart = a.segmentStart ?? a.startMinute;
    const bStart = b.segmentStart ?? b.startMinute;
    const aEnd = a.segmentEnd ?? a.endMinute;
    const bEnd = b.segmentEnd ?? b.endMinute;
    return aStart - bStart || bEnd - aEnd;
  });

  const laneEnds = [];

  for (const item of items) {
    const start = item.segmentStart ?? item.startMinute;
    const end = item.segmentEnd ?? item.endMinute;
    let lane = laneEnds.findIndex(endMinute => endMinute <= start);
    if (lane === -1) {
      lane = laneEnds.length;
    }

    laneEnds[lane] = end;
    item.lane = lane;
  }

  const laneCount = Math.max(1, laneEnds.length);
  for (const item of items) {
    item.laneCount = laneCount;
  }
}

function createHalfTrack(halfStart, halfEnd) {
  const track = document.createElement("div");
  track.className = "half-track";
  track.dataset.halfStart = String(halfStart);
  track.dataset.halfEnd = String(halfEnd);
  const middle = halfStart + (halfEnd - halfStart) / 2;

  for (const marker of [
    { text: formatMinute(halfStart), top: 0, edge: "start" },
    { text: formatMinute(middle), top: 50, edge: "middle" },
    { text: formatMinute(halfEnd), top: 100, edge: "end" }
  ]) {
    const markerEl = document.createElement("span");
    markerEl.className = "half-label";
    markerEl.dataset.edge = marker.edge;
    markerEl.textContent = marker.text;
    markerEl.style.top = `${marker.top}%`;
    track.appendChild(markerEl);
  }

  return track;
}

function getVisibleStart(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const offset = (first.getDay() - state.settings.weekStartsOn + 7) % 7;
  return addDays(first, -offset);
}

function isFourWeekView() {
  return state.settings.periodMode === "four-weeks";
}

function isDayView() {
  return state.settings.periodMode === "day";
}

function isWeekView() {
  return state.settings.periodMode === "week";
}

function isMonthView() {
  return state.settings.periodMode === "month";
}

function startOfConfiguredWeek(date) {
  const day = startOfDay(date);
  const offset = (day.getDay() - state.settings.weekStartsOn + 7) % 7;
  return addDays(day, -offset);
}

function getDisplayStart() {
  if (isDayView()) {
    return startOfDay(state.currentDate);
  }
  if (isWeekView()) {
    return startOfConfiguredWeek(state.currentDate);
  }
  if (isFourWeekView()) {
    return startOfConfiguredWeek(state.currentDate);
  }

  return getVisibleStart(state.currentDate.getFullYear(), state.currentDate.getMonth());
}

function monthWeekStarts() {
  if (isDayView()) {
    return [startOfDay(state.currentDate)];
  }
  if (isWeekView()) {
    return [startOfConfiguredWeek(state.currentDate)];
  }
  if (isFourWeekView()) {
    const start = getDisplayStart();
    return Array.from({ length: 4 }, (_, index) => addDays(start, index * 7));
  }

  const year = state.currentDate.getFullYear();
  const monthIndex = state.currentDate.getMonth();
  const firstWeek = getVisibleStart(year, monthIndex);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const lastWeek = startOfConfiguredWeek(lastDay);
  const starts = [];

  for (let week = firstWeek; week <= lastWeek; week = addDays(week, 7)) {
    starts.push(week);
  }
  return starts;
}

function monthDatesInWeek(weekStart, monthIndex) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).filter(
    date => date.getMonth() === monthIndex
  );
}

function getMonthDisplayPlan() {
  const weekStarts = monthWeekStarts();
  if (!isMonthView()) {
    return {
      mainWeekStarts: weekStarts,
      leadingDates: [],
      trailingDates: [],
      totalWeekCount: weekStarts.length
    };
  }

  const monthIndex = state.currentDate.getMonth();
  const firstDates = monthDatesInWeek(weekStarts[0], monthIndex);
  const lastDates = monthDatesInWeek(weekStarts[weekStarts.length - 1], monthIndex);
  const compactLeading = firstDates.length <= 2;
  const compactTrailing = lastDates.length <= 2 && weekStarts.length > 1;
  const firstMainIndex = compactLeading ? 1 : 0;
  const lastMainIndex = compactTrailing ? weekStarts.length - 1 : weekStarts.length;

  return {
    mainWeekStarts: weekStarts.slice(firstMainIndex, lastMainIndex),
    leadingDates: compactLeading ? firstDates : [],
    trailingDates: compactTrailing ? lastDates : [],
    totalWeekCount: weekStarts.length
  };
}

function getDisplayRange() {
  if (isDayView()) {
    const start = startOfDay(state.currentDate);
    return { start, end: addDays(start, 1) };
  }
  if (isWeekView()) {
    const start = startOfConfiguredWeek(state.currentDate);
    return { start, end: addDays(start, 7) };
  }
  const starts = monthWeekStarts();
  const start = starts[0];
  return {
    start,
    end: addDays(starts[starts.length - 1], 7)
  };
}

function getDisplayTitle() {
  if (isDayView()) {
    return longDateFormatter.format(state.currentDate);
  }
  if (isMonthView()) {
    return monthFormatter.format(state.currentDate);
  }

  const range = getDisplayRange();
  return periodFormatter.formatRange(range.start, addDays(range.end, -1));
}

function dataRequestsForCurrentView() {
  const range = getDisplayRange();
  const lastDay = addDays(range.end, -1);
  const requests = [];
  for (
    let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    cursor <= lastDay;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    requests.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
  }
  return requests;
}

function isoWeekNumber(date) {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + 3 - ((copy.getDay() + 6) % 7));
  const weekOne = new Date(copy.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((copy - weekOne) / 86400000 - 3 + ((weekOne.getDay() + 6) % 7)) / 7
    )
  );
}

function renderLegend(data) {
  legend.replaceChildren();

  if (!data.calendars.length) {
    legend.textContent = "";
    return;
  }

  for (const calendar of data.calendars) {
    const item = document.createElement("span");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.setProperty("--calendar-color", calendar.color);
    const label = document.createElement("span");
    label.textContent = calendar.name;
    item.append(swatch, label);
    legend.appendChild(item);
  }
}

function setDialogStatus(message, isError = false) {
  dialogStatus.textContent = message || "";
  dialogStatus.classList.toggle("error-text", isError);
}

function formatDiagnostics(diagnostics) {
  const lines = [];
  lines.push(`Zeit: ${diagnostics.generatedAt || new Date().toISOString()}`);
  lines.push(`Bridge-API: ${diagnostics.bridgeApi || "unbekannt"}`);
  if (diagnostics.implementationVersion || diagnostics.bridgeStatus?.implementationVersion) {
    lines.push(
      `Bridge-Version: ${
        diagnostics.implementationVersion || diagnostics.bridgeStatus.implementationVersion
      }`
    );
  }
  if (diagnostics.bridgeStatus) {
    lines.push(
      `Bridge-Selbsttest: ${diagnostics.bridgeStatus.ok ? "ok" : "fehlgeschlagen"}${
        diagnostics.bridgeStatus.message ? ` (${diagnostics.bridgeStatus.message})` : ""
      }`
    );
  }
  if (
    "hourGridBridgeAvailable" in diagnostics ||
    "calendarBridgeAvailable" in diagnostics ||
    "calendarCustomizerAvailable" in diagnostics
  ) {
    lines.push(
      `API verfuegbar: hourGridBridge=${Boolean(
        diagnostics.hourGridBridgeAvailable
      )}, calendarBridge=${Boolean(
        diagnostics.calendarBridgeAvailable
      )}, calendarCustomizer=${Boolean(diagnostics.calendarCustomizerAvailable)}`
    );
  }
  lines.push(`Registry: ${diagnostics.registryBranch || "calendar.registry."}`);
  lines.push(`Registry-Prefs: ${diagnostics.prefChildCount ?? 0}`);
  lines.push(`Registry-IDs: ${(diagnostics.registryIds || []).length}`);
  lines.push(`Kalender aus Registry: ${(diagnostics.registryCalendars || []).length}`);
  lines.push(`Kalender aus cal.manager: ${(diagnostics.managerCalendars || []).length}`);

  const visibleView = diagnostics.visibleView || {};
  lines.push(
    `Sichtbare Kalenderansicht: Dokumente ${visibleView.documentCount ?? 0}, Tage ${
      visibleView.dayBoxCount ?? 0
    }, Terminelemente ${visibleView.itemElementCount ?? 0}`
  );

  if ((diagnostics.steps || []).length) {
    lines.push("");
    lines.push("Diagnose-Schritte:");
    for (const step of diagnostics.steps) {
      lines.push(
        `- ${step.ok ? "OK" : "FEHLER"}: ${step.step || "Schritt"}${
          step.message ? ` (${step.message})` : ""
        }`
      );
    }
  }

  lines.push("");
  lines.push("Profil-Dateien:");
  for (const file of diagnostics.files || []) {
    lines.push(
      `- ${file.label}: ${file.exists ? "gefunden" : "fehlt"}${
        file.size ? `, ${file.size} Bytes` : ""
      } ${file.path || ""}${file.error ? ` (${file.error})` : ""}`
    );
  }

  lines.push("");
  lines.push("Kalender:");
  const calendars = mergeCalendarLists(
    diagnostics.registryCalendars || [],
    diagnostics.managerCalendars || []
  );
  if (!calendars.length) {
    lines.push("- keine Kalender gefunden");
  }
  for (const calendar of calendars) {
    lines.push(
      `- ${calendar.name || "(Ohne Namen)"} | id=${calendar.id || ""} | type=${
        calendar.type || ""
      } | visible=${calendar.visible !== false} | uri=${calendar.uri || calendar.url || ""}`
    );
  }

  if ((diagnostics.errors || []).length) {
    lines.push("");
    lines.push("Fehler:");
    for (const error of diagnostics.errors) {
      lines.push(`- ${error.step || "Schritt"}: ${error.message || "Unbekannter Fehler"}`);
    }
  }

  lines.push("");
  lines.push("Rohdaten:");
  lines.push(JSON.stringify(diagnostics, null, 2));
  return lines.join("\n");
}

function mergeCalendarLists(...calendarGroups) {
  const merged = [];
  const seen = new Set();
  for (const group of calendarGroups) {
    for (const calendar of group || []) {
      const key = calendarKey(calendar) || calendar.uri || calendar.url || calendar.name;
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(calendar);
    }
  }
  return merged;
}

async function openDiagnoseDialog() {
  diagnoseOutput.textContent = "Diagnose wird geladen...";
  diagnoseBackdrop.hidden = false;
  try {
    const diagnostics = await tb.runtime.sendMessage({ type: "diagnoseCalendars" });
    diagnoseOutput.textContent = formatDiagnostics(diagnostics || {});
  } catch (error) {
    diagnoseOutput.textContent = `Diagnose fehlgeschlagen: ${error.message || error}`;
  }
}

function closeDiagnoseDialogView() {
  diagnoseBackdrop.hidden = true;
}

function openCalendarDialog() {
  calendarDialog.reset();
  calendarColorInput.value = DEFAULT_EXTERNAL_COLORS[state.externalCalendars.length % DEFAULT_EXTERNAL_COLORS.length];
  thunderbirdCalendarList.replaceChildren();
  setDialogStatus("");
  dialogBackdrop.hidden = false;
  calendarNameInput.focus();
}

async function openCalendarCreation() {
  try {
    await tb.runtime.sendMessage({ type: "openCalendarWizard" });
    state.refreshAfterEditor = true;
    showActionToast(t("calendarWizardOpened"));
  } catch (error) {
    console.warn("Kalender: Thunderbird-Assistent nicht verfuegbar.", error);
    openCalendarDialog();
    setDialogStatus(
      `Der Thunderbird-Assistent konnte nicht geoeffnet werden. Du kannst diesen Kalender stattdessen hier als iCal-Kalender hinzufuegen. (${error?.message || error})`,
      true
    );
  }
}

async function openCalendarManagement() {
  settingsPanel.hidden = true;
  settingsToggle.setAttribute("aria-expanded", "false");
  try {
    await tb.runtime.sendMessage({ type: "openCalendarManager" });
  } catch (error) {
    showEditorError(
      `Kalenderverwaltung konnte nicht geoeffnet werden: ${
        error?.message || String(error || "Unbekannter Fehler")
      }`
    );
  }
}

function closeCalendarDialogView() {
  dialogBackdrop.hidden = true;
  setDialogStatus("");
}

async function addExternalCalendar(calendar) {
  const normalized = normalizeExternalCalendar(calendar, state.externalCalendars.length);
  state.externalCalendars = [
    ...state.externalCalendars.filter(existing => existing.id !== normalized.id),
    normalized
  ];
  await saveExternalCalendars();
  await loadMonth();
}

async function removeExternalCalendar(calendarId) {
  state.externalCalendars = state.externalCalendars.filter(calendar => calendar.id !== calendarId);
  state.settings.hiddenCalendarIds = state.settings.hiddenCalendarIds.filter(
    id => id !== `${EXTERNAL_SOURCE_PREFIX}${calendarId}`
  );
  await saveSettings();
  await saveExternalCalendars();
  await loadMonth();
}

async function addUrlCalendar(event) {
  event.preventDefault();
  const url = normalizeCalendarUrl(calendarUrlInput.value);
  if (!url) {
    setDialogStatus("Bitte eine iCal- oder Webcal-Adresse eintragen.", true);
    return;
  }

  let fallbackName = "Webcal";
  try {
    fallbackName = new URL(url).hostname || fallbackName;
  } catch (error) {
    setDialogStatus("Die Adresse ist keine gueltige URL.", true);
    return;
  }

  const calendar = normalizeExternalCalendar({
    id: makeId("external"),
    name: safeCalendarName(calendarNameInput.value, fallbackName),
    color: calendarColorInput.value,
    sourceType: "url",
    url
  });

  setDialogStatus("Kalender wird getestet...");
  try {
    const text = await calendarText(calendar);
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth() + 1;
    parseIcsEvents(text, calendar, monthRange(year, month, state.settings.weekStartsOn));
    await addExternalCalendar(calendar);
    closeCalendarDialogView();
  } catch (error) {
    setDialogStatus(`Kalender konnte nicht geladen werden: ${error.message || error}`, true);
  }
}

async function importIcsFile(file) {
  if (!file) {
    return;
  }

  setDialogStatus("ICS-Datei wird importiert...");
  try {
    const text = await file.text();
    const calendar = normalizeExternalCalendar({
      id: makeId("external"),
      name: safeCalendarName(calendarNameInput.value, file.name.replace(/\.ics$/i, "")),
      color: calendarColorInput.value,
      sourceType: "file",
      icsText: text
    });
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth() + 1;
    parseIcsEvents(text, calendar, monthRange(year, month, state.settings.weekStartsOn));
    await addExternalCalendar(calendar);
    closeCalendarDialogView();
  } catch (error) {
    setDialogStatus(`ICS-Datei konnte nicht importiert werden: ${error.message || error}`, true);
  } finally {
    calendarFileInput.value = "";
  }
}

function canImportThunderbirdCalendar(calendar) {
  const uri = normalizeCalendarUrl(calendar.url || calendar.uri || "");
  return /^https?:\/\//i.test(uri) && !/\/dav\/|\/caldav\/|\/principals\//i.test(uri);
}

function importHint(calendar) {
  const uri = String(calendar.url || calendar.uri || "");
  if (!uri) {
    return "Keine Adresse in Thunderbird gespeichert.";
  }
  if (/^moz-storage-calendar:/i.test(uri)) {
    return "Lokaler Thunderbird-Kalender; bitte als ICS exportieren und hier importieren.";
  }
  if (/\/dav\/|\/caldav\/|\/principals\//i.test(uri)) {
    return "CalDAV-Kalender; eine direkte ICS-/Webcal-Adresse oder ICS-Export ist noetig.";
  }
  if (!/^https?:\/\//i.test(normalizeCalendarUrl(uri))) {
    return "Dieser Kalendertyp kann nicht direkt als ICS geladen werden.";
  }
  return "Dieser Kalender kann uebernommen werden.";
}

async function detectThunderbirdCalendars() {
  thunderbirdCalendarList.replaceChildren();
  setDialogStatus("Thunderbird-Kalender werden gesucht...");

  try {
    const calendars = await tb.runtime.sendMessage({ type: "listCalendars" });
    if (!Array.isArray(calendars) || !calendars.length) {
      const diagnostics = await tb.runtime.sendMessage({ type: "diagnoseCalendars" });
      setDialogStatus(
        `Thunderbird hat keine Kalender gemeldet. Diagnose: Registry ${
          diagnostics?.registryCalendars?.length || 0
        }, cal.manager ${diagnostics?.managerCalendars?.length || 0}.`,
        true
      );
      return;
    }

    const importableCount = calendars.filter(canImportThunderbirdCalendar).length;
    setDialogStatus(
      `${calendars.length} Thunderbird-Kalender gefunden, ${importableCount} direkt uebernehmbar.`
    );
    for (const calendar of calendars) {
      const row = document.createElement("div");
      row.className = "detected-calendar";

      const swatch = document.createElement("span");
      swatch.className = "calendar-swatch";
      swatch.style.setProperty("--calendar-color", calendar.color || DEFAULT_SETTINGS.accentColor);

      const name = document.createElement("span");
      name.className = "detected-calendar-name";
      name.textContent = calendar.name || "(Ohne Namen)";
      name.title = calendar.url || calendar.uri || name.textContent;

      const button = document.createElement("button");
      button.type = "button";
      if (canImportThunderbirdCalendar(calendar)) {
        button.textContent = "Uebernehmen";
        button.addEventListener("click", async () => {
          calendarNameInput.value = calendar.name || "";
          calendarColorInput.value = sanitizeColor(calendar.color);
          calendarUrlInput.value = normalizeCalendarUrl(calendar.url || calendar.uri);
          await addUrlCalendar(new Event("submit"));
        });
      } else {
        button.textContent = "Nicht direkt";
        button.disabled = true;
        button.title = importHint(calendar);
      }

      row.append(swatch, name, button);
      thunderbirdCalendarList.appendChild(row);
    }
  } catch (error) {
    setDialogStatus(`Thunderbird-Import nicht verfuegbar: ${error.message || error}`, true);
  }
}

function makeEyeToggle(hidden, title, onClick) {
  const toggle = document.createElement("button");
  toggle.className = "calendar-toggle";
  toggle.classList.toggle("is-hidden", hidden);
  toggle.type = "button";
  toggle.title = title;
  toggle.setAttribute("aria-label", title);
  toggle.setAttribute("aria-pressed", String(!hidden));
  const icon = document.createElement("span");
  icon.className = "eye-icon";
  toggle.appendChild(icon);
  toggle.addEventListener("click", onClick);
  return toggle;
}

async function setCalendarTypeEnabled(typeId, enabled) {
  state.settings.calendarTypes = getCalendarTypes().map(type =>
    type.id === typeId ? { ...type, enabled } : type
  );
  await saveSettings();
  renderMonth();
}

async function setPersonWorkCalendarEnabled(typeId, enabled) {
  state.settings.calendarTypes = getCalendarTypes().map(type =>
    type.id === typeId ? { ...type, workCalendarEnabled: enabled } : type
  );
  await saveSettings();
  renderMonth();
}

function renderCalendarEntry(calendar) {
  const id = calendarKey(calendar);
  const isIndividuallyHidden = !isCalendarIndividuallyVisible(calendar);
  const isPersonHidden = !isCalendarTypeEnabled(calendar);
  const entry = document.createElement("div");
  entry.className = "calendar-entry";
  entry.classList.toggle("hidden-calendar", isIndividuallyHidden || isPersonHidden);
  entry.draggable = true;
  entry.dataset.calendarId = id;
  entry.style.setProperty(
    "--calendar-color",
    sanitizeColor(calendar.color, DEFAULT_SETTINGS.accentColor)
  );

  const swatch = document.createElement("span");
  swatch.className = "calendar-swatch";
  swatch.style.setProperty("--calendar-color", calendar.color || DEFAULT_SETTINGS.accentColor);

  const name = document.createElement("span");
  name.className = "calendar-name";
  name.textContent = calendar.name || "(Ohne Namen)";
  name.title = name.textContent;

  const ownerBadges = document.createElement("span");
  ownerBadges.className = "calendar-owner-badges";
  const owners = personTypesFor(calendar);
  ownerBadges.title = owners.map(person => person.name).join(", ");
  for (const person of owners) {
    const badge = document.createElement("span");
    badge.className = "calendar-owner-badge";
    badge.textContent = personInitial(person);
    badge.style.background = sanitizeColor(person.color, DEFAULT_SETTINGS.accentColor);
    badge.title = person.name;
    badge.setAttribute("aria-label", person.name);
    ownerBadges.appendChild(badge);
  }

  const toggle = makeEyeToggle(
    isIndividuallyHidden,
    isIndividuallyHidden ? "Kalender anzeigen" : "Kalender ausblenden",
    async pointerEvent => {
      pointerEvent.stopPropagation();
      const overrides = { ...getCalendarVisibilityOverrides() };
      overrides[id] = isIndividuallyHidden;
      state.settings.calendarVisibilityOverrides = overrides;
      state.settings.hiddenCalendarIds = Object.keys(overrides).filter(
        key => overrides[key] === false
      );
      await saveSettings();
      renderMonth();
    }
  );

  const people = document.createElement("button");
  people.className = "calendar-people";
  people.type = "button";
  people.textContent = "◌";
  people.title = "Personen und Arbeitszeiten dieses Kalenders";
  people.setAttribute("aria-label", `${name.textContent} Personen verwalten`);
  people.addEventListener("click", pointerEvent => {
    pointerEvent.stopPropagation();
    openCalendarPeopleDialog(calendar);
  });

  const remove = document.createElement("button");
  remove.className = "calendar-remove";
  remove.type = "button";
  remove.textContent = "×";
  remove.title = "Aus dieser Ansicht entfernen";
  remove.setAttribute("aria-label", `${name.textContent} aus dieser Ansicht entfernen`);
  remove.addEventListener("click", async pointerEvent => {
    pointerEvent.stopPropagation();
    await removeCalendarFromView(id, name.textContent);
  });

  entry.addEventListener("dragstart", dragEvent => {
    if (dragEvent.target.closest("button")) {
      dragEvent.preventDefault();
      return;
    }
    dragEvent.stopPropagation();
    state.sidebarDrag = { kind: "calendar", id };
    dragEvent.dataTransfer.effectAllowed = "move";
    dragEvent.dataTransfer.setData("text/plain", id);
    entry.classList.add("dragging");
  });
  entry.addEventListener("dragend", () => {
    state.sidebarDrag = null;
    entry.classList.remove("dragging");
    document.querySelectorAll(".type-drop-target").forEach(target =>
      target.classList.remove("type-drop-target")
    );
  });

  entry.addEventListener("dragover", dragEvent => {
    if (!state.draggedEvent || state.settings.dragCalendarMove === false) {
      return;
    }
    dragEvent.preventDefault();
    dragEvent.stopPropagation();
    dragEvent.dataTransfer.dropEffect = "move";
    previewCalendarTarget(calendar, entry);
  });

  entry.addEventListener("dragleave", dragEvent => {
    if (!entry.contains(dragEvent.relatedTarget)) {
      entry.classList.remove("calendar-drop-target");
      if (state.sidebarCalendarDropId === id && state.draggedEvent) {
        state.sidebarCalendarDropId = "";
        state.draggedElement?.style.setProperty(
          "--event-color",
          eventDisplayColor(state.draggedEvent)
        );
      }
    }
  });

  entry.addEventListener("drop", async dragEvent => {
    if (!state.draggedEvent || state.settings.dragCalendarMove === false) {
      return;
    }
    dragEvent.preventDefault();
    dragEvent.stopPropagation();
    const event = state.draggedEvent;
    resetDraggedEventPresentation();
    state.draggedEvent = null;
    await moveEventToCalendar(event, id);
  });

  entry.append(swatch, name, ownerBadges, people, toggle, remove);
  return entry;
}

async function assignCalendarType(calendarId, typeId) {
  const type = calendarTypeById(typeId);
  if (type?.kind === "person") {
    state.settings.calendarPersonAssignments = {
      ...(state.settings.calendarPersonAssignments || {}),
      [calendarId]: [type.id]
    };
    await saveSettings();
    renderMonth();
    return;
  }
  const assignments = { ...(state.settings.calendarTypeAssignments || {}) };
  if (typeId) {
    assignments[calendarId] = typeId;
  } else {
    delete assignments[calendarId];
  }
  state.settings.calendarTypeAssignments = assignments;
  await saveSettings();
  renderMonth();
}

async function reorderCalendarType(draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) {
    return;
  }

  const types = [...getCalendarTypes()];
  const fromIndex = types.findIndex(type => type.id === draggedId);
  const targetIndex = types.findIndex(type => type.id === targetId);
  if (fromIndex < 0 || targetIndex < 0) {
    return;
  }
  const [dragged] = types.splice(fromIndex, 1);
  types.splice(targetIndex, 0, dragged);
  state.settings.calendarTypes = types;
  await saveSettings();
  renderMonth();
}

function renderCalendarTypeGroup(type, calendars) {
  const typeId = type?.id || "";
  const isCollapsed = isCalendarTypeCollapsed(typeId);
  const group = document.createElement("section");
  group.className = "calendar-type-group";
  group.classList.toggle("disabled-type", type && type.enabled === false);
  group.classList.toggle("collapsed-group", isCollapsed);
  group.dataset.typeId = typeId;
  group.draggable = Boolean(type);

  const header = document.createElement("header");
  header.className = "calendar-type-header";
  const collapse = document.createElement("button");
  collapse.className = "calendar-type-collapse";
  collapse.type = "button";
  collapse.textContent = "›";
  collapse.title = isCollapsed ? "Gruppe aufklappen" : "Gruppe zusammenklappen";
  collapse.setAttribute("aria-expanded", String(!isCollapsed));
  collapse.addEventListener("click", async pointerEvent => {
    pointerEvent.stopPropagation();
    await toggleCalendarTypeCollapsed(typeId);
  });
  const icon = document.createElement("span");
  icon.className = "calendar-type-icon";
  icon.textContent = type?.icon || "○";
  icon.style.setProperty("--type-color", type?.color || "currentColor");
  const name = document.createElement("span");
  name.className = "calendar-type-name";
  name.textContent = type?.name || "Nicht zugeordnet";

  const actions = document.createElement("span");
  actions.className = "calendar-type-actions";
  if (type) {
    const toggle = makeEyeToggle(
      type.enabled === false,
      type.enabled === false ? "Kalendertyp anzeigen" : "Kalendertyp ausblenden",
      async pointerEvent => {
        pointerEvent.stopPropagation();
        await setCalendarTypeEnabled(type.id, type.enabled === false);
      }
    );
    const edit = document.createElement("button");
    edit.className = "type-edit";
    edit.type = "button";
    edit.textContent = "…";
    edit.title = "Kalendertyp bearbeiten";
    edit.addEventListener("click", pointerEvent => {
      pointerEvent.stopPropagation();
      openCalendarTypeDialog(type);
    });
    actions.append(toggle, edit);
  }

  const body = document.createElement("div");
  body.className = "calendar-type-calendars";
  body.hidden = isCollapsed;
  if (!calendars.length) {
    const empty = document.createElement("div");
    empty.className = "calendar-type-empty";
    empty.textContent = "Keine Kalender";
    body.appendChild(empty);
  } else {
    for (const calendar of calendars) {
      body.appendChild(renderCalendarEntry(calendar));
    }
  }

  header.append(collapse, icon, name, actions);
  group.append(header, body);

  if (type) {
    group.addEventListener("dragstart", dragEvent => {
      if (dragEvent.target.closest(".calendar-entry, button")) {
        dragEvent.preventDefault();
        return;
      }
      state.sidebarDrag = { kind: "type", id: type.id };
      dragEvent.dataTransfer.effectAllowed = "move";
      dragEvent.dataTransfer.setData("text/plain", type.id);
      group.classList.add("dragging");
    });
    group.addEventListener("dragend", () => {
      state.sidebarDrag = null;
      group.classList.remove("dragging");
    });
  }

  group.addEventListener("dragover", dragEvent => {
    if (!state.sidebarDrag) {
      return;
    }
    dragEvent.preventDefault();
    dragEvent.dataTransfer.dropEffect = "move";
    group.classList.add("type-drop-target");
  });
  group.addEventListener("dragleave", dragEvent => {
    if (!group.contains(dragEvent.relatedTarget)) {
      group.classList.remove("type-drop-target");
    }
  });
  group.addEventListener("drop", async dragEvent => {
    if (!state.sidebarDrag) {
      return;
    }
    dragEvent.preventDefault();
    dragEvent.stopPropagation();
    group.classList.remove("type-drop-target");
    const dragged = state.sidebarDrag;
    state.sidebarDrag = null;
    if (dragged.kind === "calendar") {
      await assignCalendarType(dragged.id, type?.id || "");
    } else if (dragged.kind === "type" && type) {
      await reorderCalendarType(dragged.id, type.id);
    }
  });

  return group;
}

function renderCalendarSidebar(data) {
  calendarList.replaceChildren();

  if (!data) {
    const empty = document.createElement("div");
    empty.className = "calendar-empty";
    empty.textContent = "Kalender werden geladen...";
    calendarList.appendChild(empty);
    appendCalendarPeoplePanel();
    return;
  }

  const availableCalendars = data.calendars.filter(calendar => !isCalendarRemoved(calendar));
  if (!availableCalendars.length) {
    const empty = document.createElement("div");
    empty.className = "calendar-empty";
    empty.textContent = data.calendars.length
      ? "Alle Kalender wurden aus dieser Ansicht entfernt"
      : "Keine Kalender gefunden";
    calendarList.appendChild(empty);
    appendCalendarPeoplePanel();
    return;
  }

  // Categories form the primary calendar hierarchy. People are intentionally
  // separate: a shared calendar can belong to several people without being
  // duplicated in the normal category list.
  for (const type of getCalendarTypes().filter(entry => entry.kind === "category")) {
    const calendars = availableCalendars.filter(calendar =>
      categoryTypeFor(calendar)?.id === type.id
    );
    calendarList.appendChild(renderCalendarTypeGroup(type, calendars));
  }
  appendCalendarPeoplePanel();
}

function appendCalendarPeoplePanel() {
  renderCalendarPeopleSidebar();
  calendarList.appendChild(calendarPeoplePanel);
}

function renderCalendarPeopleSidebar() {
  calendarPeopleList.replaceChildren();
  calendarPeoplePanel.open = Boolean(state.settings.peoplePanelOpen);
  if (document.activeElement !== calendarPeopleSearch) calendarPeopleSearch.value = state.settings.peopleSearch || "";
  const people = personTypes().sort(
    (left, right) => personRelationshipSort(left) - personRelationshipSort(right) || left.name.localeCompare(right.name, UI_LOCALE)
  );
  calendarPeoplePanel.hidden = people.length === 0;
  calendarPeopleCount.textContent = String(people.length);
  settingsPeopleList.replaceChildren();
  for (const person of people) {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = `${person.name} · ${personRelationshipLabel(person)}`;
    edit.addEventListener("click", () => openCalendarTypeDialog(person));
    settingsPeopleList.appendChild(edit);
  }

  for (const person of people) {
    if (state.settings.peopleSearch && !person.name.toLocaleLowerCase(UI_LOCALE).includes(state.settings.peopleSearch.toLocaleLowerCase(UI_LOCALE))) continue;
    const row = document.createElement("div");
    row.className = "calendar-person-row";
    row.classList.toggle("disabled-person", person.enabled === false);

    const symbol = document.createElement("span");
    symbol.className = "calendar-person-symbol";
    symbol.textContent = personInitial(person);
    symbol.style.background = sanitizeColor(person.color, DEFAULT_SETTINGS.accentColor);
    symbol.title = person.name;

    const name = document.createElement("span");
    name.className = "calendar-person-name";
    const title = document.createElement("strong");
    title.textContent = person.name;
    const schedule = document.createElement("span");
    schedule.textContent = `${personRelationshipLabel(person)} · ${workScheduleSummary(person)}`;
    name.append(title, schedule);

    const actions = document.createElement("span");
    actions.className = "calendar-person-actions";
    actions.append(
      makeEyeToggle(
        person.enabled === false,
        person.enabled === false ? `${person.name} in Normalansicht anzeigen` : `${person.name} in Normalansicht ausblenden`,
        async pointerEvent => {
          pointerEvent.stopPropagation();
          await setCalendarTypeEnabled(person.id, person.enabled === false);
        }
      )
    );
    const edit = document.createElement("button");
    edit.className = "type-edit";
    edit.type = "button";
    edit.textContent = "…";
    edit.title = `${person.name} bearbeiten`;
    edit.addEventListener("click", pointerEvent => {
      pointerEvent.stopPropagation();
      openCalendarTypeDialog(person);
    });
    actions.appendChild(edit);

    const workCalendar = document.createElement("div");
    workCalendar.className = "calendar-person-work-calendar";
    workCalendar.hidden = activeViewProfile().effect !== "work";
    const workMarker = document.createElement("span");
    workMarker.className = "calendar-swatch";
    workMarker.style.setProperty("--calendar-color", person.color);
    const workText = document.createElement("span");
    workText.textContent = `Arbeitszeit · ${workScheduleSummary(person)}`;
    workText.title = `${person.name}: ${workScheduleSummary(person)}`;
    const workToggle = makeEyeToggle(
      person.workCalendarEnabled === false,
      person.workCalendarEnabled === false
        ? `${person.name} Arbeitszeit anzeigen`
        : `${person.name} Arbeitszeit ausblenden`,
      async pointerEvent => {
        pointerEvent.stopPropagation();
        await setPersonWorkCalendarEnabled(person.id, person.workCalendarEnabled === false);
      }
    );
    workCalendar.append(workMarker, workText, workToggle);

    row.append(symbol, name, actions, workCalendar);
    calendarPeopleList.appendChild(row);
  }
}

function openCalendarTypeDialog(type = null) {
  calendarTypeDialog.reset();
  calendarTypeId.value = type?.id || "";
  const holidayButton = document.getElementById("calendar-type-holiday-region");
  holidayButton.disabled = !type;
  holidayButton.textContent = type ? "Region wählen oder ändern …" : "Person zuerst speichern";
  holidayButton.onclick = () => { if (type) openHolidayRegionDialog(type); };
  calendarTypeName.value = type?.name || "";
  calendarTypeIcon.value = type?.icon || "●";
  const relationship = normalizePersonRelationship(type?.relationship, "other");
  calendarTypeColor.value = sanitizeColor(type?.color, defaultPersonColor(relationship));
  calendarTypeColor.dataset.relationshipDefault = type ? "false" : "true";
  calendarTypeKind.value = type?.kind || "person";
  calendarTypeRelationship.value = relationship;
  calendarTypeRelationship.disabled = type?.id === "own";
  calendarTypeKind.disabled = Boolean(type?.builtIn);
  calendarTypeDisplayMode.value = type?.displayMode || "normal";
  calendarTypeWorkStart.value = String(type?.workStartHour ?? 8);
  calendarTypeWorkEnd.value = String(type?.workEndHour ?? 17);
  renderCalendarTypeWeekdayOptions(type);
  syncCalendarTypeDialogFields();
  calendarTypeDialogTitle.textContent = type
    ? t("calendarTypeDialogEdit")
    : t("calendarTypeDialogNew");
  deleteCalendarType.hidden = !type || type.builtIn;
  calendarTypeDialogBackdrop.hidden = false;
  calendarTypeName.focus();
}

async function openHolidayRegionDialog(person) {
  const existingCalendar = state.externalCalendars.find(calendar => calendar.id === `holidays-${person.id}`);
  const existingRegion = existingCalendar?.url ? new URL(existingCalendar.url).searchParams : new URLSearchParams();
  const dialog = document.createElement("dialog");
  dialog.className = "holiday-region-dialog";
  const title = document.createElement("h3");
  title.textContent = `Feiertagsregion · ${person.name}`;
  const description = document.createElement("p");
  description.textContent = "Feiertagsdaten: OpenHolidays API (ODbL). Es werden nur Region und Zeitraum übermittelt.";
  const attribution = document.createElement("a");
  attribution.href = "https://www.openholidaysapi.org/de/faq/";
  attribution.textContent = "Datenquelle und ODbL-Lizenz";
  attribution.target = "_blank";
  attribution.rel = "noopener noreferrer";
  const country = document.createElement("select");
  country.setAttribute("aria-label", "Land");
  const query = document.createElement("input");
  query.type = "search";
  query.placeholder = "Region suchen …";
  query.setAttribute("aria-label", "Region suchen");
  const region = document.createElement("select");
  region.setAttribute("aria-label", "Feiertagsregion");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const save = document.createElement("button");
  save.textContent = "Feiertagskalender hinzufügen";
  save.disabled = true;
  const remove = document.createElement("button");
  remove.textContent = "Feiertagsregion entfernen";
  const cancel = document.createElement("button");
  cancel.textContent = "Schließen";
  cancel.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.append(title, description, attribution, country, query, region, status, save, remove, cancel);
  document.body.append(dialog);
  dialog.showModal();
  const label = entry => (entry.name || []).find(item => item.language === "DE")?.text || entry.name?.[0]?.text || entry.code || entry.isoCode;
  const request = async path => {
    const response = await fetch(`https://openholidaysapi.org/${path}`, {
      credentials: "omit", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`OpenHolidays antwortet mit HTTP ${response.status}`);
    const result = await response.json();
    if (!Array.isArray(result)) throw new Error("Ungültige OpenHolidays-Antwort");
    return result;
  };
  let regions = [];
  const renderRegions = () => {
    const previous = region.value;
    region.replaceChildren(new Option("Landesweite Feiertage", ""));
    regions.filter(item => label(item).toLocaleLowerCase().includes(query.value.toLocaleLowerCase()))
      .forEach(item => region.add(new Option(label(item), item.code)));
    if ([...region.options].some(option => option.value === previous)) region.value = previous;
  };
  query.addEventListener("input", renderRegions);
  const loadRegions = async () => {
    const selected = country.value;
    save.disabled = true;
    status.textContent = "Regionen werden geladen …";
    try {
      const result = await request(`Subdivisions?countryIsoCode=${encodeURIComponent(selected)}`);
      if (country.value !== selected) return;
      const flatten = items => items.flatMap(item => [item, ...flatten(item.children || [])]);
      regions = flatten(result);
      renderRegions();
      status.textContent = `${regions.length} Regionen gefunden · Quelle: OpenHolidays API`;
      save.disabled = false;
    } catch (error) { status.textContent = error.message; }
  };
  country.addEventListener("change", loadRegions);
  const id = `holidays-${person.id}`;
  remove.hidden = !state.externalCalendars.some(calendar => calendar.id === id);
  remove.addEventListener("click", async () => {
    await removeExternalCalendar(id);
    dialog.close();
  });
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      const year = state.currentDate.getFullYear();
      const params = new URLSearchParams({ countryIsoCode: country.value, languageIsoCode: "DE",
        validFrom: `${year - 1}-01-01`, validTo: `${year + 1}-12-31` });
      if (region.value) params.set("subdivisionCode", region.value);
      const calendar = normalizeExternalCalendar({ id, sourceType: "url", color: person.color,
        name: `Feiertage · ${person.name} · ${region.selectedOptions[0]?.textContent || country.value}`,
        url: `https://openholidaysapi.org/PublicHolidays?${params}` });
      await calendarText(calendar);
      state.settings.calendarPersonAssignments[`${EXTERNAL_SOURCE_PREFIX}${id}`] = [person.id];
      state.settings.calendarTypeAssignments[`${EXTERNAL_SOURCE_PREFIX}${id}`] = "vacation";
      await saveSettings();
      await addExternalCalendar(calendar);
      dialog.close();
    } catch (error) { status.textContent = error.message; save.disabled = false; }
  });
  try {
    status.textContent = "Länder werden online gesucht …";
    const countries = await request("Countries");
    countries.forEach(item => country.add(new Option(label(item), item.isoCode)));
    const savedCountry = existingRegion.get("countryIsoCode") || "DE";
    country.value = countries.some(item => item.isoCode === savedCountry) ? savedCountry : countries[0]?.isoCode || "";
    await loadRegions();
    const savedRegion = existingRegion.get("subdivisionCode") || "";
    if ([...region.options].some(option => option.value === savedRegion)) region.value = savedRegion;
  } catch (error) { status.textContent = error.message; }
}

function syncCalendarTypeDialogFields() {
  const person = calendarTypeKind.value === "person";
  calendarTypeRelationshipField.hidden = !person;
  calendarTypeWorkHours.hidden = !person;
  calendarTypeWeekdayHours.hidden = !person;
  document.getElementById("calendar-type-holidays").hidden = !person;
  calendarTypeDisplayMode.closest("label").hidden = person;
  if (person) calendarTypeDisplayMode.value = "normal";
}

function renderCalendarTypeWeekdayOptions(type = null) {
  const hours = normalizeWeekdayHours(
    type?.weekdayHours,
    type?.workStartHour ?? 8,
    type?.workEndHour ?? 17
  );
  calendarTypeWeekdayOptions.replaceChildren();
  for (const day of WEEKDAYS) {
    const item = hours[String(day.value)];
    const row = document.createElement("div");
    row.className = "weekday-hour-row";
    const enabledLabel = document.createElement("label");
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.className = "weekday-hour-enabled";
    enabled.dataset.weekday = String(day.value);
    enabled.checked = item.enabled;
    const label = document.createElement("span");
    label.textContent = day.short;
    enabledLabel.append(enabled, label);
    const start = document.createElement("input");
    start.type = "number";
    start.min = "0";
    start.max = "23";
    start.value = String(item.startHour);
    start.className = "weekday-hour-start";
    start.dataset.weekday = String(day.value);
    const end = document.createElement("input");
    end.type = "number";
    end.min = "1";
    end.max = "24";
    end.value = String(item.endHour);
    end.className = "weekday-hour-end";
    end.dataset.weekday = String(day.value);
    const applyEnabledState = () => {
      start.disabled = !enabled.checked;
      end.disabled = !enabled.checked;
    };
    enabled.addEventListener("change", applyEnabledState);
    applyEnabledState();
    row.append(enabledLabel, start, end);
    calendarTypeWeekdayOptions.appendChild(row);
  }
}

function calendarTypeWeekdayHoursFromDialog() {
  const result = {};
  for (const day of WEEKDAYS) {
    const id = String(day.value);
    const enabled = calendarTypeWeekdayOptions.querySelector(`.weekday-hour-enabled[data-weekday="${id}"]`);
    const start = calendarTypeWeekdayOptions.querySelector(`.weekday-hour-start[data-weekday="${id}"]`);
    const end = calendarTypeWeekdayOptions.querySelector(`.weekday-hour-end[data-weekday="${id}"]`);
    result[id] = {
      enabled: Boolean(enabled?.checked),
      startHour: start?.value ?? calendarTypeWorkStart.value,
      endHour: end?.value ?? calendarTypeWorkEnd.value
    };
  }
  return result;
}

function closeCalendarTypeDialogView() {
  calendarTypeDialogBackdrop.hidden = true;
}

async function saveCalendarTypeDialog(pointerEvent) {
  pointerEvent.preventDefault();
  const id = calendarTypeId.value || makeId("type");
  const nextType = normalizeCalendarType({
    id,
    name: calendarTypeName.value,
    icon: calendarTypeIcon.value,
    color: calendarTypeColor.value,
    kind: calendarTypeKind.value,
    relationship: calendarTypeRelationship.value,
    workStartHour: calendarTypeWorkStart.value,
    workEndHour: calendarTypeWorkEnd.value,
    weekdayHours: calendarTypeWeekdayHoursFromDialog(),
    displayMode: calendarTypeDisplayMode.value,
    workCalendarEnabled: calendarTypeById(id)?.workCalendarEnabled !== false,
    enabled: calendarTypeById(id)?.enabled !== false,
    builtIn: calendarTypeById(id)?.builtIn
  });
  const existingIndex = getCalendarTypes().findIndex(type => type.id === id);
  if (existingIndex >= 0) {
    state.settings.calendarTypes = getCalendarTypes().map(type =>
      type.id === id ? nextType : type
    );
  } else {
    state.settings.calendarTypes = [...getCalendarTypes(), nextType];
  }
  await saveSettings();
  closeCalendarTypeDialogView();
  renderMonth();
}

async function deleteCalendarTypeFromDialog() {
  const id = calendarTypeId.value;
  const type = calendarTypeById(id);
  if (!type || type.builtIn) {
    return;
  }
  state.settings.calendarTypes = getCalendarTypes().filter(entry => entry.id !== id);
  const assignments = { ...(state.settings.calendarTypeAssignments || {}) };
  for (const [calendarId, typeId] of Object.entries(assignments)) {
    if (typeId === id) {
      delete assignments[calendarId];
    }
  }
  state.settings.calendarTypeAssignments = assignments;
  const people = { ...(state.settings.calendarPersonAssignments || {}) };
  for (const [calendarId, personIds] of Object.entries(people)) {
    const remaining = (Array.isArray(personIds) ? personIds : []).filter(personId => personId !== id);
    if (remaining.length) people[calendarId] = remaining;
    else delete people[calendarId];
  }
  state.settings.calendarPersonAssignments = people;
  await saveSettings();
  closeCalendarTypeDialogView();
  renderMonth();
}

function openCalendarPeopleDialog(calendar) {
  const calendarId = calendarKey(calendar);
  calendarPersonDialog.dataset.calendarId = calendarId;
  calendarPersonDialogCalendar.textContent = calendar.name || "(Ohne Namen)";
  const selected = new Set(personTypeIdsFor(calendar));
  calendarPersonOptions.replaceChildren();
  for (const person of personTypes()) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = person.id;
    input.checked = selected.has(person.id);
    const swatch = document.createElement("span");
    swatch.className = "calendar-swatch";
    swatch.style.setProperty("--calendar-color", person.color);
    const name = document.createElement("span");
    name.textContent = `${person.name} · ${workScheduleSummary(person)}`;
    label.append(input, swatch, name);
    calendarPersonOptions.appendChild(label);
  }
  calendarPersonDialogBackdrop.hidden = false;
}

function closeCalendarPeopleDialogView() {
  calendarPersonDialogBackdrop.hidden = true;
  calendarPersonDialog.dataset.calendarId = "";
}

async function saveCalendarPeopleDialog(event) {
  event.preventDefault();
  const calendarId = calendarPersonDialog.dataset.calendarId;
  if (!calendarId) return;
  const selected = [...calendarPersonOptions.querySelectorAll("input:checked")]
    .map(input => input.value)
    .filter(id => calendarTypeById(id)?.kind === "person");
  const assignments = { ...(state.settings.calendarPersonAssignments || {}) };
  // An empty selection deliberately falls back to "Meine Kalender".
  if (selected.length) assignments[calendarId] = selected;
  else delete assignments[calendarId];
  state.settings.calendarPersonAssignments = assignments;
  await saveSettings();
  closeCalendarPeopleDialogView();
  renderMonth();
}

function renderMessageBar(errors) {
  messageBar.replaceChildren();

  if (!errors.length) {
    messageBar.hidden = true;
    return;
  }

  const title = document.createElement("strong");
  title.textContent = "Kalenderdaten nicht vollstaendig geladen:";
  const list = document.createElement("ul");

  for (const error of errors.slice(0, 4)) {
    const item = document.createElement("li");
    const prefix = error.calendarName ? `${error.calendarName}: ` : "";
    item.textContent = `${prefix}${error.message || "Unbekannter Fehler"}`;
    list.appendChild(item);
  }

  messageBar.append(title, list);
  messageBar.hidden = false;
}

function dataSourceLabel(source) {
  switch (source) {
    case "internal":
      return "aus Kalenderdienst";
    case "visible-view":
      return "aus sichtbarer Kalenderansicht";
    case "external":
      return "aus gespeicherten Kalendern";
    case "mixed":
      return "aus Thunderbird und gespeicherten Kalendern";
    case "none":
      return "ohne Kalenderquelle";
    default:
      return "aus Kalenderdaten";
  }
}

function eventTooltip(event) {
  const lines = [];
  if (event.allDay) {
    lines.push(`Ganztags: ${event.title || "(Ohne Titel)"}`);
  } else {
    const start = event.startMinute ?? event.segmentStart;
    const end = event.endMinute ?? event.segmentEnd;
    lines.push(`${formatMinute(start)}-${formatMinute(end)} ${event.title || "(Ohne Titel)"}`);
  }

  if (event.calendarName) {
    lines.push(`Kalender: ${event.calendarName}`);
  }
  if (event.location) {
    lines.push(`Ort: ${event.location}`);
  }
  if (Array.isArray(event.categories) && event.categories.length) {
    lines.push(`Kategorien: ${event.categories.join(", ")}`);
  }
  return lines.join("\n");
}

function showEventTooltip(text, pointerEvent) {
  if (!text) {
    return;
  }

  eventTooltipEl.textContent = text;
  eventTooltipEl.hidden = false;
  positionEventTooltip(pointerEvent);
}

function positionEventTooltip(event) {
  if (eventTooltipEl.hidden || !event) {
    return;
  }

  const offset = 12;
  const tooltipRect = eventTooltipEl.getBoundingClientRect();
  let left = event.clientX + offset;
  let top = event.clientY + offset;

  if (left + tooltipRect.width > window.innerWidth - 8) {
    left = event.clientX - tooltipRect.width - offset;
  }
  if (top + tooltipRect.height > window.innerHeight - 8) {
    top = event.clientY - tooltipRect.height - offset;
  }

  eventTooltipEl.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
}

function hideEventTooltip() {
  eventTooltipEl.hidden = true;
}

function showEditorError(message) {
  renderMessageBar([
    {
      calendarName: "",
      message
    }
  ]);
}

function showActionToast(message) {
  actionToast.textContent = message;
  actionToast.hidden = false;
  clearTimeout(showActionToast.timeoutId);
  showActionToast.timeoutId = setTimeout(() => {
    actionToast.hidden = true;
  }, 4200);
}

function pushHistory(action) {
  state.history = [...state.history, action].slice(-20);
  showActionToast(`${action.label} - ${t("undoShortcut")}`);
}

async function undoLastAction() {
  const action = state.history.pop();
  if (!action) {
    showActionToast(t("nothingToUndo"));
    return;
  }
  try {
    if (action.kind === "move-time") {
      await tb.runtime.sendMessage({
        type: "moveEvent",
        eventRef: {
          ...action.eventRef,
          newStart: action.oldStart,
          newEnd: action.oldEnd
        }
      });
      await loadMonth();
    } else if (action.kind === "hide-calendar") {
      state.settings.removedCalendarIds = state.settings.removedCalendarIds.filter(
        id => id !== action.calendarId
      );
      await saveSettings();
      syncControls();
      renderMonth();
    } else if (action.kind === "move-calendar") {
      await tb.runtime.sendMessage({
        type: "moveEventToCalendar",
        eventRef: {
          ...action.movedEventRef,
          targetCalendarId: action.originalCalendarId
        }
      });
      await loadMonth();
    }
    showActionToast(t("actionUndone"));
  } catch (error) {
    state.history = [...state.history, action];
    console.error("Kalender: Rueckgaengig fehlgeschlagen.", error);
    showEditorError(
      `Aktion konnte nicht rueckgaengig gemacht werden: ${
        error?.message || String(error || "Unbekannter Fehler")
      }`
    );
  }
}

async function openEventEditor(event) {
  if (
    !event?.calendarId ||
    !event.itemId ||
    String(event.calendarId).startsWith(EXTERNAL_SOURCE_PREFIX)
  ) {
    showEditorError("Dieser Termin kann hier nur angezeigt, aber nicht direkt bearbeitet werden.");
    return;
  }

  if (event.canEdit === false) {
    showEditorError("Dieser Kalender ist schreibgeschuetzt; der Termin kann nicht bearbeitet werden.");
    return;
  }

  try {
    await tb.runtime.sendMessage({
      type: "openEventEditor",
      eventRef: {
        calendarId: event.calendarId,
        itemId: event.itemId,
        parentItemId: event.parentItemId,
        hashId: event.hashId,
        id: event.id,
        start: event.start,
        end: event.end
      }
    });
    state.refreshAfterEditor = true;
  } catch (error) {
    console.error("24h Month View: Termin konnte nicht im Thunderbird-Editor geoeffnet werden.", error);
    showEditorError(
      `Termin konnte nicht im Thunderbird-Editor geoeffnet werden: ${
        error?.message || String(error || "Unbekannter Fehler")
      }`
    );
  }
}

function canMoveEvent(event) {
  return Boolean(
    event?.calendarId &&
      event?.itemId &&
      event.canEdit !== false &&
      !String(event.calendarId).startsWith(EXTERNAL_SOURCE_PREFIX)
  );
}

async function duplicateEvent(event) {
  if (!canMoveEvent(event)) {
    showEditorError("Dieser Termin kann nicht in einen neuen Termin kopiert werden.");
    return;
  }
  try {
    await tb.runtime.sendMessage({ type: "duplicateEvent", eventRef: eventReference(event) });
    state.refreshAfterEditor = true;
    showActionToast(t("copyPrepared"));
  } catch (error) {
    console.error("Kalender: Termin konnte nicht dupliziert werden.", error);
    showEditorError(
      `Termin konnte nicht dupliziert werden: ${
        error?.message || String(error || "Unbekannter Fehler")
      }`
    );
  }
}

async function moveEventToCalendar(event, targetCalendarId) {
  if (!canMoveEvent(event) || !targetCalendarId || targetCalendarId === event.calendarId) {
    return;
  }
  const target = calendarForKey(targetCalendarId);
  if (!target || target.readOnly) {
    showEditorError("Der Zielkalender ist nicht beschreibbar.");
    return;
  }
  try {
    const response = await tb.runtime.sendMessage({
      type: "moveEventToCalendar",
      eventRef: { ...eventReference(event), targetCalendarId }
    });
    const movedEventRef = {
      ...eventReference(event),
      calendarId: response?.calendarId || targetCalendarId,
      itemId: response?.itemId || response?.id || event.itemId,
      parentItemId: response?.parentItemId || response?.itemId || response?.id || event.itemId,
      hashId: response?.hashId || response?.itemId || response?.id || event.hashId,
      id: response?.id || response?.itemId || event.id
    };
    pushHistory({
      kind: "move-calendar",
      movedEventRef,
      originalCalendarId: event.calendarId,
      label: t("movedToCalendar", { calendar: target.name || t("targetCalendar") })
    });
    await new Promise(resolve => setTimeout(resolve, 350));
    await loadMonth();
  } catch (error) {
    console.error("Kalender: Kalenderwechsel fehlgeschlagen.", error);
    showEditorError(
      `Termin konnte nicht in den Zielkalender verschoben werden: ${
        error?.message || String(error || "Unbekannter Fehler")
      }`
    );
  }
}

function closeEventContextMenu() {
  eventContextMenu.hidden = true;
  state.contextEvent = null;
}

function showEventContextMenu(event, pointerEvent) {
  state.contextEvent = event;
  contextCalendarTargets.replaceChildren();
  const canEdit = canMoveEvent(event);
  contextEditEvent.disabled = !canEdit;
  contextDuplicateEvent.disabled = !canEdit;
  if (state.settings.dragCalendarMove !== false && canEdit) {
    const heading = document.createElement("span");
    heading.className = "context-menu-heading";
    heading.textContent = t("moveToCalendar");
    contextCalendarTargets.appendChild(heading);
    for (const calendar of state.data?.calendars || []) {
      if (calendar.id === event.calendarId || calendar.readOnly) {
        continue;
      }
      const target = document.createElement("button");
      target.type = "button";
      target.className = "context-calendar-target";
      target.textContent = calendar.name || t("unnamedCalendar");
      target.style.setProperty("--calendar-color", calendar.color || DEFAULT_SETTINGS.accentColor);
      target.addEventListener("click", async () => {
        closeEventContextMenu();
        await moveEventToCalendar(event, calendar.id);
      });
      contextCalendarTargets.appendChild(target);
    }
  }
  eventContextMenu.hidden = false;
  const rect = eventContextMenu.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, pointerEvent.clientX));
  const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, pointerEvent.clientY));
  eventContextMenu.style.insetInlineStart = `${left}px`;
  eventContextMenu.style.insetBlockStart = `${top}px`;
}

function eventReference(event) {
  return {
    calendarId: event.calendarId,
    itemId: event.itemId,
    parentItemId: event.parentItemId,
    hashId: event.hashId,
    id: event.id,
    start: event.start,
    end: event.end,
    allDay: Boolean(event.allDay)
  };
}

function trackAtPointer(hourArea, pointerEvent) {
  const directTrack = pointerEvent.target.closest?.(".half-track");
  if (directTrack) {
    return directTrack;
  }

  const tracks = Array.from(hourArea.querySelectorAll(".half-track"));
  const areaRect = hourArea.getBoundingClientRect();
  const halfIndex = pointerEvent.clientX < areaRect.left + areaRect.width / 2 ? 0 : 1;
  return tracks[halfIndex] || tracks[0] || null;
}

function minuteAtPointer(track, pointerEvent) {
  const rect = track.getBoundingClientRect();
  const halfStart = Number(track.dataset.halfStart);
  const halfEnd = Number(track.dataset.halfEnd);
  const ratio =
    rect.height > 0
      ? Math.max(0, Math.min(1, (pointerEvent.clientY - rect.top) / rect.height))
      : 0;
  const rawMinute = halfStart + ratio * (halfEnd - halfStart);
  return Math.max(0, Math.min(1425, Math.round(rawMinute / 15) * 15));
}

async function createEventForRange(start, end) {
  try {
    await tb.runtime.sendMessage({
      type: "createEvent",
      eventRef: {
        start: dateToPart(start),
        end: dateToPart(end),
        allDay: false
      }
    });
    state.refreshAfterEditor = true;
  } catch (error) {
    console.error("Kalender: Neuer Termin konnte nicht geoeffnet werden.", error);
    showEditorError(
      `Neuer Termin konnte nicht geoeffnet werden: ${
        error?.message || String(error || "Unbekannter Fehler")
      }`
    );
  }
}

async function createEventForDay(date, hourArea, pointerEvent) {
  const track = trackAtPointer(hourArea, pointerEvent);
  if (!track) {
    return;
  }

  const minute = minuteAtPointer(track, pointerEvent);
  const start = startOfDay(date);
  start.setMinutes(minute);
  await createEventForRange(start, new Date(start.getTime() + 60 * 60000));
}

function allDaySpan(event) {
  const { start, end } = eventRange(event);
  if (!start || !end) {
    return 1;
  }

  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.round((utcEnd - utcStart) / 86400000));
}

function proposedMoveRange(event, date, hourArea, pointerEvent) {
  let newStart;
  let newEnd;
  const originalRange = eventRange(event);
  if (!originalRange.start || !originalRange.end) {
    return null;
  }

  if (event.allDay) {
    newStart = startOfDay(date);
    newEnd = addDays(newStart, allDaySpan(event));
  } else if (
    isSameDay(originalRange.start, date) ||
    state.dragZoomActive ||
    hourArea.closest(".zoomed-day-cell")
  ) {
    const track = trackAtPointer(hourArea, pointerEvent);
    if (!track) {
      return null;
    }
    const minute = minuteAtPointer(track, pointerEvent);
    const duration = Math.max(15 * 60000, originalRange.end - originalRange.start);
    newStart = startOfDay(date);
    newStart.setMinutes(minute);
    newEnd = new Date(newStart.getTime() + duration);
  } else {
    const duration = Math.max(15 * 60000, originalRange.end - originalRange.start);
    newStart = startOfDay(date);
    newStart.setHours(
      originalRange.start.getHours(),
      originalRange.start.getMinutes(),
      originalRange.start.getSeconds(),
      0
    );
    newEnd = new Date(newStart.getTime() + duration);
  }

  return { start: newStart, end: newEnd };
}

function clearDragPreview() {
  state.dragPreviewKey = "";
  document.querySelectorAll(".drag-preview-range").forEach(cell => {
    cell.classList.remove("drag-preview-range", "drag-preview-start", "drag-preview-end");
  });
  document.querySelectorAll(".drag-preview-block").forEach(preview => preview.remove());
}

function updateDraggedEventPresentation(event, range) {
  const eventEl = state.draggedElement;
  if (!eventEl || event.allDay) {
    return;
  }
  const time = eventEl.querySelector(".timed-event-time");
  if (time) {
    time.textContent = formatMinute(range.start.getHours() * 60 + range.start.getMinutes());
  }
  eventEl.classList.add("dragging-preview");
}

function resetDraggedEventPresentation() {
  const event = state.draggedEvent;
  const eventEl = state.draggedElement;
  if (event && eventEl) {
    eventEl.style.setProperty(
      "--event-color",
      eventDisplayColor(event)
    );
    if (!event.allDay) {
      const { start } = eventRange(event);
      const time = eventEl.querySelector(".timed-event-time");
      if (time && start) {
        time.textContent = formatMinute(start.getHours() * 60 + start.getMinutes());
      }
    }
    eventEl.classList.remove("dragging-preview");
  }
  document.querySelectorAll(".calendar-drop-target").forEach(entry =>
    entry.classList.remove("calendar-drop-target")
  );
  state.sidebarCalendarDropId = "";
  state.draggedElement = null;
}

function previewCalendarTarget(calendar, entry) {
  if (!state.draggedEvent || state.settings.dragCalendarMove === false) {
    return;
  }
  state.sidebarCalendarDropId = calendarKey(calendar);
  document.querySelectorAll(".calendar-drop-target").forEach(target =>
    target.classList.toggle("calendar-drop-target", target === entry)
  );
  state.draggedElement?.style.setProperty(
    "--event-color",
    sanitizeColor(calendar.color, DEFAULT_SETTINGS.accentColor)
  );
}

function rangeOverlapsDate(range, date) {
  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);
  return range.end > dayStart && range.start < dayEnd;
}

function renderTimedDragPreview(event, range, targetCell) {
  const timeRange = getTimeRange();
  const dayStart = startOfDay(range.start);
  const startMinute = range.start.getHours() * 60 + range.start.getMinutes();
  const endMinute = isSameDay(range.start, range.end)
    ? range.end.getHours() * 60 + range.end.getMinutes()
    : 1440;
  const visibleStart = Math.max(timeRange.start, startMinute);
  const visibleEnd = Math.min(timeRange.end, endMinute || 1440);
  if (
    visibleEnd <= visibleStart ||
    !isSameDay(dayStart, dateFromDayKey(targetCell.dataset.date))
  ) {
    return;
  }

  const tracks = Array.from(targetCell.querySelectorAll(":scope > .hour-area > .half-track"));
  for (const track of tracks) {
    const halfStart = Number(track.dataset.halfStart);
    const halfEnd = Number(track.dataset.halfEnd);
    const segmentStart = Math.max(visibleStart, halfStart);
    const segmentEnd = Math.min(visibleEnd, halfEnd);
    if (segmentEnd <= segmentStart) {
      continue;
    }

    const preview = document.createElement("div");
    preview.className = "drag-preview-block";
    preview.style.insetBlockStart = `${
      ((segmentStart - halfStart) / (halfEnd - halfStart)) * 100
    }%`;
    preview.style.blockSize = `${Math.max(
      ((segmentEnd - segmentStart) / (halfEnd - halfStart)) * 100,
      4
    )}%`;
    preview.textContent = `${formatMinute(startMinute)} ${event.title || ""}`.trim();
    track.appendChild(preview);
  }
}

function renderDragPreview(event, date, hourArea, pointerEvent) {
  const range = proposedMoveRange(event, date, hourArea, pointerEvent);
  if (!range) {
    return;
  }

  const previewKey = `${event.id}:${range.start.getTime()}:${range.end.getTime()}`;
  if (previewKey === state.dragPreviewKey) {
    return;
  }
  clearDragPreview();
  state.dragPreviewKey = previewKey;
  updateDraggedEventPresentation(event, range);

  const matchingCells = [];
  for (const cell of document.querySelectorAll(".day-cell[data-date]")) {
    const cellDate = dateFromDayKey(cell.dataset.date);
    if (rangeOverlapsDate(range, cellDate)) {
      matchingCells.push(cell);
      cell.classList.add("drag-preview-range");
    }
  }

  const sortedDates = [...new Set(matchingCells.map(cell => cell.dataset.date))].sort();
  for (const cell of matchingCells) {
    cell.classList.toggle("drag-preview-start", cell.dataset.date === sortedDates[0]);
    cell.classList.toggle(
      "drag-preview-end",
      cell.dataset.date === sortedDates[sortedDates.length - 1]
    );
  }

  if (!event.allDay) {
    const targetCells = matchingCells.filter(cell => cell.dataset.date === dayKey(range.start));
    for (const targetCell of targetCells) {
      renderTimedDragPreview(event, range, targetCell);
    }
  }
}

async function moveEventToDay(event, date, hourArea, pointerEvent) {
  const range = proposedMoveRange(event, date, hourArea, pointerEvent);
  if (!range) {
    return;
  }

  clearDragPreview();
  if (state.dragZoomActive) {
    closeDayZoomView();
  }
  try {
    const originalEventRef = eventReference(event);
    await tb.runtime.sendMessage({
      type: "moveEvent",
      eventRef: {
        ...eventReference(event),
        newStart: dateToPart(range.start, Boolean(event.allDay)),
        newEnd: dateToPart(range.end, Boolean(event.allDay))
      }
    });
    pushHistory({
      kind: "move-time",
      eventRef: originalEventRef,
      oldStart: event.start,
      oldEnd: event.end,
      label: "Termin verschoben"
    });
    await new Promise(resolve => setTimeout(resolve, 350));
    await loadMonth();
  } catch (error) {
    console.error("Kalender: Termin konnte nicht verschoben werden.", error);
    showEditorError(
      `Termin konnte nicht verschoben werden: ${
        error?.message || String(error || "Unbekannter Fehler")
      }`
    );
  }
}

function attachTooltipInteractions(eventEl, tooltip) {
  eventEl.setAttribute("aria-label", tooltip.replace(/\n/g, ", "));
  eventEl.addEventListener("mouseenter", pointerEvent => showEventTooltip(tooltip, pointerEvent));
  eventEl.addEventListener("mousemove", positionEventTooltip);
  eventEl.addEventListener("mouseleave", hideEventTooltip);
}

function setEventDragImage(dataTransfer, event) {
  if (typeof dataTransfer?.setDragImage !== "function") {
    return;
  }

  const { start, end } = eventRange(event);
  if (!start || !end) {
    return;
  }
  const dragImage = document.createElement("div");
  dragImage.className = "event-drag-image";
  dragImage.style.setProperty(
    "--event-color",
    eventDisplayColor(event)
  );

  const time = document.createElement("strong");
  time.textContent = event.allDay
    ? "Ganztags"
    : `${formatMinute(start.getHours() * 60 + start.getMinutes())}-${formatMinute(
        end.getHours() * 60 + end.getMinutes()
      )}`;
  const title = document.createElement("span");
  title.textContent = event.title || "(Ohne Titel)";
  dragImage.append(time, title);
  document.body.appendChild(dragImage);
  dataTransfer.setDragImage(dragImage, 18, 13);
  setTimeout(() => dragImage.remove(), 0);
}

function attachEventInteractions(eventEl, event) {
  attachTooltipInteractions(eventEl, eventTooltip(event));
  if (canMoveEvent(event)) {
    eventEl.draggable = true;
    eventEl.addEventListener("dragstart", dragEvent => {
      state.draggedEvent = event;
      state.draggedElement = eventEl;
      hideEventTooltip();
      dragEvent.dataTransfer.effectAllowed = "move";
      dragEvent.dataTransfer.setData("text/plain", JSON.stringify(eventReference(event)));
      setEventDragImage(dragEvent.dataTransfer, event);
      requestAnimationFrame(() => eventEl.classList.add("dragging"));
    });
    eventEl.addEventListener("dragend", () => {
      resetDraggedEventPresentation();
      state.draggedEvent = null;
      eventEl.classList.remove("dragging");
      clearDragPreview();
      clearDragZoomTimer();
      if (state.dragZoomActive) {
        closeDayZoomView();
      }
      document.querySelectorAll(".drop-target").forEach(target => target.classList.remove("drop-target"));
    });
  }

  eventEl.addEventListener("dblclick", async pointerEvent => {
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    hideEventTooltip();
    await openEventEditor(event);
  });

  eventEl.addEventListener("contextmenu", pointerEvent => {
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    hideEventTooltip();
    showEventContextMenu(event, pointerEvent);
  });
}

function attachDayInteractions(cell, date, hourArea, { zoomed = false } = {}) {
  cell.addEventListener("dblclick", async pointerEvent => {
    if (
      pointerEvent.button !== 0 ||
      pointerEvent.target.closest(".event, .all-day-chip, .special-event-chip")
    ) {
      return;
    }

    pointerEvent.preventDefault();
    await createEventForDay(date, hourArea, pointerEvent);
  });

  cell.addEventListener("pointerdown", pointerEvent => {
    if (
      !zoomed ||
      !state.shiftZoomHeld ||
      state.draggedEvent ||
      pointerEvent.button !== 0 ||
      pointerEvent.target.closest(".event, .all-day-chip, .special-event-chip")
    ) {
      return;
    }
    const track = trackAtPointer(hourArea, pointerEvent);
    if (!track) {
      return;
    }
    const minute = minuteAtPointer(track, pointerEvent);
    state.timeSelection = {
      date,
      hourArea,
      pointerId: pointerEvent.pointerId,
      anchorMinute: minute,
      startMinute: minute,
      endMinute: Math.min(1440, minute + 15)
    };
    cell.setPointerCapture?.(pointerEvent.pointerId);
    renderTimeSelectionPreview();
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
  });

  cell.addEventListener("pointermove", pointerEvent => {
    if (state.timeSelection?.pointerId === pointerEvent.pointerId) {
      updateTimeSelection(pointerEvent);
      pointerEvent.preventDefault();
    }
  });

  cell.addEventListener("pointerup", async pointerEvent => {
    const selection = state.timeSelection;
    if (!selection || selection.pointerId !== pointerEvent.pointerId) {
      return;
    }
    cell.releasePointerCapture?.(pointerEvent.pointerId);
    clearTimeSelectionPreview();
    const start = startOfDay(selection.date);
    start.setMinutes(selection.startMinute);
    const end = startOfDay(selection.date);
    end.setMinutes(selection.endMinute);
    await createEventForRange(start, end);
    pointerEvent.preventDefault();
  });

  cell.addEventListener("pointercancel", pointerEvent => {
    if (state.timeSelection?.pointerId === pointerEvent.pointerId) {
      clearTimeSelectionPreview();
    }
  });

  cell.addEventListener("dragover", pointerEvent => {
    if (!state.draggedEvent) {
      return;
    }
    pointerEvent.preventDefault();
    pointerEvent.dataTransfer.dropEffect = "move";
    cell.classList.add("drop-target");
    renderDragPreview(state.draggedEvent, date, hourArea, pointerEvent);
    if (!zoomed && pointerEvent.shiftKey) {
      scheduleDragDayZoom(date, pointerEvent);
    } else if (!state.dragZoomActive) {
      clearDragZoomTimer();
    }
  });

  cell.addEventListener("dragleave", pointerEvent => {
    if (!cell.contains(pointerEvent.relatedTarget)) {
      cell.classList.remove("drop-target");
      if (!state.dragZoomActive) {
        clearDragZoomTimer();
      }
    }
  });

  cell.addEventListener("drop", async pointerEvent => {
    if (!state.draggedEvent) {
      return;
    }

    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    const draggedEvent = state.draggedEvent;
    resetDraggedEventPresentation();
    state.draggedEvent = null;
    cell.classList.remove("drop-target");
    clearDragPreview();
    await moveEventToDay(draggedEvent, date, hourArea, pointerEvent);
  });
}

function allDayBackground(events) {
  const colors = [
    ...new Set(events.map(eventDisplayColor).filter(Boolean))
  ].slice(0, 6);

  if (colors.length === 1) {
    return `linear-gradient(color-mix(in srgb, ${colors[0]} 18%, transparent), color-mix(in srgb, ${
      colors[0]
    } 18%, transparent))`;
  }

  const stripeSize = 9;
  const stops = colors.map(
    (color, index) =>
      `color-mix(in srgb, ${color} 19%, transparent) ${index * stripeSize}px ${
        (index + 1) * stripeSize
      }px`
  );
  return `repeating-linear-gradient(135deg, ${stops.join(", ")})`;
}

function appendAllDayEvents(hourArea, events, stackOffset = 0) {
  if (!events.length) {
    return;
  }

  const sortedEvents = [...events].sort((a, b) =>
    String(a.title || "").localeCompare(String(b.title || ""), "de")
  );
  const layer = document.createElement("div");
  layer.className = "all-day-layer";
  layer.style.setProperty("--all-day-background", allDayBackground(sortedEvents));
  layer.style.setProperty(
    "--all-day-accent",
    sortedEvents[0] ? eventDisplayColor(sortedEvents[0]) : DEFAULT_SETTINGS.accentColor
  );
  attachTooltipInteractions(layer, sortedEvents.map(eventTooltip).join("\n\n"));

  const stack = document.createElement("div");
  stack.className = "all-day-stack";
  stack.style.insetBlockStart = `${17 + stackOffset}px`;
  const chipLimit = window.innerWidth < 900 ? 1 : 2;
  const visibleEvents =
    sortedEvents.length > chipLimit ? sortedEvents.slice(0, chipLimit) : sortedEvents;

  for (const event of visibleEvents) {
    const chip = document.createElement("div");
    chip.className = "all-day-chip";
    chip.style.setProperty("--event-color", eventDisplayColor(event));
    chip.textContent = event.title || "(Ohne Titel)";
    attachEventInteractions(chip, event);
    stack.appendChild(chip);
  }

  if (visibleEvents.length < sortedEvents.length) {
    const hiddenEvents = sortedEvents.slice(visibleEvents.length);
    const more = document.createElement("div");
    more.className = "all-day-chip more-events";
    more.textContent = `+${hiddenEvents.length}`;
    attachTooltipInteractions(more, hiddenEvents.map(eventTooltip).join("\n\n"));
    stack.appendChild(more);
  }

  hourArea.append(layer, stack);
}

function appendSpecialDayEvents(hourArea, events) {
  if (!events.length) {
    return 0;
  }

  const sortedEvents = [...events].sort((left, right) => {
    const leftType = categoryTypeFor(left);
    const rightType = categoryTypeFor(right);
    return (
      String(leftType?.name || "").localeCompare(String(rightType?.name || ""), "de") ||
      String(left.title || "").localeCompare(String(right.title || ""), "de")
    );
  });

  const vacationEvents = sortedEvents.filter(
    event => calendarTypeDisplayModeFor(event) === "vacation"
  );
  if (vacationEvents.length) {
    const band = document.createElement("div");
    band.className = "vacation-band";
    band.style.setProperty(
      "--type-color",
      categoryTypeFor(vacationEvents[0])?.color || "#168a63"
    );
    attachTooltipInteractions(band, vacationEvents.map(eventTooltip).join("\n\n"));
    hourArea.appendChild(band);
  }

  const stack = document.createElement("div");
  stack.className = "special-event-stack";
  const visibleEvents = sortedEvents.slice(0, window.innerWidth < 900 ? 1 : 2);

  for (const event of visibleEvents) {
    const type = categoryTypeFor(event);
    const chip = document.createElement("div");
    chip.className = "special-event-chip";
    chip.dataset.typeId = type?.id || "";
    chip.style.setProperty("--type-color", type?.color || event.calendarColor);
    const icon = document.createElement("span");
    icon.className = "special-event-icon";
    icon.textContent = type?.icon || "★";
    const title = document.createElement("span");
    title.className = "special-event-title";
    title.textContent = event.title || "(Ohne Titel)";
    chip.append(icon, title);
    attachEventInteractions(chip, event);
    stack.appendChild(chip);
  }

  if (visibleEvents.length < sortedEvents.length) {
    const hiddenEvents = sortedEvents.slice(visibleEvents.length);
    const more = document.createElement("div");
    more.className = "special-event-chip special-more";
    more.textContent = `+${hiddenEvents.length}`;
    attachTooltipInteractions(more, hiddenEvents.map(eventTooltip).join("\n\n"));
    stack.appendChild(more);
  }

  hourArea.appendChild(stack);
  return 17;
}

function appendProfileTimeOverlay(tracks, date, events) {
  const profile = activeViewProfile();
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const isVacation = events.some(
    event => event.allDay && calendarTypeDisplayModeFor(event) === "vacation"
  );
  if (profile.effect === "none") {
    return;
  }

  const visibleRange = getTimeRange();
  const workStartMinute = profile.workStartHour * 60;
  const workEndMinute = profile.workEndHour * 60;
  const isNonWorkday = isWeekend || isVacation;
  const highlightedRanges =
    profile.effect === "work"
      ? isNonWorkday
        ? []
        : [{ start: workStartMinute, end: workEndMinute }]
      : isNonWorkday
        ? [{ start: visibleRange.start, end: visibleRange.end }]
        : [
            { start: visibleRange.start, end: workStartMinute },
            { start: workEndMinute, end: visibleRange.end }
          ];

  for (const highlightedRange of highlightedRanges) {
    for (const track of tracks) {
      const halfStart = Number(track.dataset.halfStart);
      const halfEnd = Number(track.dataset.halfEnd);
      const segmentStart = Math.max(highlightedRange.start, halfStart, visibleRange.start);
      const segmentEnd = Math.min(highlightedRange.end, halfEnd, visibleRange.end);
      if (segmentEnd <= segmentStart) {
        continue;
      }

      const overlay = document.createElement("div");
      overlay.className = `profile-time-overlay profile-${profile.effect}`;
      overlay.style.insetBlockStart = `${
        ((segmentStart - halfStart) / (halfEnd - halfStart)) * 100
      }%`;
      overlay.style.blockSize = `${
        ((segmentEnd - segmentStart) / (halfEnd - halfStart)) * 100
      }%`;
      track.appendChild(overlay);
    }
  }
}

/**
 * Each person has a small, virtual "Arbeitszeit" calendar in the sidebar.
 * It deliberately does not create Thunderbird events: it is only a visual
 * availability layer based on that person's configured weekly hours.
 */
function personVacationOnDate(person, date) {
  return (state.data?.events || []).some(event =>
    overlapsDay(event, date) &&
    (calendarTypeDisplayModeFor(event) === "vacation" || calendarKey(event) === `${EXTERNAL_SOURCE_PREFIX}holidays-${person.id}`) &&
    personTypeIdsFor(event).includes(person.id)
  );
}

function appendPersonWorkOverlays(tracks, date) {
  if (activeViewProfile().effect !== "work") return;
  // The virtual Arbeitszeit calendar is independent from the person's normal
  // calendar eye. This makes availability available even when appointments of
  // that person are temporarily hidden.
  const people = personTypes().filter(person => person.workCalendarEnabled !== false);
  if (!people.length) return;
  const visibleRange = getTimeRange();
  people.forEach((person, personIndex) => {
    const hours = normalizeWeekdayHours(
      person.weekdayHours,
      person.workStartHour,
      person.workEndHour
    )[String(date.getDay())];
    // A vacation calendar assigned to this person wins over the weekly work
    // schedule. It removes the availability block for that day instead of
    // incorrectly showing the person as working.
    if (!hours?.enabled || personVacationOnDate(person, date)) return;
    const start = hours.startHour * 60;
    const end = hours.endHour * 60;
    for (const track of tracks) {
      const halfStart = Number(track.dataset.halfStart);
      const halfEnd = Number(track.dataset.halfEnd);
      const segmentStart = Math.max(start, halfStart, visibleRange.start);
      const segmentEnd = Math.min(end, halfEnd, visibleRange.end);
      if (segmentEnd <= segmentStart) continue;
      const overlay = document.createElement("div");
      overlay.className = "person-work-overlay";
      overlay.style.setProperty("--person-color", sanitizeColor(person.color, DEFAULT_SETTINGS.accentColor));
      overlay.style.insetBlockStart = `${((segmentStart - halfStart) / (halfEnd - halfStart)) * 100}%`;
      overlay.style.blockSize = `${((segmentEnd - segmentStart) / (halfEnd - halfStart)) * 100}%`;
      overlay.style.insetInlineStart = `${(personIndex / people.length) * 100}%`;
      overlay.style.inlineSize = `calc(${100 / people.length}% - 1px)`;
      overlay.title = `${person.name}: ${hours.startHour}:00–${hours.endHour}:00`;
      const label = document.createElement("span");
      label.textContent = personInitial(person);
      overlay.appendChild(label);
      track.appendChild(overlay);
    }
  });
}

function isCurrentTimedSegment(event, date) {
  if (!isSameDay(date, new Date())) {
    return false;
  }

  const now = new Date();
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  return nowMinute >= event.segmentStart && nowMinute < event.segmentEnd;
}

function appendNowIndicator(tracks, date, range, splitPoint) {
  if (!isSameDay(date, new Date())) {
    return;
  }

  const now = new Date();
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  if (nowMinute < range.start || nowMinute > range.end) {
    return;
  }

  const halfIndex = nowMinute < splitPoint ? 0 : 1;
  const halfStart = halfIndex === 0 ? range.start : splitPoint;
  const halfEnd = halfIndex === 0 ? splitPoint : range.end;
  const indicator = document.createElement("div");
  indicator.className = "now-indicator";
  indicator.style.insetBlockStart = `${((nowMinute - halfStart) / (halfEnd - halfStart)) * 100}%`;
  tracks[halfIndex].appendChild(indicator);
}

function renderWeekGutter(date) {
  const gutter = document.createElement("div");
  gutter.className = "week-gutter";
  const label = document.createElement("span");
  label.className = "week-gutter-label";
  label.textContent = `W ${isoWeekNumber(date)}`;
  gutter.appendChild(label);
  return gutter;
}

function renderDay(date, monthIndex, events, { sidebar = false, zoomed = false } = {}) {
  const cell = document.createElement("section");
  cell.className = "day-cell";
  cell.classList.toggle("sidebar-day-cell", sidebar);
  cell.classList.toggle("zoomed-day-cell", zoomed);
  cell.dataset.date = dayKey(date);

  if (!isFourWeekView() && date.getMonth() !== monthIndex) {
    cell.classList.add("outside-month");
  }

  if (isSameDay(date, new Date())) {
    cell.classList.add("today");
  }

  const label = document.createElement("div");
  label.className = "day-label";
  const dayNumber = document.createElement("span");
  dayNumber.className = "day-number";
  dayNumber.textContent = sidebar
    ? `${weekdayFormatter.format(date)} ${date.getDate()}.`
    : String(date.getDate());
  label.append(dayNumber);

  const hourArea = document.createElement("div");
  hourArea.className = "hour-area";
  const range = getTimeRange();
  const splitPoint = range.start + (range.end - range.start) / 2;
  const tracks = [createHalfTrack(range.start, splitPoint), createHalfTrack(splitPoint, range.end)];
  hourArea.append(...tracks);

  const allDayEvents = events.filter(event => event.allDay);
  const specialAllDayEvents = allDayEvents.filter(
    event => calendarTypeDisplayModeFor(event) !== "normal"
  );
  const regularAllDayEvents = allDayEvents.filter(
    event => calendarTypeDisplayModeFor(event) === "normal"
  );
  const timedEvents = events
    .filter(event => !event.allDay)
    .map(event => {
      const minutes = minutesOnDay(event, date);
      return minutes ? { ...event, ...minutes } : null;
    })
    .filter(Boolean);

  appendProfileTimeOverlay(tracks, date, events);
  appendPersonWorkOverlays(tracks, date);
  const specialOffset = appendSpecialDayEvents(hourArea, specialAllDayEvents);
  appendAllDayEvents(hourArea, regularAllDayEvents, specialOffset);

  const timedSegments = timedEvents.flatMap(splitSegments);
  const segmentsByHalf = [
    timedSegments.filter(event => event.halfIndex === 0),
    timedSegments.filter(event => event.halfIndex === 1)
  ];
  segmentsByHalf.forEach(assignLanes);

  for (const event of timedSegments) {
    const eventEl = document.createElement("div");
    const laneWidth = 100 / event.laneCount;
    const top = ((event.segmentStart - event.halfStart) / (event.halfEnd - event.halfStart)) * 100;
    const height = Math.max(
      ((event.segmentEnd - event.segmentStart) / (event.halfEnd - event.halfStart)) * 100,
      3.2
    );

    eventEl.className = "event timed";
    eventEl.classList.toggle("current-event", isCurrentTimedSegment(event, date));
    eventEl.style.setProperty("--event-color", eventDisplayColor(event));
    eventEl.style.insetBlockStart = `${top}%`;
    eventEl.style.blockSize = `${height}%`;
    eventEl.style.insetInlineStart = `${event.lane * laneWidth}%`;
    eventEl.style.inlineSize = `calc(${laneWidth}% - 2px)`;

    const time = document.createElement("span");
    time.className = "timed-event-time";
    time.textContent = formatMinute(event.segmentStart);
    const title = document.createElement("span");
    title.className = "timed-event-title";
    title.textContent = event.title || "(Ohne Titel)";
    eventEl.append(time, title);
    attachEventInteractions(eventEl, event);
    tracks[event.halfIndex].appendChild(eventEl);
  }

  appendNowIndicator(tracks, date, range, splitPoint);
  attachDayInteractions(cell, date, hourArea, { zoomed });
  cell.append(label, hourArea);
  return cell;
}

function clearDragZoomTimer() {
  if (state.dragZoomTimer) {
    clearTimeout(state.dragZoomTimer);
    state.dragZoomTimer = 0;
  }
  if (!state.dragZoomActive) {
    state.dragZoomKey = "";
  }
}

function pointerSnapshot(pointerEvent) {
  if (
    pointerEvent &&
    Number.isFinite(pointerEvent.clientX) &&
    Number.isFinite(pointerEvent.clientY)
  ) {
    return { clientX: pointerEvent.clientX, clientY: pointerEvent.clientY };
  }
  return state.lastPointer;
}

function dayCellAtPointer(pointer = state.lastPointer) {
  if (!pointer || !Number.isFinite(pointer.clientX) || !Number.isFinite(pointer.clientY)) {
    return null;
  }
  return document
    .elementFromPoint(pointer.clientX, pointer.clientY)
    ?.closest?.(".day-cell[data-date]") || null;
}

function activateShiftDayZoom(date, pointerEvent, { forDrag = false } = {}) {
  const key = dayKey(date);
  if (state.shiftZoomBlockedUntilRelease || (state.shiftZoomHeld && state.shiftZoomKey)) {
    return;
  }
  state.shiftZoomHeld = true;
  state.shiftZoomKey = key;
  openDayZoom(date, { forDrag, forShift: true, pointer: pointerSnapshot(pointerEvent) });
}

function releaseShiftDayZoom() {
  state.shiftZoomHeld = false;
  state.shiftZoomKey = "";
  state.shiftZoomBlockedUntilRelease = false;
  if (state.dayZoomMode === "shift" || state.dayZoomMode === "drag-shift") {
    closeDayZoomView();
  }
}

function scheduleDragDayZoom(date, pointerEvent) {
  if (!pointerEvent.shiftKey) {
    return;
  }
  activateShiftDayZoom(date, pointerEvent, { forDrag: true });
}

function openDayZoom(date, { forDrag = false, forShift = false, pointer = null } = {}) {
  if (!state.data) {
    renderFilterControls(null);
    return;
  }
  const events = state.data.events
    .filter(isCalendarVisible)
    .filter(event => overlapsDay(event, date));
  dayZoomTitle.textContent = forDrag
    ? `Ablegen: ${longDateFormatter.format(date)}`
    : longDateFormatter.format(date);
  dayZoomContent.replaceChildren(
    renderDay(date, state.currentDate.getMonth(), events, { zoomed: true })
  );
  state.dragZoomActive = forDrag;
  state.dragZoomKey = forDrag ? dayKey(date) : "";
  state.dayZoomMode = forDrag && forShift ? "drag-shift" : forDrag ? "drag" : forShift ? "shift" : "manual";
  dayZoomBackdrop.classList.toggle("drag-zoom", forDrag || forShift);
  dayZoomDialog.style.insetInlineStart = "";
  dayZoomDialog.style.insetBlockStart = "";
  if ((forDrag || forShift) && pointer) {
    const dialogWidth = Math.min(560, window.innerWidth - 24);
    const preferredLeft =
      pointer.clientX < window.innerWidth / 2
        ? pointer.clientX + 18
        : pointer.clientX - dialogWidth - 18;
    dayZoomDialog.style.insetInlineStart = `${Math.max(
      12,
      Math.min(window.innerWidth - dialogWidth - 12, preferredLeft)
    )}px`;
    dayZoomDialog.style.insetBlockStart = "12px";
  }
  dayZoomBackdrop.hidden = false;
}

function closeDayZoomView() {
  clearDragZoomTimer();
  clearTimeSelectionPreview();
  dayZoomBackdrop.hidden = true;
  dayZoomBackdrop.classList.remove("drag-zoom");
  dayZoomDialog.style.insetInlineStart = "";
  dayZoomDialog.style.insetBlockStart = "";
  dayZoomContent.replaceChildren();
  state.dragZoomActive = false;
  state.dragZoomKey = "";
  state.dayZoomMode = "";
}

function clearTimeSelectionPreview() {
  state.timeSelection = null;
  document.querySelectorAll(".time-selection-preview").forEach(preview => preview.remove());
}

function renderTimeSelectionPreview() {
  document.querySelectorAll(".time-selection-preview").forEach(preview => preview.remove());
  const selection = state.timeSelection;
  if (!selection) {
    return;
  }
  const text = `${formatMinute(selection.startMinute)}-${formatMinute(selection.endMinute)}`;
  for (const track of selection.hourArea.querySelectorAll(".half-track")) {
    const halfStart = Number(track.dataset.halfStart);
    const halfEnd = Number(track.dataset.halfEnd);
    const start = Math.max(selection.startMinute, halfStart);
    const end = Math.min(selection.endMinute, halfEnd);
    if (end <= start) {
      continue;
    }
    const preview = document.createElement("div");
    preview.className = "time-selection-preview";
    preview.style.insetBlockStart = `${((start - halfStart) / (halfEnd - halfStart)) * 100}%`;
    preview.style.blockSize = `${Math.max(
      ((end - start) / (halfEnd - halfStart)) * 100,
      2.8
    )}%`;
    preview.textContent = text;
    track.appendChild(preview);
  }
}

function updateTimeSelection(pointerEvent) {
  const selection = state.timeSelection;
  if (!selection) {
    return;
  }
  const track = trackAtPointer(selection.hourArea, pointerEvent);
  if (!track) {
    return;
  }
  const minute = minuteAtPointer(track, pointerEvent);
  selection.startMinute = Math.min(selection.anchorMinute, minute);
  selection.endMinute = Math.max(selection.anchorMinute + 15, minute + 15);
  renderTimeSelectionPreview();
}

function renderSidebarEdgeGroup(container, dates, monthIndex, events) {
  container.replaceChildren();
  container.hidden = dates.length === 0;
  if (!dates.length) {
    return;
  }

  container.style.gridTemplateColumns = `repeat(${dates.length}, minmax(0, 1fr))`;
  for (const date of dates) {
    const dayEvents = events.filter(event => overlapsDay(event, date));
    container.appendChild(renderDay(date, monthIndex, dayEvents, { sidebar: true }));
  }
}

function renderSidebarEdges(plan, monthIndex, events, visibleWeekdays) {
  const leadingDates = plan.leadingDates.filter(date => visibleWeekdays.includes(date.getDay()));
  const trailingDates = plan.trailingDates.filter(date => visibleWeekdays.includes(date.getDay()));
  const leadingRows = leadingDates.length ? 1 : 0;
  const trailingRows = trailingDates.length ? 1 : 0;
  const listRows = Math.max(1, plan.totalWeekCount - leadingRows - trailingRows);

  calendarSidebar.classList.toggle("has-leading-edge", leadingRows > 0);
  calendarSidebar.style.gridTemplateRows = [
    leadingRows ? "minmax(0, 1fr)" : "27px",
    leadingRows ? "27px" : "0",
    `minmax(0, ${listRows}fr)`,
    trailingRows ? "minmax(0, 1fr)" : "0"
  ].join(" ");

  renderSidebarEdgeGroup(leadingEdgeDays, leadingDates, monthIndex, events);
  renderSidebarEdgeGroup(trailingEdgeDays, trailingDates, monthIndex, events);
}

function renderMonth() {
  const date = state.currentDate;
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const visibleWeekdays = isDayView() ? [date.getDay()] : getVisibleWeekdays();
  const displayPlan = getMonthDisplayPlan();

  applyAppearance();
  document.documentElement.style.setProperty("--visible-day-count", String(visibleWeekdays.length));
  document.documentElement.style.setProperty(
    "--visible-week-count",
    String(displayPlan.mainWeekStarts.length)
  );
  const compactWeekendColumns = Boolean(activeViewProfile().compactWeekends);
  grid.style.gridTemplateColumns = [
    "var(--week-gutter-width)",
    ...visibleWeekdays.map(weekday =>
      compactWeekendColumns && (weekday === 0 || weekday === 6)
        ? "minmax(0, 0.62fr)"
        : "minmax(0, 1fr)"
    )
  ].join(" ");
  monthTitle.textContent = getDisplayTitle();
  grid.replaceChildren();

  const weekHeader = document.createElement("div");
  weekHeader.className = "week-gutter-header";
  grid.appendChild(weekHeader);

  for (const weekday of visibleWeekdays) {
    const header = document.createElement("div");
    header.className = "weekday";
    const weekdayInfo = WEEKDAYS.find(day => day.value === weekday);
    header.textContent = weekdayFormatter.format(weekdayInfo.sampleDate);
    grid.appendChild(header);
  }

  if (!state.data) {
    renderMessageBar([]);
    renderCalendarSidebar(null);
    renderSidebarEdges(displayPlan, monthIndex, [], visibleWeekdays);
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Termine werden geladen...";
    grid.appendChild(empty);
    return;
  }

  renderMessageBar(state.data.errors);
  renderCalendarSidebar(state.data);

  const visibleEvents = filteredEvents(state.data);
  renderFilterControls(state.data);
  renderSidebarEdges(displayPlan, monthIndex, visibleEvents, visibleWeekdays);
  if (isDayView()) {
    const dayEvents = visibleEvents.filter(event => overlapsDay(event, date));
    grid.appendChild(renderWeekGutter(date));
    grid.appendChild(renderDay(date, monthIndex, dayEvents));
  } else {
    for (const weekStart of displayPlan.mainWeekStarts) {
    grid.appendChild(renderWeekGutter(weekStart));

    for (let weekdayOffset = 0; weekdayOffset < 7; weekdayOffset++) {
      const cellDate = addDays(weekStart, weekdayOffset);
      if (!visibleWeekdays.includes(cellDate.getDay())) {
        continue;
      }

      const events = visibleEvents.filter(event => overlapsDay(event, cellDate));
      grid.appendChild(renderDay(cellDate, monthIndex, events));
    }
    }
  }

  renderLegend(state.data);

  const errorCount = state.data.errors.length;
  const sourceText = dataSourceLabel(state.data.source);
  statusText.textContent = errorCount
    ? `${visibleEvents.length} Termine angezeigt, ${errorCount} Fehler, ${sourceText}`
    : `${visibleEvents.length} Termine angezeigt, ${sourceText}`;
}

async function loadSettings() {
  const saved = await tb.storage.local.get(DEFAULT_SETTINGS);
  state.settings = { ...DEFAULT_SETTINGS, ...saved };
  state.settings.calendarTypes = normalizeCalendarTypes(state.settings.calendarTypes);
  state.settings.viewProfiles = normalizeViewProfiles(state.settings.viewProfiles);
  if (Number(state.settings.profileSettingsVersion) < 2) {
    state.settings.activeViewProfileId = "standard";
  }
  if (Number(state.settings.profileSettingsVersion) < PROFILE_SETTINGS_VERSION) {
    const legacyHiddenWeekdays = Array.isArray(state.settings.hiddenWeekdays)
      ? state.settings.hiddenWeekdays.map(Number)
      : [];
    const legacyCompactWeekends = Boolean(state.settings.compactWeekends);
    state.settings.viewProfiles = state.settings.viewProfiles.map(profile =>
      normalizeViewProfile({
        ...profile,
        hiddenWeekdays: legacyHiddenWeekdays,
        compactWeekends: legacyCompactWeekends
      })
    );
    state.settings.profileSettingsVersion = PROFILE_SETTINGS_VERSION;
  }
  state.settings.shiftDayZoom = true;
  state.settings.dragCalendarMove = state.settings.dragCalendarMove !== false;
  state.settings.themeMode = ["system", "standard", "high-contrast"].includes(
    state.settings.themeMode
  )
    ? state.settings.themeMode
    : "system";
  state.settings.accentColor = sanitizeColor(
    state.settings.accentColor,
    DEFAULT_SETTINGS.accentColor
  );
  if (
    !state.settings.calendarTypeAssignments ||
    typeof state.settings.calendarTypeAssignments !== "object" ||
    Array.isArray(state.settings.calendarTypeAssignments)
  ) {
    state.settings.calendarTypeAssignments = {};
  }
  if (
    !state.settings.calendarPersonAssignments ||
    typeof state.settings.calendarPersonAssignments !== "object" ||
    Array.isArray(state.settings.calendarPersonAssignments)
  ) {
    state.settings.calendarPersonAssignments = {};
  } else {
    state.settings.calendarPersonAssignments = Object.fromEntries(
      Object.entries(state.settings.calendarPersonAssignments).map(([calendarId, people]) => [
        String(calendarId),
        (Array.isArray(people) ? people : []).map(String)
      ])
    );
  }
  if (
    !state.settings.viewProfiles.some(
      profile => profile.id === state.settings.activeViewProfileId
    )
  ) {
    state.settings.activeViewProfileId = state.settings.viewProfiles[0].id;
  }
  if (!Array.isArray(state.settings.hiddenWeekdays)) {
    state.settings.hiddenWeekdays = [];
  }
  if (!Array.isArray(state.settings.hiddenCalendarIds)) {
    state.settings.hiddenCalendarIds = [];
  }
  if (!Array.isArray(state.settings.removedCalendarIds)) {
    state.settings.removedCalendarIds = [];
  } else {
    state.settings.removedCalendarIds = state.settings.removedCalendarIds.map(String);
  }
  if (!Array.isArray(state.settings.collapsedCalendarTypeIds)) {
    state.settings.collapsedCalendarTypeIds = [];
  } else {
    state.settings.collapsedCalendarTypeIds =
      state.settings.collapsedCalendarTypeIds.map(String);
  }
  if (
    !state.settings.calendarVisibilityOverrides ||
    typeof state.settings.calendarVisibilityOverrides !== "object" ||
    Array.isArray(state.settings.calendarVisibilityOverrides)
  ) {
    state.settings.calendarVisibilityOverrides = {};
  }
  for (const id of state.settings.hiddenCalendarIds) {
    if (!hasOwnValue(state.settings.calendarVisibilityOverrides, String(id))) {
      state.settings.calendarVisibilityOverrides[String(id)] = false;
    }
  }
  await loadExternalCalendars();
}

async function saveSettings() {
  state.settings = {
    ...state.settings,
    periodMode: ["day", "week", "month", "four-weeks"].includes(periodMode.value)
      ? periodMode.value
      : "month",
    hiddenCalendarIds: Array.isArray(state.settings.hiddenCalendarIds)
      ? state.settings.hiddenCalendarIds.map(String)
      : [],
    calendarVisibilityOverrides: getCalendarVisibilityOverrides(),
    removedCalendarIds: state.settings.removedCalendarIds.map(String),
    collapsedCalendarTypeIds: state.settings.collapsedCalendarTypeIds.map(String),
    dragCalendarMove: state.settings.dragCalendarMove !== false,
    themeMode: state.settings.themeMode,
    accentColor: sanitizeColor(state.settings.accentColor, DEFAULT_SETTINGS.accentColor),
    calendarTypes: normalizeCalendarTypes(state.settings.calendarTypes),
    calendarTypeAssignments: { ...(state.settings.calendarTypeAssignments || {}) },
    calendarPersonAssignments: { ...(state.settings.calendarPersonAssignments || {}) },
    viewProfiles: normalizeViewProfiles(state.settings.viewProfiles),
    activeViewProfileId: String(state.settings.activeViewProfileId || ""),
    profileSettingsVersion: PROFILE_SETTINGS_VERSION
  };

  await tb.storage.local.set(state.settings);
}

function renderViewProfileControls() {
  const profiles = state.settings.viewProfiles;
  viewProfile.replaceChildren();
  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    viewProfile.appendChild(option);
  }

  const active = activeViewProfile();
  viewProfile.value = active.id;
  settingsProfileList.replaceChildren();
  for (const profile of profiles) {
    const row = document.createElement("div");
    row.className = "settings-profile-entry";
    row.classList.toggle("active-profile", profile.id === active.id);
    const text = document.createElement("div");
    text.className = "settings-profile-text";
    const name = document.createElement("strong");
    name.textContent = profile.name;
    const details = document.createElement("span");
    const raster =
      profile.viewMode === "custom"
        ? `${profile.customStartHour}:00-${profile.customEndHour}:00`
        : t("fullDay");
    const effect =
      profile.effect === "work"
        ? t("workingTime")
        : profile.effect === "leisure"
          ? t("leisureTime")
          : t("noMarking");
    details.textContent = `${raster} · ${effect}`;
    text.append(name, details);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Bearbeiten";
    edit.addEventListener("click", () => openProfileEditor(profile.id));
    row.append(text, edit);
    settingsProfileList.appendChild(row);
  }
}

async function openProfileEditor(profileId = "new") {
  const url = tb.runtime.getURL(
    `space/profile.html?profileId=${encodeURIComponent(profileId)}`
  );
  if (tb.windows?.create) {
    try {
      await tb.windows.create({
        url,
        type: "popup",
        width: 460,
        height: 650
      });
      return;
    } catch (error) {
      console.warn("Profilfenster konnte nicht ueber die Fenster-API geoeffnet werden.", error);
    }
  }
  window.open(url, "calendar-profile-editor", "popup,width=460,height=650");
}

function syncControls() {
  periodMode.value = state.settings.periodMode;
  themeMode.value = state.settings.themeMode;
  accentColor.value = sanitizeColor(state.settings.accentColor, DEFAULT_SETTINGS.accentColor);
  dragCalendarMove.checked = state.settings.dragCalendarMove !== false;
  const removedCount = state.settings.removedCalendarIds.length;
  restoreRemovedCalendarsButton.hidden = removedCount === 0;
  restoreRemovedCalendarsButton.textContent =
    removedCount === 1
      ? "1 entfernten Kalender wieder anzeigen"
      : `${removedCount} entfernte Kalender wieder anzeigen`;
  renderViewProfileControls();
}

async function loadInternalMonthPart(year, month) {
  try {
    const data = await tb.runtime.sendMessage({
      type: "getMonthData",
      year,
      month,
      weekStartsOn: state.settings.weekStartsOn
    });
    return normalizeMonthData(data, year, month);
  } catch (error) {
    return emptyMonthData(year, month, state.settings.weekStartsOn, error);
  }
}

async function loadMonth() {
  if (state.isLoading) {
    state.reloadPending = true;
    return;
  }
  state.isLoading = true;
  try {
    statusText.textContent = "Termine werden geladen...";
    state.data = null;
    renderMonth();

    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth() + 1;

    const requests = dataRequestsForCurrentView();
    const internalParts = await Promise.all(
      requests.map(request => loadInternalMonthPart(request.year, request.month))
    );
    const internalData = combineMonthData(internalParts, year, month);
    const externalRange = isFourWeekView() ? getDisplayRange() : null;
    const externalData = await loadExternalMonthData(
      year,
      month,
      state.settings.weekStartsOn,
      externalRange
    );
    state.data = mergeMonthData(internalData, externalData);
  } finally {
    state.isLoading = false;
    renderMonth();
    if (state.reloadPending) {
      state.reloadPending = false;
      await loadMonth();
    }
  }
}

function dateForPeriod(date, mode = state.settings.periodMode) {
  const normalized = startOfDay(date);
  if (mode === "month") {
    return new Date(normalized.getFullYear(), normalized.getMonth(), 1);
  }
  return normalized;
}

function moveCurrentPeriod(offset) {
  if (isDayView()) {
    state.currentDate = addDays(state.currentDate, offset);
    return;
  }
  if (isWeekView()) {
    state.currentDate = addDays(state.currentDate, offset * 7);
    return;
  }
  if (isFourWeekView()) {
    state.currentDate = addDays(state.currentDate, offset * 28);
    return;
  }
  state.currentDate = new Date(
    state.currentDate.getFullYear(),
    state.currentDate.getMonth() + offset,
    1
  );
}

async function init() {
  await loadSettings();
  state.currentDate = dateForPeriod(new Date());
  syncControls();
  await tb.runtime.sendMessage({ type: "ensureHourGridSpace" });
  await loadMonth();
}

document.getElementById("previous").addEventListener("click", async () => {
  moveCurrentPeriod(-1);
  await loadMonth();
});

document.getElementById("next").addEventListener("click", async () => {
  moveCurrentPeriod(1);
  await loadMonth();
});

document.getElementById("today").addEventListener("click", async () => {
  state.currentDate = dateForPeriod(new Date());
  await loadMonth();
});

settingsToggle.addEventListener("click", () => {
  const willOpen = settingsPanel.hidden;
  settingsPanel.hidden = !willOpen;
  if (willOpen) renderCalendarPeopleSidebar();
  settingsToggle.setAttribute("aria-expanded", String(willOpen));
});

document.addEventListener("pointerdown", pointerEvent => {
  if (
    !settingsPanel.hidden &&
    !settingsPanel.contains(pointerEvent.target) &&
    !settingsToggle.contains(pointerEvent.target)
  ) {
    settingsPanel.hidden = true;
    settingsToggle.setAttribute("aria-expanded", "false");
  }
  if (
    !filterPanel.hidden &&
    !filterPanel.contains(pointerEvent.target) &&
    !filterToggle.contains(pointerEvent.target)
  ) {
    filterPanel.hidden = true;
    filterToggle.setAttribute("aria-expanded", "false");
  }
  if (!eventContextMenu.hidden && !eventContextMenu.contains(pointerEvent.target)) {
    closeEventContextMenu();
  }
});

filterToggle.addEventListener("click", () => {
  const willOpen = filterPanel.hidden;
  filterPanel.hidden = !willOpen;
  filterToggle.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    renderFilterControls();
  }
});

eventSearch.addEventListener("input", () => {
  state.filters.query = eventSearch.value;
  renderMonth();
});

filterEventKind.addEventListener("change", () => {
  state.filters.eventKind = filterEventKind.value;
  renderMonth();
});

resetFiltersButton.addEventListener("click", resetFilters);

contextEditEvent.addEventListener("click", async () => {
  const event = state.contextEvent;
  closeEventContextMenu();
  if (event) {
    await openEventEditor(event);
  }
});

contextDuplicateEvent.addEventListener("click", async () => {
  const event = state.contextEvent;
  closeEventContextMenu();
  if (event) {
    await duplicateEvent(event);
  }
});

addCalendarTypeButton.addEventListener("click", () => openCalendarTypeDialog());
addCalendarButton.addEventListener("click", openCalendarCreation);
document.getElementById("connect-nextcloud-calendar").addEventListener("click", async () => {
  try {
    const result = await tb.runtime.sendMessage("tb-connect-module-hub@tbconnect.local", {type:"openNextcloudCalendars"});
    if (!result?.ok) throw new Error("Modul-Hub nicht erreichbar.");
  } catch (error) {
    showActionToast("Bitte den TB-Connect Modul-Hub ab Version 2.0.23 installieren. Dort Nextcloud anmelden und echte CalDAV-Kalender hinzufügen.");
  }
});
manageCalendarsButton.addEventListener("click", openCalendarManagement);
manageCalendarsSettingsButton.addEventListener("click", openCalendarManagement);
calendarTypeDialog.addEventListener("submit", saveCalendarTypeDialog);
closeCalendarTypeDialog.addEventListener("click", closeCalendarTypeDialogView);
deleteCalendarType.addEventListener("click", deleteCalendarTypeFromDialog);
calendarTypeKind.addEventListener("change", syncCalendarTypeDialogFields);
calendarTypeRelationship.addEventListener("change", () => {
  if (calendarTypeColor.dataset.relationshipDefault === "true") {
    calendarTypeColor.value = defaultPersonColor(calendarTypeRelationship.value);
  }
});
calendarTypeColor.addEventListener("input", () => {
  calendarTypeColor.dataset.relationshipDefault = "false";
});
calendarTypeWorkStart.addEventListener("input", () => {
  calendarTypeWeekdayOptions.querySelectorAll(".weekday-hour-start").forEach(input => {
    input.value = calendarTypeWorkStart.value;
  });
});
calendarTypeWorkEnd.addEventListener("input", () => {
  calendarTypeWeekdayOptions.querySelectorAll(".weekday-hour-end").forEach(input => {
    input.value = calendarTypeWorkEnd.value;
  });
});
calendarTypeDialogBackdrop.addEventListener("click", pointerEvent => {
  if (pointerEvent.target === calendarTypeDialogBackdrop) {
    closeCalendarTypeDialogView();
  }
});

calendarPersonDialog.addEventListener("submit", saveCalendarPeopleDialog);
closeCalendarPersonDialog.addEventListener("click", closeCalendarPeopleDialogView);
cancelCalendarPersonDialog.addEventListener("click", closeCalendarPeopleDialogView);
calendarPersonDialogBackdrop.addEventListener("click", pointerEvent => {
  if (pointerEvent.target === calendarPersonDialogBackdrop) {
    closeCalendarPeopleDialogView();
  }
});

closeDayZoom.addEventListener("click", () => {
  state.shiftZoomHeld = false;
  state.shiftZoomKey = "";
  state.shiftZoomBlockedUntilRelease = true;
  closeDayZoomView();
});
dayZoomBackdrop.addEventListener("click", pointerEvent => {
  if (pointerEvent.target === dayZoomBackdrop) {
    state.shiftZoomHeld = false;
    state.shiftZoomKey = "";
    state.shiftZoomBlockedUntilRelease = true;
    closeDayZoomView();
  }
});

closeCalendarDialog.addEventListener("click", closeCalendarDialogView);

dialogBackdrop.addEventListener("click", event => {
  if (event.target === dialogBackdrop) {
    closeCalendarDialogView();
  }
});

calendarDialog.addEventListener("submit", addUrlCalendar);

importFileButton.addEventListener("click", () => {
  calendarFileInput.click();
});

diagnoseButton.addEventListener("click", openDiagnoseDialog);

closeDiagnoseDialog.addEventListener("click", closeDiagnoseDialogView);

diagnoseBackdrop.addEventListener("click", event => {
  if (event.target === diagnoseBackdrop) {
    closeDiagnoseDialogView();
  }
});

calendarFileInput.addEventListener("change", async () => {
  await importIcsFile(calendarFileInput.files[0]);
});

detectThunderbirdButton.addEventListener("click", detectThunderbirdCalendars);

periodMode.addEventListener("change", async () => {
  const nextMode = periodMode.value;
  const today = new Date();
  if (nextMode === "month") {
    state.currentDate = dateForPeriod(state.currentDate, nextMode);
  } else if (
    state.settings.periodMode === "month" &&
    state.currentDate.getFullYear() === today.getFullYear() &&
    state.currentDate.getMonth() === today.getMonth()
  ) {
    state.currentDate = dateForPeriod(today, nextMode);
  } else {
    state.currentDate = dateForPeriod(state.currentDate, nextMode);
  }

  await saveSettings();
  syncControls();
  await loadMonth();
});

viewProfile.addEventListener("change", async () => {
  state.settings.activeViewProfileId = viewProfile.value;
  await saveSettings();
  renderViewProfileControls();
  renderMonth();
});

newViewProfileButton.addEventListener("click", () => openProfileEditor());

themeMode.addEventListener("change", async () => {
  state.settings.themeMode = themeMode.value;
  await saveSettings();
  applyAppearance();
  renderMonth();
});

accentColor.addEventListener("change", async () => {
  state.settings.accentColor = sanitizeColor(accentColor.value, DEFAULT_SETTINGS.accentColor);
  await saveSettings();
  applyAppearance();
  renderMonth();
});

dragCalendarMove.addEventListener("change", async () => {
  state.settings.dragCalendarMove = dragCalendarMove.checked;
  await saveSettings();
});

restoreRemovedCalendarsButton.addEventListener("click", restoreRemovedCalendars);

exportPdfButton.addEventListener("click", () => {
  settingsPanel.hidden = true;
  settingsToggle.setAttribute("aria-expanded", "false");
  window.print();
});

window.addEventListener("blur", () => {
  hideEventTooltip();
  releaseShiftDayZoom();
});
window.addEventListener("scroll", hideEventTooltip, true);
document.addEventListener("pointermove", pointerEvent => {
  state.lastPointer = pointerSnapshot(pointerEvent);
  if (!pointerEvent.shiftKey || state.shiftZoomHeld || state.shiftZoomBlockedUntilRelease) {
    return;
  }
  const cell = pointerEvent.target.closest?.(".day-cell[data-date]") || dayCellAtPointer();
  if (cell) {
    activateShiftDayZoom(dateFromDayKey(cell.dataset.date), pointerEvent, {
      forDrag: Boolean(state.draggedEvent)
    });
  }
});
window.addEventListener("keydown", keyEvent => {
  if (
    keyEvent.key.toLocaleLowerCase() === "z" &&
    (keyEvent.ctrlKey || keyEvent.metaKey) &&
    !keyEvent.altKey &&
    !keyEvent.target.closest?.("input, textarea, select, [contenteditable='true']")
  ) {
    keyEvent.preventDefault();
    undoLastAction();
    return;
  }
  if (keyEvent.key === "Shift" && !keyEvent.repeat && !state.shiftZoomHeld) {
    const cell = dayCellAtPointer();
    if (cell) {
      activateShiftDayZoom(dateFromDayKey(cell.dataset.date), keyEvent, {
        forDrag: Boolean(state.draggedEvent)
      });
    }
  }
  if (keyEvent.key !== "Escape") {
    return;
  }
  settingsPanel.hidden = true;
  settingsToggle.setAttribute("aria-expanded", "false");
  filterPanel.hidden = true;
  filterToggle.setAttribute("aria-expanded", "false");
  closeEventContextMenu();
  closeCalendarTypeDialogView();
  state.shiftZoomHeld = false;
  state.shiftZoomKey = "";
  closeDayZoomView();
});
window.addEventListener("keyup", keyEvent => {
  if (keyEvent.key === "Shift") {
    releaseShiftDayZoom();
  }
});
window.addEventListener("focus", async () => {
  if (state.refreshAfterEditor && !state.isLoading) {
    state.refreshAfterEditor = false;
    await loadMonth();
  }
});
document.addEventListener("visibilitychange", async () => {
  if (!document.hidden && state.refreshAfterEditor && !state.isLoading) {
    state.refreshAfterEditor = false;
    await loadMonth();
  }
});
let resizeFrame = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(renderMonth);
});

tb.storage.onChanged.addListener(async changes => {
  if (changes[EXTERNAL_CALENDAR_KEY] && !state.isLoading) {
    await loadSettings();
    syncControls();
    await loadMonth();
    return;
  }

  if (
    changes.calendarDataRevision ||
    changes.accentColor ||
    changes.weekStartsOn ||
    changes.periodMode ||
    changes.hiddenCalendarIds ||
    changes.calendarVisibilityOverrides ||
    changes.removedCalendarIds ||
    changes.collapsedCalendarTypeIds ||
    changes.dragCalendarMove ||
    changes.themeMode ||
    changes.peoplePanelOpen ||
    changes.peopleSearch ||
    changes.calendarTypes ||
    changes.calendarTypeAssignments ||
    changes.calendarPersonAssignments ||
    changes.viewProfiles ||
    changes.activeViewProfileId
  ) {
    await loadSettings();
    syncControls();
    if (changes.calendarDataRevision) {
      await loadMonth();
    } else {
      renderMonth();
    }
  }
});

const syncNowButton = document.getElementById("sync-now");
if (syncNowButton) syncNowButton.addEventListener("click", async () => {
  if (syncNowButton.disabled) return;
  const status = document.getElementById("sync-now-status");
  syncNowButton.disabled = true;
  status.textContent = "Senden und Empfangen läuft …";
  try {
    const ids = (state.data?.calendars || []).filter(isCalendarVisible).map(calendar => calendar.id);
    const result = await tb.runtime.sendMessage({ type: "syncNow", calendarIds: ids });
    await loadMonth();
    const providerText = (result?.providers?.calendars || []).map(item => `${item.name}: ${
      {received:"Antwort empfangen",local:"lokaler Kalender",pending:"Anbieter läuft noch",failed:"Fehler",missing:"nicht verfügbar"}[item.status]
    }`).join(" · ");
    status.textContent = `${providerText || "Keine aktiven Kalender"}. ${result?.transport?.message || "Hub-Austausch nicht bestätigt."}`;
  } catch (_) { status.textContent = "Synchronisierung fehlgeschlagen. Bitte Zugang und Verbindung prüfen."; }
  finally { syncNowButton.disabled = false; }
});

init();
