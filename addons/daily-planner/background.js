"use strict";


const tb = globalThis.messenger || globalThis.browser;
const Core = globalThis.DailyPlannerCore;
const STORAGE_KEY = "dailyPlannerState";
const MODULE_BRIDGE_STATUS_KEY = "dailyPlannerModuleBridgeStatus";
const MOBILE_PAIRING_KEY = "dailyPlannerMobilePairing";
const MOBILE_SYNC_PORT = 47830;
const MOBILE_PAIRING_SESSION_MS = 5 * 60 * 1000;
const MODULE_BRIDGE_ENDPOINT = "http://127.0.0.1:47832/v1/desktop-sync";
const MODULE_BRIDGE_MODULE_ID = "de.tbconnect.modules.daily-planner";
// This is a bridge peer ID, not the Thunderbird extension ID. Keep it in the
// module-bridge identifier format so the Hub can persist it safely.
const MODULE_BRIDGE_CLIENT_ID = "desktop-daily-planner";
const SPACE_NAME = "daily_planner";
const SPACE_TITLE = "Tagesplaner";
const SPACE_URL = tb.runtime.getURL("planner/index.html");
const ALARM_PREFIX = "daily-planner:";
const MENU_PARENT = "daily-planner-add";
const MENU_TARGETS = Object.freeze({
  "daily-planner-today": "today",
  "daily-planner-tomorrow": "tomorrow",
  "daily-planner-someday": "someday"
});

const pendingEmailSelections = new Map();
let mobileSyncStarted = false;
let mobileSnapshotQueue = Promise.resolve();
let moduleBridgeSnapshotQueue = Promise.resolve();
let plannerOpenQueue = Promise.resolve();

function errorText(error) {
  return error?.message || String(error || "Unbekannter Fehler");
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function loadState() {
  const stored = await tb.storage.local.get(STORAGE_KEY);
  return Core.normalizeState(stored?.[STORAGE_KEY]);
}

async function broadcastStateChanged() {
  try {
    await tb.runtime.sendMessage({ type: "plannerStateChanged" });
  } catch (error) {
    // No open planner page is a normal condition.
  }
}

async function saveState(state, { broadcast = true } = {}) {
  const normalized = Core.normalizeState(state);
  normalized.updatedAt = new Date().toISOString();
  await tb.storage.local.set({ [STORAGE_KEY]: normalized });
  queueMobileSnapshot();
  queueModuleBridgeSnapshot();
  if (broadcast) {
    await broadcastStateChanged();
  }
  return normalized;
}

function mergeModuleBridgeTasks(state, remoteState) {
  const rawTasks = Array.isArray(remoteState?.tasks) ? remoteState.tasks : [];
  const remoteTasks = rawTasks.map(validMobileTask).filter(Boolean);
  const deletedById = new Map(
    (Array.isArray(state.deletedTasks) ? state.deletedTasks : [])
      .map(validMobileDeletedTask)
      .filter(Boolean)
      .map(item => [item.id, item])
  );
  for (const tombstone of (Array.isArray(remoteState?.deletedTasks) ? remoteState.deletedTasks : []).map(validMobileDeletedTask).filter(Boolean)) {
    const existing = deletedById.get(tombstone.id);
    if (!existing || Date.parse(tombstone.deletedAt) >= Date.parse(existing.deletedAt)) {
      deletedById.set(tombstone.id, tombstone);
    }
  }
  const localById = new Map(state.tasks.map(task => [String(task.id), task]));
  let changed = false;
  for (const remote of remoteTasks) {
    const local = localById.get(remote.id);
    if (!local) {
      state.tasks.push(remote);
      localById.set(remote.id, remote);
      changed = true;
    } else if (mobileValueIsNewer(remote, local)) {
      Object.assign(local, remote);
      changed = true;
    }
  }
  const retainedTasks = state.tasks.filter(task => {
    const tombstone = deletedById.get(String(task.id));
    return !tombstone || Date.parse(task.updatedAt || 0) > Date.parse(tombstone.deletedAt);
  });
  if (retainedTasks.length !== state.tasks.length) {
    state.tasks = retainedTasks;
    changed = true;
  }
  const nextDeletedTasks = [...deletedById.values()];
  if (JSON.stringify(state.deletedTasks || []) !== JSON.stringify(nextDeletedTasks)) {
    state.deletedTasks = nextDeletedTasks;
    changed = true;
  }
  const remoteAppointments = (Array.isArray(remoteState?.appointments) ? remoteState.appointments : [])
    .map(validMobileAppointment)
    .filter(Boolean);
  const deletedAppointmentsById = new Map(
    (Array.isArray(state.deletedAppointments) ? state.deletedAppointments : [])
      .map(validMobileDeletedTask)
      .filter(Boolean)
      .map(item => [item.id, item])
  );
  for (const tombstone of (Array.isArray(remoteState?.deletedAppointments) ? remoteState.deletedAppointments : [])
    .map(validMobileDeletedTask)
    .filter(Boolean)) {
    const existing = deletedAppointmentsById.get(tombstone.id);
    if (!existing || Date.parse(tombstone.deletedAt) >= Date.parse(existing.deletedAt)) {
      deletedAppointmentsById.set(tombstone.id, tombstone);
    }
  }
  const localAppointmentsById = new Map((state.appointments || []).map(item => [String(item.id), item]));
  for (const remote of remoteAppointments) {
    const local = localAppointmentsById.get(remote.id);
    if (!local) {
      state.appointments.push(remote);
      localAppointmentsById.set(remote.id, remote);
      changed = true;
    } else if (mobileValueIsNewer(remote, local)) {
      Object.assign(local, remote);
      changed = true;
    }
  }
  const retainedAppointments = (state.appointments || []).filter(item => {
    const tombstone = deletedAppointmentsById.get(String(item.id));
    return !tombstone || Date.parse(item.updatedAt || 0) > Date.parse(tombstone.deletedAt);
  });
  if (retainedAppointments.length !== (state.appointments || []).length) {
    state.appointments = retainedAppointments;
    changed = true;
  }
  const nextDeletedAppointments = [...deletedAppointmentsById.values()];
  if (JSON.stringify(state.deletedAppointments || []) !== JSON.stringify(nextDeletedAppointments)) {
    state.deletedAppointments = nextDeletedAppointments;
    changed = true;
  }
  return changed;
}

async function postModuleBridgeState(payload) {
  // Keep this on Thunderbird's regular extension networking stack.  The Hub
  // explicitly permits loopback desktop requests and responds to the required
  // CORS preflight.  This is more reliable than a hand-managed socket in an
  // experiment API: it also survives an add-on reload without keeping a stale
  // privileged socket alive.
  let response;
  try {
    response = await fetch(MODULE_BRIDGE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "omit"
    });
  } catch (error) {
    const bridge = tb.hourGridBridge;
    if (!bridge?.syncModuleBridge) {
      throw new Error(`Der lokale TB-Connect Modul-Hub ist nicht erreichbar: ${errorText(error)}`);
    }
    // Older Thunderbird builds can block a loopback fetch while reloading an
    // extension.  Retain the privileged socket as a narrow compatibility
    // fallback, rather than silently dropping the desktop snapshot.
    return bridge.syncModuleBridge(JSON.stringify(payload));
  }

  let result = null;
  try {
    result = JSON.parse(await response.text());
  } catch (error) {
    throw new Error("Der lokale TB-Connect Modul-Hub hat keine gültige Antwort geliefert.");
  }
  if (!response.ok || !result || typeof result !== "object") {
    throw new Error(result?.error || `Der lokale TB-Connect Modul-Hub antwortet mit ${response.status}.`);
  }
  return result;
}

