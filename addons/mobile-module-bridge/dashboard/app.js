"use strict";

const tb = globalThis.messenger || globalThis.browser;
const PAIRING_HOST_KEY = "pairingHost";
const elements = {
  connectionTitle: document.querySelector("#connection-title"),
  connectionDetail: document.querySelector("#connection-detail"),
  pairingHost: document.querySelector("#pairing-host"),
  pairingCard: document.querySelector("#pairing-card"),
  pairingQr: document.querySelector("#pairing-qr"),
  pairingCode: document.querySelector("#pairing-code"),
  peers: document.querySelector("#peers"),
  modules: document.querySelector("#modules"),
  moduleStatus: document.querySelector("#module-status"),
  nextcloudStatus: document.querySelector("#nextcloud-status"),
  nextcloudServer: document.querySelector("#nextcloud-server"),
  nextcloudAppFolder: document.querySelector("#nextcloud-app-folder"),
  nextcloudSyncButton: document.querySelector("#nextcloud-sync-button"),
  nextcloudLoginCancelButton: document.querySelector("#nextcloud-login-cancel-button"),
  nextcloudRemoveButton: document.querySelector("#nextcloud-remove-button"),
  actionFeedback: document.querySelector("#action-feedback"),
  message: document.querySelector("#message")
};
let pairingHostRestored = false;
let lastModuleStatusAt = null;
let nextcloudLoginRefreshTimer = null;

async function sendHubMessage(type, payload = {}) {
  const result = await tb.runtime.sendMessage({ type, ...payload });
  if (!result?.ok) {
    throw new Error(result?.error || "Der Modul-Hub hat keine verwertbare Antwort geliefert.");
  }
  return result;
}

function formatTime(value) {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) && date.getTime() > 0
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "noch nie";
}

function renderNextcloud(config, login, setupError) {
  const connected = Boolean(config?.configured);
  document.querySelector("#caldav-refresh").disabled = !connected;
  document.querySelector("#caldav-create").disabled = !connected;
  const pending = Boolean(login?.pending);
  elements.nextcloudSyncButton.disabled = !connected || pending;
  elements.nextcloudLoginCancelButton.hidden = !pending;
  elements.nextcloudRemoveButton.hidden = !connected;
  const display = config || login;
  if (document.activeElement !== elements.nextcloudServer && display?.serverUrl) elements.nextcloudServer.value = display.serverUrl;
  if (document.activeElement !== elements.nextcloudAppFolder && display?.appFolder) elements.nextcloudAppFolder.value = display.appFolder;
  if (pending) {
    const error = login.lastError ? `Letzter Prüfversuch: ${login.lastError}` : "Warte auf die Bestätigung auf der Nextcloud-Seite …";
    elements.nextcloudStatus.textContent = `Anmeldung läuft bis ${formatTime(login.expiresAt)}. ${error}`;
    elements.nextcloudStatus.classList.toggle("is-error", Boolean(login.lastError));
    elements.nextcloudStatus.classList.remove("is-active");
    return;
  }
  if (!connected) {
    elements.nextcloudStatus.textContent = setupError
      ? `Letzter Einrichtungsversuch fehlgeschlagen: ${setupError}. Starte die Anmeldung erneut.`
      : "Noch nicht eingerichtet. Die lokale WLAN-Verbindung bleibt davon unabhängig.";
    elements.nextcloudStatus.classList.toggle("is-error", Boolean(setupError));
    elements.nextcloudStatus.classList.remove("is-active");
    return;
  }
  const state = config.lastError
    ? `Fehler beim letzten Abgleich: ${config.lastError}`
    : config.lastSyncAt
      ? `✓ Aktiv · letzter erfolgreicher Abgleich: ${formatTime(config.lastSyncAt)} · Ordner: ${config.remotePath || "Thunderbird"}`
      : "Angemeldet · erster Datenabgleich steht noch aus. Klicke auf Jetzt abgleichen.";
  elements.nextcloudStatus.textContent = state;
  elements.nextcloudStatus.classList.toggle("is-error", Boolean(config.lastError));
  elements.nextcloudStatus.classList.toggle("is-active", !config.lastError && Boolean(config.lastSyncAt));
}

function textNode(value) {
  return document.createTextNode(String(value || ""));
}

