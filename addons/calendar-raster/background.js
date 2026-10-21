const tb = globalThis.messenger || globalThis.browser;

const DEFAULT_SETTINGS = {
  accentColor: "#006fd6",
  weekStartsOn: 1,
  periodMode: "month",
  viewMode: "full",
  customStartHour: 8,
  customEndHour: 22,
  hiddenWeekdays: [],
  hiddenCalendarIds: [],
  calendarVisibilityOverrides: {}
};

const SPACE_NAME = "hour_grid_month";
const SPACE_TITLE = "Kalender";
const SPACE_PATH = "space/month.html";
const SPACE_URL = tb.runtime.getURL(SPACE_PATH);
const SPACE_ID_KEY = "hourGridMonthSpaceId";
const MANAGER_PATH = "space/manager.html";
const MANAGER_URL = tb.runtime.getURL(MANAGER_PATH);
const BACKUP_SETTINGS_KEY = "backupSettings";
const BACKUP_STATUS_KEY = "backupStatus";
const BACKUP_ALARM_NAME = "calendar-grid-email-backup";
const DEFAULT_BACKUP_SETTINGS = {
  enabled: false,
  interval: "weekly",
  identityId: "",
  recipient: "",
  autoSend: false
};

function calendarApi() {
  return tb.hourGridBridge || tb.calendarBridge || tb.calendarCustomizer || null;
}

function calendarApiName() {
  if (tb.hourGridBridge) {
    return "hourGridBridge";
  }
  if (tb.calendarBridge) {
    return "calendarBridge";
  }
  if (tb.calendarCustomizer) {
    return "calendarCustomizer";
  }
  return "none";
}

function monthLoadError(year, month, weekStartsOn, error) {
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
    errors: [
      {
        calendarId: "",
        calendarName: "",
        message: error?.message || String(error || "Unbekannter Fehler")
      }
    ],
    generatedAt: new Date().toISOString()
  };
}

async function ensureDefaultSettings() {
  const saved = await tb.storage.local.get(DEFAULT_SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...saved };
  await tb.storage.local.set(merged);
  return merged;
}

async function findExistingSpace() {
  if (!tb.spaces?.query) {
    return null;
  }

  const spaces = await tb.spaces.query({
    isSelfOwned: true,
    name: SPACE_NAME
  });
  return spaces[0] || null;
}

async function ensureHourGridSpace() {
  await ensureDefaultSettings();

  if (!tb.spaces?.create) {
    return null;
  }

  const buttonProperties = {
    title: SPACE_TITLE,
    defaultIcons: {
      "16": "icons/calendar-focus.svg",
      "32": "icons/calendar-focus.svg"
    }
  };

  const existingSpace = await findExistingSpace();
  if (existingSpace) {
    await tb.spaces.update(existingSpace.id, SPACE_URL, buttonProperties);
    await tb.storage.local.set({ [SPACE_ID_KEY]: existingSpace.id });
    return existingSpace;
  }

  const createdSpace = await tb.spaces.create(SPACE_NAME, SPACE_URL, buttonProperties);
  await tb.storage.local.set({ [SPACE_ID_KEY]: createdSpace.id });
  return createdSpace;
}

function logSpaceSetupError(error) {
  console.error("24h Month View: Spaces-Eintrag konnte nicht vorbereitet werden.", error);
}

async function safeEnsureHourGridSpace() {
  try {
    return await ensureHourGridSpace();
  } catch (error) {
    logSpaceSetupError(error);
    return null;
  }
}

async function openHourGridSpace() {
  const space = await safeEnsureHourGridSpace();

  if (space && tb.spaces?.open) {
    try {
      await tb.spaces.open(space.id);
      return;
    } catch (error) {
      logSpaceSetupError(error);
    }
  }

  await tb.tabs.create({ url: SPACE_URL });
}

async function openCalendarManager() {
  if (tb.windows?.create) {
    return tb.windows.create({
      url: MANAGER_URL,
      type: "popup",
      width: 940,
      height: 760
    });
  }
  return tb.tabs.create({ url: MANAGER_URL });
}