async function syncStateWithModuleBridge({ strict = false } = {}) {
  const [state, calendar] = await Promise.all([loadState(), readCalendarData()]);
  const bridgeState = { ...state, calendar };
  let remote;
  try {
    remote = await postModuleBridgeState({
      protocol: "tb-connect-module-bridge/1",
      moduleId: MODULE_BRIDGE_MODULE_ID,
      client: { id: MODULE_BRIDGE_CLIENT_ID, name: "Dieser Thunderbird", kind: "desktop" },
      updatedAt: state.updatedAt,
      state: bridgeState
    });
  } catch (error) {
    if (strict) throw error;
    console.warn("Tagesplaner: Modul-Hub-Abgleich fehlgeschlagen.", error);
    return;
  }
  if (strict && (!remote?.state || typeof remote.state !== "object" || remote.ok === false)) {
    throw new Error("Keine gültigen Tagesplanerdaten vom Modul-Hub empfangen.");
  }
  if (remote?.state) {
    // The user can edit tasks or remember/remove mail while the Hub request is in flight.
    // Merge into the latest desktop state instead of writing back the outgoing snapshot.
    const current = await loadState();
    if (mergeModuleBridgeTasks(current, remote.state)) await saveState(current);
  }
  // Any module can use this compact peer list to show whether a phone is
  // actually connected. It contains no task or mail data and is refreshed by
  // every successful Hub exchange.
  if (remote?.status && typeof remote.status === "object") {
    await tb.storage.local.set({
      [MODULE_BRIDGE_STATUS_KEY]: {
        receivedAt: new Date().toISOString(),
        connected: Boolean(remote.status.connected),
        mobileCount: (remote.status.peers || []).filter(peer => peer?.kind === "mobile").length,
        mobiles: (remote.status.peers || []).filter(peer => peer?.kind === "mobile").map(peer => ({
          id: peer.id,
          name: peer.name,
          lastSyncAt: peer.lastSyncAt
        }))
      }
    });
  }
  if (strict && !remote) throw new Error("Keine Antwort vom Modul-Hub.");
  return { ok: Boolean(remote), sent: Boolean(remote), received: Boolean(remote) };
}

function queueModuleBridgeSnapshot() {
  moduleBridgeSnapshotQueue = moduleBridgeSnapshotQueue
    .catch(() => {})
    .then(syncStateWithModuleBridge)
    .catch(() => {});
}

function newMobileToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function mobilePairing() {
  const stored = await tb.storage.local.get(MOBILE_PAIRING_KEY);
  const existing = stored?.[MOBILE_PAIRING_KEY];
  if (existing?.token && typeof existing.token === "string") {
    return existing;
  }
  const pairing = { token: newMobileToken(), createdAt: new Date().toISOString() };
  await tb.storage.local.set({ [MOBILE_PAIRING_KEY]: pairing });
  return pairing;
}

function mobileBridge() {
  const bridge = tb.hourGridBridge;
  if (!bridge?.startMobileSync || !bridge?.setMobileSnapshot) {
    throw new Error("Thunderbirds lokale Synchronisationsschnittstelle ist nicht verfügbar.");
  }
  return bridge;
}

