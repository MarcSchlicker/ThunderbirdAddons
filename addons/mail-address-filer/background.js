"use strict";

const tb = typeof messenger !== "undefined" ? messenger : browser;
const SETTINGS_KEY = "routingSettings";
const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  mappings: {}
});

function errorText(error) {
  return error?.message || String(error || "Unbekannter Fehler");
}

async function loadSettings() {
  const stored = await tb.storage.local.get(SETTINGS_KEY);
  const settings = stored?.[SETTINGS_KEY];
  return {
    ...DEFAULT_SETTINGS,
    ...(settings && typeof settings === "object" ? settings : {}),
    mappings:
      settings?.mappings && typeof settings.mappings === "object"
        ? settings.mappings
        : {}
  };
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
    const selected = await collectMessageList(
      await tb.mailTabs.getSelectedMessages(tab.id)
    );
    if (selected.length) {
      return selected;
    }
  } catch (error) {
    // A standalone message tab/window is not a mail tab.
  }

  try {
    if (typeof tb.messageDisplay.getDisplayedMessages === "function") {
      const displayed = await tb.messageDisplay.getDisplayedMessages(tab.id);
      if (displayed?.length) {
        return displayed;
      }
    }
  } catch (error) {
    // Older compatible builds may only provide getDisplayedMessage().
  }

  try {
    const displayed = await tb.messageDisplay.getDisplayedMessage(tab.id);
    return displayed ? [displayed] : [];
  } catch (error) {
    return [];
  }
}

async function showNotification(title, message) {
  await tb.notifications.create({
    type: "basic",
    iconUrl: tb.runtime.getURL("icons/extension.svg"),
    title,
    message
  });
}

function groupPlansByFolder(plans) {
  const groups = new Map();
  for (const plan of plans) {
    if (!groups.has(plan.folder.id)) {
      groups.set(plan.folder.id, {
        folder: plan.folder,
        messageIds: []
      });
    }
    groups.get(plan.folder.id).messageIds.push(plan.message.id);
  }
  return [...groups.values()];
}

async function moveMessageIds(messageIds, folderId) {
  try {
    const browserInfo = await tb.runtime.getBrowserInfo();
    const majorVersion = Number.parseInt(browserInfo?.version, 10);
    if (Number.isFinite(majorVersion) && majorVersion >= 137) {
      await tb.messages.move(messageIds, folderId, { isUserAction: true });
      return;
    }
  } catch (error) {
    // Thunderbird 128-136 does not know the isUserAction option yet.
  }

  await tb.messages.move(messageIds, folderId);
}

async function setReadState(messages, read) {
  const results = await Promise.allSettled(
    messages.map(message => tb.messages.update(message.id, { read }))
  );
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) {
    throw new Error(
      `${failures.length} von ${messages.length} Nachrichten konnten nicht als ${
        read ? "gelesen" : "ungelesen"
      } markiert werden.`
    );
  }
}

async function buildMovePlans(messages) {
  const [settings, accounts] = await Promise.all([
    loadSettings(),
    tb.accounts.list(true)
  ]);
  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const folders = MailAddressRouting.flattenFolders(accounts);
  const plans = [];
  const missing = [];

  for (const message of messages) {
    const account = accountMap.get(message?.folder?.accountId) || null;
    const email = MailAddressRouting.findIdentityEmail(
      message,
      account,
      settings.mappings
    );
    const descriptor = email ? settings.mappings[email] : null;
    const folder = MailAddressRouting.findFolder(folders, descriptor);

    if (!email || !folder) {
      missing.push({ message, email });
      continue;
    }

    plans.push({ message, email, folder });
  }

  return { plans, missing };
}

async function moveMessages(tab) {
  const messages = await messagesForTab(tab);
  if (!messages.length) {
    await showNotification(
      "Keine Mail ausgewählt",
      "Wähle zuerst mindestens eine Nachricht aus."
    );
    return;
  }

  try {
    const { plans, missing } = await buildMovePlans(messages);
    if (missing.length) {
      await showNotification(
        "Zielordner fehlt",
        missing.length === 1
          ? "Für diese Mailadresse ist noch kein erreichbarer Zielordner eingestellt."
          : `Für ${missing.length} ausgewählte Nachrichten fehlt eine eindeutige Ordnerzuordnung.`
      );
      await tb.runtime.openOptionsPage();
      return;
    }

    if (messages.length > 1) {
      await setReadState(messages, true);
    }

    const movablePlans = plans.filter(
      plan => plan.message?.folder?.id !== plan.folder.id
    );
    if (!movablePlans.length) {
      return;
    }

    for (const group of groupPlansByFolder(movablePlans)) {
      await moveMessageIds(group.messageIds, group.folder.id);
    }
  } catch (error) {
    await showNotification("Ablegen fehlgeschlagen", errorText(error));
  }
}

async function markMessagesUnread(tab) {
  const messages = await messagesForTab(tab);
  if (!messages.length) {
    await showNotification(
      "Keine Mail ausgewählt",
      "Wähle zuerst mindestens eine Nachricht aus."
    );
    return;
  }

  try {
    await setReadState(messages, false);
  } catch (error) {
    await showNotification("Ungelesen markieren fehlgeschlagen", errorText(error));
  }
}

async function markMessagesJunk(tab) {
  const messages = await messagesForTab(tab);
  if (!messages.length) {
    await showNotification(
      "Keine Mail ausgewählt",
      "Wähle zuerst mindestens eine Nachricht aus."
    );
    return;
  }

  const results = await Promise.allSettled(
    messages.map(message => tb.messages.update(message.id, { junk: true }))
  );
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) {
    await showNotification(
      "Spam-Markierung fehlgeschlagen",
      `${failures.length} von ${messages.length} Nachrichten konnten nicht als Spam markiert werden.`
    );
  }
}

async function activeTab() {
  const tabs = await tb.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

tb.messageDisplayAction.onClicked.addListener(tab => moveMessages(tab));

try {
  tb.headerLayout.onAction.addListener(async action => {
    const tab = await activeTab();
    if (action === "unread") {
      await markMessagesUnread(tab);
    } else if (action === "file") {
      await moveMessages(tab);
    } else if (action === "junk") {
      await markMessagesJunk(tab);
    }
  });
  tb.headerLayout.start();
} catch (error) {
  showNotification(
    "Kopfzeile konnte nicht angepasst werden",
    `Ablegen bleibt verfügbar. Details: ${errorText(error)}`
  ).catch(() => {});
}

tb.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") {
    tb.runtime.openOptionsPage().catch(() => {});
  }
});