async function getMonthDataForPage(message) {
  const year = Number(message.year);
  const month = Number(message.month);
  const weekStartsOn = Number(message.weekStartsOn ?? 1);

  try {
    const api = calendarApi();
    if (!api?.getMonthData) {
      throw new Error("Die Kalender-Schnittstelle des Add-ons ist nicht verfuegbar.");
    }

    return await api.getMonthData(year, month, weekStartsOn);
  } catch (error) {
    return monthLoadError(year, month, weekStartsOn, error);
  }
}

async function listCalendarsForPage() {
  try {
    const api = calendarApi();
    if (!api?.listCalendars) {
      throw new Error("Die Kalender-Schnittstelle des Add-ons ist nicht verfuegbar.");
    }

    return await api.listCalendars();
  } catch (error) {
    return [];
  }
}

async function openEventEditorForPage(message) {
  const api = calendarApi();
  if (!api?.openEventEditor) {
    throw new Error("Der Thunderbird-Termin-Editor ist ueber dieses Add-on nicht verfuegbar.");
  }

  return api.openEventEditor(JSON.stringify(message.eventRef || {}));
}

async function createEventForPage(message) {
  const api = calendarApi();
  if (!api?.createEvent) {
    throw new Error("Neue Termine koennen ueber dieses Add-on nicht angelegt werden.");
  }

  return api.createEvent(JSON.stringify(message.eventRef || {}));
}

async function moveEventForPage(message) {
  const api = calendarApi();
  if (!api?.moveEvent) {
    throw new Error("Termine koennen ueber dieses Add-on nicht verschoben werden.");
  }

  return api.moveEvent(JSON.stringify(message.eventRef || {}));
}

async function duplicateEventForPage(message) {
  const api = calendarApi();
  if (!api?.duplicateEvent) {
    throw new Error("Termine koennen ueber dieses Add-on nicht dupliziert werden.");
  }
  return api.duplicateEvent(JSON.stringify(message.eventRef || {}));
}

async function moveEventToCalendarForPage(message) {
  const api = calendarApi();
  if (!api?.moveEventToCalendar) {
    throw new Error("Termine koennen ueber dieses Add-on nicht in einen anderen Kalender verschoben werden.");
  }
  return api.moveEventToCalendar(JSON.stringify(message.eventRef || {}));
}

async function openCalendarWizardForPage() {
  const api = calendarApi();
  if (!api?.openCalendarWizard) {
    throw new Error("Thunderbirds Kalender-Assistent ist ueber dieses Add-on nicht verfuegbar.");
  }
  return api.openCalendarWizard();
}

async function getCalendarManagementDataForPage() {
  const api = calendarApi();
  if (!api?.getCalendarManagementData) {
    throw new Error("Die Kalenderverwaltung ist ueber dieses Add-on nicht verfuegbar.");
  }
  return api.getCalendarManagementData();
}

async function updateCalendarForPage(message) {
  const api = calendarApi();
  if (!api?.updateCalendar) {
    throw new Error("Kalendereigenschaften koennen nicht geaendert werden.");
  }
  return api.updateCalendar(JSON.stringify(message.calendar || {}));
}

async function openCalendarPropertiesForPage(message) {
  const api = calendarApi();
  if (!api?.openCalendarProperties) {
    throw new Error("Die erweiterten Kalendereigenschaften sind nicht verfuegbar.");
  }
  return api.openCalendarProperties(String(message.calendarId || ""));
}

async function removeCalendarForPage(message) {
  const api = calendarApi();
  if (!api?.removeCalendar) {
    throw new Error("Der Kalender kann nicht entfernt werden.");
  }
  return api.removeCalendar(JSON.stringify({
    calendarId: String(message.calendarId || ""),
    mode: message.mode === "delete" ? "delete" : "unsubscribe"
  }));
}

function sanitizeExternalCalendar(calendar) {
  const safe = {
    id: String(calendar?.id || ""),
    name: String(calendar?.name || ""),
    color: String(calendar?.color || ""),
    source: String(calendar?.source || "")
  };
  if (typeof calendar?.icsText === "string") {
    safe.icsText = calendar.icsText;
  } else if (calendar?.url) {
    safe.addressRemovedForSecurity = true;
  }
  return safe;
}

