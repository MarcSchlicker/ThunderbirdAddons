const tb = globalThis.messenger || globalThis.browser;
const language = String(tb?.i18n?.getUILanguage?.() || navigator.language || "de").toLowerCase();
const isGerman = language.startsWith("de");
const locale = isGerman ? language : "en-US";
const messages = {
  de: {
    managerTitle: "Kalenderverwaltung",
    managerSubtitle: "Kalender und Sicherungen",
    addCalendar: "Kalender hinzufuegen",
    calendars: "Kalender",
    backup: "Sicherung",
    searchCalendars: "Kalender suchen",
    localBackup: "Lokale Sicherung",
    backupScope: "Ansichtsprofile, Kalendertypen, Sichtbarkeit und Add-on-Einstellungen",
    downloadBackup: "Sicherung herunterladen",
    restoreBackup: "Sicherung wiederherstellen",
    securityNote: "Passwoerter, OAuth-Tokens und gespeicherte Anmeldedaten werden nicht exportiert.",
    emailBackup: "E-Mail-Sicherung",
    emailBackupSubtitle: "Sicherung als JSON-Anhang",
    prepareEmail: "E-Mail vorbereiten",
    sendNow: "Jetzt senden",
    sender: "Absender",
    recipient: "Zieladresse",
    interval: "Intervall",
    daily: "Taeglich",
    weekly: "Woechentlich",
    monthly: "Monatlich",
    automaticEmail: "Automatisch per E-Mail senden",
    saveSchedule: "Zeitplan speichern",
    removeCalendar: "Kalender entfernen",
    removeWarning: "Diese Aktion wirkt direkt auf Thunderbirds Kalenderverwaltung.",
    unsubscribe: "Nur abmelden",
    deleteData: "Kalender und lokale Daten loeschen",
    cancel: "Abbrechen",
    restore: "Wiederherstellen",
    loading: "Kalender werden geladen...",
    calendarCount: "{count} Kalender",
    noCalendars: "Keine Kalender gefunden",
    visible: "Im Raster sichtbar",
    enabled: "Kalender aktiv",
    defaultCalendar: "Standard",
    makeDefault: "Als Standard",
    save: "Speichern",
    advanced: "Erweitert",
    remove: "Entfernen",
    saved: "{calendar} gespeichert",
    saveFailed: "Kalender konnte nicht gespeichert werden: {message}",
    removed: "{calendar} wurde entfernt",
    removeFailed: "Kalender konnte nicht entfernt werden: {message}",
    nativeCalendar: "Thunderbird · {type}",
    addonCalendar: "Add-on-Kalender",
    lastCalendar: "Der letzte Kalender kann nicht entfernt werden.",
    backupCreated: "Sicherung wurde erstellt",
    backupPrepared: "Backup-E-Mail wurde vorbereitet",
    backupSent: "Backup-E-Mail wurde gesendet",
    scheduleSaved: "Backup-Zeitplan gespeichert",
    backupFailed: "Sicherung fehlgeschlagen: {message}",
    noIdentity: "Keine E-Mail-Identitaet gefunden",
    confirmSend: "Die Sicherung jetzt automatisch an {recipient} senden?",
    restoreSummary: "Sicherung vom {date}",
    restoreSettings: "{count} Einstellungsbereiche",
    restoreCalendars: "Metadaten fuer {count} Kalender",
    restoreConfirm: "Die aktuellen Add-on-Einstellungen werden durch die Sicherung ersetzt.",
    restored: "{count} Einstellungsbereiche wurden wiederhergestellt",
    invalidBackup: "Sicherung konnte nicht gelesen werden: {message}",
    refresh: "Aktualisieren",
    close: "Schliessen"
  },
  en: {
    managerTitle: "Calendar management",
    managerSubtitle: "Calendars and backups",
    addCalendar: "Add calendar",
    calendars: "Calendars",
    backup: "Backup",
    searchCalendars: "Search calendars",
    localBackup: "Local backup",
    backupScope: "View profiles, calendar types, visibility and add-on settings",
    downloadBackup: "Download backup",
    restoreBackup: "Restore backup",
    securityNote: "Passwords, OAuth tokens and saved credentials are never exported.",
    emailBackup: "Email backup",
    emailBackupSubtitle: "Backup as a JSON attachment",
    prepareEmail: "Prepare email",
    sendNow: "Send now",
    sender: "Sender",
    recipient: "Recipient",
    interval: "Interval",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    automaticEmail: "Send automatically by email",
    saveSchedule: "Save schedule",
    removeCalendar: "Remove calendar",
    removeWarning: "This action directly changes Thunderbird's calendar management.",
    unsubscribe: "Unsubscribe only",
    deleteData: "Delete calendar and local data",
    cancel: "Cancel",
    restore: "Restore",
    loading: "Loading calendars...",
    calendarCount: "{count} calendars",
    noCalendars: "No calendars found",
    visible: "Visible in grid",
    enabled: "Calendar active",
    defaultCalendar: "Default",
    makeDefault: "Make default",
    save: "Save",
    advanced: "Advanced",
    remove: "Remove",
    saved: "Saved {calendar}",
    saveFailed: "Could not save calendar: {message}",
    removed: "Removed {calendar}",
    removeFailed: "Could not remove calendar: {message}",
    nativeCalendar: "Thunderbird · {type}",
    addonCalendar: "Add-on calendar",
    lastCalendar: "The last calendar cannot be removed.",
    backupCreated: "Backup created",
    backupPrepared: "Backup email prepared",
    backupSent: "Backup email sent",
    scheduleSaved: "Backup schedule saved",
    backupFailed: "Backup failed: {message}",
    noIdentity: "No email identity found",
    confirmSend: "Send the backup automatically to {recipient} now?",
    restoreSummary: "Backup from {date}",
    restoreSettings: "{count} setting sections",
    restoreCalendars: "Metadata for {count} calendars",
    restoreConfirm: "Current add-on settings will be replaced by the backup.",
    restored: "Restored {count} setting sections",
    invalidBackup: "Could not read backup: {message}",
    refresh: "Refresh",
    close: "Close"
  }
};
const dictionary = isGerman ? messages.de : messages.en;