function isPrivateIpv4(value) {
  const parts = String(value || "").trim().split(".").map(part => Number(part));
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return parts[0] === 10 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

function pairingAddressRank(value) {
  if (String(value).startsWith("192.168.")) return 0;
  if (String(value).startsWith("10.") || String(value).startsWith("100.")) return 1;
  if (String(value).startsWith("172.")) return 2;
  return 3;
}

async function restorePairingHost() {
  if (pairingHostRestored) return;
  pairingHostRestored = true;
  const stored = await tb.storage.local.get(PAIRING_HOST_KEY);
  const host = String(stored?.[PAIRING_HOST_KEY] || "").trim();
  if (isPrivateIpv4(host)) {
    elements.pairingHost.value = host;
  }
}

async function preferredPairingHost(status) {
  await restorePairingHost();
  const entered = elements.pairingHost.value.trim();
  const detectedAddresses = Array.isArray(status?.addresses)
    ? status.addresses.filter(isPrivateIpv4)
    : [];
  // A stored address is used only while the Hub still sees it. This prevents
  // an old DHCP lease from being put into every subsequently generated QR code.
  if (entered && (detectedAddresses.length === 0 || detectedAddresses.includes(entered))) {
    if (!isPrivateIpv4(entered)) {
      throw new Error("Bitte die private IPv4-Adresse dieses PCs eingeben.");
    }
    await tb.storage.local.set({ [PAIRING_HOST_KEY]: entered });
    return entered;
  }
  const detected = detectedAddresses.sort((left, right) => pairingAddressRank(left) - pairingAddressRank(right))[0] || "";
  if (detected) {
    elements.pairingHost.value = detected;
    await tb.storage.local.set({ [PAIRING_HOST_KEY]: detected });
    return detected;
  }
  throw new Error("Keine WLAN-IP erkannt. Trage die IPv4-Adresse dieses PCs ein, dann wird ein funktionierender QR-Code erstellt.");
}

function appendLine(parent, title, detail, badge = "", status = "") {
  const item = document.createElement("article");
  item.className = "peer";
  const copy = document.createElement("div");
  const heading = document.createElement("strong");
  heading.append(textNode(title));
  const description = document.createElement("p");
  description.append(textNode(detail));
  copy.append(heading, description);
  if (status) {
    const statusLine = document.createElement("p");
    statusLine.className = "module-line-status";
    statusLine.append(textNode(status));
    copy.append(statusLine);
  }
  item.append(copy);
  if (badge) {
    const label = document.createElement("span");
    label.className = "badge";
    label.append(textNode(badge));
    item.append(label);
  }
  parent.append(item);
  return item;
}

function moduleReceiptTime(peer, moduleId) {
  if (peer?.kind === "mobile") return peer?.moduleReceipts?.[moduleId]?.confirmedAt || null;
  return peer?.moduleReceipts?.[moduleId]?.deliveredAt ||
    peer?.moduleReceipts?.[moduleId]?.receivedAt ||
    peer?.lastSyncAt || null;
}

function moduleReceiptCurrent(peer, module) {
  const receipt = peer?.moduleReceipts?.[module.id];
  const revision = module.sync?.updatedAt;
  return Boolean(revision && receipt?.confirmedAt && receipt.confirmedUpdatedAt === revision);
}

function moduleDelivery(module, peers) {
  const mobiles = (peers || []).filter(peer => peer?.kind === "mobile");
  const deliveries = mobiles.map(peer => ({ peer, delivery: peer?.moduleInstallations?.[module.id] || null }));
  const stale = deliveries.some(({ peer }) => Date.now() - new Date(peer.lastSyncAt || 0).getTime() > 20 * 60 * 1000);
  const failed = deliveries.find(({ delivery }) => String(delivery?.status || "").toLowerCase().startsWith("fehler"));
  const installed = deliveries.filter(({ delivery }) => delivery?.status === "Installiert").length;
  return { mobiles, deliveries, stale, failed, installed };
}

function moduleStatusText(module, peers) {
  if (module.discovered) {
    return "Noch kein TB-Connect-Vertrag erkannt. Füge eine tb-connect-module.json hinzu, um Daten oder ein Mobil-Paket bereitzustellen.";
  }
  if (!module.desktop) return module.mobile?.preview
    ? "Konzeptkarte: Für dieses Mobilmodul gibt es noch keine native Ansicht."
    : "Reines Mobilmodul – keine Desktop-Erweiterung erforderlich.";
  if (!module.installed) return "Desktop-Add-on fehlt oder ist deaktiviert.";
  const desktopPeer = (peers || []).find(peer =>
    peer?.kind === "desktop" && Array.isArray(peer.modules) && peer.modules.includes(module.id)
  );
  if (!desktopPeer) {
    return "Desktop-Add-on erkannt – Desktop → Hub wurde noch nicht empfangen.";
  }
  const mobiles = (peers || []).filter(peer =>
    peer?.kind === "mobile" && Array.isArray(peer.modules) && peer.modules.includes(module.id)
  );
  const desktopTime = formatTime(moduleReceiptTime(desktopPeer, module.id));
  const mobileTimes = mobiles.length
    ? mobiles.map(peer => `${peer.name || peer.id}: ${moduleReceiptCurrent(peer, module) ? formatTime(moduleReceiptTime(peer, module.id)) : "Aktueller Stand noch nicht bestätigt"}`).join(" · ")
    : "kein Mobilgerät verknüpft";
  const delivery = moduleDelivery(module, peers);
  const installation = delivery.mobiles.length
    ? ` · Mobil installiert: ${delivery.installed}/${delivery.mobiles.length}`
    : "";
  if (delivery.failed) {
    return `Fehler auf ${delivery.failed.peer.name || delivery.failed.peer.id}: ${delivery.failed.delivery.status}`;
  }
  if (module.mobileSelected && delivery.stale) {
    return `Nicht aktuell: Ein Mobilgerät hat seit über 20 Minuten nicht abgeglichen. ${desktopTime}`;
  }
  return `Desktop → Hub: ${desktopTime} · Mobil empfangen/abgeglichen: ${mobileTimes}${installation}`;
}

function moduleTone(module, peers) {
  const delivery = moduleDelivery(module, peers);
  if (delivery.failed || (module.mobileSelected && delivery.stale)) return "error";
  const installed = delivery.deliveries.filter(({ delivery: installation }) => installation?.status === "Installiert");
  if (module.mobileSelected && installed.length > 0 && installed.every(({ peer }) => moduleReceiptCurrent(peer, module))) return "success";
  if (module.mobileSelected) return "pending";
  return "neutral";
}

function moduleBadge(module) {
  if (module.discovered) return module.installed ? "Erkannt" : "Deaktiviert";
  if (module.mobile?.preview) return "Vorschau";
  if (module.mobileSelected) return "Für Mobil ausgewählt";
  if (module.installed) return "Desktop installiert";
  return module.desktop ? "Desktop fehlt" : "Mobil bereit";
}

function moduleActionButton(label, className, listener) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", listener);
  return button;
}

