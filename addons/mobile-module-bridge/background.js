"use strict";

const tb = globalThis.messenger || globalThis.browser;
const BRIDGE_PORT = 47832;
const STATE_KEY = "moduleBridgeState";
const PAIRING_LIFETIME_MS = 5 * 60 * 1000;
const DASHBOARD_URL = tb.runtime.getURL("dashboard/index.html");
const SPACE_NAME = "tb_connect_module_hub";
const SPACE_TITLE = "TB-Connect Mobil";
const MODULE_TRANSPORT = "tb-connect-module-bridge-v1";
const DIAGNOSTIC_PEER_IDS = new Set(["desktop-diagnostic", "desktop-simple-post-diagnostic"]);
const DIAGNOSTIC_MODULE_ID = "de.tbconnect.modules.daily-planner";
const DIAGNOSTIC_TASK_ID = "task-diagnostic";
const HUB_EXTENSION_ID = "tb-connect-module-hub@tbconnect.local";
const DEFAULT_MOBILE_MODULE_IDS = new Set(["de.tbconnect.modules.daily-planner"]);
const NEXTCLOUD_PROTOCOL = "tb-connect-nextcloud/1";
const NEXTCLOUD_STATE_FILE = "tb-connect-sync.json";
const NEXTCLOUD_MANIFEST_FILE = "tb-connect-manifest.json";
const DEFAULT_NEXTCLOUD_APP_FOLDER = "Thunderbird";
const NEXTCLOUD_REQUEST_TIMEOUT_MS = 15 * 1000;
const NEXTCLOUD_LOGIN_MAX_AGE_MS = 20 * 60 * 1000;
const NEXTCLOUD_LOGIN_POLL_INTERVAL_MS = 2 * 1000;

let statePushQueue = Promise.resolve();
let nextcloudLoginPollPromise = null;
let nextcloudLoginPollTimer = null;
let stateWriteQueue = Promise.resolve();

function errorDetails(error, fallback = "Unbekannter Fehler") {
  const message = String(error?.message || error || fallback).trim() || fallback;
  const result = typeof error?.result === "number" ? ` (Code ${error.result})` : "";
  return `${message}${result}`;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function emptyState() {
  return {
    version: 2,
    workspaceId: `workspace-${randomToken()}`,
    accessToken: randomToken(),
    moduleStates: {},
    peers: [],
    peerLabels: {},
    sources: [],
    mobileEnabledModuleIds: [...DEFAULT_MOBILE_MODULE_IDS],
    nextcloud: null,
    nextcloudLogin: null,
    nextcloudSetupError: null,
    updatedAt: new Date().toISOString()
  };
}

async function loadState() {
  const stored = await tb.storage.local.get(STATE_KEY);
  const value = stored?.[STATE_KEY];
  if (!value || typeof value !== "object" || !value.workspaceId || !value.accessToken) {
    const fresh = emptyState();
    await tb.storage.local.set({ [STATE_KEY]: fresh });
    return fresh;
  }
  return {
    ...emptyState(),
    ...value,
    version: 2,
    moduleStates: value.moduleStates && typeof value.moduleStates === "object" ? value.moduleStates : {},
    peers: Array.isArray(value.peers) ? value.peers : [],
    peerLabels: value.peerLabels && typeof value.peerLabels === "object" && !Array.isArray(value.peerLabels)
      ? value.peerLabels
      : {},
    sources: Array.isArray(value.sources) ? value.sources : [],
    mobileEnabledModuleIds: Array.isArray(value.mobileEnabledModuleIds)
      ? value.mobileEnabledModuleIds.filter(item => typeof item === "string")
      : [...DEFAULT_MOBILE_MODULE_IDS],
    nextcloud: normalizeStoredNextcloud(value.nextcloud),
    nextcloudLogin: normalizePendingNextcloudLogin(value.nextcloudLogin),
    nextcloudSetupError: String(value.nextcloudSetupError || "").trim().slice(0, 240) || null
  };
}

async function saveState(nextState) {
  const value = { ...nextState, version: 2, updatedAt: new Date().toISOString() };
  await tb.storage.local.set({ [STATE_KEY]: value });
  return value;
}

function updateState(changes) {
  const operation = stateWriteQueue.catch(() => {}).then(async () => {
    const latest = await loadState();
    return saveState({ ...latest, ...(typeof changes === "function" ? changes(latest) : changes) });
  });
  stateWriteQueue = operation;
  return operation;
}

function moduleId(value) {
  const id = String(value || "").trim();
  return /^[a-z0-9][a-z0-9._-]{2,119}$/i.test(id) ? id : "";
}

function safeHttpsUrl(value, baseUrl, fieldName, { required = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    if (required) throw new Error(`${fieldName} fehlt.`);
    return "";
  }
  let url;
  try {
    url = new URL(raw, baseUrl);
  } catch (error) {
    throw new Error(`${fieldName} ist keine gültige Adresse.`);
  }
  if (url.protocol !== "https:") throw new Error(`${fieldName} muss HTTPS verwenden.`);
  return url.href;
}

function normalizeNextcloudServerUrl(value) {
  const raw = String(value || "").trim();
  // People naturally enter `cloud.example.de`. Treat a hostname without a
  // scheme as HTTPS, while still rejecting explicit insecure URLs below.
  const candidate = raw && !/^[a-z][a-z0-9+.-]*:/i.test(raw) ? `https://${raw}` : raw;
  let url;
  try {
    url = new URL(candidate);
  } catch (error) {
    throw new Error("Die Nextcloud-Adresse ist ungültig.");
  }
  if (url.protocol !== "https:") throw new Error("Die Nextcloud-Adresse muss HTTPS verwenden.");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Die Nextcloud-Adresse darf keine Zugangsdaten, Suche oder Fragment enthalten.");
  }
  let path = url.pathname.replace(/\/+$/, "");
  if (/\/remote\.php\/dav$/i.test(path)) {
    path = path.replace(/\/remote\.php\/dav$/i, "");
  } else if (/\/remote\.php\//i.test(path)) {
    throw new Error("Gib die Basisadresse deiner Nextcloud ein, nicht einen WebDAV-Unterpfad.");
  }
  url.pathname = path || "/";
  return url.href.replace(/\/$/, "");
}

function normalizeNextcloudAppFolder(value) {
  const folder = String(value || DEFAULT_NEXTCLOUD_APP_FOLDER).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,63}$/.test(folder) || folder === "." || folder === "..") {
    throw new Error("Der App-Ordner darf nur Buchstaben, Zahlen, Leerzeichen, Punkt, Unterstrich und Bindestrich enthalten.");
  }
  return folder;
}

function normalizeNextcloudUsername(value) {
  const username = String(value || "").trim();
  if (!username || username.length > 320 || /[\r\n]/.test(username)) {
    throw new Error("Der Nextcloud-Benutzername ist ungültig.");
  }
  return username;
}

function normalizeStoredNextcloud(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    return {
      serverUrl: normalizeNextcloudServerUrl(value.serverUrl),
      username: normalizeNextcloudUsername(value.username),
      appFolder: normalizeNextcloudAppFolder(value.appFolder),
      lastSyncAt: String(value.lastSyncAt || "").trim() || null,
      lastError: String(value.lastError || "").trim().slice(0, 240) || null,
      lastRevision: Math.max(0, Number(value.lastRevision || 0) || 0)
    };
  } catch (error) {
    return null;
  }
}