function t(key, values = {}) {
  let value = dictionary[key] || messages.de[key] || key;
  for (const [name, replacement] of Object.entries(values)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

const state = {
  calendars: [],
  filteredCalendars: [],
  removalCalendar: null,
  pendingBackup: null,
  backupOverview: null
};

const calendarList = document.getElementById("managed-calendar-list");
const calendarStatus = document.getElementById("calendar-manager-status");
const calendarCount = document.getElementById("calendar-count");
const calendarSearch = document.getElementById("calendar-search");
const removeBackdrop = document.getElementById("remove-dialog-backdrop");
const removeCalendarName = document.getElementById("remove-calendar-name");
const unsubscribeButton = document.getElementById("unsubscribe-calendar");
const deleteDataButton = document.getElementById("delete-calendar-data");
const restoreBackdrop = document.getElementById("restore-dialog-backdrop");
const restoreSummary = document.getElementById("restore-summary");
const backupStatus = document.getElementById("backup-status");
const identitySelect = document.getElementById("backup-identity");
const recipientInput = document.getElementById("backup-recipient");
const intervalSelect = document.getElementById("backup-interval");
const automaticBackup = document.getElementById("automatic-email-backup");

function localizeDocument() {
  document.documentElement.lang = isGerman ? "de" : "en";
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  calendarSearch.placeholder = t("searchCalendars");
  document.getElementById("refresh-calendars").title = t("refresh");
  document.getElementById("refresh-calendars").setAttribute("aria-label", t("refresh"));
  document.getElementById("close-remove-dialog").setAttribute("aria-label", t("close"));
  document.getElementById("close-restore-dialog").setAttribute("aria-label", t("close"));
}

function setStatus(element, message, isError = false) {
  element.textContent = message || "";
  element.classList.toggle("error", isError);
}

function calendarKey(calendar) {
  return String(calendar?.id || "");
}

function addonVisibility(settings, id, fallback = true) {
  const overrides = settings.calendarVisibilityOverrides || {};
  return Object.prototype.hasOwnProperty.call(overrides, id)
    ? overrides[id] !== false
    : fallback;
}

async function loadCalendars() {
  setStatus(calendarStatus, t("loading"));
  try {
    const [nativeCalendars, stored] = await Promise.all([
      tb.runtime.sendMessage({ type: "getCalendarManagementData" }),
      tb.storage.local.get({ externalCalendars: [], calendarVisibilityOverrides: {} })
    ]);
    const native = (nativeCalendars || []).map(calendar => ({
      ...calendar,
      source: "thunderbird",
      addonVisible: addonVisibility(stored, String(calendar.id), calendar.visible !== false)
    }));
    const external = (stored.externalCalendars || []).map(calendar => ({
      ...calendar,
      id: String(calendar.id || `external:${calendar.name || "calendar"}`),
      type: calendar.source || "external",
      source: "addon",
      disabled: false,
      visible: addonVisibility(stored, String(calendar.id), true),
      addonVisible: addonVisibility(stored, String(calendar.id), true),
      canUnsubscribe: false,
      canDeleteData: true,
      removeModes: ["delete"]
    }));
    state.calendars = [...native, ...external];
    renderCalendars();
    setStatus(calendarStatus, "");
  } catch (error) {
    setStatus(calendarStatus, error?.message || String(error), true);
  }
}

function renderCalendars() {
  const query = calendarSearch.value.trim().toLocaleLowerCase(locale);
  state.filteredCalendars = state.calendars.filter(calendar =>
    `${calendar.name || ""} ${calendar.type || ""} ${calendar.uri || calendar.url || ""}`
      .toLocaleLowerCase(locale)
      .includes(query)
  );
  calendarList.replaceChildren();
  calendarCount.textContent = t("calendarCount", { count: state.filteredCalendars.length });
  if (!state.filteredCalendars.length) {
    const empty = document.createElement("p");
    empty.className = "inline-status";
    empty.textContent = t("noCalendars");
    calendarList.appendChild(empty);
    return;
  }
  for (const calendar of state.filteredCalendars) {
    calendarList.appendChild(renderCalendar(calendar));
  }
}

function checkboxControl(labelText, checked, className) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.className = className;
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(input, text);
  return label;
}

function actionButton(label, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  return button;
}

function renderCalendar(calendar) {
  const row = document.createElement("article");
  row.className = "managed-calendar";
  row.classList.toggle("is-disabled", Boolean(calendar.disabled));
  row.dataset.calendarId = calendarKey(calendar);
  row.style.setProperty("--calendar-color", calendar.color || "#087f8c");

  const color = document.createElement("input");
  color.type = "color";
  color.className = "calendar-color-input";
  color.value = /^#[0-9a-fA-F]{6}$/.test(calendar.color || "") ? calendar.color : "#087f8c";
  color.title = calendar.name || "";

  const main = document.createElement("div");
  main.className = "calendar-main-fields";
  const name = document.createElement("input");
  name.type = "text";
  name.className = "calendar-name-input";
  name.value = calendar.name || "";
  name.maxLength = 160;
  const meta = document.createElement("span");
  meta.className = "calendar-meta";
  meta.textContent =
    calendar.source === "addon"
      ? t("addonCalendar")
      : t("nativeCalendar", { type: calendar.type || "calendar" });
  meta.title = calendar.uri || calendar.url || meta.textContent;
  main.append(name, meta);

  const stateControls = document.createElement("div");
  stateControls.className = "calendar-state-controls";
  const visible = checkboxControl(t("visible"), calendar.addonVisible !== false, "calendar-visible");
  stateControls.appendChild(visible);
  let enabled = null;
  if (calendar.source !== "addon") {
    enabled = checkboxControl(t("enabled"), !calendar.disabled, "calendar-enabled");
    stateControls.appendChild(enabled);
  }

  const actions = document.createElement("div");
  actions.className = "calendar-row-actions";
  if (calendar.isDefault) {
    const badge = document.createElement("span");
    badge.className = "default-badge";
    badge.textContent = t("defaultCalendar");
    actions.appendChild(badge);
  } else if (calendar.source !== "addon") {
    const makeDefault = actionButton(t("makeDefault"));
    makeDefault.addEventListener("click", () => saveCalendar(calendar, row, { makeDefault: true }));
    actions.appendChild(makeDefault);
  }
  if (calendar.source !== "addon") {
    const advanced = actionButton(t("advanced"));
    advanced.addEventListener("click", async () => {
      await tb.runtime.sendMessage({ type: "openCalendarProperties", calendarId: calendar.id });
    });
    actions.appendChild(advanced);
  }
  const save = actionButton(t("save"), "primary-command");
  save.addEventListener("click", () => saveCalendar(calendar, row));
  const remove = actionButton(t("remove"), "danger-command");
  remove.disabled = state.calendars.length <= 1;
  remove.title = remove.disabled ? t("lastCalendar") : t("remove");
  remove.addEventListener("click", () => openRemoveDialog(calendar));
  actions.append(save, remove);

  row.append(color, main, stateControls, actions);
  return row;
}

async function saveAddonVisibility(calendarId, visible) {
  const stored = await tb.storage.local.get({
    calendarVisibilityOverrides: {},
    hiddenCalendarIds: []
  });
  const overrides = { ...(stored.calendarVisibilityOverrides || {}), [calendarId]: visible };
  const hiddenCalendarIds = Object.keys(overrides).filter(id => overrides[id] === false);
  await tb.storage.local.set({ calendarVisibilityOverrides: overrides, hiddenCalendarIds });
}

async function saveCalendar(calendar, row, { makeDefault = false } = {}) {
  const name = row.querySelector(".calendar-name-input").value.trim();
  const color = row.querySelector(".calendar-color-input").value;
  const visible = row.querySelector(".calendar-visible").checked;
  try {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("Ungültige Kalenderfarbe");
    await saveAddonVisibility(calendarKey(calendar), visible);
    if (calendar.source === "addon") {
      const stored = await tb.storage.local.get({ externalCalendars: [] });
      const externalCalendars = (stored.externalCalendars || []).map(entry =>
        String(entry.id) === calendarKey(calendar) ? { ...entry, name, color } : entry
      );
      await tb.storage.local.set({ externalCalendars });
    } else {
      const enabled = row.querySelector(".calendar-enabled").checked;
      const updated = await tb.runtime.sendMessage({
        type: "updateCalendar",
        calendar: { calendarId: calendar.id, name, color, enabled, visible, makeDefault }
      });
      if (updated?.color?.toLowerCase() !== color.toLowerCase()) {
        throw new Error("Thunderbird hat die Kalenderfarbe nicht bestätigt.");
      }
    }
    await tb.storage.local.set({ calendarDataRevision: Date.now() });
    await loadCalendars();
    const reloaded = state.calendars.find(entry => calendarKey(entry) === calendarKey(calendar));
    if (reloaded?.color?.toLowerCase() !== color.toLowerCase()) {
      throw new Error("Die Kalenderfarbe wurde beim erneuten Lesen überschrieben.");
    }
    setStatus(calendarStatus, t("saved", { calendar: name }));
  } catch (error) {
    setStatus(calendarStatus, t("saveFailed", { message: error?.message || error }), true);
  }
}

function openRemoveDialog(calendar) {
  state.removalCalendar = calendar;
  removeCalendarName.textContent = calendar.name || "";
  unsubscribeButton.hidden = calendar.source === "addon" || !calendar.canUnsubscribe;
  deleteDataButton.hidden = !calendar.canDeleteData;
  removeBackdrop.hidden = false;
}

function closeRemoveDialog() {
  removeBackdrop.hidden = true;
  state.removalCalendar = null;
}

async function cleanRemovedCalendarSettings(calendarId) {
  const stored = await tb.storage.local.get({
    calendarVisibilityOverrides: {},
    hiddenCalendarIds: [],
    removedCalendarIds: [],
    calendarTypeAssignments: {}
  });
  const overrides = { ...(stored.calendarVisibilityOverrides || {}) };
  const assignments = { ...(stored.calendarTypeAssignments || {}) };
  delete overrides[calendarId];
  delete assignments[calendarId];
  await tb.storage.local.set({
    calendarVisibilityOverrides: overrides,
    hiddenCalendarIds: (stored.hiddenCalendarIds || []).filter(id => String(id) !== calendarId),
    removedCalendarIds: (stored.removedCalendarIds || []).filter(id => String(id) !== calendarId),
    calendarTypeAssignments: assignments
  });
}

async function removeSelectedCalendar(mode) {
  const calendar = state.removalCalendar;
  if (!calendar) return;
  closeRemoveDialog();
  try {
    if (calendar.source === "addon") {
      const stored = await tb.storage.local.get({ externalCalendars: [] });
      await tb.storage.local.set({
        externalCalendars: (stored.externalCalendars || []).filter(
          entry => String(entry.id) !== calendarKey(calendar)
        )
      });
    } else {
      await tb.runtime.sendMessage({
        type: "removeCalendar",
        calendarId: calendar.id,
        mode
      });
    }
    await cleanRemovedCalendarSettings(calendarKey(calendar));
    await tb.storage.local.set({ calendarDataRevision: Date.now() });
    setStatus(calendarStatus, t("removed", { calendar: calendar.name }));
    await loadCalendars();
  } catch (error) {
    setStatus(calendarStatus, t("removeFailed", { message: error?.message || error }), true);
  }
}

function activatePanel(panelName) {
  for (const tab of document.querySelectorAll(".manager-tab")) {
    tab.classList.toggle("active", tab.dataset.panel === panelName);
  }
  for (const panel of document.querySelectorAll(".manager-panel")) {
    panel.classList.toggle("active", panel.id === `${panelName}-panel`);
  }
}

function downloadJson(envelope) {
  const filename = `kalender-raster-backup-${String(envelope.createdAt).slice(0, 10)}.json`;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function createAndDownloadBackup() {
  try {
    const envelope = await tb.runtime.sendMessage({ type: "createBackup" });
    downloadJson(envelope);
    setStatus(backupStatus, t("backupCreated"));
  } catch (error) {
    setStatus(backupStatus, t("backupFailed", { message: error?.message || error }), true);
  }
}

async function readBackupFile(file) {
  const text = await file.text();
  const backup = JSON.parse(text);
  if (backup?.format !== "calendar-grid-backup" || !backup?.data?.settings) {
    throw new Error("Unknown backup format");
  }
  return backup;
}

function showRestoreDialog(backup) {
  state.pendingBackup = backup;
  restoreSummary.replaceChildren();
  const date = document.createElement("strong");
  date.textContent = t("restoreSummary", {
    date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(backup.createdAt)
    )
  });
  const settings = document.createElement("span");
  settings.textContent = t("restoreSettings", {
    count: Object.keys(backup.data.settings || {}).length
  });
  const calendars = document.createElement("span");
  calendars.textContent = t("restoreCalendars", {
    count: Array.isArray(backup.data.calendars) ? backup.data.calendars.length : 0
  });
  const warning = document.createElement("p");
  warning.textContent = t("restoreConfirm");
  restoreSummary.append(date, settings, calendars, warning);
  restoreBackdrop.hidden = false;
}

function closeRestoreDialog() {
  restoreBackdrop.hidden = true;
  state.pendingBackup = null;
}

async function restorePendingBackup() {
  if (!state.pendingBackup) return;
  const backup = state.pendingBackup;
  closeRestoreDialog();
  try {
    const result = await tb.runtime.sendMessage({ type: "restoreBackup", backup });
    setStatus(backupStatus, t("restored", { count: result.settingCount }));
    await Promise.all([loadCalendars(), loadBackupOverview()]);
  } catch (error) {
    setStatus(backupStatus, t("invalidBackup", { message: error?.message || error }), true);
  }
}

async function loadBackupOverview() {
  try {
    const overview = await tb.runtime.sendMessage({ type: "getBackupOverview" });
    state.backupOverview = overview;
    identitySelect.replaceChildren();
    for (const identity of overview.identities || []) {
      const option = document.createElement("option");
      option.value = identity.id;
      option.textContent = `${identity.name} <${identity.email}>`;
      identitySelect.appendChild(option);
    }
    if (!(overview.identities || []).length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = t("noIdentity");
      identitySelect.appendChild(option);
    }
    identitySelect.value = overview.settings.identityId || identitySelect.options[0]?.value || "";
    recipientInput.value = overview.settings.recipient || "";
    if (!recipientInput.value && overview.identities?.length) {
      recipientInput.value = overview.identities[0].email;
    }
    intervalSelect.value = overview.settings.interval || "weekly";
    automaticBackup.checked = Boolean(overview.settings.enabled && overview.settings.autoSend);
    if (overview.status) {
      const at = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
        new Date(overview.status.at)
      );
      const message = overview.status.ok
        ? overview.status.action === "sent"
          ? t("backupSent")
          : t("backupPrepared")
        : t("backupFailed", { message: overview.status.message || "" });
      setStatus(backupStatus, `${message} · ${at}`, overview.status.ok === false);
    }
  } catch (error) {
    setStatus(backupStatus, t("backupFailed", { message: error?.message || error }), true);
  }
}