async function startMobilePairing() {
  const status = await ensureMobileSync();
  const bridge = mobileBridge();
  if (typeof bridge.setMobilePairingSession !== "function") {
    throw new Error("Die automatische Handy-Verbindung ist in dieser Add-on-Version noch nicht verfÃ¼gbar.");
  }
  const session = {
    sessionId: newMobileToken(),
    secret: newMobileToken(),
    expiresAt: new Date(Date.now() + MOBILE_PAIRING_SESSION_MS).toISOString()
  };
  await bridge.setMobilePairingSession(JSON.stringify(session));
  return {
    ...status,
    pairingMode: true,
    pairingExpiresAt: session.expiresAt
  };
}

async function ensureMobileSync() {
  const pairing = await mobilePairing();
  const bridge = mobileBridge();
  const status = await bridge.startMobileSync(MOBILE_SYNC_PORT, pairing.token);
  mobileSyncStarted = Boolean(status?.running);
  if (!mobileSyncStarted) {
    throw new Error("Thunderbird konnte den lokalen Handy-Dienst nicht starten.");
  }
  await publishMobileSnapshot();
  return status;
}

async function publishMobileSnapshot() {
  if (!mobileSyncStarted) {
    return;
  }
  const snapshot = await plannerSnapshot();
  await mobileBridge().setMobileSnapshot(JSON.stringify(snapshot));
}

function queueMobileSnapshot() {
  if (!mobileSyncStarted) {
    return;
  }
  mobileSnapshotQueue = mobileSnapshotQueue
    .catch(() => {})
    .then(publishMobileSnapshot)
    .catch(error => console.warn("Tagesplaner: Handy-Snapshot konnte nicht aktualisiert werden.", error));
}

function validMobileTask(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const id = String(value.id || "").trim().slice(0, 180);
  const text = String(value.text || value.title || "").trim().slice(0, 500);
  if (!id || !text) {
    return null;
  }
  const changedAt = new Date(value.updatedAt || value.createdAt || 0);
  return {
    id,
    text,
    emailAddress: String(value.emailAddress || "").trim().slice(0, 320),
    notes: String(value.notes || "").slice(0, 10000),
    dueDate: validDueDate(value.dueDate) ? value.dueDate : null,
    order: Number.isFinite(Number(value.order)) ? Number(value.order) : 0,
    done: Boolean(value.done),
    createdAt: String(value.createdAt || new Date().toISOString()),
    updatedAt: Number.isFinite(changedAt.getTime())
      ? changedAt.toISOString()
      : new Date(0).toISOString()
  };
}

function validMobileDeletedTask(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const id = String(value.id || "").trim().slice(0, 180);
  const deletedAt = new Date(value.deletedAt || 0);
  if (!id || !Number.isFinite(deletedAt.getTime())) {
    return null;
  }
  return { id, deletedAt: deletedAt.toISOString() };
}

function validMobileAppointment(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const id = String(value.id || "").trim().slice(0, 180);
  const title = String(value.title || "").trim().slice(0, 500);
  const date = validDueDate(value.date) ? value.date : null;
  const validTime = input => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(input || ""));
  if (!id || !title || !date) {
    return null;
  }
  const changedAt = new Date(value.updatedAt || value.createdAt || 0);
  return {
    id,
    title,
    date,
    startTime: validTime(value.startTime) ? value.startTime : "09:00",
    endTime: validTime(value.endTime) ? value.endTime : (validTime(value.startTime) ? value.startTime : "10:00"),
    createdAt: String(value.createdAt || new Date().toISOString()),
    updatedAt: Number.isFinite(changedAt.getTime()) ? changedAt.toISOString() : new Date(0).toISOString()
  };
}

function mobileValueIsNewer(remote, local) {
  const remoteTime = Date.parse(remote?.updatedAt || 0);
  const localTime = Date.parse(local?.updatedAt || 0);
  return Number.isFinite(remoteTime) && (!Number.isFinite(localTime) || remoteTime > localTime);
}

async function pullMobileChanges() {
  if (!mobileSyncStarted) {
    return;
  }
  let rawSnapshot;
  try {
    rawSnapshot = await mobileBridge().takeMobileSnapshot();
  } catch (error) {
    return;
  }
  if (!rawSnapshot) {
    return;
  }
  let snapshot;
  try {
    snapshot = JSON.parse(rawSnapshot);
  } catch (error) {
    return;
  }
  const rawTasks = Array.isArray(snapshot?.state?.tasks)
    ? snapshot.state.tasks
    : Array.isArray(snapshot?.tasks)
      ? snapshot.tasks
      : [];
  const remoteTasks = rawTasks.map(validMobileTask).filter(Boolean);
  const remoteAppointments = (Array.isArray(snapshot?.state?.appointments)
    ? snapshot.state.appointments
    : Array.isArray(snapshot?.appointments) ? snapshot.appointments : [])
    .map(validMobileAppointment)
    .filter(Boolean);
  if (!remoteTasks.length && !remoteAppointments.length) {
    return;
  }
  const state = await loadState();
  const localById = new Map(state.tasks.map(task => [String(task.id), task]));
  let changed = false;
  for (const remote of remoteTasks) {
    const local = localById.get(remote.id);
    if (!local) {
      state.tasks.push(remote);
      localById.set(remote.id, remote);
      changed = true;
    } else if (mobileValueIsNewer(remote, local)) {
      Object.assign(local, remote);
      changed = true;
    }
  }
  const localAppointmentsById = new Map((state.appointments || []).map(item => [String(item.id), item]));
  for (const remote of remoteAppointments) {
    const local = localAppointmentsById.get(remote.id);
    if (!local) {
      state.appointments.push(remote);
      localAppointmentsById.set(remote.id, remote);
      changed = true;
    } else if (mobileValueIsNewer(remote, local)) {
      Object.assign(local, remote);
      changed = true;
    }
  }
  if (changed) {
    await saveState(state);
  }
}

