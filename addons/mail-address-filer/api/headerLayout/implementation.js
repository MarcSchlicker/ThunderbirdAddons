var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);

const STYLE_ID = "mailAddressFilerHeaderStyle";
const ACTION_RAIL_ID = "mailAddressFilerActionRail";
const UNREAD_BUTTON_ID = "mailAddressFilerUnreadButton";
const SINGLE_FILE_BUTTON_ID = "mailAddressFilerSingleFileButton";
const MULTI_FILE_BUTTON_ID = "mailAddressFilerMultiFileButton";
const MULTI_MORE_BUTTON_ID = "mailAddressFilerMultiMoreButton";
const MULTI_MORE_POPUP_ID = "mailAddressFilerMultiMorePopup";
const ARCHIVE_MENU_ID = "mailAddressFilerArchiveMenuItem";
const JUNK_MENU_ID = "mailAddressFilerJunkMenuItem";
const MENU_SEPARATOR_ID = "mailAddressFilerMenuSeparator";
const OFFICIAL_FILE_BUTTON_ID =
  "mail-address-filer_example_local-messageDisplayAction-toolbarbutton";
const UNREAD_RAIL_ICON =
  "chrome://messenger/skin/icons/new/compact/unread.svg";
const FILE_RAIL_ICON =
  "chrome://messenger/skin/icons/new/compact/folder-save.svg";

const actionEmitter = new ExtensionCommon.EventEmitter();
const documentStates = new Map();
const customizedDocuments = new Set();
let documentObserverRegistered = false;
let unreadIconUrl = "";
let fileIconUrl = "";

function documentKind(doc) {
  const uri = String(doc?.documentURI || doc?.location?.href || "").toLowerCase();

  if (uri.includes("multimessageview.xhtml")) {
    return "multiple";
  }
  if (
    uri.startsWith("about:message") ||
    uri.includes("/aboutmessage.xhtml")
  ) {
    return "single";
  }
  return null;
}

function stateFor(doc) {
  if (!documentStates.has(doc)) {
    documentStates.set(doc, {
      cleanup: [],
      mutationObserver: null,
      retryTimer: null,
      retries: 0,
      waitingForDOMContentLoaded: false
    });
  }
  return documentStates.get(doc);
}

function addCleanup(doc, callback) {
  stateFor(doc).cleanup.push(callback);
}

