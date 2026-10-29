"use strict";

const tb = globalThis.messenger || globalThis.browser;
const params = new URLSearchParams(location.search);

let snapshot = null;
let toastTimer = null;
let draggedTaskId = null;
let mobileSync = null;

const $ = selector => document.querySelector(selector);

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function formatDayHeading(key) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(dateFromKey(key));
}

function formatCompactDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatPlannerDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return "Ohne Datum";
  }
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(dateFromKey(value));
}

function partToDate(part) {
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

function dayBounds(key) {
  const start = dateFromKey(key);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function eventOccursOn(event, key) {
  const start = partToDate(event.start);
  const end = partToDate(event.end);
  const bounds = dayBounds(key);
  return Boolean(start && end && end > bounds.start && start < bounds.end);
}

function clock(part) {
  return `${pad(part?.hour || 0)}:${pad(part?.minute || 0)}`;
}

function eventTimeLabel(event, key) {
  if (event.allDay) {
    return "Ganztägig";
  }
  const start = partToDate(event.start);
  const end = partToDate(event.end);
  const bounds = dayBounds(key);
  if (start < bounds.start && end >= bounds.end) {
    return "Läuft durch";
  }
  if (start < bounds.start) {
    return `bis ${clock(event.end)}`;
  }
  if (end > bounds.end) {
    return `ab ${clock(event.start)}`;
  }
  return `${clock(event.start)}–${clock(event.end)}`;
}

function node(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== "") {
    element.textContent = text;
  }
  return element;
}

function empty(container, text) {
  container.replaceChildren(node("p", "empty-state", text));
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.style.background = isError ? "#8f2f3a" : "#242331";
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3600);
}