async function mobileSyncStatus() {
  let startupError = "";
  if (!mobileSyncStarted) {
    try {
      await ensureMobileSync();
    } catch (error) {
      startupError = errorText(error);
    }
  }
  let status = {
    running: false,
    port: MOBILE_SYNC_PORT,
    addresses: [],
    connected: false
  };
  try {
    status = await mobileBridge().getMobileSyncStatus();
  } catch (error) {
    startupError = startupError || errorText(error);
  }
  return { ...status, error: startupError };
}

function isPrivateMobileAddress(value) {
  const parts = String(value || "").trim().split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return parts[0] === 10
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

async function mobilePairingCode(address) {
  const status = await mobileSyncStatus();
  const host = String(address || "").trim();
  if (!status.running) {
    throw new Error(status.error || "Der lokale Handy-Dienst läuft nicht.");
  }
  if (!(status.addresses || []).includes(host) && !isPrivateMobileAddress(host)) {
    throw new Error("Bitte eine private WLAN-, VPN- oder WireGuard-Adresse dieses PCs eingeben.");
  }
  const pairing = await mobilePairing();
  const endpoint = `http://${host}:${status.port || MOBILE_SYNC_PORT}`;
  return `zeitklar://pair?host=${encodeURIComponent(endpoint)}&token=${encodeURIComponent(pairing.token)}&v=3&source=thunderbird`;
}

async function rotateMobilePairing() {
  const pairing = { token: newMobileToken(), createdAt: new Date().toISOString() };
  await tb.storage.local.set({ [MOBILE_PAIRING_KEY]: pairing });
  mobileSyncStarted = false;
  const status = await ensureMobileSync();
  return { ok: true, ...status };
}

async function updateState(mutator) {
  const state = await loadState();
  const result = await mutator(state);
  const saved = await saveState(state);
  return { state: saved, result };
}

async function showNotification(title, message) {
  try {
    await tb.notifications.create({
      type: "basic",
      iconUrl: tb.runtime.getURL("icons/planner.svg"),
      title,
      message
    });
  } catch (error) {
    console.warn("Tagesplaner: Benachrichtigung fehlgeschlagen.", error);
  }
}

async function findExistingSpace() {
  if (!tb.spaces?.query) {
    return null;
  }
  const spaces = await tb.spaces.query({ isSelfOwned: true, name: SPACE_NAME });
  return spaces[0] || null;
}

async function ensurePlannerSpace() {
  if (!tb.spaces?.create) {
    return null;
  }
  const buttonProperties = {
    title: SPACE_TITLE,
    defaultIcons: {
      "16": "icons/planner.svg",
      "32": "icons/planner.svg"
    }
  };
  const existing = await findExistingSpace();
  if (existing) {
    await tb.spaces.update(existing.id, SPACE_URL, buttonProperties);
    return existing;
  }
  return tb.spaces.create(SPACE_NAME, SPACE_URL, buttonProperties);
}

async function openPlannerSpace() {
  const errors = [];
  try {
    await ensurePlannerSpace();
  } catch (error) {
    errors.push(errorText(error));
  }
  try {
    // Reuse the already open Planner instead of turning another mail tab into a
    // second Planner tab or window.
    const existingTabs = await tb.tabs.query({ url: SPACE_URL });
    const existingTab = existingTabs.find(tab => tab?.id != null && tab.url === SPACE_URL);
    if (existingTab) {
      const updated = await tb.tabs.update(existingTab.id, { active: true });
      return { ok: true, method: "existing-tab", tabId: updated?.id ?? existingTab.id };
    }
    // Never navigate an unrelated active tab: it may be the Calendar space.
    const created = await tb.tabs.create({ url: SPACE_URL, active: true });
    if (created?.id == null) {
      throw new Error("Thunderbird hat keinen Tagesplaner-Tab bereitgestellt.");
    }
    return { ok: true, method: "new-tab", tabId: created.id };
  } catch (error) {
    errors.push(errorText(error));
    return { ok: false, error: errors.filter(Boolean).join(" · ") };
  }
}

function requestPlannerOpen() {
  plannerOpenQueue = plannerOpenQueue
    .catch(() => {})
    .then(() => openPlannerSpaceWithRetry())
    .catch(error => console.error("Tagesplaner konnte nicht geöffnet werden.", error));
  return plannerOpenQueue;
}

async function plannerStayedInTab(tabId) {
  try {
    const tab = await tb.tabs.get(tabId);
    return tab?.active === true && tab.url === SPACE_URL;
  } catch (error) {
    return false;
  }
}

async function openPlannerSpaceWithRetry(attempts = 10) {
  let result = { ok: false, error: "Thunderbird ist noch nicht bereit." };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    result = await openPlannerSpace();
    if (result.ok) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (await plannerStayedInTab(result.tabId)) {
        return result;
      }
      result = {
        ok: false,
        error: "Thunderbird hat den Start-Tab noch nicht fertig wiederhergestellt."
      };
    }
    if (attempt + 1 < attempts) {
      await new Promise(resolve => setTimeout(resolve, 900));
    }
  }
  console.error("Tagesplaner: aktueller Tab konnte nicht geöffnet werden.", result.error);
  return result;
}