function sanitizeBackupSettings(settings) {
  const safe = { ...settings };
  delete safe[SPACE_ID_KEY];
  delete safe[BACKUP_STATUS_KEY];
  if (Array.isArray(safe.externalCalendars)) {
    safe.externalCalendars = safe.externalCalendars.map(sanitizeExternalCalendar);
  }
  return safe;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function createBackupEnvelope() {
  const allSettings = await tb.storage.local.get(null);
  let calendars = [];
  try {
    calendars = await getCalendarManagementDataForPage();
  } catch (error) {
    calendars = [];
  }
  const data = {
    settings: sanitizeBackupSettings(allSettings),
    calendars: (calendars || []).map(calendar => ({
      id: calendar.id,
      name: calendar.name,
      type: calendar.type,
      color: calendar.color,
      readOnly: Boolean(calendar.readOnly),
      disabled: Boolean(calendar.disabled),
      visible: calendar.visible !== false,
      isDefault: Boolean(calendar.isDefault)
    }))
  };
  return {
    format: "calendar-grid-backup",
    formatVersion: 1,
    addonVersion: tb.runtime.getManifest().version,
    createdAt: new Date().toISOString(),
    checksum: await sha256(JSON.stringify(data)),
    data
  };
}

async function verifyBackupEnvelope(envelope) {
  if (
    envelope?.format !== "calendar-grid-backup" ||
    Number(envelope?.formatVersion) !== 1 ||
    !envelope?.data?.settings ||
    typeof envelope.data.settings !== "object"
  ) {
    throw new Error("Die ausgewaehlte Datei ist keine gueltige Kalender-Raster-Sicherung.");
  }
  const checksum = await sha256(JSON.stringify(envelope.data));
  if (checksum !== envelope.checksum) {
    throw new Error("Die Sicherungsdatei ist unvollstaendig oder wurde veraendert.");
  }
  return envelope;
}

async function restoreBackupForPage(message) {
  const envelope = await verifyBackupEnvelope(message.backup);
  const restored = { ...envelope.data.settings };
  delete restored[SPACE_ID_KEY];
  delete restored[BACKUP_STATUS_KEY];
  await tb.storage.local.clear();
  await tb.storage.local.set(restored);
  await safeEnsureHourGridSpace();
  await scheduleBackupAlarm();
  return {
    ok: true,
    settingCount: Object.keys(restored).length,
    calendarMetadataCount: Array.isArray(envelope.data.calendars)
      ? envelope.data.calendars.length
      : 0
  };
}

async function listMailIdentities() {
  if (!tb.identities?.list) {
    return [];
  }
  const identities = await tb.identities.list();
  return identities
    .filter(identity => identity?.id && identity?.email)
    .map(identity => ({
      id: String(identity.id),
      email: String(identity.email),
      name: String(identity.name || identity.label || identity.email)
    }));
}

function backupFilename(envelope) {
  return `kalender-raster-backup-${String(envelope.createdAt).slice(0, 10)}.json`;
}

async function emailBackup({ autoSend = false } = {}) {
  const stored = await tb.storage.local.get({
    [BACKUP_SETTINGS_KEY]: DEFAULT_BACKUP_SETTINGS
  });
  const settings = { ...DEFAULT_BACKUP_SETTINGS, ...(stored[BACKUP_SETTINGS_KEY] || {}) };
  if (!settings.identityId || !/^\S+@\S+\.\S+$/.test(settings.recipient || "")) {
    throw new Error("Fuer das E-Mail-Backup fehlen Absenderidentitaet oder Zieladresse.");
  }
  if (!tb.compose?.beginNew) {
    throw new Error("Thunderbirds Verfassen-Schnittstelle ist nicht verfuegbar.");
  }

  const envelope = await createBackupEnvelope();
  const filename = backupFilename(envelope);
  const file = new File([JSON.stringify(envelope, null, 2)], filename, {
    type: "application/json"
  });
  const tab = await tb.compose.beginNew({
    identityId: settings.identityId,
    to: [settings.recipient],
    subject: `Kalender-Raster Backup ${String(envelope.createdAt).slice(0, 10)}`,
    plainTextBody:
      "Automatisch erstellte Sicherung der Kalender-Raster-Einstellungen. Zugangsdaten und OAuth-Tokens sind nicht enthalten.",
    attachments: [{ file, name: filename }]
  });
  if (autoSend) {
    if (!tb.compose.sendMessage) {
      throw new Error("Thunderbirds Versand-Schnittstelle ist nicht verfuegbar.");
    }
    await tb.compose.sendMessage(tab.id, { mode: "sendNow" });
  }
  await tb.storage.local.set({
    [BACKUP_STATUS_KEY]: {
      ok: true,
      action: autoSend ? "sent" : "prepared",
      at: new Date().toISOString(),
      filename
    }
  });
  return { ok: true, action: autoSend ? "sent" : "prepared", filename };
}

function intervalMinutes(interval) {
  return {
    daily: 1440,
    weekly: 10080,
    monthly: 43200
  }[interval] || 0;
}

async function scheduleBackupAlarm() {
  if (!tb.alarms) {
    return null;
  }
  await tb.alarms.clear(BACKUP_ALARM_NAME);
  const stored = await tb.storage.local.get({
    [BACKUP_SETTINGS_KEY]: DEFAULT_BACKUP_SETTINGS
  });
  const settings = { ...DEFAULT_BACKUP_SETTINGS, ...(stored[BACKUP_SETTINGS_KEY] || {}) };
  const minutes = intervalMinutes(settings.interval);
  if (!settings.enabled || !settings.autoSend || !minutes) {
    return null;
  }
  await tb.alarms.create(BACKUP_ALARM_NAME, {
    delayInMinutes: minutes,
    periodInMinutes: minutes
  });
  return tb.alarms.get(BACKUP_ALARM_NAME);
}

async function getBackupOverview() {
  const stored = await tb.storage.local.get({
    [BACKUP_SETTINGS_KEY]: DEFAULT_BACKUP_SETTINGS,
    [BACKUP_STATUS_KEY]: null
  });
  return {
    settings: { ...DEFAULT_BACKUP_SETTINGS, ...(stored[BACKUP_SETTINGS_KEY] || {}) },
    status: stored[BACKUP_STATUS_KEY] || null,
    identities: await listMailIdentities(),
    alarm: tb.alarms ? await tb.alarms.get(BACKUP_ALARM_NAME) : null
  };
}

async function saveBackupSettingsForPage(message) {
  const settings = {
    ...DEFAULT_BACKUP_SETTINGS,
    ...(message.settings || {}),
    enabled: Boolean(message.settings?.enabled),
    autoSend: Boolean(message.settings?.autoSend),
    identityId: String(message.settings?.identityId || ""),
    recipient: String(message.settings?.recipient || "").trim(),
    interval: ["daily", "weekly", "monthly"].includes(message.settings?.interval)
      ? message.settings.interval
      : "weekly"
  };
  await tb.storage.local.set({ [BACKUP_SETTINGS_KEY]: settings });
  await scheduleBackupAlarm();
  return getBackupOverview();
}

async function runAutomaticBackup() {
  try {
    await emailBackup({ autoSend: true });
  } catch (error) {
    await tb.storage.local.set({
      [BACKUP_STATUS_KEY]: {
        ok: false,
        action: "send",
        at: new Date().toISOString(),
        message: error?.message || String(error || "Unbekannter Fehler")
      }
    });
    console.error("Kalender Raster: Automatisches Backup fehlgeschlagen.", error);
  }
}

async function bridgeStatusForPage(api) {
  if (!api?.getBridgeStatus) {
    return {
      ok: false,
      message: "getBridgeStatus ist nicht verfuegbar."
    };
  }

  try {
    return await api.getBridgeStatus();
  } catch (error) {
    return {
      ok: false,
      message: error?.message || String(error || "Unbekannter Fehler"),
      name: error?.name || "",
      stack: error?.stack || ""
    };
  }
}

async function diagnoseCalendarsForPage() {
  let api = null;
  try {
    api = calendarApi();
    if (!api?.diagnoseCalendars) {
      throw new Error("Die Kalender-Schnittstelle des Add-ons ist nicht verfuegbar.");
    }

    const diagnostics = await api.diagnoseCalendars();
    return {
      ...diagnostics,
      bridgeStatus: await bridgeStatusForPage(api),
      bridgeApi: calendarApiName(),
      hourGridBridgeAvailable: Boolean(tb.hourGridBridge),
      calendarBridgeAvailable: Boolean(tb.calendarBridge),
      calendarCustomizerAvailable: Boolean(tb.calendarCustomizer)
    };
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      registryBranch: "calendar.registry.",
      bridgeApi: calendarApiName(),
      hourGridBridgeAvailable: Boolean(tb.hourGridBridge),
      calendarBridgeAvailable: Boolean(tb.calendarBridge),
      calendarCustomizerAvailable: Boolean(tb.calendarCustomizer),
      prefChildCount: 0,
      registryIds: [],
      registryCalendars: [],
      managerCalendars: [],
      visibleView: null,
      files: [],
      bridgeStatus: await bridgeStatusForPage(api),
      errors: [
        {
          step: "background.diagnoseCalendars",
          message: error?.message || String(error || "Unbekannter Fehler"),
          name: error?.name || "",
          stack: error?.stack || ""
        }
      ]
    };
  }
}