async function send(message) {
  try {
    return await tb.runtime.sendMessage(message);
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function visibleItems(items) {
  if (snapshot?.state?.settings?.showCompleted !== false) {
    return items;
  }
  return items.filter(item => !item.done);
}

function sortEmailItems(items) {
  return [...items].sort((left, right) => {
    if (left.done !== right.done) {
      return left.done ? 1 : -1;
    }
    return String(left.createdAt || left.addedAt || "")
      .localeCompare(String(right.createdAt || right.addedAt || ""));
  });
}

function sortTaskItems(items) {
  return [...items].sort((left, right) => {
    const orderDifference = Number(left.order || 0) - Number(right.order || 0);
    return orderDifference || String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
  });
}

function isOverdue(item) {
  return Boolean(item.dueDate && item.dueDate < snapshot.todayKey && !item.done);
}

function itemDateControls(item, collectionName) {
  const label = collectionName === "tasks" ? "Aufgabe" : "Mail";
  const dateInput = node("input", "item-date");
  dateInput.type = "date";
  dateInput.value = item.dueDate || "";
  dateInput.title = `Datum der ${label} ändern`;
  dateInput.setAttribute("aria-label", `Datum der ${label} ändern`);
  dateInput.addEventListener("change", async () => {
    const result = await send({
      type: collectionName === "tasks" ? "moveTask" : "moveEmail",
      id: item.id,
      dueDate: dateInput.value || null
    });
    if (!result?.ok) {
      showToast(result?.error || "Datum konnte nicht geändert werden.", true);
      return;
    }
    await refresh();
  });

  const clear = node("button", "date-clear-button", "Ewig");
  clear.type = "button";
  clear.title = "Datum entfernen und auf die ewige Liste setzen";
  clear.disabled = !item.dueDate;
  clear.addEventListener("click", async () => {
    const result = await send({
      type: collectionName === "tasks" ? "moveTask" : "moveEmail",
      id: item.id,
      dueDate: null
    });
    if (!result?.ok) {
      showToast(result?.error || "Datum konnte nicht entfernt werden.", true);
      return;
    }
    await refresh();
  });
  return [dateInput, clear];
}

function deleteButton(item, collectionName) {
  const button = node("button", "delete-button", "Löschen");
  button.type = "button";
  button.title = "Eintrag endgültig löschen";
  button.addEventListener("click", async () => {
    const result = await send({
      type: collectionName === "tasks" ? "deleteTask" : "deleteEmail",
      id: item.id
    });
    if (!result?.ok) {
      showToast(result?.error || "Löschen fehlgeschlagen.", true);
      return;
    }
    await refresh();
  });
  return button;
}

function completionBox(item, collectionName) {
  const checkbox = node("input", "complete-box");
  checkbox.type = "checkbox";
  checkbox.checked = Boolean(item.done);
  checkbox.title = item.done ? "Als offen markieren" : "Als erledigt markieren";
  checkbox.addEventListener("change", async () => {
    const result = await send({
      type: collectionName === "tasks" ? "toggleTask" : "toggleEmail",
      id: item.id,
      done: checkbox.checked
    });
    if (!result?.ok) {
      checkbox.checked = !checkbox.checked;
      showToast(result?.error || "Änderung fehlgeschlagen.", true);
      return;
    }
    await refresh();
  });
  return checkbox;
}

function clearTaskDragState() {
  document.querySelectorAll(".is-dragging, .drag-before, .drag-after, .is-drop-zone")
    .forEach(element => element.classList.remove(
      "is-dragging",
      "drag-before",
      "drag-after",
      "is-drop-zone"
    ));
}

async function performTaskDrop({ id, dueDate, targetId = null, position = "after" }) {
  if (!id || id === targetId) {
    return;
  }
  const result = await send({ type: "dropTask", id, dueDate, targetId, position });
  if (!result?.ok) {
    showToast(result?.error || "Aufgabe konnte nicht verschoben werden.", true);
    return;
  }
  await refresh();
}

function bindTaskListDropZone(container, dueDate) {
  container.ondragover = event => {
    if (!draggedTaskId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    container.classList.add("is-drop-zone");
  };
  container.ondragleave = event => {
    if (!container.contains(event.relatedTarget)) {
      container.classList.remove("is-drop-zone");
    }
  };
  container.ondrop = async event => {
    if (!draggedTaskId) {
      return;
    }
    event.preventDefault();
    const id = draggedTaskId;
    draggedTaskId = null;
    clearTaskDragState();
    await performTaskDrop({ id, dueDate, position: "after" });
  };
}

function taskDragHandle(item, card) {
  const handle = node("span", "drag-handle", "⋮⋮");
  handle.draggable = true;
  handle.title = "Aufgabe ziehen und ablegen";
  handle.setAttribute("aria-label", handle.title);
  handle.addEventListener("dragstart", event => {
    draggedTaskId = item.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    requestAnimationFrame(() => card.classList.add("is-dragging"));
  });
  handle.addEventListener("dragend", () => {
    draggedTaskId = null;
    clearTaskDragState();
  });
  return handle;
}

function bindTaskCardDrop(card, item) {
  card.addEventListener("dragover", event => {
    if (!draggedTaskId || draggedTaskId === item.id) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const before = event.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2;
    card.classList.toggle("drag-before", before);
    card.classList.toggle("drag-after", !before);
  });
  card.addEventListener("dragleave", event => {
    if (!card.contains(event.relatedTarget)) {
      card.classList.remove("drag-before", "drag-after");
    }
  });
  card.addEventListener("drop", async event => {
    if (!draggedTaskId || draggedTaskId === item.id) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const id = draggedTaskId;
    const position = card.classList.contains("drag-before") ? "before" : "after";
    draggedTaskId = null;
    clearTaskDragState();
    await performTaskDrop({ id, dueDate: item.dueDate || null, targetId: item.id, position });
  });
}

function editTaskInline(main, item) {
  const form = node("form", "task-edit-form");
  const textInput = node("input");
  textInput.name = "text";
  textInput.type = "text";
  textInput.maxLength = 500;
  textInput.required = true;
  textInput.value = item.text || "";
  textInput.setAttribute("aria-label", "Aufgabentext bearbeiten");

  const emailInput = node("input");
  emailInput.name = "emailAddress";
  emailInput.type = "email";
  emailInput.maxLength = 320;
  emailInput.value = item.emailAddress || "";
  emailInput.placeholder = "E-Mail-Bezug (optional)";

  const dateInput = node("input");
  dateInput.name = "dueDate";
  dateInput.type = "date";
  dateInput.value = item.dueDate || "";
  dateInput.setAttribute("aria-label", "Datum der Aufgabe bearbeiten");
  const notesInput = node("textarea");
  notesInput.name = "notes";
  notesInput.maxLength = 10000;
  notesInput.rows = 4;
  notesInput.placeholder = "Notizen zur Aufgabe";
  notesInput.value = item.notes || "";
  notesInput.setAttribute("aria-label", "Aufgabennotizen");

  const controls = node("div", "task-edit-actions");
  const save = node("button", "save-button", "Speichern");
  save.type = "submit";
  const cancel = node("button", "text-button", "Abbrechen");
  cancel.type = "button";
  cancel.addEventListener("click", refresh);
  controls.append(save, cancel);
  form.append(textInput, emailInput, dateInput, notesInput, controls);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const result = await send({
      type: "updateTask",
      id: item.id,
      text: textInput.value,
      emailAddress: emailInput.value,
      notes: notesInput.value,
      dueDate: dateInput.value || null
    });
    if (!result?.ok) {
      showToast(result?.error || "Aufgabe konnte nicht gespeichert werden.", true);
      return;
    }
    await refresh();
  });
  main.replaceChildren(form);
  textInput.focus();
  textInput.select();
}

function taskCard(item, { showDueDate = false } = {}) {
  const card = node(
    "div",
    `planner-item task-item${item.done ? " is-done" : ""}${isOverdue(item) ? " is-overdue" : ""}`
  );
  card.dataset.taskId = item.id;
  card.append(taskDragHandle(item, card), completionBox(item, "tasks"));
  bindTaskCardDrop(card, item);

  const main = node("div", "item-main");
  main.append(node("div", "item-title", item.text));
  if (item.notes) {
    const notes = node("div", "item-subline", item.notes);
    notes.style.whiteSpace = "pre-wrap";
    main.append(notes);
  }
  const line = node("div", "item-subline task-meta");
  if (showDueDate) {
    line.append(node("span", "item-kind", "Aufgabe"));
    const prefix = isOverdue(item) ? "Überfällig" : "Geplant";
    line.append(node("span", "due-label", `${prefix}: ${formatPlannerDateKey(item.dueDate)}`));
  }
  if (item.emailAddress) {
    line.append(node("span", "", item.emailAddress));
    const compose = node("button", "text-button", "Mail verfassen");
    compose.type = "button";
    compose.addEventListener("click", async () => {
      const result = await send({ type: "composeTo", address: item.emailAddress });
      if (!result?.ok) {
        showToast(result?.error || "Mailfenster konnte nicht geöffnet werden.", true);
      }
    });
    line.append(compose);
  }
  if (line.childNodes.length) {
    main.append(line);
  }
  card.append(main);

  const actions = node("div", "item-actions");
  const edit = node("button", "text-button", "Bearbeiten");
  edit.type = "button";
  edit.addEventListener("click", () => editTaskInline(main, item));
  actions.append(
    edit,
    ...itemDateControls(item, "tasks"),
    deleteButton(item, "tasks")
  );
  card.append(actions);
  return card;
}

function renderTasks(target, key) {
  const container = $(`#${target}-tasks`);
  const all = snapshot.state.tasks.filter(item => (item.dueDate || null) === key);
  const items = sortTaskItems(visibleItems(all));
  $(`#${target}-task-count`).textContent = `${all.length} ${all.length === 1 ? "Eintrag" : "Einträge"}`;
  if (!items.length) {
    empty(container, all.length ? "Erledigte Aufgaben sind ausgeblendet." : "Noch keine Aufgabe.");
    bindTaskListDropZone(container, key);
    return;
  }
  container.replaceChildren(...items.map(item => taskCard(item)));
  bindTaskListDropZone(container, key);
}

function authorLabel(author) {
  const value = String(author || "").trim();
  return value || "Unbekannter Absender";
}

function emailCard(item, { showDueDate = false } = {}) {
  const card = node(
    "div",
    `planner-item email-item${item.done ? " is-done" : ""}${isOverdue(item) ? " is-overdue" : ""}`
  );
  card.append(completionBox(item, "emails"));

  const main = node("div", "item-main");
  main.append(node("div", "item-title", item.subject || "(Ohne Betreff)"));
  const meta = node("div", "item-subline email-meta");
  meta.append(node("span", "", authorLabel(item.author)));
  if (item.messageDate) {
    meta.append(node("span", "", formatCompactDate(item.messageDate)));
  }
  if (item.folderName) {
    meta.append(node("span", "", item.folderName));
  }
  if (showDueDate && item.dueDate) {
    meta.prepend(node("span", "item-kind", "Mail"));
    const prefix = isOverdue(item) ? "Überfällig" : "Geplant";
    meta.append(node("span", "due-label", `${prefix}: ${formatPlannerDateKey(item.dueDate)}`));
  }
  main.append(meta);
  card.append(main);

  const actions = node("div", "item-actions");
  const open = node("button", "open-button", "Öffnen");
  open.type = "button";
  open.addEventListener("click", async () => {
    const result = await send({ type: "openStoredEmail", id: item.id });
    if (!result?.ok) {
      showToast(result?.error || "Mail konnte nicht geöffnet werden.", true);
    }
  });
  actions.append(open, ...itemDateControls(item, "emails"), deleteButton(item, "emails"));
  card.append(actions);
  return card;
}

function renderEmails(target, key) {
  const container = $(`#${target}-emails`);
  const all = snapshot.state.emails.filter(item => (item.dueDate || null) === key);
  const items = sortEmailItems(visibleItems(all));
  $(`#${target}-email-count`).textContent = `${all.length} ${all.length === 1 ? "Mail" : "Mails"}`;
  if (!items.length) {
    empty(container, all.length ? "Erledigte Mails sind ausgeblendet." : "Keine Mail eingeplant.");
    return;
  }
  container.replaceChildren(...items.map(item => emailCard(item)));
}

function datedEntries(predicate) {
  return [
    ...snapshot.state.tasks.map(item => ({ kind: "task", item })),
    ...snapshot.state.emails.map(item => ({ kind: "email", item }))
  ]
    .filter(entry => entry.item.dueDate && predicate(entry.item))
    .sort((left, right) => {
      if (left.item.done !== right.item.done) {
        return left.item.done ? 1 : -1;
      }
      const dateDifference = String(left.item.dueDate).localeCompare(String(right.item.dueDate));
      if (dateDifference) {
        return dateDifference;
      }
      if (left.kind === "task" && right.kind === "task") {
        return Number(left.item.order || 0) - Number(right.item.order || 0);
      }
      return String(left.item.createdAt || left.item.addedAt || "")
        .localeCompare(String(right.item.createdAt || right.item.addedAt || ""));
    });
}

function renderDatedCard({ cardSelector, countSelector, itemsSelector, entries }) {
  const card = $(cardSelector);
  const items = snapshot.state.settings.showCompleted === false
    ? entries.filter(entry => !entry.item.done)
    : entries;
  card.hidden = items.length === 0;
  $(countSelector).textContent = `${entries.filter(entry => !entry.item.done).length} offen`;
  if (!items.length) {
    return;
  }
  $(itemsSelector).replaceChildren(
    ...items.map(entry => entry.kind === "task"
      ? taskCard(entry.item, { showDueDate: true })
      : emailCard(entry.item, { showDueDate: true }))
  );
}

function renderOverdueItems() {
  renderDatedCard({
    cardSelector: "#overdue-card",
    countSelector: "#overdue-count",
    itemsSelector: "#overdue-items",
    entries: datedEntries(item => item.dueDate < snapshot.todayKey)
  });
}

function renderScheduledItems() {
  const all = datedEntries(item => item.dueDate > snapshot.tomorrowKey);
  renderDatedCard({
    cardSelector: "#scheduled-card",
    countSelector: "#scheduled-count",
    itemsSelector: "#scheduled-items",
    entries: all
  });
}

function renderEvents(target, key) {
  const container = $(`#${target}-events`);
  const calendarEvents = (snapshot.calendar?.events || [])
    .filter(event => eventOccursOn(event, key))
    .map(event => ({ ...event, source: "calendar" }));
  const mobileAppointments = (snapshot.state?.appointments || [])
    .filter(item => item.date === key)
    .map(item => ({
      ...item,
      source: "tb-connect",
      allDay: false,
      start: { hour: Number(item.startTime?.slice(0, 2) || 0), minute: Number(item.startTime?.slice(3, 5) || 0) },
      end: { hour: Number(item.endTime?.slice(0, 2) || 0), minute: Number(item.endTime?.slice(3, 5) || 0) },
      calendarName: "TB-Connect Mobil",
      calendarColor: "#008f87"
    }));
  const events = [...calendarEvents, ...mobileAppointments]
    .sort((left, right) => {
      if (left.allDay !== right.allDay) {
        return left.allDay ? -1 : 1;
      }
      if (left.source === "tb-connect" || right.source === "tb-connect") {
        return clock(left.start).localeCompare(clock(right.start));
      }
      return (partToDate(left.start)?.getTime() || 0) - (partToDate(right.start)?.getTime() || 0);
    });
  $(`#${target}-event-count`).textContent = `${events.length} ${events.length === 1 ? "Termin" : "Termine"}`;
  if (!events.length) {
    empty(container, "Keine Termine.");
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const event of events) {
    const card = node("div", "event-card");
    card.style.setProperty("--event-color", event.calendarColor || "#6558e8");
    card.append(node("div", "event-time", event.source === "tb-connect"
      ? `${clock(event.start)}–${clock(event.end)}`
      : eventTimeLabel(event, key)));

    const content = node("div");
    content.append(node("div", "event-title", event.title || "(Ohne Titel)"));
    const details = node("div", "event-details event-meta");
    const dot = node("span", "calendar-dot");
    dot.style.setProperty("--event-color", event.calendarColor || "#6558e8");
    details.append(dot, node("span", "", event.calendarName || "Kalender"));
    if (event.location) {
      details.append(node("span", "", `Ort: ${event.location}`));
    }
    content.append(details);
    card.append(content);
    fragment.append(card);
  }
  container.replaceChildren(fragment);
}

function openCount(key) {
  const tasks = snapshot.state.tasks.filter(item => (item.dueDate || null) === key && !item.done).length;
  const emails = snapshot.state.emails.filter(item => (item.dueDate || null) === key && !item.done).length;
  return tasks + emails;
}

function renderHeader() {
  $("#today-title").textContent = formatDayHeading(snapshot.todayKey);
  $("#tomorrow-title").textContent = formatDayHeading(snapshot.tomorrowKey);
  $("#date-span").textContent = `${formatDayHeading(snapshot.todayKey)} · ${formatDayHeading(snapshot.tomorrowKey)}`;
  for (const [target, key] of [
    ["today", snapshot.todayKey],
    ["tomorrow", snapshot.tomorrowKey],
    ["someday", null]
  ]) {
    const count = openCount(key);
    $(`#${target}-count`).textContent = `${count} offen`;
  }
  const generatedAt = new Date(snapshot.generatedAt);
  $("#sync-status").textContent = `Aktualisiert ${new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(generatedAt)}`;
}

function formatMobileSyncStatus(status) {
  if (status?.requiresModuleHub) return "Verbindung im Modul-Hub";
  if (!status?.running) {
    return "Hub: nicht verfügbar";
  }
  if (status.connected) {
    return "Hub: verbunden";
  }
  if (status.pairingMode) {
    return "Hub: Verbindung wird hergestellt";
  }
  return "Hub: nicht verbunden";
}

function populateMobileAddresses(status) {
  const select = $("#mobile-address");
  const current = select.value;
  const addresses = Array.isArray(status?.addresses) ? status.addresses : [];
  select.replaceChildren();
  for (const address of addresses) {
    const option = document.createElement("option");
    option.value = address;
    option.textContent = address.startsWith("10.") || address.startsWith("100.")
      ? `${address} (möglicherweise WireGuard)`
      : address;
    select.append(option);
  }
  if (!addresses.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Keine Netzwerkadresse gefunden";
    select.append(option);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  const preferred = addresses.find(address => address === current)
    || addresses.find(address => address.startsWith("10.") || address.startsWith("100."))
    || addresses[0];
  select.value = preferred;
}

function mobileAddress() {
  return $("#mobile-manual-address").value.trim() || $("#mobile-address").value.trim();
}

function renderMobileSyncStatus(status = mobileSync) {
  const label = $("#mobile-sync-status");
  label.textContent = formatMobileSyncStatus(status);
  label.classList.toggle("is-connected", Boolean(status?.connected));
  const detail = $("#mobile-connection-detail");
  if (detail) {
    if (status?.requiresModuleHub) {
      detail.textContent = "Die verschlüsselte Geräteverbindung wird im TB-Connect Modul-Hub verwaltet.";
    } else if (status?.connected) {
      const time = status.lastSeenAt ? new Date(status.lastSeenAt) : null;
      detail.textContent = time && Number.isFinite(time.getTime())
        ? `Hub verbunden – zuletzt abgeglichen um ${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(time)}.`
        : "Hub verbunden.";
    } else if (status?.pairingMode) {
      detail.textContent = "Der Hub stellt gerade eine Verbindung her.";
    } else {
      detail.textContent = "Hub nicht verbunden. Die Verbindung wird im Bereich Module verwaltet.";
    }
  }
}

function renderPairingQr(payload) {
  const target = $("#mobile-qr");
  target.replaceChildren();
  if (!payload) {
    target.textContent = "Kein Kopplungscode verfügbar.";
    return;
  }
  if (typeof qrcode !== "function") {
    target.textContent = "QR-Code konnte nicht erstellt werden.";
    return;
  }
  try {
    const code = qrcode(0, "M");
    code.addData(payload);
    code.make();
    target.innerHTML = code.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
  } catch (error) {
    target.textContent = "QR-Code konnte nicht erstellt werden.";
  }
}

async function refreshMobilePairingCode() {
  const address = mobileAddress();
  if (!address) {
    $("#mobile-pairing-code").value = "";
    renderPairingQr("");
    return;
  }
  const result = await send({ type: "getMobilePairingCode", address });
  if (!result?.ok) {
    $("#mobile-pairing-code").value = "";
    renderPairingQr("");
    showToast(result?.error || "Kopplungscode konnte nicht erstellt werden.", true);
    return;
  }
  $("#mobile-pairing-code").value = result.code;
  renderPairingQr(result.code);
}

async function refreshMobileSyncStatus({ refreshCode = false } = {}) {
  const result = await send({ type: "getMobileSyncStatus" });
  if (!result?.ok) {
    mobileSync = { running: false, connected: false, addresses: [] };
    renderMobileSyncStatus();
    return mobileSync;
  }
  mobileSync = result;
  renderMobileSyncStatus();
  if ($("#mobile-sync-dialog").open) {
    populateMobileAddresses(result);
    if (refreshCode && $("#mobile-advanced-pairing").open) {
      await refreshMobilePairingCode();
    }
  }
  return result;
}

async function openMobileSync() {
  await refreshMobileSyncStatus();
  $("#mobile-advanced-pairing").hidden = true;
  $("#restart-mobile-pairing").hidden = true;
  const dialog = $("#mobile-sync-dialog");
  if (!dialog.open) dialog.showModal();
}

function closeMobileSync() {
  const dialog = $("#mobile-sync-dialog");
  if (dialog.open) {
    dialog.close();
  }
}

function renderWarning() {
  const warning = $("#calendar-warning");
  const errors = snapshot.calendar?.errors || [];
  if (snapshot.calendar?.ok !== false && !errors.length) {
    warning.hidden = true;
    return;
  }
  const message = errors.map(entry => entry.message).filter(Boolean).join(" · ");
  warning.textContent = `Kalender konnten nicht vollständig gelesen werden${message ? `: ${message}` : "."}`;
  warning.hidden = false;
}

function render() {
  renderHeader();
  renderWarning();
  for (const [target, key] of [
    ["today", snapshot.todayKey],
    ["tomorrow", snapshot.tomorrowKey]
  ]) {
    renderEvents(target, key);
    renderEmails(target, key);
    renderTasks(target, key);
  }
  renderEmails("someday", null);
  renderTasks("someday", null);
  renderOverdueItems();
  renderScheduledItems();
  syncTaskFormDates();
}

async function refresh() {
  $("#sync-status").textContent = "Wird aktualisiert …";
  const result = await send({ type: "getPlannerData" });
  if (!result?.ok) {
    $("#sync-status").textContent = "Aktualisierung fehlgeschlagen";
    showToast(result?.error || "Tagesplaner konnte nicht geladen werden.", true);
    return;
  }
  snapshot = result;
  render();
}

function dueDateFromTarget(target) {
  if (target === "today") {
    return snapshot.todayKey;
  }
  if (target === "tomorrow") {
    return snapshot.tomorrowKey;
  }
  return null;
}

function syncTaskFormDates() {
  for (const form of document.querySelectorAll(".task-form")) {
    const input = form.elements.dueDate;
    if (input && !input.value) {
      input.value = dueDateFromTarget(form.dataset.target) || "";
    }
  }
}

function openSettings() {
  if (!snapshot) {
    return;
  }
  $("#open-on-startup").checked = snapshot.state.settings.openOnStartup !== false;
  $("#show-completed").checked = snapshot.state.settings.showCompleted !== false;
  $("#reminder-times").value = (snapshot.state.settings.reminderTimes || []).join(", ");
  const dialog = $("#settings-dialog");
  if (!dialog.open) {
    dialog.showModal();
  }
}

function closeSettings() {
  const dialog = $("#settings-dialog");
  if (dialog.open) {
    dialog.close();
  }
}

function bindEvents() {
  $("#sync-now-button").addEventListener("click", async event => {
    const button = event.currentTarget;
    if (button.disabled) return;
    button.disabled = true;
    $("#sync-status").textContent = "Senden und Empfangen läuft …";
    try {
      const result = await send({type:"syncNow"});
      if (!result?.ok) throw new Error(result?.error || "Keine Antwort vom Hub.");
      snapshot = result;
      render();
      $("#sync-status").textContent = result.manualSync?.message || "Austausch nicht bestätigt.";
      showToast(result.manualSync?.message || "Austausch nicht bestätigt.", !result.manualSync?.complete);
    } catch (error) {
      $("#sync-status").textContent = "Senden oder Empfangen fehlgeschlagen";
      showToast(error.message || "Verbindung prüfen.", true);
    } finally { button.disabled = false; }
  });
  $("#refresh-button").addEventListener("click", refresh);
  $("#settings-button").addEventListener("click", openSettings);
  $("#close-mobile-sync").addEventListener("click", closeMobileSync);
  $("#close-mobile-sync-bottom").addEventListener("click", closeMobileSync);
  $("#mobile-address").addEventListener("change", refreshMobilePairingCode);
  $("#mobile-manual-address").addEventListener("change", refreshMobilePairingCode);
  $("#mobile-advanced-pairing").addEventListener("toggle", async event => {
    if (!event.currentTarget.open) {
      return;
    }
    populateMobileAddresses(mobileSync);
    await refreshMobilePairingCode();
  });
  $("#restart-mobile-pairing").addEventListener("click", async () => {
    const result = await send({ type: "startMobilePairing" });
    if (!result?.ok) {
      showToast(result?.error || "Die automatische Handy-Suche konnte nicht gestartet werden.", true);
      return;
    }
    mobileSync = result;
    renderMobileSyncStatus(result);
    if ($("#mobile-advanced-pairing").open) {
      await refreshMobilePairingCode();
    }
    showToast("Automatische Suche neu gestartet.");
  });
  $("#close-settings").addEventListener("click", closeSettings);
  $("#cancel-settings").addEventListener("click", closeSettings);

  for (const form of document.querySelectorAll(".task-form")) {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const data = new FormData(form);
      const enteredDate = String(data.get("dueDate") || "");
      const result = await send({
        type: "addTask",
        text: data.get("text"),
        emailAddress: data.get("emailAddress"),
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(enteredDate)
          ? enteredDate
          : null
      });
      if (!result?.ok) {
        showToast(result?.error || "Aufgabe konnte nicht gespeichert werden.", true);
        return;
      }
      form.reset();
      syncTaskFormDates();
      await refresh();
    });
  }

  $("#settings-form").addEventListener("submit", async event => {
    event.preventDefault();
    const result = await send({
      type: "savePlannerSettings",
      settings: {
        openOnStartup: $("#open-on-startup").checked,
        showCompleted: $("#show-completed").checked,
        reminderTimes: $("#reminder-times").value
      }
    });
    if (!result?.ok) {
      showToast(result?.error || "Einstellungen konnten nicht gespeichert werden.", true);
      return;
    }
    closeSettings();
    showToast("Einstellungen gespeichert.");
    await refresh();
  });

  tb.runtime.onMessage?.addListener(message => {
    if (message?.type === "plannerStateChanged") {
      refresh();
      refreshMobileSyncStatus();
    }
  });
}

async function start() {
  bindEvents();
  await refresh();
  await refreshMobileSyncStatus();
  setInterval(() => refreshMobileSyncStatus(), 5000);
  if (params.get("settings") === "1") {
    openSettings();
  }
}

start();