function alarmName(time) {
  return `${ALARM_PREFIX}${time}`;
}

async function scheduleOneReminder(time) {
  const when = Core.nextReminderTimestamp(time);
  if (when == null) {
    return;
  }
  await tb.alarms.create(alarmName(time), { when });
}

async function syncReminderAlarms(settings = null) {
  const effectiveSettings = settings || (await loadState()).settings;
  const times = Core.normalizeTimes(effectiveSettings.reminderTimes);
  const existing = await tb.alarms.getAll();
  await Promise.all(
    existing
      .filter(alarm => alarm.name.startsWith(ALARM_PREFIX))
      .map(alarm => tb.alarms.clear(alarm.name))
  );
  await Promise.all(times.map(scheduleOneReminder));
}

async function collectMessageList(list) {
  const messages = [...(list?.messages || [])];
  let listId = list?.id;
  while (listId) {
    const next = await tb.messages.continueList(listId);
    messages.push(...(next?.messages || []));
    listId = next?.id;
  }
  return messages;
}

async function messagesForTab(tab) {
  if (!tab) {
    return [];
  }
  try {
    const selected = await collectMessageList(await tb.mailTabs.getSelectedMessages(tab.id));
    if (selected.length) {
      return selected;
    }
  } catch (error) {
    // Standalone message tabs are not mail tabs.
  }
  try {
    if (typeof tb.messageDisplay.getDisplayedMessages === "function") {
      const displayed = await collectMessageList(
        await tb.messageDisplay.getDisplayedMessages(tab.id)
      );
      if (displayed.length) {
        return displayed;
      }
    }
  } catch (error) {
    // Older compatible builds use getDisplayedMessage().
  }
  try {
    const displayed = await tb.messageDisplay.getDisplayedMessage(tab.id);
    return displayed ? [displayed] : [];
  } catch (error) {
    return [];
  }
}

function normalizePeople(value) {
  if (Array.isArray(value)) {
    return value.map(entry => String(entry));
  }
  return value ? [String(value)] : [];
}

function emailLookupKey(message) {
  if (message?.headerMessageId) {
    return `header:${message.headerMessageId}`;
  }
  return `session:${message?.folder?.id || ""}:${message?.id || ""}`;
}