function renderModule(module, peers) {
  const card = document.createElement("article");
  card.className = "module";
  const heading = document.createElement("div");
  heading.className = "module-heading";
  const icon = document.createElement("img");
  icon.className = "module-icon";
  icon.alt = "";
  icon.src = module.icon || "../icons/module-bridge.svg";
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.append(textNode(module.name));
  const description = document.createElement("p");
  description.append(textNode(module.description || "Keine Beschreibung."));
  const status = document.createElement("p");
  status.className = `module-line-status is-${moduleTone(module, peers)}`;
  status.append(textNode(moduleStatusText(module, peers)));
  copy.append(title, description, status);
  heading.append(icon, copy);
  const footer = document.createElement("div");
  footer.className = "module-footer";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.append(textNode(moduleBadge(module)));
  footer.append(badge);
  const actions = document.createElement("div");
  actions.className = "module-actions";
  if (module.desktop && !module.installed && !module.desktop?.install?.xpi) {
    actions.append(moduleActionButton("Modulquelle hinzufügen", "secondary", () => {
      const source = document.querySelector("#source-url");
      source.scrollIntoView({behavior:"smooth", block:"center"});
      source.focus();
      showActionFeedback("Die HTTPS-Modulbeschreibung des Herausgebers eintragen oder die XPI direkt über Thunderbird installieren.");
    }));
  }
  if (!module.discovered && module.desktop?.install?.xpi && !module.installed) {
    actions.append(moduleActionButton("XPI herunterladen", "secondary", event =>
      withButtonFeedback(event.currentTarget, "Lade …", async () => {
        await sendHubMessage("downloadDesktopPackage", { id: module.id });
        showActionFeedback(`${module.name}: XPI gespeichert. Bitte in Thunderbird sichtbar über „Add-on aus Datei installieren …“ bestätigen.`);
      }).catch(showError)
    ));
  }
  if (!module.discovered && module.mobile?.entry && !module.mobile.preview) {
    const label = module.mobileSelected ? "Von Mobil entfernen" : "Für Mobil bereitstellen";
    actions.append(moduleActionButton(label, module.mobileSelected ? "secondary" : "primary", event =>
      withButtonFeedback(event.currentTarget, "Speichere …", async () => {
        const result = await sendHubMessage("setMobileModuleEnabled", { id: module.id, enabled: !module.mobileSelected });
        showActionFeedback(`${result.module} ist ${result.enabled ? `bereitgestellt (${formatTime(result.availableAt)}). Das Handy zeigt beim nächsten Abgleich „Download verfügbar“.` : "nicht mehr für Mobil bereitgestellt"}.`);
        await refresh();
      }).catch(showError)
    ));
  }
  if (actions.childElementCount) footer.append(actions);
  let progress = null;
  if (module.mobileSelected && module.mobile?.entry) {
    const delivery = moduleDelivery(module, peers);
    progress = document.createElement("div");
    progress.className = `delivery-progress is-${moduleTone(module, peers)}`;
    const label = document.createElement("span");
    const total = Math.max(1, delivery.mobiles.length);
    label.textContent = delivery.mobiles.length
      ? `Bereitstellung: ${delivery.installed}/${delivery.mobiles.length} Mobilgerät(e) installiert`
      : "Bereitstellung gespeichert – wartet auf den nächsten Mobil-Abgleich";
    const bar = document.createElement("progress");
    bar.max = total;
    bar.value = delivery.installed;
    progress.append(label, bar);
  }
  card.append(heading, footer);
  if (progress) card.append(progress);
  elements.modules.append(card);
}