function backupSettingsFromForm() {
  return {
    identityId: identitySelect.value,
    recipient: recipientInput.value.trim(),
    interval: intervalSelect.value,
    enabled: automaticBackup.checked,
    autoSend: automaticBackup.checked
  };
}

async function saveBackupSchedule(event) {
  event.preventDefault();
  try {
    state.backupOverview = await tb.runtime.sendMessage({
      type: "saveBackupSettings",
      settings: backupSettingsFromForm()
    });
    setStatus(backupStatus, t("scheduleSaved"));
  } catch (error) {
    setStatus(backupStatus, t("backupFailed", { message: error?.message || error }), true);
  }
}

async function emailBackup(autoSend) {
  try {
    await tb.runtime.sendMessage({ type: "saveBackupSettings", settings: backupSettingsFromForm() });
    if (autoSend && !window.confirm(t("confirmSend", { recipient: recipientInput.value.trim() }))) {
      return;
    }
    const result = await tb.runtime.sendMessage({ type: "emailBackup", autoSend });
    setStatus(backupStatus, result.action === "sent" ? t("backupSent") : t("backupPrepared"));
  } catch (error) {
    setStatus(backupStatus, t("backupFailed", { message: error?.message || error }), true);
  }
}

document.querySelectorAll(".manager-tab").forEach(tab => {
  tab.addEventListener("click", () => activatePanel(tab.dataset.panel));
});
document.getElementById("refresh-calendars").addEventListener("click", loadCalendars);
document.getElementById("add-managed-calendar").addEventListener("click", async () => {
  await tb.runtime.sendMessage({ type: "openCalendarWizard" });
  setTimeout(loadCalendars, 1200);
});
calendarSearch.addEventListener("input", renderCalendars);
document.getElementById("close-remove-dialog").addEventListener("click", closeRemoveDialog);
document.getElementById("cancel-remove").addEventListener("click", closeRemoveDialog);
unsubscribeButton.addEventListener("click", () => removeSelectedCalendar("unsubscribe"));
deleteDataButton.addEventListener("click", () => removeSelectedCalendar("delete"));
removeBackdrop.addEventListener("click", event => {
  if (event.target === removeBackdrop) closeRemoveDialog();
});
document.getElementById("download-backup").addEventListener("click", createAndDownloadBackup);
document.getElementById("choose-backup").addEventListener("click", () => {
  document.getElementById("backup-file").click();
});
document.getElementById("backup-file").addEventListener("change", async event => {
  try {
    const file = event.target.files[0];
    if (file) showRestoreDialog(await readBackupFile(file));
  } catch (error) {
    setStatus(backupStatus, t("invalidBackup", { message: error?.message || error }), true);
  } finally {
    event.target.value = "";
  }
});
document.getElementById("close-restore-dialog").addEventListener("click", closeRestoreDialog);
document.getElementById("cancel-restore").addEventListener("click", closeRestoreDialog);
document.getElementById("confirm-restore").addEventListener("click", restorePendingBackup);
restoreBackdrop.addEventListener("click", event => {
  if (event.target === restoreBackdrop) closeRestoreDialog();
});
document.getElementById("backup-settings-form").addEventListener("submit", saveBackupSchedule);
document.getElementById("prepare-backup-email").addEventListener("click", () => emailBackup(false));
document.getElementById("send-backup-now").addEventListener("click", () => emailBackup(true));
window.addEventListener("focus", loadCalendars);

localizeDocument();
Promise.all([loadCalendars(), loadBackupOverview()]);