function emailReference(message, dueDate, existing = null) {
  const rawDate = message?.date ? new Date(message.date) : null;
  return {
    id: existing?.id || makeId("mail"),
    lookupKey: emailLookupKey(message),
    messageId: message?.id ?? existing?.messageId ?? null,
    headerMessageId: String(message?.headerMessageId || existing?.headerMessageId || ""),
    subject: String(message?.subject || "(Ohne Betreff)"),
    author: String(message?.author || ""),
    recipients: normalizePeople(message?.recipients),
    ccList: normalizePeople(message?.ccList),
    messageDate: rawDate && Number.isFinite(rawDate.getTime())
      ? rawDate.toISOString()
      : existing?.messageDate || "",
    folderId: String(message?.folder?.id || existing?.folderId || ""),
    folderName: String(message?.folder?.name || existing?.folderName || ""),
    folderPath: String(message?.folder?.path || existing?.folderPath || ""),
    accountId: String(message?.folder?.accountId || existing?.accountId || ""),
    dueDate,
    done: false,
    addedAt: existing?.addedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function validDueDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function formatDueDate(value) {
  if (!validDueDate(value)) {
    return "Ewige Liste";
  }
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(year, month - 1, day, 12, 0, 0, 0));
}

async function markMessagesForDueDate(messages, dueDate, destination = null) {
  if (!messages.length) {
    return { ok: false, error: "Keine Mail ausgewählt." };
  }
  if (dueDate != null && !validDueDate(dueDate)) {
    return { ok: false, error: "Bitte ein gültiges Datum auswählen." };
  }

  const { state } = await updateState(current => {
    for (const message of messages) {
      const lookupKey = emailLookupKey(message);
      const existingIndex = current.emails.findIndex(item => item.lookupKey === lookupKey);
      const existing = existingIndex >= 0 ? current.emails[existingIndex] : null;
      const next = emailReference(message, dueDate, existing);
      if (existingIndex >= 0) {
        current.emails.splice(existingIndex, 1, next);
      } else {
        current.emails.push(next);
      }
    }
  });

  const destinationLabel = destination || formatDueDate(dueDate);
  await showNotification(
    messages.length === 1 ? "Mail eingeplant" : "Mails eingeplant",
    `${messages.length} ${messages.length === 1 ? "Mail" : "Mails"} → ${destinationLabel}`
  );
  return { ok: true, count: messages.length, destination: destinationLabel, state };
}

async function markMessagesForTarget(messages, target) {
  const today = Core.localDateKey();
  const dueDate = Core.dueDateForTarget(target, today);
  const destination = target === "today"
    ? "Heute"
    : target === "tomorrow"
      ? "Morgen"
      : "Ewige Liste";
  return markMessagesForDueDate(messages, dueDate, destination);
}

async function markActiveMessages(target, tab = null) {
  const activeTab = tab || (await tb.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  const messages = await messagesForTab(activeTab);
  return markMessagesForTarget(messages, target);
}

async function markActiveMessagesForDate(dueDate, tab = null) {
  const activeTab = tab || (await tb.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  const messages = await messagesForTab(activeTab);
  return markMessagesForDueDate(messages, dueDate);
}

async function openDateChooser(messages) {
  if (!messages.length) {
    return { ok: false, error: "Keine Mail ausgewählt." };
  }
  const token = makeId("pending");
  pendingEmailSelections.set(token, {
    messages,
    expiresAt: Date.now() + 10 * 60 * 1000
  });
  const url = tb.runtime.getURL(`popup/date.html?token=${encodeURIComponent(token)}`);
  for (const type of ["popup", "normal"]) {
    try {
      await tb.windows.create({ url, type, width: 430, height: 285, focused: true });
      return { ok: true, token, type };
    } catch (error) {
      // Try the next supported presentation type.
    }
  }
  try {
    await tb.tabs.create({ url, active: true });
    return { ok: true, token, type: "tab" };
  } catch (error) {
    pendingEmailSelections.delete(token);
    return { ok: false, error: errorText(error) };
  }
}

async function confirmPendingEmailDate(token, dueDate) {
  const pending = pendingEmailSelections.get(String(token || ""));
  pendingEmailSelections.delete(String(token || ""));
  if (!pending || pending.expiresAt < Date.now()) {
    return { ok: false, error: "Die Mail-Auswahl ist abgelaufen. Bitte erneut auswählen." };
  }
  return markMessagesForDueDate(pending.messages, dueDate);
}

function sameDueDate(left, right) {
  return (left || null) === (right || null);
}

function nextTaskOrder(tasks, dueDate, excludedId = null) {
  const values = tasks
    .filter(item => item.id !== excludedId && sameDueDate(item.dueDate, dueDate))
    .map(item => Number(item.order))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) + 1 : 0;
}

async function addTask(message) {
  const text = String(message.text || "").trim();
  if (!text) {
    return { ok: false, error: "Bitte eine Aufgabe eingeben." };
  }
  const dueDate = message.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(message.dueDate)
    ? message.dueDate
    : null;
  const task = {
    id: makeId("task"),
    text,
    emailAddress: String(message.emailAddress || "").trim(),
    notes: String(message.notes || "").slice(0, 10000),
    dueDate,
    order: 0,
    done: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await updateState(state => {
    task.order = nextTaskOrder(state.tasks, dueDate);
    state.tasks.push(task);
  });
  return { ok: true, task };
}

async function updateTask(message) {
  const text = String(message.text || "").trim();
  if (!text) {
    return { ok: false, error: "Der Aufgabentext darf nicht leer sein." };
  }
  return patchStoredItem("tasks", message.id, {
    text,
    ...(Object.prototype.hasOwnProperty.call(message, "notes") ? { notes: String(message.notes || "").slice(0, 10000) } : {}),
    emailAddress: String(message.emailAddress || "").trim(),
    dueDate: validDueDate(message.dueDate) ? message.dueDate : null
  });
}

async function dropTask(id, dueDate, targetId = null, position = "after") {
  if (dueDate != null && !validDueDate(dueDate)) {
    return { ok: false, error: "Bitte ein gültiges Zieldatum auswählen." };
  }
  const normalizedDueDate = dueDate || null;
  let found = false;
  let moved = false;
  await updateState(state => {
    const result = Core.applyTaskDrop(state.tasks, {
      id,
      dueDate: normalizedDueDate,
      targetId,
      position
    });
    found = result.found;
    moved = result.moved;
    const task = state.tasks.find(item => item.id === id);
    if (task && moved) {
      task.updatedAt = new Date().toISOString();
    }
  });
  if (!found) {
    return { ok: false, error: "Aufgabe nicht gefunden." };
  }
  return { ok: true, moved };
}

async function patchStoredItem(collectionName, id, patch) {
  let changed = null;
  await updateState(state => {
    const collection = state[collectionName];
    const item = collection.find(entry => entry.id === id);
    if (!item) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "done")) {
      item.done = Boolean(patch.done);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "dueDate")) {
      const nextDueDate = patch.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)
        ? patch.dueDate
        : null;
      if (collectionName === "tasks" && !sameDueDate(item.dueDate, nextDueDate)) {
        item.order = nextTaskOrder(collection, nextDueDate, item.id);
      }
      item.dueDate = nextDueDate;
    }
    if (collectionName === "tasks" && Object.prototype.hasOwnProperty.call(patch, "text")) {
      item.text = String(patch.text);
    }
    if (collectionName === "tasks" && Object.prototype.hasOwnProperty.call(patch, "emailAddress")) {
      item.emailAddress = String(patch.emailAddress || "");
    }
    if (collectionName === "tasks" && Object.prototype.hasOwnProperty.call(patch, "notes")) {
      item.notes = String(patch.notes || "").slice(0, 10000);
    }
    item.updatedAt = new Date().toISOString();
    changed = { ...item };
  });
  return changed
    ? { ok: true, item: changed }
    : { ok: false, error: "Eintrag nicht gefunden." };
}

async function deleteStoredItem(collectionName, id) {
  let removed = false;
  await updateState(state => {
    const before = state[collectionName].length;
    state[collectionName] = state[collectionName].filter(item => item.id !== id);
    removed = state[collectionName].length < before;
    if (removed && collectionName === "tasks") {
      const deletedAt = new Date().toISOString();
      const previous = Array.isArray(state.deletedTasks) ? state.deletedTasks : [];
      state.deletedTasks = [
        ...previous.filter(item => String(item?.id || "") !== String(id)),
        { id: String(id), deletedAt }
      ];
    }
  });
  return removed ? { ok: true } : { ok: false, error: "Eintrag nicht gefunden." };
}