async function refresh({ announce = false } = {}) {
  const result = await sendHubMessage("getDashboardData");
  const status = result.status || {};
  renderNextcloud(result.nextcloud, result.nextcloudLogin, result.nextcloudSetupError);
  if (nextcloudLoginRefreshTimer) {
    clearTimeout(nextcloudLoginRefreshTimer);
    nextcloudLoginRefreshTimer = null;
  }
  if (result.nextcloudLogin?.pending) {
    nextcloudLoginRefreshTimer = setTimeout(() => refresh().catch(showError), 2_500);
  }
  await restorePairingHost();
  elements.connectionTitle.textContent = status.running ? "Lokale Schnittstelle ist bereit" : "Lokale Schnittstelle nicht verfügbar";
  const addresses = Array.isArray(status.addresses) && status.addresses.length ? status.addresses.join(", ") : "keine private IPv4-Adresse erkannt";
  const detectedHost = Array.isArray(status.addresses) ? status.addresses.find(isPrivateIpv4) : "";
  if (!elements.pairingHost.value.trim() && detectedHost) {
    elements.pairingHost.value = detectedHost;
  }
  elements.pairingHost.placeholder = detectedHost || "Private IPv4-Adresse dieses PCs";
  const desktopTransfer = status.lastDesktopRequest;
  const desktopTransferText = desktopTransfer
    ? ` · Desktop-Abgleich: ${desktopTransfer.accepted ? "empfangen" : "abgewiesen"} (${formatTime(desktopTransfer.at)})${desktopTransfer.message ? ` – ${desktopTransfer.message}` : ""}`
    : " · Desktop-Abgleich: noch nicht eingetroffen";
  const fallbackText = status.portFallback
    ? ` · Ersatzport ${status.port} aktiv, weil Port ${status.portFallback.requestedPort} belegt ist. Bitte für vorhandene Handys einen neuen QR-Code scannen.`
    : "";
  elements.connectionDetail.textContent = status.running
    ? `Port ${status.port} · erreichbare Adressen: ${addresses}${desktopTransferText}${fallbackText}`
    : "TB-Connect konnte den lokalen Dienst nicht starten.";
  elements.peers.replaceChildren();
  const peers = Array.isArray(status.peers) ? status.peers : [];
  if (!peers.length) {
    appendLine(elements.peers, "Noch kein Gerät verbunden", "Nach dem Koppeln erscheint hier für jedes Handy oder jeden weiteren Desktop der letzte Abgleich.");
  } else {
    peers.forEach((peer, index) => {
      const hasReceipt = peer.kind !== "mobile" || Object.values(peer.moduleReceipts || {}).some(receipt => Boolean(receipt.confirmedAt));
      const active = hasReceipt && Date.now() - new Date(peer.lastSyncAt || 0).getTime() < 20 * 60 * 1000;
      const item = appendLine(
        elements.peers,
        `#${index + 1} · ${peer.name || peer.id}`,
        `${peer.kind || "Gerät"} · zuletzt: ${formatTime(peer.lastSyncAt)} · ${peer.modules?.join(", ") || "kein Modul"}`,
        active ? "Empfang bestätigt" : hasReceipt ? "nicht aktuell" : "Kontakt · wartet auf Datenbestätigung"
      );
      if (peer.kind === "mobile") {
        const editor = document.createElement("div");
        editor.className = "peer-label-editor";
        const input = document.createElement("input");
        input.value = peer.name || "";
        input.maxLength = 120;
        input.setAttribute("aria-label", `Name für Gerät ${index + 1}`);
        const save = moduleActionButton("Name speichern", "secondary", event =>
          withButtonFeedback(event.currentTarget, "Speichere …", async () => {
            await sendHubMessage("setPeerLabel", { id: peer.id, label: input.value });
            showActionFeedback(`Gerät #${index + 1} wurde benannt.`);
            await refresh();
          }).catch(showError)
        );
        editor.append(input, save);
        item.querySelector("div").append(editor);
      }
    });
  }
  elements.modules.replaceChildren();
  const catalog = Array.isArray(result.catalog) ? result.catalog : [];
  const installedCount = catalog.filter(module => module.installed).length;
  const synchronizedCount = catalog.filter(module => module.sync?.lastSyncAt).length;
  lastModuleStatusAt = new Date();
  elements.moduleStatus.textContent = `${installedCount} von ${catalog.length} Desktop-Add-ons erkannt · ${synchronizedCount} Modul${synchronizedCount === 1 ? "" : "e"} mit Datenabgleich · geprüft: ${formatTime(lastModuleStatusAt)}.`;
  catalog.forEach(module => renderModule(module, peers));
  if (announce) {
    showActionFeedback("Modulstatus wurde abgerufen.");
  }
}

