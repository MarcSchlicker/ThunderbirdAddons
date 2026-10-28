var { ExtensionCommon: { ExtensionAPI } } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);
var { ExtensionStorage } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionStorage.sys.mjs"
);
var { ExtensionStorageIDB } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionStorageIDB.sys.mjs"
);

const MAX_REQUEST_BYTES = 1024 * 1024;
// Experiment scopes are not DOM windows. Import the parser before using it for
// credentials, CalDAV URLs and network addresses, without masking valid URLs.
if (typeof URL === "undefined") Cu.importGlobalProperties(["URL"]);
const CONNECTED_WINDOW_MS = 60 * 1000;
const DESKTOP_SYNC_REQUEST_TOPIC = "tb-connect-module-bridge:desktop-state";
const DESKTOP_SYNC_RESPONSE_TOPIC = "tb-connect-module-bridge:desktop-state-response";
const DAILY_PLANNER_EXTENSION_ID = "daily-planner@example.local";
const DAILY_PLANNER_PEER_ID = "desktop-daily-planner";
const DAILY_PLANNER_STORAGE_KEY = "dailyPlannerState";
const DAILY_PLANNER_MODULE_ID = "de.tbconnect.modules.daily-planner";
const CALENDAR_RASTER_EXTENSION_ID = "hour-grid-month-view@example.local";
const CALENDAR_MODULE_ID = "de.tbconnect.modules.calendar";
const CALENDAR_PEER_ID = "desktop-calendar-raster";
const DEFAULT_CALENDAR_COLOR = "#006fd6";
const ITEM_FILTER_TYPE_EVENT = 1 << 3;
const ITEM_FILTER_CLASS_OCCURRENCES = 1 << 16;
const MAX_CALENDAR_EVENTS = 1500;
const NEXTCLOUD_LOGIN_REALM_PREFIX = "TB-Connect Nextcloud";
let moduleBridgeServer = null;
let cachedCalendarUtils = null;

function nextcloudCredentialIdentity(serverUrl) {
  let url;
  try {
    url = new URL(String(serverUrl || "").trim());
  } catch (error) {
    throw new Error("Die Nextcloud-Adresse ist ungültig.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Die Nextcloud-Adresse muss HTTPS verwenden.");
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return {
    hostname: url.origin,
    realm: `${NEXTCLOUD_LOGIN_REALM_PREFIX} ${path}`
  };
}

async function nextcloudLogins(serverUrl, username) {
  const identity = nextcloudCredentialIdentity(serverUrl);
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername) {
    throw new Error("Der Nextcloud-Benutzername fehlt.");
  }
  const manager = Services.logins;
  const logins = typeof manager.searchLoginsAsync === "function"
    ? await manager.searchLoginsAsync({ origin: identity.hostname, httpRealm: identity.realm })
    : manager.findLogins(identity.hostname, null, identity.realm);
  return logins.filter(login => login.username === cleanUsername);
}

async function saveNextcloudCredential(serverUrl, username, appPassword) {
  const password = String(appPassword || "");
  if (!password) {
    throw new Error("Das Nextcloud-App-Passwort fehlt.");
  }
  const identity = nextcloudCredentialIdentity(serverUrl);
  const existing = await nextcloudLogins(serverUrl, username);
  const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  login.init(identity.hostname, null, identity.realm, String(username).trim(), password, "", "");
  if (existing.length) {
    if (typeof Services.logins.modifyLoginAsync === "function") {
      await Services.logins.modifyLoginAsync(existing[0], login);
    } else {
      Services.logins.modifyLogin(existing[0], login);
    }
  } else if (typeof Services.logins.addLoginAsync === "function") {
    await Services.logins.addLoginAsync(login);
  } else {
    Services.logins.addLogin(login);
  }
}

async function loadNextcloudCredential(serverUrl, username) {
  const login = (await nextcloudLogins(serverUrl, username))[0];
  return login?.password || "";
}

async function removeNextcloudCredential(serverUrl, username) {
  for (const login of await nextcloudLogins(serverUrl, username)) {
    if (typeof Services.logins.removeLoginAsync === "function") {
      await Services.logins.removeLoginAsync(login);
    } else {
      Services.logins.removeLogin(login);
    }
  }
}