async function saveSettings(nextSettings) {
  let savedSettings = null;
  await updateState(state => {
    const reminderTimes = Core.normalizeTimes(nextSettings?.reminderTimes);
    state.settings = {
      ...state.settings,
      openOnStartup: nextSettings?.openOnStartup !== false,
      showCompleted: nextSettings?.showCompleted !== false,
      reminderTimes: reminderTimes.length ? reminderTimes : ["08:00"]
    };
    savedSettings = { ...state.settings, reminderTimes: [...state.settings.reminderTimes] };
  });
  await syncReminderAlarms(savedSettings);
  return { ok: true, settings: savedSettings };
}

function rangeForPlanner() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  // The Tagesplaner is the reliable fallback while the separate calendar
  // module is still evolving. Publish a rolling month instead of only today
  // and tomorrow, so the mobile date picker can show upcoming appointments.
  end.setDate(end.getDate() + 32);
  return { start, end };
}

function calendarPartDate(part) {
  if (!part || !Number.isFinite(Number(part.year)) || !Number.isFinite(Number(part.month)) || !Number.isFinite(Number(part.day))) {
    return null;
  }
  const value = new Date(
    Number(part.year),
    Number(part.month) - 1,
    Number(part.day),
    Number(part.hour || 0),
    Number(part.minute || 0),
    Number(part.second || 0),
    0
  );
  return Number.isFinite(value.getTime()) ? value : null;
}

async function readCalendarData() {
  const { start, end } = rangeForPlanner();
  try {
    const calendarApi = globalThis.messenger?.hourGridBridge || globalThis.browser?.hourGridBridge;
    if (!calendarApi?.getMonthData) {
      throw new Error("Thunderbirds Kalender-Schnittstelle ist nicht verfügbar.");
    }
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, 0);
    while (cursor < end) {
      months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const monthSnapshots = await Promise.all(months.map(({ year, month }) =>
      calendarApi.getMonthData(year, month, 1)
    ));
    if (monthSnapshots.some(data => !data || !Array.isArray(data.events))) {
      throw new Error("Thunderbird hat keine gültigen Kalenderdaten geliefert.");
    }
    const eventsById = new Map();
    const calendarsById = new Map();
    const errors = [];
    for (const monthData of monthSnapshots) {
      for (const calendar of (monthData.calendars || [])) {
        calendarsById.set(String(calendar.id || calendar.name || JSON.stringify(calendar)), calendar);
      }
      errors.push(...(monthData.errors || []));
      for (const event of monthData.events) {
        const eventStart = calendarPartDate(event.start);
        const eventEnd = calendarPartDate(event.end) || eventStart;
        if (!eventStart || !eventEnd || eventEnd <= start || eventStart >= end) {
          continue;
        }
        const key = `${event.id || event.title || "event"}|${eventStart.toISOString()}|${event.calendarId || event.calendarName || ""}`;
        eventsById.set(key, event);
      }
    }
    return {
      ok: true,
      calendars: [...calendarsById.values()],
      events: [...eventsById.values()],
      errors,
      generatedAt: new Date().toISOString(),
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
      calendars: [],
      events: [],
      errors: [{ calendarId: "", calendarName: "", message: errorText(error) }],
      generatedAt: new Date().toISOString()
    };
  }
}

async function plannerSnapshot() {
  const [state, calendar] = await Promise.all([loadState(), readCalendarData()]);
  const todayKey = Core.localDateKey();
  return {
    ok: true,
    todayKey,
    tomorrowKey: Core.shiftDateKey(todayKey, 1),
    state,
    calendar,
    generatedAt: new Date().toISOString()
  };
}

async function openStoredEmail(id) {
  const state = await loadState();
  const reference = state.emails.find(item => item.id === id);
  if (!reference) {
    return { ok: false, error: "Die gespeicherte Mail wurde nicht gefunden." };
  }
  const attempts = [];
  if (reference.headerMessageId) {
    attempts.push({ headerMessageId: reference.headerMessageId, location: "tab", active: true });
  }
  if (reference.messageId != null) {
    attempts.push({ messageId: reference.messageId, location: "tab", active: true });
  }
  for (const properties of attempts) {
    try {
      await tb.messageDisplay.open(properties);
      return { ok: true };
    } catch (error) {
      // Try the session id after the stable Message-ID lookup.
    }
  }
  return {
    ok: false,
    error: "Die Mail ist nicht mehr auffindbar. Möglicherweise wurde sie gelöscht oder ihr Nachrichtenkopf geändert."
  };
}