async function withButtonFeedback(button, busyText, action) {
  const originalText = button.textContent;
  button.disabled = true;
  button.classList.add("is-busy");
  button.setAttribute("aria-busy", "true");
  button.textContent = busyText;
  try {
    return await action();
  } finally {
    button.disabled = false;
    button.classList.remove("is-busy");
    button.removeAttribute("aria-busy");
    button.textContent = originalText;
  }
}

function showActionFeedback(value) {
  elements.actionFeedback.textContent = String(value || "");
}

const refreshButton = document.querySelector("#refresh-button");
const connectionRefreshButton = document.querySelector("#connection-refresh-button");
const moduleRefreshButton = document.querySelector("#module-refresh-button");
const pairButton = document.querySelector("#pair-button");
const rotateButton = document.querySelector("#rotate-button");
const sourceButton = document.querySelector("#source-form button");
const nextcloudSaveButton = document.querySelector("#nextcloud-save-button");

document.querySelector("#sync-desktop-now").addEventListener("click", event => withButtonFeedback(
  event.currentTarget, "Sende/empfange …", async () => {
    showActionFeedback("Anbieter und Hub abgleichen; warte auf Handy-Bestätigung …");
    const result = await sendHubMessage("syncDesktopNow");
    await refresh();
    showActionFeedback(result.message || "Austausch nicht bestätigt.");
    if (!result.complete && !result.pending) showError(new Error(result.message || "Synchronisierung unvollständig."));
  }).catch(showError));