async function registerNextcloudCalendar(configJson, calendarJson) {
  const config = safeJson(configJson), source = safeJson(calendarJson);
  if (!config || !source) throw new Error("Kalenderkonfiguration fehlt.");
  const base = new URL(config.serverUrl);
  const uri = new URL(source.url);
  const allowedPath = base.pathname.replace(/\/$/, "") + "/remote.php/dav/calendars/";
  if (uri.protocol !== "https:" || uri.origin !== base.origin || uri.username || uri.password || uri.search || uri.hash ||
      !uri.pathname.startsWith(allowedPath)) throw new Error("Unzulässige Nextcloud-Kalenderadresse.");
  const manager = calendarManager();
  const existing = Array.from(manager.getCalendars()).find(calendar => calendar.uri?.spec?.replace(/\/$/, "") === uri.href.replace(/\/$/, ""));
  if (existing) return {ok:true, alreadyRegistered:true, calendarId:String(existing.id)};
  const password = await loadNextcloudCredential(config.serverUrl, config.username);
  if (!password) throw new Error("Bitte Nextcloud zuerst im Hub anmelden.");
  const calendar = manager.createCalendar("caldav", Services.io.newURI(uri.href));
  calendar.id = Services.uuid.generateUUID().toString().replace(/[{}]/g, "");
  calendar.name = String(source.name || "Nextcloud-Kalender").slice(0,160);
  calendar.setProperty("username", config.username);
  calendar.setProperty("color", /^#[0-9a-f]{6}$/i.test(source.color) ? source.color : "#6558E8");
  calendar.setProperty("cache.enabled", true);
  const { CalDavDetectionSession } = ChromeUtils.importESModule("resource:///modules/caldav/CalDavSession.sys.mjs");
  // Thunderbird handles the actual HTTP auth challenge and saves the app password
  // under the provider's realm. Nothing is sent back to another add-on or phone.
  calendar.wrappedJSObject.session = new CalDavDetectionSession(config.username, password, true);
  manager.registerCalendar(calendar);
  try {
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    if (win) calendarUtils().view.getCompositeCalendar(win).addCalendar(calendar);
    calendar.refresh();
  } catch (error) { /* Registration is durable; provider refresh may finish later. */ }
  return {ok:true, calendarId:String(calendar.id), alreadyRegistered:false};
}

function safeJson(value, fallback = null) {
  try {
    return JSON.parse(String(value || ""));
  } catch (error) {
    return fallback;
  }
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function privilegedErrorText(error, fallback = "Unbekannter Fehler") {
  const message = String(error?.message || error || fallback).trim() || fallback;
  const result = typeof error?.result === "number" ? ` (Code ${error.result})` : "";
  return `${message}${result}`;
}

function utf8ToBytes(value) {
  const converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(
    Ci.nsIScriptableUnicodeConverter
  );
  converter.charset = "UTF-8";
  return converter.ConvertFromUnicode(String(value)) + converter.Finish();
}

function bytesToUtf8(value) {
  const converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(
    Ci.nsIScriptableUnicodeConverter
  );
  converter.charset = "UTF-8";
  return converter.ConvertToUnicode(value);
}

function parseHeaders(text) {
  const result = {};
  for (const line of text.split("\r\n").slice(1)) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      result[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
    }
  }
  return result;
}

function validId(value, fallback = "") {
  const id = String(value || "").trim();
  return /^[a-z0-9][a-z0-9._-]{2,119}$/i.test(id) ? id : fallback;
}

function timeOrEpoch(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function connectionAddress(transport) {
  const candidates = [
    transport?.host,
    transport?.hostName,
    transport?.peerAddr?.address,
    transport?.peerAddr?.host
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim().toLowerCase();
    if (value) {
      return value.replace(/^\[|\]$/g, "").split("%")[0];
    }
  }
  return "";
}

function isLoopbackAddress(address) {
  return address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    address === "localhost" ||
    /^127(?:\.\d{1,3}){3}$/.test(address);
}

function publicPeer(peer) {
  return {
    id: peer.id,
    name: peer.name,
    kind: peer.kind,
    lastSyncAt: peer.lastSyncAt,
    modules: peer.modules || [],
    moduleReceipts: peer.moduleReceipts || {},
    moduleInstallations: peer.moduleInstallations || {}
  };
}

function mergeDailyPlannerState(existingState, incomingState, incomingKind = "") {
  if (!existingState || typeof existingState !== "object") {
    return incomingState;
  }
  if (!incomingState || typeof incomingState !== "object") {
    return existingState;
  }
  const useIncomingBase = timeOrEpoch(incomingState.updatedAt) >= timeOrEpoch(existingState.updatedAt);
  const result = jsonSafe(useIncomingBase ? incomingState : existingState);
  // Mail references, source calendar data and planner settings are owned by Thunderbird.
  // A phone's newer task timestamp must never clear them or resurrect a removed mail reference.
  const desktopSource = incomingKind === "desktop" ? incomingState : incomingKind === "mobile" ? existingState : null;
  if (desktopSource) {
    for (const key of ["emails", "calendar", "settings"]) {
      if (Object.prototype.hasOwnProperty.call(desktopSource, key)) result[key] = jsonSafe(desktopSource[key]);
      else if (Object.prototype.hasOwnProperty.call(existingState, key)) result[key] = jsonSafe(existingState[key]);
    }
  }
  const existingTasks = Array.isArray(existingState.tasks) ? existingState.tasks : [];
  const incomingTasks = Array.isArray(incomingState.tasks) ? incomingState.tasks : [];
  const deletedById = new Map();
  for (const tombstone of [
    ...(Array.isArray(existingState.deletedTasks) ? existingState.deletedTasks : []),
    ...(Array.isArray(incomingState.deletedTasks) ? incomingState.deletedTasks : [])
  ]) {
    const id = validId(tombstone?.id, "");
    const deletedAt = String(tombstone?.deletedAt || "");
    if (!id || !timeOrEpoch(deletedAt)) {
      continue;
    }
    const current = deletedById.get(id);
    if (!current || timeOrEpoch(deletedAt) >= timeOrEpoch(current.deletedAt)) {
      deletedById.set(id, { id, deletedAt });
    }
  }
  const tasksById = new Map();
  for (const task of [...existingTasks, ...incomingTasks]) {
    const id = validId(task?.id, "");
    if (!id) {
      continue;
    }
    const current = tasksById.get(id);
    if (!current || timeOrEpoch(task.updatedAt) >= timeOrEpoch(current.updatedAt)) {
      tasksById.set(id, task);
    }
  }
  result.tasks = [...tasksById.values()].filter(task => {
    const tombstone = deletedById.get(validId(task?.id, ""));
    return !tombstone || timeOrEpoch(task?.updatedAt) > timeOrEpoch(tombstone.deletedAt);
  });
  // Keep deletion markers indefinitely.  They are compact, versioned records
  // that stop an older offline phone or desktop from resurrecting an item.
  result.deletedTasks = [...deletedById.values()];
  return result;
}

function deserializeStoredValue(value) {
  if (value && typeof value.deserialize === "function") {
    return value.deserialize(globalThis, true);
  }
  return value;
}

async function readDailyPlannerState() {
  const extension = ExtensionParent.GlobalManager.getExtension(DAILY_PLANNER_EXTENSION_ID);
  if (!extension) {
    throw new Error("Der Tagesplaner ist nicht aktiv.");
  }

  // Thunderbird 128 can store extension data either in its newer IndexedDB
  // backend or in the established JSON backend.  Read the active backend
  // first, then deliberately fall back to the legacy backend for profiles
  // that have not migrated yet.
  try {
    const principal = ExtensionStorageIDB.getStoragePrincipal(extension);
    const database = await ExtensionStorageIDB.open(
      principal,
      extension.hasPermission("unlimitedStorage")
    );
    try {
      const stored = await database.get(DAILY_PLANNER_STORAGE_KEY);
      const state = deserializeStoredValue(stored?.[DAILY_PLANNER_STORAGE_KEY]);
      if (state && typeof state === "object") {
        return jsonSafe(state);
      }
    } finally {
      try { database.close(); } catch (error) {}
    }
  } catch (idbError) {
    // The profile may intentionally still use the JSON storage backend.
  }

  const stored = await ExtensionStorage.get(DAILY_PLANNER_EXTENSION_ID, DAILY_PLANNER_STORAGE_KEY);
  const state = deserializeStoredValue(stored?.[DAILY_PLANNER_STORAGE_KEY]);
  if (!state || typeof state !== "object") {
    throw new Error("Der Tagesplaner enthält noch keinen gespeicherten Zustand.");
  }
  return jsonSafe(state);
}

function calendarUtils() {
  if (!cachedCalendarUtils) {
    cachedCalendarUtils = ChromeUtils.importESModule(
      "resource:///modules/calendar/calUtils.sys.mjs"
    ).cal;
  }
  return cachedCalendarUtils;
}

function calendarManager() {
  try {
    return Cc["@mozilla.org/calendar/manager;1"].getService(Ci.calICalendarManager);
  } catch (error) {
    return calendarUtils().manager;
  }
}

function calendarProperty(calendar, name, fallback = null) {
  try {
    const value = calendar?.getProperty?.(name);
    return value == null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function calendarColor(calendar) {
  const color = String(calendarProperty(calendar, "color", DEFAULT_CALENDAR_COLOR));
  return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_CALENDAR_COLOR;
}

function calendarProvider(calendar) {
  const endpoint = calendarEndpointHint(calendar).toLowerCase();
  if (endpoint === "calendar.google.com" || endpoint.endsWith(".google.com") || endpoint.endsWith(".googleapis.com")) {
    return "Google Calendar";
  }
  const type = String(calendar?.type || "").trim().toLowerCase();
  const knownProviders = {
    caldav: "CalDAV",
    google: "Google Calendar",
    ics: "ICS / Web-Kalender",
    storage: "Lokaler Thunderbird-Kalender",
    memory: "Lokaler Thunderbird-Kalender"
  };
  return knownProviders[type] || (type ? type.toUpperCase() : "Thunderbird-Kalender");
}

function calendarEndpointHint(calendar) {
  // A calendar URL can contain user names, opaque collection paths, query
  // parameters, or even legacy password fragments. The mobile companion only
  // needs a provider hint for its sign-in screen, never the actual credential
  // material or a full private URL.
  const rawUri = String(calendar?.uri?.spec || "").trim();
  if (!rawUri) return "";
  try {
    const url = new URL(rawUri);
    return ["http:", "https:"].includes(url.protocol) ? url.host : "";
  } catch (error) {
    return "";
  }
}

function calendarSummary(calendar) {
  const disabled = calendarProperty(calendar, "disabled", false);
  const composite = calendarProperty(calendar, "calendar-main-in-composite", true);
  return {
    id: String(calendar?.id || ""),
    name: String(calendar?.name || "(Ohne Namen)"),
    type: String(calendar?.type || ""),
    provider: calendarProvider(calendar),
    endpointHint: calendarEndpointHint(calendar),
    color: calendarColor(calendar),
    readOnly: Boolean(calendar?.readOnly),
    visible: disabled !== true && disabled !== "true" && composite !== false && composite !== "false"
  };
}

function visibleCalendars() {
  return Array.from(calendarManager().getCalendars() || []).filter(calendar => {
    const disabled = calendarProperty(calendar, "disabled", false);
    const composite = calendarProperty(calendar, "calendar-main-in-composite", true);
    const supportsEvents = calendarProperty(calendar, "capabilities.events.supported", true);
    return disabled !== true && disabled !== "true" && composite !== false && composite !== "false" && supportsEvents !== false;
  });
}

function calendarDateTimePart(dateTime) {
  if (!dateTime) return null;
  let value = dateTime;
  try {
    value = dateTime.getInTimezone?.(calendarUtils().dtz.defaultTimezone) || dateTime;
  } catch (error) {}
  return {
    year: Number(value.year),
    month: Number(value.month) + 1,
    day: Number(value.day),
    hour: value.isDate ? 0 : Number(value.hour || 0),
    minute: value.isDate ? 0 : Number(value.minute || 0),
    second: value.isDate ? 0 : Number(value.second || 0),
    isDate: Boolean(value.isDate),
    epochMillis: !value.isDate && Number.isFinite(Number(value.nativeTime)) ? Number(value.nativeTime) / 1000 : null
  };
}

function calendarText(item, name) {
  try {
    const value = item?.getProperty?.(name);
    return value == null ? "" : String(value);
  } catch (error) {
    return "";
  }
}

function serializeCalendarEvent(item, calendar) {
  if (!item || (item.isEvent && !item.isEvent())) return null;
  const start = calendarDateTimePart(item.startDate);
  const end = calendarDateTimePart(item.endDate);
  if (!start || !end) return null;
  const sourceCalendar = item.calendar || calendar;
  const summary = calendarSummary(sourceCalendar);
  return {
    id: String(item.hashId || item.id || `${summary.id}:${item.title || ""}`),
    itemId: String(item.id || ""),
    calendarId: summary.id || summary.name,
    calendarName: summary.name,
    calendarColor: summary.color,
    title: String(item.title || "(Ohne Titel)"),
    location: calendarText(item, "LOCATION"),
    allDay: Boolean(item.startDate?.isDate || item.endDate?.isDate),
    start,
    end
  };
}

function toCalendarDateTime(date) {
  const cal = calendarUtils();
  return cal.dtz.jsDateToDateTime(date, cal.dtz.defaultTimezone);
}

function calendarEditVersion(item) {
  const hash = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
  hash.init(hash.SHA256);
  const bytes = new TextEncoder().encode(String(item.icalString));
  hash.update(bytes, bytes.length);
  return hash.finish(true);
}

async function mobileCalendarEdit(payload) {
  const calendar = calendarManager().getCalendarById(String(payload.calendarId || ""));
  if (!calendar || !visibleCalendars().some(entry => entry.id === calendar.id)) throw new Error("Kalender nicht gefunden oder ausgeblendet.");
  const item = await calendar.getItem(String(payload.itemId || ""));
  if (!item || item.recurrenceInfo || item.recurrenceId) throw new Error("Termin fehlt oder ist eine Serie. Serien bitte in Thunderbird bearbeiten.");
  if (calendar.readOnly || calendarUtils().acl?.userCanModifyItem?.(item) === false) throw new Error("Der Kalender ist schreibgeschützt.");
  const version = calendarEditVersion(item);
  if (payload.action === "read") return { ok: true, event: serializeCalendarEvent(item, calendar), editVersion: version };
  if (payload.action !== "update") throw new Error("Unbekannte Kalenderaktion.");
  if (!payload.expectedVersion || payload.expectedVersion !== version) {
    return { ok: false, conflict: true, error: "Der Termin wurde zwischenzeitlich geändert. Bitte neu laden; es wurde nichts überschrieben." };
  }
  const title = String(payload.title || "").trim();
  const location = String(payload.location || "");
  const startMillis = Number(payload.startMillis), endMillis = Number(payload.endMillis);
  if (!title || title.length > 500 || location.length > 2000 || !Number.isSafeInteger(startMillis) ||
      !Number.isSafeInteger(endMillis) || endMillis <= startMillis || startMillis < Date.UTC(2000, 0, 1) || endMillis > Date.UTC(2201, 0, 1)) {
    throw new Error("Titel, Ort oder Zeitraum ist ungültig.");
  }
  const copy = item.clone();
  copy.title = title;
  copy.setProperty("LOCATION", location);
  for (const [field, millis] of [["startDate", startMillis], ["endDate", endMillis]]) {
    const date = copy[field].clone();
    if (date.isDate) {
      const utc = new Date(millis);
      if (utc.getUTCHours() || utc.getUTCMinutes() || utc.getUTCSeconds() || utc.getUTCMilliseconds()) throw new Error("Ganztagstermine benötigen volle UTC-Tage.");
      date.day = 1; date.year = utc.getUTCFullYear(); date.month = utc.getUTCMonth(); date.day = utc.getUTCDate();
    } else {
      date.nativeTime = millis * 1000;
    }
    copy[field] = date;
  }
  // modifyItem passes the original item to the provider's own generation check.
  // A provider conflict is returned to the caller, never force-overwritten.
  await calendar.modifyItem(copy, item);
  return { ok: true };
}

async function calendarItems(calendar, start, end) {
  if (typeof calendar.getItemsAsArray !== "function") {
    throw new Error("Der Kalender bietet keine kompatible Terminschnittstelle.");
  }
  return calendar.getItemsAsArray(
    ITEM_FILTER_TYPE_EVENT | ITEM_FILTER_CLASS_OCCURRENCES,
    0,
    start,
    end
  );
}

async function readCalendarModuleState() {
  if (!ExtensionParent.GlobalManager.getExtension(CALENDAR_RASTER_EXTENSION_ID)) {
    throw new Error("Kalender Raster ist nicht aktiv.");
  }
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 3, 1, 0, 0, 0, 0);
  const calendars = visibleCalendars();
  const events = [];
  const errors = [];
  for (const calendar of calendars) {
    const summary = calendarSummary(calendar);
    try {
      const items = await calendarItems(calendar, toCalendarDateTime(rangeStart), toCalendarDateTime(rangeEnd));
      for (const item of items) {
        const event = serializeCalendarEvent(item, calendar);
        if (event) events.push(event);
        if (events.length >= MAX_CALENDAR_EVENTS) break;
      }
    } catch (error) {
      errors.push({ calendarId: summary.id, calendarName: summary.name, message: error?.message || String(error) });
    }
    if (events.length >= MAX_CALENDAR_EVENTS) {
      errors.push({ calendarId: "", calendarName: "", message: `Die mobile Kalenderansicht wurde auf ${MAX_CALENDAR_EVENTS} Termine begrenzt.` });
      break;
    }
  }
  const generatedAt = new Date().toISOString();
  return {
    version: 1,
    source: "thunderbird-calendar",
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    calendars: calendars.map(calendarSummary),
    events,
    errors,
    generatedAt,
    updatedAt: generatedAt
  };
}

function ModuleBridgeConnection(server, transport) {
  this.server = server;
  this.transport = transport;
  this.input = transport.openInputStream(0, 0, 0).QueryInterface(Ci.nsIAsyncInputStream);
  this.output = transport.openOutputStream(0, 0, 0).QueryInterface(Ci.nsIAsyncOutputStream);
  this.buffer = "";
  this.responseBuffer = null;
  this.responding = false;
  this.closed = false;
  this.input.asyncWait(this, 0, 0, Services.tm.mainThread);
}

ModuleBridgeConnection.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIInputStreamCallback", "nsIOutputStreamCallback"]),

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
    if (this.closed || this.responding) {
      return;
    }
    this.responding = true;
    const json = JSON.stringify(body);
    const jsonBytes = utf8ToBytes(json);
    this.responseBuffer = utf8ToBytes(
      `HTTP/1.1 ${status}\r\n` +
      "Content-Type: application/json; charset=utf-8\r\n" +
      "Cache-Control: no-store\r\n" +
      // The daily planner runs in a different Thunderbird extension origin. It
      // still needs the normal token / loopback checks below, but its browser
      // fetch must be allowed to read the hub response after its preflight.
      "Access-Control-Allow-Origin: *\r\n" +
      "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
      "Access-Control-Allow-Headers: Content-Type, X-TB-Connect-Module-Token\r\n" +
      "Access-Control-Max-Age: 600\r\n" +
      // Keep the socket alive until the client has consumed Content-Length.
      // Closing the underlying nsISocketTransport immediately after write()
      // can discard bytes that are still queued by Windows.
      "Connection: keep-alive\r\n" +
      `Content-Length: ${jsonBytes.length}\r\n\r\n` +
      json
    );
    this.flushResponse();
  },

  flushResponse() {
    if (this.closed || !this.responseBuffer) {
      return;
    }
    try {
      const written = this.output.write(this.responseBuffer, this.responseBuffer.length);
      if (!Number.isInteger(written) || written <= 0) {
        throw new Error("Die Antwort konnte nicht geschrieben werden.");
      }
      this.responseBuffer = this.responseBuffer.slice(written);
    } catch (error) {
      // Socket outputs can become temporarily full.  Closing here truncated a
      // successful /v1/pair response on some Android clients, consuming the
      // one-time code before the app received its access token.
    }
    if (!this.responseBuffer.length) {
      this.responseBuffer = null;
      try { this.output.flush(); } catch (error) {}
      // HttpURLConnection disconnects after reading Content-Length. Wait for
      // that peer close instead of aborting Thunderbird's pending socket data.
      try {
        this.input.asyncWait(this, 0, 0, Services.tm.mainThread);
      } catch (error) {
        this.close();
      }
      return;
    }
    try {
      this.output.asyncWait(this, 0, 0, Services.tm.mainThread);
    } catch (error) {
      this.close();
    }
  },

  onOutputStreamReady(_stream) {
    this.flushResponse();
  },

  onInputStreamReady(stream) {
    if (this.closed) {
      return;
    }
    if (this.responding) {
      // After the response is fully queued this callback means the HTTP client
      // closed (or unexpectedly sent more input). Either way the response has
      // already been handed to the transport and the connection can be freed.
      this.close();
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
    if (this.buffer.length > MAX_REQUEST_BYTES) {
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
    const headers = parseHeaders(headerText);
    const contentLength = Number(headers["content-length"] || 0);
    if (!Number.isInteger(contentLength) || contentLength < 0 || contentLength > MAX_REQUEST_BYTES) {
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

function ModuleBridgeServer(port, workspaceId, accessToken, extension = null) {
  this.extension = extension;
  this.startGeneration = 0;
  this.tlsSocket = null;
  this.tlsIdentity = null;
  this.tlsError = null;
  this.port = Number(port) || 47832;
  this.preferredPort = this.port;
  this.portFallback = null;
  this.workspaceId = validId(workspaceId, "workspace");
  this.accessToken = String(accessToken || "");
  this.socket = null;
  this.addresses = [];
  this.states = {};
  this.peers = {};
  this.mobileCatalog = [];
  this.pairing = null;
  // A mobile client can lose the HTTP response after the Hub accepted a
  // one-time pairing request. Keep that exact completed session briefly so a
  // retry from the same client can retrieve the access token instead of being
  // rejected as an expired code.
  this.completedPairings = {};
  this.lastDesktopRequest = null;
  this.connections = new Set();
  this.observerRegistered = false;
  this.startError = null;
}

ModuleBridgeServer.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIServerSocketListener", "nsIObserver"]),

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startOnce();
    try { return await this.startPromise; }
    finally { this.startPromise = null; }
  },

  async startOnce() {
    const generation = this.startGeneration;
    try {
      if (!this.socket) {
        const openSocket = port => {
          const socket = Cc["@mozilla.org/network/server-socket;1"].createInstance(Ci.nsIServerSocket);
          socket.init(port, true, -1);
          socket.asyncListen(this);
          return socket;
        };
        const requestedPort = this.preferredPort;
        try {
          this.socket = openSocket(requestedPort);
          this.portFallback = null;
        } catch (error) {
          // An older Hub build can still own the usual port while Thunderbird is
          // updating. A temporary free port is safe: its QR code includes the
          // active port and pairing still requires the short-lived secret.
          try {
            this.socket = openSocket(0);
            this.portFallback = {
              requestedPort,
              reason: privilegedErrorText(error, "Der Standardport ist belegt.")
            };
          } catch (fallbackError) {
            throw new Error(`Der lokale Hub konnte weder Port ${requestedPort} noch einen freien Ersatzport öffnen. Standardport: ${privilegedErrorText(error)}; Ersatzport: ${privilegedErrorText(fallbackError)}`);
          }
        }
        this.port = this.socket.port;
      }
      this.addresses = await this.listAddresses();
      if (generation !== this.startGeneration) return this.status();
      if (this.extension && !this.tlsSocket) {
        let tlsSocket = null;
        try {
          const environment = { Cc, Ci, Services, IOUtils, PathUtils };
          if (typeof crypto === "undefined") Cu.importGlobalProperties(["crypto"]);
          environment.crypto = crypto;
          const scope = { ChromeUtils };
          Services.scriptloader.loadSubScript(this.extension.getURL("api/moduleBridge/tls.js"), scope);
          this.tlsIdentity = await scope.TBHubTLS.ensure(this.extension, environment);
          if (generation !== this.startGeneration) return this.status();
          tlsSocket = Cc["@mozilla.org/network/tls-server-socket;1"].createInstance(Ci.nsITLSServerSocket);
          tlsSocket.init(this.preferredPort < 65535 ? this.preferredPort + 1 : 0, false, -1);
          tlsSocket.serverCert = this.tlsIdentity.certificate;
          tlsSocket.setVersionRange(0x0303, 0x0304);
          tlsSocket.setRequestClientCertificate(Ci.nsITLSServerSocket.REQUEST_NEVER);
          tlsSocket.asyncListen(this);
          this.tlsSocket = tlsSocket;
          this.tlsError = null;
        } catch (error) {
          try { tlsSocket?.close(); } catch (ignored) {}
          this.tlsError = privilegedErrorText(error, "Der verschlüsselte Hub konnte nicht gestartet werden.");
        }
      }
      if (!this.observerRegistered) {
        Services.obs.addObserver(this, DESKTOP_SYNC_REQUEST_TOPIC);
        this.observerRegistered = true;
      }
      this.startError = null;
    } catch (error) {
      // Exceptions thrown by an experiment method are reduced to Thunderbird's
      // generic “An unexpected error occurred”. Preserve a serializable,
      // actionable diagnosis for the dashboard and leave the server retryable.
      this.startError = privilegedErrorText(error, "Der lokale Dienst konnte nicht gestartet werden.");
      this.stop();
    }
    return this.status();
  },

  async listAddresses() {
    return new Promise(resolve => {
      let settled = false;
      const finish = values => {
        if (settled) return;
        settled = true;
        resolve(values);
      };
      try {
        const service = Cc["@mozilla.org/network-info-service;1"].getService(Ci.nsINetworkInfoService);
        const listener = {
          QueryInterface: ChromeUtils.generateQI(["nsIListNetworkAddressesListener"]),
          onListedNetworkAddresses(addresses) {
            // Thunderbird supplies an nsIArray on Windows, not a JavaScript
            // iterable. Array.from(nsIArray) silently returned [] and caused
            // the Hub to keep an outdated manually entered WLAN address.
            const raw = [];
            if (addresses && typeof addresses.length === "number") {
              for (let index = 0; index < addresses.length; index += 1) {
                try {
                  raw.push(addresses.queryElementAt
                    ? addresses.queryElementAt(index, Ci.nsISupportsCString)
                    : addresses[index]);
                } catch (error) {
                  try { raw.push(addresses.queryElementAt(index)); } catch (ignored) {}
                }
              }
            } else {
              try { raw.push(...Array.from(addresses || [])); } catch (error) {}
            }
            const values = raw
              .map(value => String(value?.data || value?.address || value || "").trim())
              .filter(value => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value))
              .filter(value => value !== "127.0.0.1" && !value.startsWith("169.254."));
            finish([...new Set(values)]);
          },
          onListNetworkAddressesFailed() { finish([]); }
        };
        service.listNetworkAddresses(listener);
      } catch (error) {
        finish([]);
      }
      // Some Thunderbird builds do not call back while a network adapter is
      // changing. Starting the Hub must still work; the dashboard can then use
      // a manually entered address rather than hanging forever.
      Services.tm.dispatchToMainThread(() => {});
      setTimeout(() => finish([]), 1500);
    });
  },

  stop() {
    this.startGeneration += 1;
    if (this.tlsSocket) {
      try { this.tlsSocket.close(); } catch (error) {}
      this.tlsSocket = null;
    }
    for (const connection of this.connections) {
      connection.close();
    }
    if (this.socket) {
      try { this.socket.close(); } catch (error) {}
      this.socket = null;
    }
    if (this.observerRegistered) {
      try { Services.obs.removeObserver(this, DESKTOP_SYNC_REQUEST_TOPIC); } catch (error) {}
      this.observerRegistered = false;
    }
  },

  activePairing() {
    if (!this.pairing || timeOrEpoch(this.pairing.expiresAt) <= Date.now()) {
      this.pairing = null;
      return null;
    }
    return this.pairing;
  },

  completedPairing(payload) {
    const sessionId = String(payload?.sessionId || "");
    const completed = this.completedPairings[sessionId];
    if (!completed) {
      return null;
    }
    if (timeOrEpoch(completed.expiresAt) <= Date.now()) {
      delete this.completedPairings[sessionId];
      return null;
    }
    const clientId = String(payload?.client?.id || "");
    if (String(payload?.pairingSecret || "") !== completed.secret || clientId !== completed.clientId) {
      return null;
    }
    return completed;
  },

  setPairing(sessionJson) {
    const session = safeJson(sessionJson);
    if (!session || !session.sessionId || !session.secret || timeOrEpoch(session.expiresAt) <= Date.now()) {
      this.pairing = null;
      return;
    }
    this.pairing = {
      sessionId: String(session.sessionId),
      secret: String(session.secret),
      expiresAt: String(session.expiresAt)
    };
  },

  setStates(statesJson) {
    const states = safeJson(statesJson, {});
    if (!states || typeof states !== "object" || Array.isArray(states)) {
      throw new Error("Ungültiger Modulzustand.");
    }
    this.states = states;
  },

  setCatalog(catalogJson) {
    const catalog = safeJson(catalogJson, []);
    if (!Array.isArray(catalog)) {
      throw new Error("Ungültiger mobiler Modulkatalog.");
    }
    // The dashboard has already validated the HTTPS descriptors. Keep a plain
    // JSON snapshot only; it is returned to paired mobile devices on sync.
    this.mobileCatalog = jsonSafe(catalog).slice(0, 100);
  },

  setPeers(peersJson) {
    const peers = safeJson(peersJson, []);
    if (!Array.isArray(peers)) {
      return;
    }
    const nextPeers = {};
    for (const peer of peers) {
      const id = validId(peer?.id, "");
      if (!id || !peer?.lastSyncAt) {
        continue;
      }
      nextPeers[id] = {
        id,
        name: String(peer.name || "Unbekanntes Gerät").slice(0, 120),
        kind: String(peer.kind || "mobile").slice(0, 32),
        lastSyncAt: String(peer.lastSyncAt),
        modules: Array.isArray(peer.modules) ? peer.modules.map(value => validId(value, "")).filter(Boolean) : [],
        moduleReceipts: peer.moduleReceipts && typeof peer.moduleReceipts === "object"
          ? jsonSafe(peer.moduleReceipts)
          : {},
        moduleInstallations: peer.moduleInstallations && typeof peer.moduleInstallations === "object"
          ? jsonSafe(peer.moduleInstallations)
          : {}
      };
    }
    this.peers = nextPeers;
  },

  status() {
    const peers = Object.values(this.peers).map(publicPeer).sort((left, right) =>
      timeOrEpoch(right.lastSyncAt) - timeOrEpoch(left.lastSyncAt)
    );
    return {
      running: Boolean(this.socket),
      startError: this.startError,
      protocol: "tb-connect-module-bridge/1",
      workspaceId: this.workspaceId,
      port: this.port,
      tlsPort: this.tlsSocket?.port || null,
      tlsFingerprint: this.tlsSocket ? this.tlsIdentity?.fingerprint : null,
      tlsError: this.tlsError,
      transportSecurity: this.tlsSocket ? "tls-pinned" : "loopback-only",
      portFallback: this.portFallback ? {
        requestedPort: this.portFallback.requestedPort,
        reason: this.portFallback.reason
      } : null,
      addresses: this.addresses,
      pairingMode: Boolean(this.activePairing()),
      pairingExpiresAt: this.activePairing()?.expiresAt || null,
      connected: peers.some(peer => peer.kind === "mobile" && Object.values(peer.moduleReceipts || {}).some(receipt =>
        Date.now() - timeOrEpoch(receipt.confirmedAt) < CONNECTED_WINDOW_MS)),
      lastDesktopRequest: this.lastDesktopRequest,
      mobileCatalogCount: this.mobileCatalog.length,
      peers
    };
  },

  onSocketAccepted(_socket, transport) {
    const connection = new ModuleBridgeConnection(this, transport);
    this.connections.add(connection);
  },

  onStopListening(socket) {
    if (socket === this.tlsSocket) this.tlsSocket = null;
    else if (socket === this.socket) this.socket = null;
  },

  syncStoredDailyPlannerState(state) {
    if (!state || typeof state !== "object") {
      throw new Error("Der gespeicherte Tagesplaner-Zustand ist ungültig.");
    }
    const payload = {
      protocol: "tb-connect-module-bridge/1",
      moduleId: DAILY_PLANNER_MODULE_ID,
      client: {
        id: DAILY_PLANNER_PEER_ID,
        name: "Dieser Thunderbird",
        kind: "desktop"
      },
      updatedAt: String(state.updatedAt || new Date().toISOString()),
      state
    };
    const peer = this.peerFromPayload(payload);
    this.peers[peer.id] = peer;
    const record = this.mergeModuleState(DAILY_PLANNER_MODULE_ID, payload, peer);
    this.lastDesktopRequest = {
      at: peer.lastSyncAt,
      address: "Thunderbird-Speicher",
      accepted: true,
      message: "Tagesplaner-Zustand direkt aus Thunderbird übernommen."
    };
    return record;
  },

  syncStoredCalendarState(state) {
    if (!state || typeof state !== "object") {
      throw new Error("Der gespeicherte Kalender-Zustand ist ungültig.");
    }
    const payload = {
      protocol: "tb-connect-module-bridge/1",
      moduleId: CALENDAR_MODULE_ID,
      client: {
        id: CALENDAR_PEER_ID,
        name: "Dieser Thunderbird – Kalender",
        kind: "desktop"
      },
      updatedAt: String(state.updatedAt || new Date().toISOString()),
      state
    };
    const peer = this.peerFromPayload(payload);
    this.peers[peer.id] = peer;
    const record = this.mergeModuleState(CALENDAR_MODULE_ID, payload, peer);
    this.lastDesktopRequest = {
      at: peer.lastSyncAt,
      address: "Thunderbird-Kalender",
      accepted: true,
      message: `${Array.isArray(state.events) ? state.events.length : 0} Kalendertermine direkt aus Thunderbird übernommen.`
    };
    return record;
  },

  observe(_subject, topic, data) {
    if (topic !== DESKTOP_SYNC_REQUEST_TOPIC) {
      return;
    }
    const request = safeJson(data);
    const requestId = validId(request?.requestId, "");
    const payload = request?.payload;
    const reply = result => {
      if (requestId) {
        Services.obs.notifyObservers(
          null,
          DESKTOP_SYNC_RESPONSE_TOPIC,
          JSON.stringify({ requestId, ...result })
        );
      }
    };
    if (!requestId || !payload || typeof payload !== "object" || payload.protocol !== "tb-connect-module-bridge/1") {
      reply({ ok: false, error: "Ungültige interne Desktop-Anfrage." });
      return;
    }
    const moduleId = validId(payload.moduleId, "");
    const peer = this.peerFromPayload(payload);
    if (!moduleId || !peer || !payload.state || typeof payload.state !== "object") {
      reply({ ok: false, error: "Modul, Desktop oder Modulzustand fehlt." });
      return;
    }
    this.peers[peer.id] = peer;
    const record = this.mergeModuleState(moduleId, payload, peer);
    this.lastDesktopRequest = {
      at: new Date().toISOString(),
      address: "Thunderbird intern",
      accepted: true,
      message: "Desktop-Modulzustand wurde intern übernommen."
    };
    reply({
      ok: true,
      result: {
        ok: true,
        protocol: "tb-connect-module-bridge/1",
        workspaceId: this.workspaceId,
        state: record.state,
        updatedAt: record.updatedAt,
        serverSyncAt: peer.lastSyncAt,
        moduleCatalog: this.mobileCatalog,
        status: this.status()
      }
    });
  },

  peerFromPayload(payload) {
    const input = payload?.client && typeof payload.client === "object" ? payload.client : {};
    const id = validId(input.id, "");
    if (!id) {
      return null;
    }
    const now = new Date().toISOString();
    const moduleId = validId(payload.moduleId, "");
    const old = this.peers[id] || {};
    const moduleReceipts = old.moduleReceipts && typeof old.moduleReceipts === "object"
      ? jsonSafe(old.moduleReceipts)
      : {};
    const moduleInstallations = old.moduleInstallations && typeof old.moduleInstallations === "object"
      ? jsonSafe(old.moduleInstallations)
      : {};
    if (moduleId) {
      moduleReceipts[moduleId] = {
        ...moduleReceipts[moduleId],
        requestedAt: now,
        receivedAt: String(input.kind || old.kind || "mobile") === "desktop" ? now : moduleReceipts[moduleId]?.receivedAt || null
      };
    }
    const deliveries = Array.isArray(payload?.moduleInstallations) ? payload.moduleInstallations : [];
    for (const delivery of deliveries) {
      const deliveredId = validId(delivery?.id, "");
      if (!deliveredId) continue;
      moduleInstallations[deliveredId] = {
        entry: String(delivery?.entry || "").slice(0, 80),
        status: String(delivery?.status || "Unbekannt").slice(0, 120),
        installedAt: String(delivery?.installedAt || "").slice(0, 80),
        reportedAt: now
      };
    }
    return {
      id,
      // A dashboard-defined name must survive each mobile sync. The phone's
      // technical default is used only for a newly seen peer.
      name: String(old.name || input.name || "Unbekanntes Gerät").slice(0, 120),
      kind: String(input.kind || old.kind || "mobile").slice(0, 32),
      lastSyncAt: now,
      modules: [...new Set([...(old.modules || []), moduleId])].filter(Boolean),
      moduleReceipts,
      moduleInstallations
    };
  },

  mergeModuleState(moduleId, payload, peer) {
    const incomingUpdatedAt = String(payload.updatedAt || payload.state?.updatedAt || new Date().toISOString());
    const existing = this.states[moduleId];
    const state = moduleId === DAILY_PLANNER_MODULE_ID && existing
      ? mergeDailyPlannerState(existing.state, payload.state, peer.kind)
      : payload.state;
    // Thunderbird is authoritative for the read-only calendar module. A phone
    // may request and cache calendar data, but may not replace the desktop
    // calendar with an empty local payload during its first sync.
    if (moduleId === CALENDAR_MODULE_ID && existing && peer.kind !== "desktop") {
      return existing;
    }
    if (!existing || moduleId === DAILY_PLANNER_MODULE_ID ||
      (moduleId === CALENDAR_MODULE_ID && peer.kind === "desktop") ||
      timeOrEpoch(incomingUpdatedAt) >= timeOrEpoch(existing.updatedAt)) {
      // A merge can add an offline task even when the sender's snapshot clock
      // is older. Such a changed payload must never reuse an acknowledged revision.
      const changed = existing && JSON.stringify(state) !== JSON.stringify(existing.state);
      const updatedAt = changed && timeOrEpoch(incomingUpdatedAt) <= timeOrEpoch(existing.updatedAt)
        ? new Date(Math.max(Date.now(), timeOrEpoch(existing.updatedAt) + 1)).toISOString()
        : timeOrEpoch(incomingUpdatedAt) >= timeOrEpoch(existing?.updatedAt) ? incomingUpdatedAt : existing.updatedAt;
      this.states[moduleId] = {
        state,
        updatedAt,
        lastWriter: peer.id,
        lastSyncAt: peer.lastSyncAt
      };
    }
    // The Tagesplaner already reads Thunderbird's native calendar through its
    // proven experiment API. Reuse that snapshot for the read-only Calendar
    // module instead of starting a second privileged calendar reader in the
    // Hub. This keeps both modules on the same desktop transport.
    const plannerCalendar = moduleId === DAILY_PLANNER_MODULE_ID && peer.kind === "desktop"
      ? payload.state?.calendar
      : null;
    const plannerCalendarTime = String(plannerCalendar?.updatedAt || plannerCalendar?.generatedAt || incomingUpdatedAt);
    if (plannerCalendar && typeof plannerCalendar === "object" &&
        timeOrEpoch(plannerCalendarTime) >= timeOrEpoch(this.states[CALENDAR_MODULE_ID]?.updatedAt)) {
      const previousCalendarPeer = this.peers[CALENDAR_PEER_ID] || {};
      const calendarPeer = {
        ...peer,
        id: CALENDAR_PEER_ID,
        name: "Dieser Thunderbird – Kalender",
        modules: [...new Set([...(previousCalendarPeer.modules || []), CALENDAR_MODULE_ID])],
        moduleReceipts: {
          ...(previousCalendarPeer.moduleReceipts || {}),
          [CALENDAR_MODULE_ID]: {
            receivedAt: peer.lastSyncAt,
            deliveredAt: peer.lastSyncAt
          }
        }
      };
      this.peers[calendarPeer.id] = calendarPeer;
      this.states[CALENDAR_MODULE_ID] = {
        state: plannerCalendar,
        updatedAt: plannerCalendarTime,
        lastWriter: calendarPeer.id,
        lastSyncAt: peer.lastSyncAt
      };
    }
    return this.states[moduleId];
  },

  handle(connection, request) {
    if (request.method === "OPTIONS") {
      // A preflight response must not be a 204 response with a JSON body.
      // Thunderbird otherwise drops the subsequent cross-extension POST.
      connection.respond("200 OK", { ok: true });
      return;
    }
    if (request.method === "GET" && request.path === "/v1/health") {
      connection.respond("200 OK", { ok: true, service: "tb-connect-module-bridge", ...this.status() });
      return;
    }
    if (request.method !== "POST" || !["/v1/pair", "/v1/sync", "/v1/desktop-sync", "/v1/ack", "/v1/calendar-edit"].includes(request.path)) {
      connection.respond("404 Not Found", { error: "Nicht gefunden." });
      return;
    }
    const payload = safeJson(bytesToUtf8(request.body));
    if (!payload || typeof payload !== "object" || payload.protocol !== "tb-connect-module-bridge/1") {
      connection.respond("400 Bad Request", { error: "Ungültige Modul-Brückenanfrage." });
      return;
    }
    const session = this.activePairing();
    const initialPairing = request.path === "/v1/pair" && session &&
      payload.sessionId === session.sessionId && payload.pairingSecret === session.secret;
    const completedPairing = request.path === "/v1/pair" ? this.completedPairing(payload) : null;
    const pairingAllowed = Boolean(initialPairing || completedPairing);
    const remoteAddress = connectionAddress(connection.transport);
    const isDesktopSync = request.path === "/v1/desktop-sync";
    const isLocalDesktopAdapter = isDesktopSync && isLoopbackAddress(remoteAddress);
    const suppliedToken = request.headers["x-tb-connect-module-token"] || payload.token;
    if (!pairingAllowed && !isLocalDesktopAdapter && suppliedToken !== this.accessToken) {
      if (isDesktopSync) {
        this.lastDesktopRequest = {
          at: new Date().toISOString(),
          address: remoteAddress || "unbekannt",
          accepted: false,
          message: "Kein lokaler Desktop-Absender erkannt."
        };
      }
      connection.respond("401 Unauthorized", { error: "Ungültiger Kopplungscode." });
      return;
    }
    const moduleId = validId(payload.moduleId, "");
    if (request.path === "/v1/calendar-edit") {
      mobileCalendarEdit(payload).then(async result => {
        if (result.ok && payload.action === "update") {
          try { this.syncStoredCalendarState(await readCalendarModuleState()); } catch (error) {}
        }
        connection.respond(result.conflict ? "409 Conflict" : "200 OK", result);
      }).catch(error => {
        const detail = String(error?.message || "");
        const safeMessages = ["Kalender nicht gefunden oder ausgeblendet.", "Termin fehlt oder ist eine Serie. Serien bitte in Thunderbird bearbeiten.",
          "Der Kalender ist schreibgeschützt.", "Unbekannte Kalenderaktion.", "Titel, Ort oder Zeitraum ist ungültig.", "Ganztagstermine benötigen volle UTC-Tage."];
        connection.respond("400 Bad Request", { error: safeMessages.includes(detail) ? detail : "Änderung vom Kalenderanbieter abgelehnt. Bitte in Thunderbird prüfen." });
      });
      return;
    }
    if (request.path === "/v1/ack") {
      const peerId = validId(payload.client?.id, "");
      const peer = this.peers[peerId];
      const record = this.states[moduleId];
      if (!peer || !record || String(payload.receivedUpdatedAt || "") !== String(record.updatedAt || "")) {
        connection.respond("409 Conflict", { error: "Der bestätigte Modulstand ist nicht mehr aktuell." });
        return;
      }
      const confirmedAt = new Date().toISOString();
      peer.moduleReceipts = peer.moduleReceipts || {};
      peer.moduleReceipts[moduleId] = { ...peer.moduleReceipts[moduleId], confirmedAt, confirmedUpdatedAt: record.updatedAt };
      connection.respond("200 OK", { ok: true, confirmedAt });
      return;
    }
    const peer = this.peerFromPayload(payload);
    if (!moduleId || !peer || !payload.state || typeof payload.state !== "object") {
      connection.respond("400 Bad Request", { error: "Modul, Gerät oder Modulzustand fehlt." });
      return;
    }
    if (isDesktopSync) {
      this.lastDesktopRequest = {
        at: new Date().toISOString(),
        address: remoteAddress || "unbekannt",
        accepted: true,
        message: "Desktop-Modulzustand wurde übernommen."
      };
    }
    this.peers[peer.id] = peer;
    const record = this.mergeModuleState(moduleId, payload, peer);
    if (initialPairing) {
      this.completedPairings[session.sessionId] = {
        secret: session.secret,
        clientId: peer.id,
        expiresAt: session.expiresAt
      };
      this.pairing = null;
    }
    connection.respond("200 OK", {
      ok: true,
      protocol: "tb-connect-module-bridge/1",
      workspaceId: this.workspaceId,
      token: pairingAllowed ? this.accessToken : undefined,
      state: record.state,
      updatedAt: record.updatedAt,
      serverSyncAt: peer.lastSyncAt,
      moduleCatalog: this.mobileCatalog,
      status: this.status()
    });
  }
};

async function startServer(port, workspaceId, accessToken, extension = null) {
  if (!moduleBridgeServer) {
    moduleBridgeServer = new ModuleBridgeServer(port, workspaceId, accessToken, extension);
  } else {
    moduleBridgeServer.workspaceId = validId(workspaceId, moduleBridgeServer.workspaceId);
    moduleBridgeServer.accessToken = String(accessToken || moduleBridgeServer.accessToken);
  }
  return moduleBridgeServer.start();
}

this.module_bridge = class extends ExtensionAPI {
  getAPI(context) {
    return {
      moduleBridge: {
        async start(port, workspaceId, accessToken) {
          // Experiment scripts are privileged. Register only this packaged, immutable
          // source tree as a local resource; never evaluate downloaded code.
          const resources = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
          resources.setSubstitution("tb-connect-hub-tls", context.extension.rootURI);
          const packagedSource = { getURL: path => "resource://tb-connect-hub-tls/" + path };
          return jsonSafe(await startServer(port, workspaceId, accessToken, packagedSource));
        },
        async setStates(statesJson) {
          if (!moduleBridgeServer) {
            throw new Error("Der Modul-Hub wurde noch nicht gestartet.");
          }
          moduleBridgeServer.setStates(statesJson);
        },
        async setCatalog(catalogJson) {
          if (!moduleBridgeServer) {
            throw new Error("Der Modul-Hub wurde noch nicht gestartet.");
          }
          moduleBridgeServer.setCatalog(catalogJson);
        },
        async getStates() {
          return JSON.stringify(moduleBridgeServer?.states || {});
        },
        async setPairing(sessionJson) {
          if (!moduleBridgeServer) {
            throw new Error("Der Modul-Hub wurde noch nicht gestartet.");
          }
          moduleBridgeServer.setPairing(sessionJson);
        },
        async setPeers(peersJson) {
          if (!moduleBridgeServer) {
            throw new Error("Der Modul-Hub wurde noch nicht gestartet.");
          }
          moduleBridgeServer.setPeers(peersJson);
        },
        async getStatus() {
          return jsonSafe(moduleBridgeServer?.status() || { running: false, peers: [] });
        },
        async syncDailyPlannerFromStorage() {
          if (!moduleBridgeServer) {
            throw new Error("Der Modul-Hub wurde noch nicht gestartet.");
          }
          try {
            const state = await readDailyPlannerState();
            return jsonSafe(moduleBridgeServer.syncStoredDailyPlannerState(state));
          } catch (error) {
            moduleBridgeServer.lastDesktopRequest = {
              at: new Date().toISOString(),
              address: "Thunderbird-Speicher",
              accepted: false,
              message: error?.message || String(error || "Der Tagesplaner konnte nicht gelesen werden.")
            };
            throw error;
          }
        },
        async syncCalendarFromStorage() {
          if (!moduleBridgeServer) {
            throw new Error("Der Modul-Hub wurde noch nicht gestartet.");
          }
          try {
            const state = await readCalendarModuleState();
            return jsonSafe(moduleBridgeServer.syncStoredCalendarState(state));
          } catch (error) {
            moduleBridgeServer.lastDesktopRequest = {
              at: new Date().toISOString(),
              address: "Thunderbird-Kalender",
              accepted: false,
              message: error?.message || String(error || "Der Kalender konnte nicht gelesen werden.")
            };
            throw error;
          }
        },
        async saveNextcloudCredential(serverUrl, username, appPassword) {
          try {
            await saveNextcloudCredential(serverUrl, username, appPassword);
            return { ok: true };
          } catch (error) {
            return { ok: false, error: `Nextcloud-Zugang konnte nicht im Thunderbird-Passwortspeicher gesichert werden: ${privilegedErrorText(error)}` };
          }
        },
        async loadNextcloudCredential(serverUrl, username) {
          return loadNextcloudCredential(serverUrl, username);
        },
        async removeNextcloudCredential(serverUrl, username) {
          await removeNextcloudCredential(serverUrl, username);
        },
        async registerNextcloudCalendar(configJson, calendarJson) {
          try { return jsonSafe(await registerNextcloudCalendar(configJson, calendarJson)); }
          catch (error) { return {ok:false, error:privilegedErrorText(error)}; }
        }
      }
    };
  }

  onShutdown(isAppShutdown) {
    moduleBridgeServer?.stop();
    moduleBridgeServer = null;
    if (!isAppShutdown) {
      Services.obs.notifyObservers(null, "startupcache-invalidate", null);
    }
  }
};