async function composeTo(address) {
  const value = String(address || "").trim();
  if (!value) {
    return { ok: false, error: "Keine E-Mail-Adresse hinterlegt." };
  }
  try {
    await tb.compose.beginNew({ to: [value] });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}

async function createMenus() {
  try {
    await tb.menus.removeAll();
    tb.menus.create({
      id: MENU_PARENT,
      title: "Zum Tagesplaner",
      contexts: ["message_list", "message_display"]
    });
    tb.menus.create({
      id: "daily-planner-today",
      parentId: MENU_PARENT,
      title: "Für heute",
      contexts: ["message_list", "message_display"]
    });
    tb.menus.create({
      id: "daily-planner-tomorrow",
      parentId: MENU_PARENT,
      title: "Für morgen",
      contexts: ["message_list", "message_display"]
    });
    tb.menus.create({
      id: "daily-planner-date",
      parentId: MENU_PARENT,
      title: "Für ein bestimmtes Datum …",
      contexts: ["message_list", "message_display"]
    });
    tb.menus.create({
      id: "daily-planner-someday",
      parentId: MENU_PARENT,
      title: "Auf die ewige Liste",
      contexts: ["message_list", "message_display"]
    });
  } catch (error) {
    console.error("Tagesplaner: Kontextmenü konnte nicht erstellt werden.", error);
  }
}

tb.menus.onClicked.addListener(async (info, tab) => {
  let messages = await collectMessageList(info.selectedMessages);
  if (!messages.length) {
    messages = await messagesForTab(tab);
  }

  if (info.menuItemId === "daily-planner-date") {
    const chooserResult = await openDateChooser(messages);
    if (!chooserResult.ok) {
      await showNotification("Einplanen nicht möglich", chooserResult.error);
    }
    return;
  }

  const target = MENU_TARGETS[info.menuItemId];
  if (!target) {
    return;
  }
  const result = await markMessagesForTarget(messages, target);
  if (!result.ok) {
    await showNotification("Einplanen nicht möglich", result.error);
  }
});

tb.browserAction.onClicked.addListener(() => requestPlannerOpen());

tb.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) {
    return;
  }
  await requestPlannerOpen();
  await scheduleOneReminder(alarm.name.slice(ALARM_PREFIX.length));
});

tb.runtime.onInstalled.addListener(details => {
  ensurePlannerSpace().catch(error => console.error(error));
  syncReminderAlarms().catch(error => console.error(error));
  createMenus();
  if (details.reason === "install") {
    setTimeout(() => requestPlannerOpen(), 5000);
  }
});

tb.runtime.onStartup.addListener(async () => {
  ensurePlannerSpace().catch(error => console.error(error));
  syncReminderAlarms().catch(error => console.error(error));
  createMenus();
  const state = await loadState();
  if (state.settings.openOnStartup) {
    setTimeout(() => requestPlannerOpen(), 5000);
  }
});

tb.runtime.onMessage.addListener((message, sender) => {
  switch (message?.type) {
    case "syncNow":
      return (async () => {
        await syncStateWithModuleBridge({ strict: true });
        const hub = await tb.runtime.sendMessage("tb-connect-module-hub@tbconnect.local",
          { type: "syncDesktopNow", skipPlanner: true });
        return { ...await plannerSnapshot(), manualSync: hub };
      })().catch(error => ({ok:false,error:error.message || "Senden oder Empfangen fehlgeschlagen."}));
    case "getPlannerData":
      return plannerSnapshot();
    case "addTask":
      return addTask(message);
    case "updateTask":
      return updateTask(message);
    case "dropTask":
      return dropTask(message.id, message.dueDate, message.targetId, message.position);
    case "toggleTask":
      return patchStoredItem("tasks", message.id, { done: message.done });
    case "moveTask":
      return patchStoredItem("tasks", message.id, { dueDate: message.dueDate });
    case "deleteTask":
      return deleteStoredItem("tasks", message.id);
    case "toggleEmail":
      return patchStoredItem("emails", message.id, { done: message.done });
    case "moveEmail":
      return patchStoredItem("emails", message.id, { dueDate: message.dueDate });
    case "deleteEmail":
      return deleteStoredItem("emails", message.id);
    case "savePlannerSettings":
      return saveSettings(message.settings);
    case "openStoredEmail":
      return openStoredEmail(message.id);
    case "composeTo":
      return composeTo(message.address);
    case "markActiveMessages":
      return markActiveMessages(message.target, sender?.tab || null);
    case "markActiveMessagesForDate":
      return markActiveMessagesForDate(message.dueDate, sender?.tab || null);
    case "confirmPendingEmailDate":
      return confirmPendingEmailDate(message.token, message.dueDate);
    case "openPlannerSpace":
      return requestPlannerOpen();
    case "getMobileSyncStatus":
      return mobileSyncStatus().then(status => ({ ok: true, ...status }));
    case "startMobileSync":
      return ensureMobileSync().then(status => ({ ok: true, ...status }));
    case "startMobilePairing":
      return startMobilePairing().then(status => ({ ok: true, ...status }));
    case "getMobilePairingCode":
      return mobilePairingCode(message.address).then(code => ({ ok: true, code }));
    case "rotateMobilePairing":
      return rotateMobilePairing();
    default:
      return undefined;
  }
});

loadState().then(state => saveState(state, { broadcast: false })).catch(() => {});
ensurePlannerSpace().catch(error => console.error(error));
syncReminderAlarms().catch(error => console.error(error));
createMenus();
ensureMobileSync().catch(error => console.warn("Tagesplaner: Handy-Dienst konnte nicht gestartet werden.", error));
setInterval(() => pullMobileChanges().catch(() => {}), 4000);
setInterval(() => syncStateWithModuleBridge().catch(() => {}), 4000);

if (tb.runtime.onMessageExternal) tb.runtime.onMessageExternal.addListener((message, sender) => {
  if (sender.id !== "tb-connect-module-hub@tbconnect.local" || message?.type !== "forceModuleSync") return undefined;
  return syncStateWithModuleBridge({ strict: true });
});
