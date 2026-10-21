"use strict";

const tb = typeof messenger !== "undefined" ? messenger : browser;
const SETTINGS_KEY = "routingSettings";

const loading = document.getElementById("loading");
const mappingList = document.getElementById("mapping-list");
const noIdentities = document.getElementById("no-identities");
const saveButton = document.getElementById("save");
const reloadButton = document.getElementById("reload");
const status = document.getElementById("status");

let state = {
  accounts: [],
  folders: [],
  identities: [],
  mappings: {}
};

function setStatus(message, type = "") {
  status.textContent = message;
  status.className = type;
}

function createFolderOption(folder) {
  const option = document.createElement("option");
  option.value = folder.id;
  const indent = folder.depth ? `${"·  ".repeat(folder.depth)}` : "";
  option.textContent = `${indent}${folder.name}`;
  return option;
}

function createFolderSelect(email, index) {
  const select = document.createElement("select");
  select.id = `folder-${index}`;
  select.dataset.email = email;

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Noch kein Zielordner";
  select.append(empty);

  for (const account of state.accounts) {
    const accountFolders = state.folders.filter(
      folder => folder.accountId === account.id && !folder.isVirtual && !folder.isTag && !folder.isUnified
    );
    if (!accountFolders.length) {
      continue;
    }

    const group = document.createElement("optgroup");
    group.label = account.name;
    for (const folder of accountFolders) {
      group.append(createFolderOption(folder));
    }
    select.append(group);
  }

  const selected = MailAddressRouting.findFolder(
    state.folders,
    state.mappings[email]
  );
  select.value = selected?.id || "";
  select.addEventListener("change", () => {
    saveButton.disabled = false;
    setStatus("Ungespeicherte Änderung");
  });
  return select;
}

function renderMappings() {
  mappingList.replaceChildren();
  loading.hidden = true;

  if (!state.identities.length) {
    noIdentities.hidden = false;
    mappingList.hidden = true;
    saveButton.disabled = true;
    return;
  }

  noIdentities.hidden = true;
  mappingList.hidden = false;

  for (const [index, identity] of state.identities.entries()) {
    const row = document.createElement("div");
    row.className = "mapping-row";

    const addressBlock = document.createElement("div");
    const address = document.createElement("p");
    address.className = "mapping-address";
    address.textContent = identity.email;
    const meta = document.createElement("p");
    meta.className = "mapping-meta";
    meta.textContent = identity.accountNames.join(" · ");
    addressBlock.append(address, meta);

    const field = document.createElement("div");
    field.className = "folder-field";
    const label = document.createElement("label");
    const select = createFolderSelect(identity.email, index);
    label.htmlFor = select.id;
    label.textContent = "Zielordner";
    field.append(label, select);

    row.append(addressBlock, field);
    mappingList.append(row);
  }

  saveButton.disabled = false;
}

function collectIdentities(accounts) {
  const byEmail = new Map();
  for (const account of accounts) {
    for (const email of MailAddressRouting.identityEmails(account)) {
      if (!byEmail.has(email)) {
        byEmail.set(email, { email, accountNames: [] });
      }
      const item = byEmail.get(email);
      if (!item.accountNames.includes(account.name)) {
        item.accountNames.push(account.name);
      }
    }
  }
  return [...byEmail.values()].sort((left, right) =>
    left.email.localeCompare(right.email, "de")
  );
}

async function load() {
  loading.hidden = false;
  mappingList.hidden = true;
  noIdentities.hidden = true;
  saveButton.disabled = true;
  reloadButton.disabled = true;
  setStatus("");

  try {
    const [accounts, stored] = await Promise.all([
      tb.accounts.list(true),
      tb.storage.local.get(SETTINGS_KEY)
    ]);
    state.accounts = accounts;
    state.folders = MailAddressRouting.flattenFolders(accounts);
    state.identities = collectIdentities(accounts);
    state.mappings = stored?.[SETTINGS_KEY]?.mappings || {};
    renderMappings();
  } catch (error) {
    loading.hidden = true;
    setStatus(
      `Konten und Ordner konnten nicht geladen werden: ${error?.message || error}`,
      "error"
    );
  } finally {
    reloadButton.disabled = false;
  }
}

async function save() {
  saveButton.disabled = true;
  setStatus("Wird gespeichert …");

  try {
    const mappings = { ...state.mappings };
    const selects = mappingList.querySelectorAll("select[data-email]");

    for (const select of selects) {
      const email = select.dataset.email;
      const folder = state.folders.find(item => item.id === select.value);
      if (!folder) {
        delete mappings[email];
        continue;
      }
      mappings[email] = {
        folderId: folder.id,
        accountId: folder.accountId,
        path: folder.path,
        name: folder.name
      };
    }

    await tb.storage.local.set({
      [SETTINGS_KEY]: {
        version: 1,
        mappings
      }
    });
    state.mappings = mappings;
    setStatus("Gespeichert. Die Knöpfe sind sofort einsatzbereit.", "success");
  } catch (error) {
    saveButton.disabled = false;
    setStatus(`Speichern fehlgeschlagen: ${error?.message || error}`, "error");
  }
}

saveButton.addEventListener("click", save);
reloadButton.addEventListener("click", load);
load();