function createStyle(doc) {
  if (doc.getElementById(STYLE_ID)) {
    return;
  }

  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #messageHeader,
    #headingWrapper {
      position: relative !important;
      padding-inline-start: 60px !important;
    }

    #messageHeader,
    #headingWrapper {
      min-block-size: 104px;
      box-sizing: border-box;
    }

    #${ACTION_RAIL_ID} {
      position: absolute;
      inset-block-start: 7px;
      inset-inline-start: 8px;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    #${ACTION_RAIL_ID} .mail-address-filer-rail-button {
      appearance: none;
      box-sizing: border-box;
      display: grid;
      place-items: center;
      inline-size: 42px;
      min-inline-size: 42px;
      max-inline-size: 42px;
      block-size: 42px;
      min-block-size: 42px;
      max-block-size: 42px;
      margin: 0;
      padding: 0;
      border: 1px solid color-mix(in srgb, var(--maf-action-color) 38%, transparent);
      border-radius: 5px;
      background-color: color-mix(in srgb, var(--maf-action-color) 9%, transparent);
      color: var(--maf-action-color);
      cursor: pointer;
    }

    #${ACTION_RAIL_ID} .mail-address-filer-rail-button:hover {
      background-color: color-mix(in srgb, var(--maf-action-color) 17%, transparent);
    }

    #${ACTION_RAIL_ID} .mail-address-filer-rail-button:active {
      background-color: color-mix(in srgb, var(--maf-action-color) 24%, transparent);
    }

    #${ACTION_RAIL_ID} .mail-address-filer-rail-button:focus-visible {
      outline: 2px solid SelectedItem;
      outline-offset: 2px;
    }

    #${ACTION_RAIL_ID} .mail-address-filer-rail-button img {
      inline-size: 21px;
      block-size: 21px;
      pointer-events: none;
      -moz-context-properties: fill, stroke;
      fill: currentColor;
      stroke: currentColor;
    }

    #${ACTION_RAIL_ID} #${UNREAD_BUTTON_ID} {
      --maf-action-color: #0a78c7;
    }

    #${ACTION_RAIL_ID} #${SINGLE_FILE_BUTTON_ID},
    #${ACTION_RAIL_ID} #${MULTI_FILE_BUTTON_ID} {
      --maf-action-color: #8f2041;
    }

    #${OFFICIAL_FILE_BUTTON_ID} {
      display: none !important;
    }

    #header-view-toolbar > #hdrArchiveButton,
    #header-view-toolbar > #hdrJunkButton {
      display: none !important;
    }

    #header-view-toolbar > #hdrTrashButton {
      min-width: 30px !important;
      max-width: 34px !important;
      padding-inline: 5px !important;
      opacity: 0.76;
    }

    #header-view-toolbar > #hdrTrashButton .toolbarbutton-text {
      display: none !important;
    }

    #header-view-toolbar > #hdrTrashButton .toolbarbutton-icon {
      width: 16px !important;
      height: 16px !important;
      margin-inline: 0 !important;
    }

    #otherActionsButton,
    #${MULTI_MORE_BUTTON_ID} {
      opacity: 0.84;
    }

    #${UNREAD_BUTTON_ID} {
      font-weight: 600;
    }

    #${UNREAD_BUTTON_ID} .toolbarbutton-icon,
    #${MULTI_FILE_BUTTON_ID} .toolbarbutton-icon {
      width: 17px !important;
      height: 17px !important;
    }
  `;
  (doc.head || doc.documentElement).append(style);
}

function createToolbarButton(doc, id, label, tooltip, iconUrl, action) {
  const button = doc.createXULElement("toolbarbutton");
  button.id = id;
  button.setAttribute(
    "class",
    "toolbarbutton-1 message-header-view-button mail-address-filer-button"
  );
  button.setAttribute("label", label);
  button.setAttribute("tooltiptext", tooltip);
  button.setAttribute("image", iconUrl);
  button.setAttribute("style", `list-style-image: url("${iconUrl}");`);
  button.addEventListener("command", () => {
    actionEmitter.emit("header-action", action);
  });
  return button;
}

function createRailButton(doc, id, label, tooltip, iconUrl, action) {
  const button = doc.createElement("button");
  button.id = id;
  button.setAttribute("type", "button");
  button.setAttribute("class", "mail-address-filer-rail-button");
  button.setAttribute("title", tooltip);
  button.setAttribute("aria-label", label);

  const icon = doc.createElement("img");
  icon.setAttribute("src", iconUrl);
  icon.setAttribute("alt", "");
  button.append(icon);
  button.addEventListener("click", () => {
    actionEmitter.emit("header-action", action);
  });
  return button;
}

function createActionRail(
  doc,
  container,
  fileButtonId,
  unreadTooltip,
  fileTooltip
) {
  let rail = doc.getElementById(ACTION_RAIL_ID);
  if (!rail) {
    rail = doc.createElement("div");
    rail.id = ACTION_RAIL_ID;
    rail.setAttribute("role", "toolbar");
    rail.setAttribute("aria-label", "Mail-Aktionen");
    container.insertBefore(rail, container.firstElementChild);
  }

  if (!doc.getElementById(UNREAD_BUTTON_ID)) {
    rail.append(
      createRailButton(
        doc,
        UNREAD_BUTTON_ID,
        "Ungelesen",
        unreadTooltip,
        UNREAD_RAIL_ICON,
        "unread"
      )
    );
  }

  if (!doc.getElementById(fileButtonId)) {
    rail.append(
      createRailButton(
        doc,
        fileButtonId,
        "Ablegen",
        fileTooltip,
        FILE_RAIL_ICON,
        "file"
      )
    );
  }
}

function createNativeMenuItem(doc, id, nativeButton, fallbackLabel) {
  const item = doc.createXULElement("menuitem");
  item.id = id;
  item.setAttribute("class", "menuitem-iconic");
  item.setAttribute("label", nativeButton.getAttribute("label") || fallbackLabel);
  item.addEventListener("command", () => nativeButton.click());
  return item;
}

function createActionMenuItem(doc, id, label, action) {
  const item = doc.createXULElement("menuitem");
  item.id = id;
  item.setAttribute("class", "menuitem-iconic");
  item.setAttribute("label", label);
  item.addEventListener("command", () => {
    actionEmitter.emit("header-action", action);
  });
  return item;
}

function createMultipleMoreButton(doc, archiveButton) {
  const button = doc.createXULElement("toolbarbutton");
  button.id = MULTI_MORE_BUTTON_ID;
  button.setAttribute("type", "menu");
  button.setAttribute("label", "Mehr");
  button.setAttribute("tooltiptext", "Weitere Aktionen");
  button.setAttribute(
    "class",
    "toolbarbutton-1 message-header-view-button hdrMoreButton"
  );

  const popup = doc.createXULElement("menupopup");
  popup.id = MULTI_MORE_POPUP_ID;
  popup.setAttribute("class", "no-icon-menupopup");

  const archiveItem = createNativeMenuItem(
    doc,
    ARCHIVE_MENU_ID,
    archiveButton,
    "Archivieren"
  );
  const junkItem = createActionMenuItem(doc, JUNK_MENU_ID, "Spam", "junk");
  popup.append(archiveItem, junkItem);
  button.append(popup);

  const sync = () => {
    archiveItem.hidden = Boolean(archiveButton.hidden);
    archiveItem.disabled = Boolean(archiveButton.disabled);
  };
  popup.addEventListener("popupshowing", sync);
  addCleanup(doc, () => popup.removeEventListener("popupshowing", sync));
  sync();

  return button;
}

function syncSingleMenuState(
  archiveItem,
  archiveButton,
  junkItem,
  junkButton
) {
  archiveItem.hidden = Boolean(archiveButton.hidden);
  archiveItem.disabled = Boolean(archiveButton.disabled);
  junkItem.hidden = Boolean(junkButton.hidden);
  junkItem.disabled = Boolean(junkButton.disabled);
}

function customizeSingleDocument(doc) {
  const messageHeader = doc.getElementById("messageHeader");
  const toolbar = doc.getElementById("header-view-toolbar");
  const archiveButton = doc.getElementById("hdrArchiveButton");
  const junkButton = doc.getElementById("hdrJunkButton");
  const trashButton = doc.getElementById("hdrTrashButton");
  const popup = doc.getElementById("otherActionsPopup");
  if (
    !messageHeader ||
    !toolbar ||
    !archiveButton ||
    !junkButton ||
    !trashButton ||
    !popup
  ) {
    return false;
  }

  createStyle(doc);
  createActionRail(
    doc,
    messageHeader,
    SINGLE_FILE_BUTTON_ID,
    "Als ungelesen markieren",
    "In den persönlichen Ablageordner verschieben"
  );

  let archiveItem = doc.getElementById(ARCHIVE_MENU_ID);
  let junkItem = doc.getElementById(JUNK_MENU_ID);
  let separator = doc.getElementById(MENU_SEPARATOR_ID);

  if (!archiveItem) {
    archiveItem = createNativeMenuItem(
      doc,
      ARCHIVE_MENU_ID,
      archiveButton,
      "Archivieren"
    );
  }
  if (!junkItem) {
    junkItem = createNativeMenuItem(doc, JUNK_MENU_ID, junkButton, "Spam");
  }
  if (!separator) {
    separator = doc.createXULElement("menuseparator");
    separator.id = MENU_SEPARATOR_ID;
  }

  const firstItem = popup.firstElementChild;
  if (!archiveItem.parentElement) {
    popup.insertBefore(archiveItem, firstItem);
  }
  if (!junkItem.parentElement) {
    popup.insertBefore(junkItem, separator.parentElement ? separator : firstItem);
  }
  if (!separator.parentElement) {
    popup.insertBefore(separator, firstItem);
  }

  const sync = () =>
    syncSingleMenuState(archiveItem, archiveButton, junkItem, junkButton);
  popup.addEventListener("popupshowing", sync);
  addCleanup(doc, () => popup.removeEventListener("popupshowing", sync));
  sync();
  return true;
}

function customizeMultipleDocument(doc) {
  const headingWrapper = doc.getElementById("headingWrapper");
  const toolbar = doc.getElementById("header-view-toolbar");
  const archiveButton = doc.getElementById("hdrArchiveButton");
  const trashButton = doc.getElementById("hdrTrashButton");
  if (!headingWrapper || !toolbar || !archiveButton || !trashButton) {
    return false;
  }

  createStyle(doc);
  createActionRail(
    doc,
    headingWrapper,
    MULTI_FILE_BUTTON_ID,
    "Ausgewählte Nachrichten als ungelesen markieren",
    "Ausgewählte Nachrichten ablegen"
  );

  if (!doc.getElementById(MULTI_MORE_BUTTON_ID)) {
    toolbar.append(createMultipleMoreButton(doc, archiveButton));
  }

  return true;
}

function stopWatchingDocument(doc) {
  const state = documentStates.get(doc);
  if (!state) {
    return;
  }

  try {
    state.mutationObserver?.disconnect();
  } catch (error) {
    // The document may already be gone.
  }
  state.mutationObserver = null;

  if (state.retryTimer != null) {
    try {
      doc.defaultView?.clearTimeout(state.retryTimer);
    } catch (error) {
      // The window may already be gone.
    }
    state.retryTimer = null;
  }
}

function tryCustomizeDocument(doc) {
  const kind = documentKind(doc);
  if (!kind || customizedDocuments.has(doc)) {
    return Boolean(kind && customizedDocuments.has(doc));
  }

  let completed = false;
  try {
    completed =
      kind === "multiple"
        ? customizeMultipleDocument(doc)
        : customizeSingleDocument(doc);
  } catch (error) {
    try {
      console.error("Mail-Ablage: Kopfzeile konnte nicht angepasst werden", error);
    } catch (reportingError) {
      // Keep retrying even if the error console is unavailable.
    }
    return false;
  }

  if (completed) {
    customizedDocuments.add(doc);
    stopWatchingDocument(doc);
  }
  return completed;
}

function retryCustomization(doc) {
  const state = stateFor(doc);
  if (tryCustomizeDocument(doc) || state.retries >= 100) {
    return;
  }

  if (state.retryTimer != null) {
    return;
  }

  state.retries += 1;
  state.retryTimer = doc.defaultView?.setTimeout(
    () => {
      state.retryTimer = null;
      retryCustomization(doc);
    },
    100
  );
}

function watchLoadedDocument(doc) {
  if (!documentKind(doc) || customizedDocuments.has(doc)) {
    return;
  }

  const state = stateFor(doc);
  if (!state.mutationObserver && doc.defaultView?.MutationObserver) {
    state.mutationObserver = new doc.defaultView.MutationObserver(() => {
      tryCustomizeDocument(doc);
    });
    state.mutationObserver.observe(doc.documentElement, {
      childList: true,
      subtree: true
    });
  }

  retryCustomization(doc);
}

function scheduleDocument(doc) {
  if (!doc || doc.nodeType !== doc.DOCUMENT_NODE) {
    return;
  }

  if (doc.readyState === "loading") {
    const state = stateFor(doc);
    if (state.waitingForDOMContentLoaded) {
      return;
    }

    state.waitingForDOMContentLoaded = true;
    const onReady = () => {
      state.waitingForDOMContentLoaded = false;
      watchLoadedDocument(doc);
    };
    doc.addEventListener("DOMContentLoaded", onReady, { once: true });
    state.cleanup.push(() =>
      doc.removeEventListener("DOMContentLoaded", onReady)
    );
    return;
  }

  watchLoadedDocument(doc);
}

function collectDocuments(doc, seen = new Set(), depth = 0) {
  if (!doc || seen.has(doc) || depth > 6) {
    return;
  }
  seen.add(doc);
  scheduleDocument(doc);

  let frames = [];
  try {
    frames = doc.querySelectorAll("browser, iframe, frame");
  } catch (error) {
    return;
  }

  for (const frame of frames) {
    try {
      collectDocuments(frame.contentDocument, seen, depth + 1);
    } catch (error) {
      // Ignore inaccessible embedded documents.
    }
  }
}

const documentObserver = {
  observe(subject) {
    scheduleDocument(subject);
  }
};

function startCustomization(extension) {
  unreadIconUrl = extension.rootURI.resolve("icons/mark-unread.svg");
  fileIconUrl = extension.rootURI.resolve("icons/file-message.svg");

  if (!documentObserverRegistered) {
    Services.obs.addObserver(documentObserver, "chrome-document-loaded");
    documentObserverRegistered = true;
  }

  const windows = Services.wm.getEnumerator(null);
  while (windows.hasMoreElements()) {
    const win = windows.getNext();
    try {
      collectDocuments(win.document);
    } catch (error) {
      // Ignore windows that are closing.
    }
  }
}

function cleanupDocument(doc) {
  const state = documentStates.get(doc);
  stopWatchingDocument(doc);

  if (state) {
    for (const callback of state.cleanup.splice(0)) {
      try {
        callback();
      } catch (error) {
        // Ignore cleanup for documents that are already gone.
      }
    }
  }

  try {
    doc.getElementById(ACTION_RAIL_ID)?.remove();
    doc.getElementById(UNREAD_BUTTON_ID)?.remove();
    doc.getElementById(SINGLE_FILE_BUTTON_ID)?.remove();
    doc.getElementById(MULTI_FILE_BUTTON_ID)?.remove();
    doc.getElementById(MULTI_MORE_BUTTON_ID)?.remove();
    doc.getElementById(ARCHIVE_MENU_ID)?.remove();
    doc.getElementById(JUNK_MENU_ID)?.remove();
    doc.getElementById(MENU_SEPARATOR_ID)?.remove();
    doc.getElementById(STYLE_ID)?.remove();
  } catch (error) {
    // The document may already be gone.
  }

  documentStates.delete(doc);
  customizedDocuments.delete(doc);
}

function stopCustomization() {
  if (documentObserverRegistered) {
    Services.obs.removeObserver(documentObserver, "chrome-document-loaded");
    documentObserverRegistered = false;
  }

  for (const doc of [...documentStates.keys()]) {
    cleanupDocument(doc);
  }
  customizedDocuments.clear();
}

this.header_layout = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      headerLayout: {
        start() {
          startCustomization(context.extension);
        },

        onAction: new ExtensionCommon.EventManager({
          context,
          name: "headerLayout.onAction",
          register(fire) {
            function callback(event, action) {
              return fire.async(action);
            }

            actionEmitter.on("header-action", callback);
            return () => actionEmitter.off("header-action", callback);
          }
        }).api()
      }
    };
  }

  onShutdown(isAppShutdown) {
    stopCustomization();
    if (!isAppShutdown) {
      Services.obs.notifyObservers(null, "startupcache-invalidate", null);
    }
  }
};