if (tb.runtime.onInstalled) {
  tb.runtime.onInstalled.addListener(() => {
    safeEnsureHourGridSpace();
    scheduleBackupAlarm();
  });
}

if (tb.runtime.onStartup) {
  tb.runtime.onStartup.addListener(() => {
    safeEnsureHourGridSpace();
    scheduleBackupAlarm();
  });
}

if (tb.alarms?.onAlarm) {
  tb.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === BACKUP_ALARM_NAME) {
      runAutomaticBackup();
    }
  });
}

if (tb.storage?.onChanged) {
  tb.storage.onChanged.addListener(changes => {
    if (changes[BACKUP_SETTINGS_KEY]) {
      scheduleBackupAlarm();
    }
  });
}

tb.runtime.onMessage.addListener(message => {
  if (message?.type === "openHourGridSpace") {
    return openHourGridSpace();
  }

  if (message?.type === "openCalendarManager") {
    return openCalendarManager();
  }

  if (message?.type === "ensureHourGridSpace") {
    return safeEnsureHourGridSpace();
  }

  if (message?.type === "getMonthData") {
    return getMonthDataForPage(message);
  }

  if (message?.type === "listCalendars") {
    return listCalendarsForPage();
  }

  if (message?.type === "openEventEditor") {
    return openEventEditorForPage(message);
  }

  if (message?.type === "createEvent") {
    return createEventForPage(message);
  }

  if (message?.type === "moveEvent") {
    return moveEventForPage(message);
  }

  if (message?.type === "duplicateEvent") {
    return duplicateEventForPage(message);
  }

  if (message?.type === "moveEventToCalendar") {
    return moveEventToCalendarForPage(message);
  }

  if (message?.type === "openCalendarWizard") {
    return openCalendarWizardForPage();
  }

  if (message?.type === "getCalendarManagementData") {
    return getCalendarManagementDataForPage();
  }

  if (message?.type === "updateCalendar") {
    return updateCalendarForPage(message);
  }

  if (message?.type === "openCalendarProperties") {
    return openCalendarPropertiesForPage(message);
  }

  if (message?.type === "removeCalendar") {
    return removeCalendarForPage(message);
  }

  if (message?.type === "createBackup") {
    return createBackupEnvelope();
  }

  if (message?.type === "restoreBackup") {
    return restoreBackupForPage(message);
  }

  if (message?.type === "getBackupOverview") {
    return getBackupOverview();
  }

  if (message?.type === "saveBackupSettings") {
    return saveBackupSettingsForPage(message);
  }

  if (message?.type === "emailBackup") {
    return emailBackup({ autoSend: Boolean(message.autoSend) });
  }

  if (message?.type === "diagnoseCalendars") {
    return diagnoseCalendarsForPage();
  }

  return false;
});

safeEnsureHourGridSpace();
scheduleBackupAlarm();