function nextcloudPathSegment(value) {
  return encodeURIComponent(String(value || "")).replace(/%2F/gi, "%252F");
}

function nextcloudUserRootUrl(config) {
  const base = normalizeNextcloudServerUrl(config.serverUrl);
  return `${base}/remote.php/dav/files/${nextcloudPathSegment(config.username)}/`;
}

function nextcloudFileUrl(config, filename) {
  return `${nextcloudUserRootUrl(config)}${nextcloudPathSegment(config.appFolder)}/${nextcloudPathSegment(filename)}`;
}

function nextcloudRemotePath(config) {
  return config.appFolder;
}

function nextcloudAuthorization(username, appPassword) {
  const raw = `${username}:${appPassword}`;
  return `Basic ${btoa(unescape(encodeURIComponent(raw)))}`;
}

function nextcloudPublicConfig(config) {
  if (!config) return null;
  return {
    configured: true,
    serverUrl: config.serverUrl,
    username: config.username,
    appFolder: config.appFolder,
    remotePath: nextcloudRemotePath(config),
    lastSyncAt: config.lastSyncAt || null,
    lastError: config.lastError || null,
    lastRevision: Math.max(0, Number(config.lastRevision || 0) || 0)
  };
}

function normalizePendingNextcloudLogin(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const serverUrl = normalizeNextcloudServerUrl(value.serverUrl);
    const pollEndpoint = safeHttpsUrl(value.pollEndpoint, serverUrl, "Nextcloud-Anmelde-Endpunkt", { required: true });
    const pollUrl = new URL(pollEndpoint);
    if (pollUrl.origin !== new URL(serverUrl).origin) {
      throw new Error("Der Nextcloud-Anmelde-Endpunkt gehört nicht zu dieser Cloud.");
    }
    const pollToken = String(value.pollToken || "").trim();
    const startedAt = String(value.startedAt || "").trim();
    const startedAtMs = new Date(startedAt).getTime();
    if (!pollToken || !Number.isFinite(startedAtMs) || Date.now() - startedAtMs > NEXTCLOUD_LOGIN_MAX_AGE_MS) {
      return null;
    }
    return {
      serverUrl,
      appFolder: normalizeNextcloudAppFolder(value.appFolder),
      pollEndpoint,
      pollToken,
      startedAt,
      lastError: String(value.lastError || "").trim().slice(0, 240) || null
    };
  } catch (error) {
    return null;
  }
}

function nextcloudLoginPublic(login) {
  if (!login) return { pending: false };
  const startedAtMs = new Date(login.startedAt).getTime();
  return {
    pending: true,
    serverUrl: login.serverUrl,
    appFolder: login.appFolder,
    startedAt: login.startedAt,
    expiresAt: new Date(startedAtMs + NEXTCLOUD_LOGIN_MAX_AGE_MS).toISOString(),
    lastError: login.lastError || null
  };
}

function cloneJson(value, fallback) {
  try { return JSON.parse(JSON.stringify(value)); } catch (error) { return fallback; }
}

function timeOrEpoch(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function newerRecord(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return timeOrEpoch(right.updatedAt) >= timeOrEpoch(left.updatedAt) ? right : left;
}

function mergePlannerCollection(remote, local, itemName, deletedName) {
  const remoteItems = Array.isArray(remote?.[itemName]) ? remote[itemName] : [];
  const localItems = Array.isArray(local?.[itemName]) ? local[itemName] : [];
  const remoteDeleted = Array.isArray(remote?.[deletedName]) ? remote[deletedName] : [];
  const localDeleted = Array.isArray(local?.[deletedName]) ? local[deletedName] : [];
  const deleted = new Map();
  for (const marker of [...remoteDeleted, ...localDeleted]) {
    const id = String(marker?.id || "").trim();
    const deletedAt = String(marker?.deletedAt || "").trim();
    if (!id || !timeOrEpoch(deletedAt)) continue;
    const previous = deleted.get(id);
    if (!previous || timeOrEpoch(deletedAt) >= timeOrEpoch(previous.deletedAt)) deleted.set(id, { id, deletedAt });
  }
  const items = new Map();
  for (const item of [...remoteItems, ...localItems]) {
    const id = String(item?.id || "").trim();
    if (!id) continue;
    const previous = items.get(id);
    if (!previous || timeOrEpoch(item?.updatedAt) >= timeOrEpoch(previous.updatedAt)) items.set(id, item);
  }
  return {
    items: [...items.values()].filter(item => {
      const tombstone = deleted.get(String(item?.id || ""));
      return !tombstone || timeOrEpoch(item?.updatedAt) > timeOrEpoch(tombstone.deletedAt);
    }),
    deleted: [...deleted.values()]
  };
}

function mergePlannerNextcloudState(remoteState, localState) {
  const remote = remoteState && typeof remoteState === "object" ? remoteState : {};
  const local = localState && typeof localState === "object" ? localState : {};
  const result = cloneJson(
    timeOrEpoch(local.updatedAt) >= timeOrEpoch(remote.updatedAt) ? local : remote,
    {}
  );
  // Keep optional planner fields (calendar references, planned mail references
  // and settings) when the other side has not touched them. Only tasks and
  // app appointments need the stronger per-record conflict merge below.
  for (const source of [remote, local]) {
    for (const [key, value] of Object.entries(source)) {
      if (!(key in result)) result[key] = cloneJson(value, value);
    }
  }
  for (const [items, deleted] of [["tasks", "deletedTasks"], ["appointments", "deletedAppointments"]]) {
    const merged = mergePlannerCollection(remote, local, items, deleted);
    result[items] = merged.items;
    result[deleted] = merged.deleted;
  }
  result.updatedAt = new Date().toISOString();
  return result;
}

function normalizeNextcloudSnapshot(value, config) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      format: NEXTCLOUD_PROTOCOL,
      appFolder: config.appFolder,
      revision: 0,
      updatedAt: null,
      modules: {},
      catalog: [],
      clients: {}
    };
  }
  if (value.format && value.format !== NEXTCLOUD_PROTOCOL) {
    throw new Error("Der Nextcloud-Ordner enthält kein kompatibles TB-Connect-Datenformat.");
  }
  return {
    format: NEXTCLOUD_PROTOCOL,
    appFolder: config.appFolder,
    revision: Math.max(0, Number(value.revision || 0) || 0),
    updatedAt: String(value.updatedAt || "").trim() || null,
    modules: value.modules && typeof value.modules === "object" && !Array.isArray(value.modules) ? value.modules : {},
    catalog: Array.isArray(value.catalog) ? value.catalog : [],
    clients: value.clients && typeof value.clients === "object" && !Array.isArray(value.clients) ? value.clients : {}
  };
}

function mergeNextcloudModuleStates(remoteStates, localStates) {
  const result = {};
  const ids = new Set([...Object.keys(remoteStates || {}), ...Object.keys(localStates || {})]);
  for (const id of ids) {
    const remote = remoteStates?.[id] && typeof remoteStates[id] === "object" ? remoteStates[id] : null;
    const local = localStates?.[id] && typeof localStates[id] === "object" ? localStates[id] : null;
    if (!local) {
      if (remote) result[id] = cloneJson(remote, remote);
      continue;
    }
    if (!remote) {
      result[id] = cloneJson(local, local);
      continue;
    }
    if (id === DIAGNOSTIC_MODULE_ID) {
      const state = mergePlannerNextcloudState(remote.state, local.state);
      result[id] = {
        ...cloneJson(newerRecord(remote, local), local),
        state,
        updatedAt: state.updatedAt,
        lastWriter: "nextcloud-merge",
        lastSyncAt: state.updatedAt
      };
      continue;
    }
    // The Thunderbird calendar is intentionally desktop-owned. A cached phone
    // snapshot may never replace the current Thunderbird calendar view.
    if (id === "de.tbconnect.modules.calendar") {
      result[id] = cloneJson(local, local);
      continue;
    }
    result[id] = cloneJson(newerRecord(remote, local), local);
  }
  return result;
}

function normalizeSourceUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch (error) {
    throw new Error("Bitte eine vollständige HTTPS-Adresse oder ein GitHub-Repository eingeben.");
  }
  if (url.protocol !== "https:") throw new Error("Modulquellen müssen HTTPS verwenden.");
  const githubParts = url.hostname.toLowerCase() === "github.com"
    ? url.pathname.split("/").filter(Boolean)
    : [];
  if (githubParts.length === 2) {
    return `https://raw.githubusercontent.com/${githubParts[0]}/${githubParts[1]}/main/tb-connect-module.json`;
  }
  if (!url.pathname.endsWith("tb-connect-module.json")) {
    throw new Error("Gib die tb-connect-module.json oder die HTTPS-Adresse eines GitHub-Repositories ein.");
  }
  return url.href;
}

function normalizeBuiltIn(module) {
  return {
    ...module,
    desktop: module.desktop && typeof module.desktop === "object" ? module.desktop : null,
    mobile: module.mobile && typeof module.mobile === "object" ? module.mobile : null,
    transport: MODULE_TRANSPORT,
    source: "bundled"
  };
}

function allKnownModules(state) {
  const byId = new Map();
  for (const item of globalThis.ModuleBridgeCatalog || []) {
    const module = normalizeBuiltIn(item);
    if (moduleId(module.id)) byId.set(module.id, module);
  }
  for (const item of state.sources || []) {
    if (item && moduleId(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function mobileCatalog(state) {
  const selected = new Set(state.mobileEnabledModuleIds || []);
  return allKnownModules(state)
    .filter(module => module.mobile?.entry && selected.has(module.id))
    .map(module => ({
      id: module.id,
      name: module.name,
      description: module.description,
      icon: module.icon || "",
      transport: MODULE_TRANSPORT,
      desktopExtensionId: module.desktop?.extensionId || "",
    mobile: {
        entry: String(module.mobile.entry || ""),
        minimumAppVersion: Number(module.mobile.minimumAppVersion || 1),
        preview: Boolean(module.mobile.preview),
        package: module.mobile.package?.url ? {
          format: "tb-connect-mobile-package/1",
          url: module.mobile.package.url,
          sha256: module.mobile.package.sha256 || "",
          // Built-in packages are sent inline as a resilient fallback. They are
          // declarative metadata only; the Android app never executes code from
          // a module package. External repositories stay HTTPS-download only.
          inline: module.mobile.package.inline || null
        } : null
      },
      selectedAt: state.updatedAt
    }));
}

// This removes only the single diagnostic record that was created while the
// connection was being repaired. It is deliberately exact, so normal module
// data is never affected.
async function removeKnownDiagnosticArtifacts() {
  const current = await loadState();
  let moduleStates = current.moduleStates;
  let peers = current.peers;
  let changed = false;
  const planner = current.moduleStates?.[DIAGNOSTIC_MODULE_ID];
  const tasks = planner?.state?.tasks;
  if (Array.isArray(tasks)) {
    const keptTasks = tasks.filter(task => task?.id !== DIAGNOSTIC_TASK_ID);
    if (keptTasks.length !== tasks.length) {
      moduleStates = { ...current.moduleStates, [DIAGNOSTIC_MODULE_ID]: { ...planner, state: { ...planner.state, tasks: keptTasks } } };
      changed = true;
    }
  }
  const keptPeers = current.peers.filter(peer => !DIAGNOSTIC_PEER_IDS.has(peer?.id));
  if (keptPeers.length !== current.peers.length) {
    peers = keptPeers;
    changed = true;
  }
  return changed ? updateState({ moduleStates, peers }) : current;
}

function bridge() {
  const api = tb.moduleBridge;
  if (!api?.start || !api?.setStates || !api?.setPeers || !api?.setCatalog || !api?.syncDailyPlannerFromStorage || !api?.syncCalendarFromStorage) {
    throw new Error("Die Modul-Schnittstelle ist in dieser Add-on-Installation nicht verfügbar. Bitte TB-Connect Modul-Hub 2.0 installieren.");
  }
  return api;
}

async function publishBridgeConfiguration(state) {
  await bridge().setStates(JSON.stringify(state.moduleStates));
  await bridge().setPeers(JSON.stringify(namedPeers(state)));
  await bridge().setCatalog(JSON.stringify(mobileCatalog(state)));
}

function namedPeers(state) {
  const labels = state.peerLabels && typeof state.peerLabels === "object" ? state.peerLabels : {};
  return (state.peers || []).map(peer => ({
    ...peer,
    name: String(labels[peer?.id] || peer?.name || "Unbekanntes Gerät").slice(0, 120)
  }));
}

function mobileRevisionConfirmed(peer, revisions) {
  return revisions.length > 0 && revisions.every(([id, version]) => {
    const receipt = peer.moduleReceipts?.[id];
    if (!receipt?.confirmedAt) return false;
    return receipt.confirmedUpdatedAt === version ||
      (Date.parse(receipt.confirmedUpdatedAt) >= Date.parse(version));
  });
}

async function manualDesktopSync(options = {}) {
  const execute = async () => {
    let status = await bridge().getStatus();
    if (!status?.running) { await startBridge(); }
    const parts = [];
    if (!options.skipCalendarRefresh) {
      try {
        const result = await tb.runtime.sendMessage("hour-grid-month-view@example.local", {type:"syncCalendarProviders"});
        const calendars = result?.calendars || [];
        parts.push({name:"Kalenderanbieter",ok:result?.ok === true,
          detail:calendars.map(item => `${item.name}: ${{received:"empfangen",local:"lokal",pending:"läuft noch",failed:"Fehler",missing:"nicht gefunden"}[item.status]}`).join(" · ")});
      } catch (_) { parts.push({name:"Kalenderanbieter",ok:false,detail:"Kalendererweiterung nicht erreichbar oder nicht aktuell."}); }
    }
    if (!options.skipPlanner) {
      try {
        const result = await tb.runtime.sendMessage("daily-planner@example.local", {type:"forceModuleSync"});
        parts.push({name:"Tagesplaner",ok:result?.sent === true && result?.received === true,
          detail:result?.sent && result?.received ? "Zum Hub gesendet und Antwort übernommen" : "Senden/Empfangen nicht bestätigt"});
      } catch (_) { parts.push({name:"Tagesplaner",ok:false,detail:"Tagesplaner nicht erreichbar oder nicht aktuell."}); }
    }
    try { await persistIncomingStates({strict:true}); }
    catch (_) { parts.push({name:"Desktop-Daten",ok:false,detail:"Einlesen der Desktop-Daten fehlgeschlagen."}); }
    const states = JSON.parse(await bridge().getStates());
    const revisions = ["de.tbconnect.modules.daily-planner", "de.tbconnect.modules.calendar"]
      .filter(id => states[id]).map(id => [id, states[id].updatedAt]);
    status = await bridge().getStatus();
    let mobiles = (status?.peers || []).filter(peer => peer.kind === "mobile");
    const deadline = Date.now() + 35000;
    // The phone confirms the exact received revision; a local snapshot alone is never success.
    while (mobiles.length && !mobiles.every(peer => mobileRevisionConfirmed(peer, revisions)) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      status = await bridge().getStatus();
      mobiles = (status?.peers || []).filter(peer => peer.kind === "mobile");
    }
    const confirmed = mobiles.filter(peer => mobileRevisionConfirmed(peer, revisions)).length;
    if (mobiles.length) {
      // A phone can upload new tasks while we wait. Its receipt proves only the outgoing leg.
      // Read the final Hub state into the planner explicitly, including when the planner called us.
      // forceModuleSync never calls manualDesktopSync, so this cannot create a request loop.
      try {
        const result = await tb.runtime.sendMessage("daily-planner@example.local", {type:"forceModuleSync"});
        parts.push({name:"Empfang am Desktop",ok:result?.sent === true && result?.received === true,
          detail:result?.sent === true && result?.received === true
            ? "Hub-Antwort nach dem Handyabgleich im Tagesplaner übernommen"
            : "Übernahme der abschließenden Hub-Antwort nicht bestätigt"});
      } catch (_) {
        parts.push({name:"Empfang am Desktop",ok:false,detail:"Abschließender Empfang im Tagesplaner fehlgeschlagen."});
      }
    }
    const localOk = parts.every(part => part.ok);
    const complete = localOk && mobiles.length > 0 && confirmed === mobiles.length;
    const detail = parts.map(part => `${part.name}: ${part.detail}`).join("\n");
    const mobileDetail = mobiles.length
      ? `${confirmed} von ${mobiles.length} Handys haben die Übernahme bestätigt.`
      : "Kein Handy gekoppelt; nur Desktop/Hub abgeglichen.";
    return {ok:true,complete,pending:localOk && !complete,parts,message:`${detail}\n${mobileDetail}`.trim()};
  };
  const run = statePushQueue.catch(() => {}).then(execute);
  statePushQueue = run.catch(() => {});
  return run;
}

async function syncDesktopAdapters() {
  const failures = [];
  try { await bridge().syncDailyPlannerFromStorage(); } catch (error) { failures.push(error); }
  // The calendar state is a separate, desktop-owned module. It must be
  // refreshed before serving a phone, otherwise an authenticated connection
  // can look healthy while returning an empty calendar forever.
  try { await bridge().syncCalendarFromStorage(); } catch (error) { failures.push(error); }
  return failures;
}

async function startBridge() {
  const state = await removeKnownDiagnosticArtifacts();
  let bridgeStatus;
  try {
    bridgeStatus = await bridge().start(BRIDGE_PORT, state.workspaceId, state.accessToken);
  } catch (error) {
    throw new Error(`Lokaler Dienst konnte nicht gestartet werden: ${errorDetails(error)}`);
  }
  if (!bridgeStatus?.running) {
    throw new Error(`Lokaler Dienst konnte nicht gestartet werden: ${String(bridgeStatus?.startError || "Thunderbird hat keinen Socket geöffnet.")}`);
  }
  try {
    await publishBridgeConfiguration(state);
  } catch (error) {
    throw new Error(`Hub-Konfiguration konnte nicht gespeichert werden: ${errorDetails(error)}`);
  }
  await syncDesktopAdapters();
  try {
    return await bridge().getStatus();
  } catch (error) {
    throw new Error(`Hub-Status konnte nicht gelesen werden: ${errorDetails(error)}`);
  }
}

async function findExistingSpace() {
  if (!tb.spaces?.query) return null;
  const spaces = await tb.spaces.query({ isSelfOwned: true, name: SPACE_NAME });
  return spaces[0] || null;
}

async function ensureHubSpace() {
  if (!tb.spaces?.create) return null;
  const buttonProperties = { title: SPACE_TITLE, defaultIcons: { "16": "icons/mobile-connect.svg", "32": "icons/mobile-connect.svg" } };
  const existing = await findExistingSpace();
  if (existing) {
    await tb.spaces.update(existing.id, DASHBOARD_URL, buttonProperties);
    return existing;
  }
  return tb.spaces.create(SPACE_NAME, DASHBOARD_URL, buttonProperties);
}

async function persistIncomingStates({strict = false} = {}) {
  const current = await loadState();
  const failures = await syncDesktopAdapters();
  if (strict && failures.length) throw new Error("Desktop-Daten konnten nicht gelesen werden.");
  const [raw, status] = await Promise.all([bridge().getStates(), bridge().getStatus()]);
  let incoming;
  try { incoming = JSON.parse(raw); } catch (error) { return current; }
  if (!incoming || typeof incoming !== "object") return current;
  const peers = Array.isArray(status?.peers) ? namedPeers({ ...current, peers: status.peers }) : current.peers;
  const changed = JSON.stringify(incoming) !== JSON.stringify(current.moduleStates) || JSON.stringify(peers) !== JSON.stringify(current.peers);
  if (!changed) return current;
  const next = await updateState({ moduleStates: incoming, peers });
  await bridge().setCatalog(JSON.stringify(mobileCatalog(next)));
  return next;
}

function validManifest(value, sourceUrl) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Die Moduldatei enthält kein JSON-Objekt.");
  const id = moduleId(value.id);
  const name = String(value.name || "").trim();
  if (!id || !name) throw new Error("Die Moduldatei benötigt eine gültige id und einen Namen.");
  const transport = String(value.transport || MODULE_TRANSPORT);
  if (!["module-bridge-v1", MODULE_TRANSPORT].includes(transport)) throw new Error("Dieses Modul verwendet eine nicht unterstützte Datenschnittstelle.");
  const desktopInput = value.desktop && typeof value.desktop === "object" ? value.desktop : null;
  const mobileInput = value.mobile && typeof value.mobile === "object" ? value.mobile : null;
  const extensionId = String(desktopInput?.extensionId || "").trim();
  const xpi = safeHttpsUrl(desktopInput?.install?.xpi, sourceUrl, "desktop.install.xpi");
  const entry = String(mobileInput?.entry || "").trim().slice(0, 80);
  const packageUrl = safeHttpsUrl(mobileInput?.package?.url || mobileInput?.package, sourceUrl, "mobile.package");
  if (!extensionId && !entry) throw new Error("Ein Modul benötigt desktop.extensionId oder mobile.entry.");
  return {
    id,
    name: name.slice(0, 120),
    description: String(value.description || "").trim().slice(0, 500),
    icon: safeHttpsUrl(value.icon, sourceUrl, "icon", { required: true }),
    transport: MODULE_TRANSPORT,
    desktop: extensionId ? { extensionId, install: xpi ? { xpi } : {} } : null,
    mobile: entry ? {
      entry,
      minimumAppVersion: Math.max(1, Number(mobileInput?.minimumAppVersion || 1)),
      preview: Boolean(mobileInput?.preview),
      package: packageUrl ? { url: packageUrl, sha256: String(mobileInput?.package?.sha256 || "") } : null
    } : null,
    source: sourceUrl,
    bundled: false
  };
}

async function addSource(rawUrl) {
  const sourceUrl = normalizeSourceUrl(rawUrl);
  const response = await fetch(sourceUrl, { cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new Error(`Die Moduldatei konnte nicht geladen werden (${response.status}).`);
  const manifest = validManifest(await response.json(), sourceUrl);
  const state = await loadState();
  const sources = state.sources.filter(source => source.id !== manifest.id && source.source !== manifest.source);
  sources.push(manifest);
  const next = await updateState({ sources });
  await publishBridgeConfiguration(next);
  return manifest;
}

async function extensionEntries() {
  try { return await tb.management.getAll(); } catch (error) { return []; }
}

function catalogForDashboard(state, extensions) {
  const enabledIds = new Set((state.mobileEnabledModuleIds || []).map(moduleId).filter(Boolean));
  const enabledExtensions = new Set(extensions.filter(item => item.enabled).map(item => item.id));
  const knownExtensionIds = new Set();
  const catalog = allKnownModules(state).map(module => {
    const extensionId = module.desktop?.extensionId || "";
    if (extensionId) knownExtensionIds.add(extensionId);
    const installedEntry = extensions.find(entry => entry.id === extensionId) || null;
    return {
      ...module,
      installed: extensionId ? enabledExtensions.has(extensionId) : false,
      installedEntry: installedEntry ? { name: installedEntry.name, version: installedEntry.version, enabled: installedEntry.enabled } : null,
      mobileSelected: Boolean(module.mobile?.entry && enabledIds.has(module.id)),
      sync: state.moduleStates?.[module.id] || null,
      discovered: false
    };
  });
  const discovered = extensions
    .filter(entry => entry.type === "extension" && entry.id !== HUB_EXTENSION_ID && !knownExtensionIds.has(entry.id))
    .map(entry => ({
      id: `detected.${entry.id}`,
      name: entry.name || entry.id,
      description: `Erkannte Thunderbird-Erweiterung (${entry.version || "ohne Versionsangabe"}). Sie hat noch keine TB-Connect-Modulbeschreibung.`,
      icon: entry.icons?.[0]?.url || "icons/module-bridge.svg",
      transport: "",
      desktop: { extensionId: entry.id, install: {} },
      mobile: null,
      installed: Boolean(entry.enabled),
      installedEntry: { name: entry.name, version: entry.version, enabled: entry.enabled },
      mobileSelected: false,
      sync: null,
      discovered: true
    }));
  return [...catalog, ...discovered].sort((left, right) => left.name.localeCompare(right.name, "de"));
}

async function dashboardData() {
  try {
    await startBridge();
    const [state, status, extensions] = await Promise.all([persistIncomingStates(), bridge().getStatus(), extensionEntries()]);
    return {
      ok: true,
      status,
      catalog: catalogForDashboard(state, extensions),
      sources: state.sources,
      nextcloud: nextcloudPublicConfig(state.nextcloud),
      nextcloudLogin: nextcloudLoginPublic(state.nextcloudLogin),
      nextcloudSetupError: state.nextcloudSetupError || null
    };
  } catch (error) {
    // Thunderbird otherwise replaces an experiment exception with the generic
    // “An unexpected error occurred” before the dashboard can display it.
    return {
      ok: false,
      error: `Der Modul-Hub konnte nicht initialisiert werden: ${errorDetails(error)}`,
      diagnostic: {
        requestedPort: BRIDGE_PORT,
        moduleBridgeAvailable: Boolean(tb.moduleBridge),
        at: new Date().toISOString()
      }
    };
  }
}

async function nextcloudFetch(url, username = "", appPassword = "", options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1_000, Number(options.timeoutMs || NEXTCLOUD_REQUEST_TIMEOUT_MS));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { ...(options.headers || {}) };
  if (username || appPassword) {
    headers.Authorization = nextcloudAuthorization(username, appPassword);
  }
  try {
    return await fetch(url, {
      method: options.method || "GET",
      cache: "no-store",
      credentials: "omit",
      // A redirect could cause credentials to leave the configured server.
      // Reject it, but turn the browser exception into an actionable message.
      redirect: "error",
      headers,
      body: options.body,
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Nextcloud antwortet nicht innerhalb von ${Math.round(timeoutMs / 1000)} Sekunden. Prüfe Adresse, Netzwerk und VPN.`);
    }
    throw new Error(`Nextcloud ist unter dieser Adresse nicht sicher erreichbar. Prüfe die HTTPS-Basisadresse und mögliche Weiterleitungen. (${errorDetails(error)})`);
  } finally {
    clearTimeout(timeout);
  }
}

function nextcloudResponseError(response, phase) {
  const status = Number(response?.status || 0);
  if (status === 401) {
    return `Nextcloud lehnt die Anmeldung ab (${status}). Prüfe Benutzername und ein neu erzeugtes Nextcloud-App-Passwort.`;
  }
  if (status === 403) {
    return `Nextcloud verweigert den Zugriff beim ${phase} (403). Prüfe Dateizugriff des App-Passworts, Ordnerrechte und serverseitige Zugriffsregeln. Eine erfolgreiche Browser-Anmeldung allein bestätigt diese Rechte noch nicht.`;
  }
  if ([301, 302, 303, 307, 308].includes(status)) {
    return `Nextcloud leitet die Adresse um (${status}). Trage die HTTPS-Basisadresse ein, die nach dem Öffnen der Cloud im Browser angezeigt wird.`;
  }
  if (status === 404) {
    return `Nextcloud findet den WebDAV-Pfad nicht (404). Prüfe die Basisadresse und den exakten Anmeldenamen.`;
  }
  return `Nextcloud antwortet beim ${phase} mit ${status || "einem unbekannten Fehler"}.`;
}

function nextcloudLoginResponseError(response, phase) {
  const status = Number(response?.status || 0);
  if (status === 404) {
    return "Diese Nextcloud bietet den Browser-Anmeldefluss nicht an (404). Aktualisiere Nextcloud oder nutze ein App-Passwort in den erweiterten Einstellungen.";
  }
  if (status === 401 || status === 403) {
    return `Nextcloud lehnt die Browser-Anmeldung ab (${status}). Prüfe die Cloud-Adresse oder lasse den Login Flow v2 auf dem Server zu.`;
  }
  return nextcloudResponseError(response, phase);
}

async function verifyNextcloudAccess(config, appPassword) {
  // A Depth-0 PROPFIND against the authenticated user root verifies both
  // Basic authentication and the actual WebDAV location before we create or
  // overwrite a synchronization file. Nextcloud documents this endpoint.
  const response = await nextcloudFetch(
    nextcloudUserRootUrl(config),
    config.username,
    appPassword,
    { method: "PROPFIND", headers: { Depth: "0" } }
  );
  if (!response.ok) throw new Error(nextcloudResponseError(response, "Anmeldetest"));
}

async function readNextcloudSnapshot(config, appPassword) {
  const response = await nextcloudFetch(
    nextcloudFileUrl(config, NEXTCLOUD_STATE_FILE),
    config.username,
    appPassword
  );
  if (response.status === 404) {
    return { snapshot: normalizeNextcloudSnapshot(null, config), etag: "", exists: false };
  }
  if (!response.ok) {
    throw new Error(nextcloudResponseError(response, "Lesen"));
  }
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("Die Nextcloud-Synchronisationsdatei enthält kein gültiges JSON.");
  }
  return {
    snapshot: normalizeNextcloudSnapshot(payload, config),
    etag: response.headers.get("etag") || "",
    exists: true
  };
}

async function ensureNextcloudFolder(config, appPassword) {
  const url = nextcloudFileUrl(config, "");
  const response = await nextcloudFetch(url, config.username, appPassword, { method: "MKCOL" });
  if (response.status === 201) return;
  if (response.status === 405) {
    const existing = await nextcloudFetch(url, config.username, appPassword, {method:"PROPFIND", headers:{Depth:"0"}});
    if (existing.status === 207) return;
    throw new Error(nextcloudResponseError(existing, "Prüfen des vorhandenen App-Ordners"));
  }
  throw new Error(nextcloudResponseError(response, "Anlegen des App-Ordners"));
}

async function putNextcloudJson(config, appPassword, filename, payload, conditionalHeaders = {}) {
  const response = await nextcloudFetch(
    nextcloudFileUrl(config, filename),
    config.username,
    appPassword,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...conditionalHeaders
      },
      body: JSON.stringify(payload)
    }
  );
  return response;
}

function nextcloudManifest(config, catalog) {
  return {
    format: NEXTCLOUD_PROTOCOL,
    kind: "tb-connect-app-folder",
    appFolder: config.appFolder,
    createdBy: "TB-Connect Modul-Hub",
    updatedAt: new Date().toISOString(),
    modules: (catalog || []).map(module => ({ id: module.id, name: module.name })).slice(0, 100)
  };
}

async function recordNextcloudFailure(state, config, error) {
  const nextcloud = config ? {
    ...config,
    lastError: errorDetails(error).slice(0, 240)
  } : null;
  return updateState({ nextcloud });
}

let nextcloudSyncPromise = null;
async function synchronizeNextcloud() {
  if (nextcloudSyncPromise) return nextcloudSyncPromise;
  nextcloudSyncPromise = synchronizeNextcloudOnce();
  try { return await nextcloudSyncPromise; }
  finally { nextcloudSyncPromise = null; }
}

async function synchronizeNextcloudOnce() {
  const current = await loadState();
  const config = normalizeStoredNextcloud(current.nextcloud);
  if (!config) throw new Error("Nextcloud ist noch nicht eingerichtet.");

  try {
    const appPassword = await bridge().loadNextcloudCredential(config.serverUrl, config.username);
    if (!appPassword) {
      throw new Error("Das Nextcloud-App-Passwort fehlt. Öffne die Nextcloud-Einstellungen und speichere ein neues App-Passwort.");
    }
    await verifyNextcloudAccess(config, appPassword);
    await ensureNextcloudFolder(config, appPassword);
    const local = await persistIncomingStates();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const remote = await readNextcloudSnapshot(config, appPassword);
      const mergedStates = mergeNextcloudModuleStates(remote.snapshot.modules, local.moduleStates);
      const now = new Date().toISOString();
      const clientId = `desktop-${local.workspaceId}`;
      const snapshot = {
        ...remote.snapshot,
        format: NEXTCLOUD_PROTOCOL,
        appFolder: config.appFolder,
        revision: remote.snapshot.revision + 1,
        updatedAt: now,
        modules: mergedStates,
        // The Hub owns the distributable module catalog. The app verifies every
        // package exactly as it does over local WLAN before it offers an install.
        catalog: mobileCatalog(local),
        clients: {
          ...remote.snapshot.clients,
          [clientId]: {
            id: clientId,
            name: "Dieser Thunderbird",
            kind: "desktop",
            lastSyncAt: now
          }
        }
      };
      const manifestResponse = await putNextcloudJson(config, appPassword, NEXTCLOUD_MANIFEST_FILE, nextcloudManifest(config, snapshot.catalog));
      if (!manifestResponse.ok) {
        throw new Error(nextcloudResponseError(manifestResponse, "Einrichten des Ordners"));
      }
      const stateResponse = await putNextcloudJson(
        config,
        appPassword,
        NEXTCLOUD_STATE_FILE,
        snapshot,
        remote.exists && remote.etag ? { "If-Match": remote.etag } : { "If-None-Match": "*" }
      );
      if (stateResponse.status === 412) continue;
      if (!stateResponse.ok) {
        throw new Error(nextcloudResponseError(stateResponse, "Speichern"));
      }
      const nextcloud = {
        ...config,
        lastSyncAt: now,
        lastError: null,
        lastRevision: snapshot.revision
      };
      // Network I/O may overlap the regular local/device state refresh. Merge
      // inside the serialized write so edits made during upload are retained.
      // They are sent to Nextcloud on the following synchronization.
      const nextState = await updateState(latest => ({
        moduleStates: mergeNextcloudModuleStates(mergedStates, latest.moduleStates),
        nextcloud
      }));
      await publishBridgeConfiguration(nextState);
      return {
        ok: true,
        nextcloud: nextcloudPublicConfig(nextcloud),
        modules: Object.keys(mergedStates).length,
        remotePath: nextcloudRemotePath(config)
      };
    }
    throw new Error("Der Nextcloud-Zustand wurde gleichzeitig geändert. Bitte den Abgleich erneut starten.");
  } catch (error) {
    await recordNextcloudFailure(current, config, error);
    throw error;
  }
}

function nextcloudLoginV2Url(serverUrl) {
  return `${normalizeNextcloudServerUrl(serverUrl)}/index.php/login/v2`;
}

async function readNextcloudLoginPayload(response, phase) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`Nextcloud liefert beim ${phase} keine gültige Antwort. Aktualisiere ggf. deine Nextcloud oder nutze das App-Passwort in den erweiterten Einstellungen.`);
  }
}

function ensureNextcloudLoginPolling() {
  if (nextcloudLoginPollTimer) return;
  nextcloudLoginPollTimer = setInterval(() => {
    pollPendingNextcloudLogin().catch(error => console.warn("TB-Connect: Nextcloud-Anmeldung konnte nicht geprüft werden.", error));
  }, NEXTCLOUD_LOGIN_POLL_INTERVAL_MS);
}

function stopNextcloudLoginPolling() {
  if (!nextcloudLoginPollTimer) return;
  clearInterval(nextcloudLoginPollTimer);
  nextcloudLoginPollTimer = null;
}

async function startNextcloudBrowserLogin(input) {
  const serverUrl = normalizeNextcloudServerUrl(input?.serverUrl);
  const appFolder = normalizeNextcloudAppFolder(input?.appFolder);
  const response = await nextcloudFetch(nextcloudLoginV2Url(serverUrl), "", "", {
    method: "POST",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(nextcloudLoginResponseError(response, "Starten der Browser-Anmeldung"));
  }
  const payload = await readNextcloudLoginPayload(response, "Starten der Browser-Anmeldung");
  const loginUrl = safeHttpsUrl(payload?.login, serverUrl, "Nextcloud-Anmeldeseite", { required: true });
  const pollEndpoint = safeHttpsUrl(payload?.poll?.endpoint, serverUrl, "Nextcloud-Anmelde-Endpunkt", { required: true });
  if (new URL(loginUrl).origin !== new URL(serverUrl).origin || new URL(pollEndpoint).origin !== new URL(serverUrl).origin) {
    throw new Error("Nextcloud hat einen Anmelde-Endpunkt außerhalb der angegebenen Cloud geliefert.");
  }
  const pollToken = String(payload?.poll?.token || "").trim();
  if (!pollToken) throw new Error("Nextcloud hat keinen Anmeldecode geliefert.");

  const current = await loadState();
  const nextcloudLogin = {
    serverUrl,
    appFolder,
    pollEndpoint,
    pollToken,
    startedAt: new Date().toISOString(),
    lastError: null
  };
  await updateState({ nextcloudLogin, nextcloudSetupError: null });
  ensureNextcloudLoginPolling();
  // Login Flow v2 completes in the system browser, keeping redirects and
  // browser session cookies together throughout the user's approval.
  try {
    await tb.windows.openDefaultBrowser(loginUrl);
  } catch (error) {
    await cancelNextcloudBrowserLogin();
    throw new Error("Der Standardbrowser konnte nicht geöffnet werden. Bitte die Browser-Anmeldung erneut starten.");
  }
  return { ok: true, nextcloudLogin: nextcloudLoginPublic(nextcloudLogin) };
}

async function pollPendingNextcloudLogin() {
  if (nextcloudLoginPollPromise) return nextcloudLoginPollPromise;
  nextcloudLoginPollPromise = (async () => {
    const current = await loadState();
    const pending = normalizePendingNextcloudLogin(current.nextcloudLogin);
    if (!pending) {
      if (current.nextcloudLogin) {
        const reason = String(current.nextcloudLogin?.lastError || "Die Nextcloud-Anmeldung ist abgelaufen. Bitte starte sie erneut.").slice(0, 240);
        await updateState({ nextcloudLogin: null, nextcloudSetupError: reason });
      }
      stopNextcloudLoginPolling();
      return { ok: true, pending: false };
    }
    ensureNextcloudLoginPolling();
    try {
      const response = await nextcloudFetch(pending.pollEndpoint, "", "", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: `token=${encodeURIComponent(pending.pollToken)}`
      });
      // A 404 is the documented state while the user is still signing in.
      if (response.status === 404) return { ok: true, pending: true, nextcloudLogin: nextcloudLoginPublic(pending) };
      if (!response.ok) throw new Error(nextcloudLoginResponseError(response, "Prüfen der Browser-Anmeldung"));
      const payload = await readNextcloudLoginPayload(response, "Prüfen der Browser-Anmeldung");
      const serverUrl = normalizeNextcloudServerUrl(payload?.server || pending.serverUrl);
      if (serverUrl !== pending.serverUrl) throw new Error("Nextcloud hat nach der Anmeldung eine andere Serveradresse geliefert. Bitte die endgültige Cloud-Adresse erneut einrichten.");
      const username = normalizeNextcloudUsername(payload?.loginName);
      const appPassword = String(payload?.appPassword || "");
      if (!appPassword) throw new Error("Nextcloud hat kein App-Passwort geliefert.");
      const config = {
        serverUrl,
        username,
        appFolder: pending.appFolder,
        lastSyncAt: null,
        lastError: null,
        lastRevision: 0
      };
      const latestPending = normalizePendingNextcloudLogin((await loadState()).nextcloudLogin);
      if (!latestPending || latestPending.pollToken !== pending.pollToken) return {ok:true,pending:false,cancelled:true};
      const saved = await bridge().saveNextcloudCredential(serverUrl, username, appPassword);
      if (!saved?.ok) throw new Error(saved?.error || "Nextcloud-Zugang konnte nicht gespeichert werden. Bitte die Browser-Anmeldung erneut starten.");
      await updateState({ nextcloud: config, nextcloudLogin: null, nextcloudSetupError: null });
      stopNextcloudLoginPolling();
      const result = await synchronizeNextcloud();
      return { ...result, pending: false, completed: true };
    } catch (error) {
      const latest = await loadState();
      const latestPending = normalizePendingNextcloudLogin(latest.nextcloudLogin);
      const failure = errorDetails(error).slice(0, 240);
      if (latestPending) {
        await updateState({
          nextcloudLogin: { ...latestPending, lastError: failure },
          nextcloudSetupError: failure
        });
      } else {
        await updateState({ nextcloudSetupError: failure });
      }
      throw error;
    }
  })();
  try {
    return await nextcloudLoginPollPromise;
  } finally {
    nextcloudLoginPollPromise = null;
  }
}

async function cancelNextcloudBrowserLogin() {
  const current = await loadState();
  await updateState({ nextcloudLogin: null, nextcloudSetupError: null });
  stopNextcloudLoginPolling();
  return { ok: true };
}

async function configureNextcloud(input) {
  const current = await loadState();
  const previous = normalizeStoredNextcloud(current.nextcloud);
  const config = {
    serverUrl: normalizeNextcloudServerUrl(input?.serverUrl),
    username: normalizeNextcloudUsername(input?.username),
    appFolder: normalizeNextcloudAppFolder(input?.appFolder),
    lastSyncAt: previous?.lastSyncAt || null,
    lastError: null,
    lastRevision: previous?.lastRevision || 0
  };
  const suppliedPassword = String(input?.appPassword || "");
  if (suppliedPassword) {
    const saved = await bridge().saveNextcloudCredential(config.serverUrl, config.username, suppliedPassword);
    if (!saved?.ok) throw new Error(saved?.error || "Nextcloud-Zugang konnte nicht gespeichert werden.");
  }
  const storedPassword = await bridge().loadNextcloudCredential(config.serverUrl, config.username);
  if (!storedPassword) {
    throw new Error("Bitte gib ein Nextcloud-App-Passwort ein. Das normale Konto-Passwort wird nicht benötigt.");
  }
  await updateState({ nextcloud: config, nextcloudLogin: null, nextcloudSetupError: null });
  stopNextcloudLoginPolling();
  return synchronizeNextcloud();
}

async function removeNextcloudConfiguration() {
  const current = await loadState();
  const config = normalizeStoredNextcloud(current.nextcloud);
  if (config) {
    await bridge().removeNextcloudCredential(config.serverUrl, config.username);
  }
  await updateState({ nextcloud: null, nextcloudLogin: null, nextcloudSetupError: null });
  stopNextcloudLoginPolling();
  return { ok: true };
}

async function nextcloudCalendarContext() {
  const current = await loadState();
  const config = normalizeStoredNextcloud(current.nextcloud);
  if (!config) throw new Error("Bitte Nextcloud zuerst oben im Hub anmelden.");
  const password = await bridge().loadNextcloudCredential(config.serverUrl, config.username);
  if (!password) throw new Error("Das Nextcloud-App-Passwort fehlt. Bitte neu anmelden.");
  const request = (url, options) => nextcloudFetch(NextcloudCalDav.safeUrl(url, config.serverUrl), config.username, password, options);
  return {config, request, ...(await NextcloudCalDav.discover(config.serverUrl, request))};
}

async function listNextcloudCalendars() {
  const context = await nextcloudCalendarContext();
  return {ok:true, calendars:context.calendars};
}

async function connectNextcloudCalendar(message) {
  const context = await nextcloudCalendarContext();
  let source;
  if (message.create) {
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(message.requestId || "")) throw new Error("Bitte die Kalenderanlage erneut starten.");
    const target = NextcloudCalDav.safeUrl(context.home.replace(/\/?$/, "/") + "tb-connect-" + message.requestId + "/", context.config.serverUrl);
    source = context.calendars.find(calendar => calendar.url === target);
    if (!source) source = await NextcloudCalDav.create(context.config.serverUrl, context.home, message.name, message.color,
      "tb-connect-" + message.requestId, context.request);
  } else {
    source = context.calendars.find(calendar => calendar.url === message.url);
    if (!source) throw new Error("Bitte den Kalender erneut abrufen und auswählen.");
  }
  try {
    const result = await bridge().registerNextcloudCalendar(JSON.stringify({serverUrl:context.config.serverUrl, username:context.config.username}), JSON.stringify(source));
    if (!result?.ok) throw new Error(result?.error || "Thunderbird konnte den Kalender nicht einbinden.");
    return {...result, name:source.name};
  } catch (error) {
    if (message.create) throw new Error("Der Kalender wurde in Nextcloud angelegt, konnte aber nicht in Thunderbird eingebunden werden. Bitte Kalender abrufen und erneut hinzufügen; keinen zweiten Kalender anlegen.");
    throw error;
  }
}

async function startPairing() {
  await startBridge();
  const session = { sessionId: randomToken(), secret: randomToken(), expiresAt: new Date(Date.now() + PAIRING_LIFETIME_MS).toISOString() };
  await bridge().setPairing(JSON.stringify(session));
  return { ok: true, ...session, status: await bridge().getStatus() };
}

async function rotateAccessToken() {
  const state = await loadState();
  const nextState = await updateState({ accessToken: randomToken() });
  await bridge().start(BRIDGE_PORT, nextState.workspaceId, nextState.accessToken);
  await publishBridgeConfiguration(nextState);
  return { ok: true, status: await bridge().getStatus() };
}

async function setMobileModuleEnabled(id, enabled) {
  const state = await loadState();
  const module = allKnownModules(state).find(item => item.id === id);
  if (!module?.mobile?.entry || module.mobile.preview) throw new Error("Dieses Modul besitzt noch keine installierbare mobile Oberfläche.");
  const selected = new Set(state.mobileEnabledModuleIds || []);
  if (enabled) selected.add(module.id); else selected.delete(module.id);
  const next = await updateState({ mobileEnabledModuleIds: [...selected].sort() });
  await publishBridgeConfiguration(next);
  return {
    ok: true,
    enabled: selected.has(module.id),
    module: module.name,
    availableAt: selected.has(module.id) ? new Date().toISOString() : null
  };
}

async function setPeerLabel(id, label) {
  const peerId = moduleId(id);
  const clean = String(label || "").trim().slice(0, 120);
  if (!peerId || !clean) throw new Error("Bitte einen kurzen Gerätenamen eingeben.");
  const state = await loadState();
  const knownPeers = (await bridge().getStatus()).peers || state.peers;
  if (!knownPeers.some(peer => peer?.id === peerId)) throw new Error("Dieses Gerät ist nicht mehr mit dem Hub verbunden.");
  const next = await updateState({ peers: knownPeers, peerLabels: { ...state.peerLabels, [peerId]: clean } });
  await publishBridgeConfiguration(next);
  return { ok: true, id: peerId, label: clean };
}

function packageFilename(module, xpiUrl) {
  const fromUrl = String(new URL(xpiUrl).pathname.split("/").pop() || "").replace(/[^a-zA-Z0-9._-]/g, "-");
  return fromUrl.endsWith(".xpi") ? `TB-Connect/${fromUrl}` : `TB-Connect/${module.id}.xpi`;
}

async function downloadDesktopPackage(id) {
  const state = await loadState();
  const module = allKnownModules(state).find(item => item.id === id);
  const xpi = module?.desktop?.install?.xpi;
  if (!module || !xpi) throw new Error("Für dieses Modul ist keine Desktop-XPI in der Modulbeschreibung hinterlegt.");
  const downloadId = await tb.downloads.download({ url: xpi, filename: packageFilename(module, xpi), saveAs: true, conflictAction: "uniquify" });
  return { ok: true, downloadId, module: module.name };
}

async function openDashboard(section = "") {
  const tabs = await tb.tabs.query({ url: DASHBOARD_URL });
  const url = DASHBOARD_URL + (section ? "#" + section : "");
  if (tabs[0]) await tb.tabs.update(tabs[0].id, { active: true, ...(section ? {url} : {}) });
  else await tb.tabs.create({ url, active: true });
}

tb.browserAction.onClicked.addListener(() => openDashboard());
tb.runtime.onInstalled.addListener(() => { ensureHubSpace().catch(() => {}); startBridge().catch(() => {}); pollPendingNextcloudLogin().catch(() => {}); });
tb.runtime.onStartup.addListener(() => { ensureHubSpace().catch(() => {}); startBridge().catch(() => {}); pollPendingNextcloudLogin().catch(() => {}); });
tb.runtime.onMessage.addListener(message => {
  const action = () => {
    switch (message?.type) {
      case "getDashboardData": return dashboardData();
      case "startPairing": return startPairing();
      case "rotateAccessToken": return rotateAccessToken();
      case "addModuleSource": return addSource(message.url).then(module => ({ ok: true, module }));
      case "setMobileModuleEnabled": return setMobileModuleEnabled(message.id, Boolean(message.enabled));
      case "setPeerLabel": return setPeerLabel(message.id, message.label);
      case "downloadDesktopPackage": return downloadDesktopPackage(message.id);
      case "startNextcloudLogin": return startNextcloudBrowserLogin(message.nextcloud);
      case "pollNextcloudLogin": return pollPendingNextcloudLogin();
      case "cancelNextcloudLogin": return cancelNextcloudBrowserLogin();
      case "configureNextcloud": return configureNextcloud(message.nextcloud);
      case "syncDesktopNow": return manualDesktopSync();
      case "syncNextcloud": return synchronizeNextcloud();
      case "removeNextcloud": return removeNextcloudConfiguration();
      case "listNextcloudCalendars": return listNextcloudCalendars();
      case "connectNextcloudCalendar": return connectNextcloudCalendar(message);
      default: return undefined;
    }
  };
  try {
    const result = action();
    return result && typeof result.then === "function"
      ? result.catch(error => ({ ok: false, error: errorDetails(error) }))
      : result;
  } catch (error) {
    return { ok: false, error: errorDetails(error) };
  }
});

tb.runtime.onMessageExternal.addListener((message, sender) => {
  if (!["hour-grid-month-view@example.local", "daily-planner@example.local"].includes(sender.id)) return undefined;
  if (message?.type === "syncDesktopNow") {
    return manualDesktopSync({
      skipCalendarRefresh: sender.id === "hour-grid-month-view@example.local",
      skipPlanner: sender.id === "daily-planner@example.local"
    });
  }
  if (sender.id === "hour-grid-month-view@example.local" && message?.type === "openNextcloudCalendars") {
    return openDashboard("nextcloud-calendars").then(() => ({ok:true}));
  }
  return undefined;
});

ensureHubSpace().catch(error => console.warn("Modul-Hub: Seitenleiste konnte nicht eingerichtet werden.", error));
startBridge().catch(error => console.warn("Modul-Hub konnte nicht gestartet werden.", error));
pollPendingNextcloudLogin().catch(() => {});
setInterval(() => {
  statePushQueue = statePushQueue.catch(() => {}).then(persistIncomingStates).catch(() => {});
}, 4000);
// Keep the desktop part of a cloud-only connection alive while Thunderbird runs.
setInterval(async () => {
  try {
    const state = await loadState();
    if (state.nextcloud && !state.nextcloudLogin) await synchronizeNextcloud();
  } catch (_) { /* The sync records its actionable error in the dashboard. */ }
}, 60000);