refreshButton.addEventListener("click", () => withButtonFeedback(refreshButton, "Prüfe …", () => refresh({ announce: true })).catch(showError));
connectionRefreshButton.addEventListener("click", () => withButtonFeedback(connectionRefreshButton, "Prüfe …", () => refresh({ announce: true })).catch(showError));
moduleRefreshButton.addEventListener("click", () => withButtonFeedback(moduleRefreshButton, "Rufe ab …", () => refresh({ announce: true })).catch(showError));
pairButton.addEventListener("click", () => withButtonFeedback(pairButton, "Erstelle …", async () => {
    const result = await sendHubMessage("startPairing");
    const address = await preferredPairingHost(result.status);
    const port = result.status?.port || 47832;
    // A desktop may have more than one usable private adapter (WLAN,
    // Ethernet, hotspot or WireGuard).  The primary is still shown in the
    // Hub, while the QR code carries the alternatives for the app to retry.
    const endpoint = `http://${address}:${port}`;
    // Keep the camera code compact: longer multi-address codes were decoded
    // but regularly failed on mobile cameras. The app can still safely recover
    // changed addresses through the workspace-verified WLAN discovery later.
    const pairingCode = `tb-connect://pair?host=${encodeURIComponent(endpoint)}&session=${encodeURIComponent(result.sessionId)}&secret=${encodeURIComponent(result.secret)}&v=3`;
    elements.pairingCode.value = pairingCode;
    renderPairingQr(pairingCode);
    elements.pairingCard.hidden = false;
    await refresh();
    showActionFeedback("QR-Code ist bereit. Er ist fünf Minuten gültig.");
  }).catch(showError));
rotateButton.addEventListener("click", () => withButtonFeedback(rotateButton, "Erneuere …", async () => {
    await sendHubMessage("rotateAccessToken");
    elements.pairingCard.hidden = true;
    showMessage("Alle gespeicherten Zugänge wurden erneuert. Geräte müssen neu gekoppelt werden.");
    await refresh();
    showActionFeedback("Zugänge wurden erneuert.");
  }).catch(showError));
document.querySelector("#source-form").addEventListener("submit", async event => {
  event.preventDefault();
  return withButtonFeedback(sourceButton, "Prüfe …", async () => {
    const input = document.querySelector("#source-url");
    const result = await sendHubMessage("addModuleSource", { url: input.value });
    showMessage(`${result.module.name} wurde als Modulquelle gespeichert.`);
    input.value = "";
    await refresh();
    showActionFeedback("Modulquelle wurde gespeichert.");
  }).catch(showError);
});
document.querySelector("#nextcloud-form").addEventListener("submit", async event => {
  event.preventDefault();
  return withButtonFeedback(nextcloudSaveButton, "Öffne …", async () => {
    const result = await sendHubMessage("startNextcloudLogin", {
      nextcloud: {
        serverUrl: elements.nextcloudServer.value,
        appFolder: elements.nextcloudAppFolder.value
      }
    });
    showActionFeedback(`Die Nextcloud-Anmeldeseite ist geöffnet. Bestätige dort den Zugriff; TB-Connect gleicht anschließend automatisch ${result.nextcloudLogin.appFolder} ab.`);
    await refresh();
  }).catch(showError);
});
elements.nextcloudLoginCancelButton.addEventListener("click", () => withButtonFeedback(elements.nextcloudLoginCancelButton, "Breche ab …", async () => {
  await sendHubMessage("cancelNextcloudLogin");
  showActionFeedback("Die laufende Nextcloud-Anmeldung wurde abgebrochen.");
  await refresh();
}).catch(showError));

document.querySelector("#nextcloud-password-form").addEventListener("submit", event => {
  event.preventDefault();
  const password = document.querySelector("#nextcloud-password");
  const appPassword = password.value;
  password.value = "";
  return withButtonFeedback(document.querySelector("#nextcloud-password-save"), "Prüfe …", async () => {
    try {
      await sendHubMessage("configureNextcloud", {nextcloud: {
        serverUrl: elements.nextcloudServer.value,
        appFolder: elements.nextcloudAppFolder.value,
        username: document.querySelector("#nextcloud-username").value,
        appPassword
      }});
      showActionFeedback("Nextcloud-Zugang gespeichert und Daten abgeglichen.");
    } finally { await refresh(); }
  }).catch(showError);
});
elements.nextcloudSyncButton.addEventListener("click", () => withButtonFeedback(elements.nextcloudSyncButton, "Gleiche ab …", async () => {
  const result = await sendHubMessage("syncNextcloud");
  showActionFeedback(`Nextcloud-Abgleich abgeschlossen: ${result.modules} Modulzustand/-zustände in ${result.remotePath}.`);
  await refresh();
}).catch(showError));
elements.nextcloudRemoveButton.addEventListener("click", () => {
  if (!confirm("Hub-Nextcloud-Verbindung und Hub-Zugang entfernen? Dateien in Nextcloud sowie bereits eingebundene Thunderbird-CalDAV-Kalender und deren eigene Zugangsdaten bleiben erhalten.")) return;
  return withButtonFeedback(elements.nextcloudRemoveButton, "Entferne …", async () => {
    await sendHubMessage("removeNextcloud");
    showActionFeedback("Hub-Verbindung und Hub-Zugang entfernt. Dateien und Thunderbird-CalDAV-Kalender bleiben erhalten. Den Zugang bei Bedarf in Nextcloud selbst widerrufen.");
    await refresh();
  }).catch(showError);
});
function showMessage(value) { elements.message.textContent = String(value || ""); }
function showError(error) {
  const message = error?.message || String(error || "Unbekannter Fehler");
  showMessage(message);
  showActionFeedback(`Aktion fehlgeschlagen: ${message}`);
}

function renderPairingQr(value) {
  if (typeof qrcode !== "function") {
    elements.pairingQr.textContent = "QR-Code konnte nicht erstellt werden. Nutze den Kopplungscode als Alternative.";
    return;
  }
  const code = qrcode(0, "M");
  code.addData(value);
  code.make();
  elements.pairingQr.innerHTML = code.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
}
async function refreshNextcloudCalendars() {
  const result = await sendHubMessage("listNextcloudCalendars");
  const list = document.querySelector("#caldav-list");
  list.replaceChildren();
  for (const calendar of result.calendars || []) {
    const item = document.createElement("div");
    item.className = "module";
    const title = document.createElement("strong");
    title.textContent = calendar.name;
    title.style.borderLeft = `6px solid ${calendar.color}`;
    title.style.paddingLeft = "10px";
    const add = moduleActionButton("In Thunderbird hinzufügen", "secondary", event => withButtonFeedback(
      event.currentTarget, "Verbinde …", async () => {
        const response = await sendHubMessage("connectNextcloudCalendar", {url:calendar.url});
        document.querySelector("#caldav-status").textContent = response.alreadyRegistered
          ? `${calendar.name}: bereits eingebunden.` : `${calendar.name}: eingebunden. Thunderbird lädt jetzt die Termine; danach in der App abgleichen.`;
      }).catch(showError));
    item.append(title, add);
    list.append(item);
  }
  document.querySelector("#caldav-status").textContent = `${result.calendars.length} Nextcloud-Kalender gefunden.`;
}

document.querySelector("#caldav-refresh").addEventListener("click", event => withButtonFeedback(
  event.currentTarget, "Suche …", refreshNextcloudCalendars).catch(showError));
let calendarCreationId = sessionStorage.getItem("nextcloud-calendar-request") || null;
document.querySelector("#caldav-name").addEventListener("input", () => {
  calendarCreationId = null;
  sessionStorage.removeItem("nextcloud-calendar-request");
});
document.querySelector("#caldav-create-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = document.querySelector("#caldav-name").value.trim();
  if (!name || !confirm(`Einen neuen Kalender „${name}“ in deinem Nextcloud-Konto anlegen und in Thunderbird hinzufügen?`)) return;
  calendarCreationId ||= crypto.randomUUID();
  sessionStorage.setItem("nextcloud-calendar-request", calendarCreationId);
  withButtonFeedback(document.querySelector("#caldav-create"), "Lege an …", async () => {
    const result = await sendHubMessage("connectNextcloudCalendar", {create:true, name, color:document.querySelector("#caldav-color").value, requestId:calendarCreationId});
    await refreshNextcloudCalendars();
    document.querySelector("#caldav-status").textContent = `${result.name}: in Nextcloud angelegt und in Thunderbird eingebunden. Die erste Terminabfrage läuft im Kalenderanbieter.`;
    document.querySelector("#caldav-name").value = "";
    calendarCreationId = null;
    sessionStorage.removeItem("nextcloud-calendar-request");
  }).catch(showError);
});
refresh().catch(showError);
