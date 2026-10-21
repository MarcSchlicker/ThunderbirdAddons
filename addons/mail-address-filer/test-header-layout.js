"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.clickCount = 0;
    this.textContent = "";
  }

  set id(value) {
    this.setAttribute("id", value);
  }

  get id() {
    return this.getAttribute("id");
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  set hidden(value) {
    this.toggleAttribute("hidden", value);
  }

  get hidden() {
    return this.attributes.has("hidden");
  }

  set disabled(value) {
    this.toggleAttribute("disabled", value);
  }

  get disabled() {
    return this.attributes.has("disabled");
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || "";
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  toggleAttribute(name, force) {
    if (force) {
      this.attributes.set(name, "true");
    } else {
      this.attributes.delete(name);
    }
  }

  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }

  insertBefore(node, reference) {
    node.remove();
    node.parentElement = this;
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index === -1) {
      this.children.push(node);
    } else {
      this.children.splice(index, 0, node);
    }
    return node;
  }

  remove() {
    if (!this.parentElement) {
      return;
    }
    const index = this.parentElement.children.indexOf(this);
    if (index !== -1) {
      this.parentElement.children.splice(index, 1);
    }
    this.parentElement = null;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  trigger(type) {
    for (const listener of this.listeners.get(type) || []) {
      listener({ type, target: this });
    }
  }

  click() {
    this.clickCount += 1;
    this.trigger("click");
    this.trigger("command");
  }
}

class FakeDocument {
  constructor(uri) {
    this.documentURI = uri;
    this.location = { href: uri };
    this.nodeType = 9;
    this.DOCUMENT_NODE = 9;
    this.readyState = "complete";
    this.documentElement = new FakeElement(this, "html");
    this.head = new FakeElement(this, "head");
    this.body = new FakeElement(this, "body");
    this.documentElement.append(this.head, this.body);
  }

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  createXULElement(tagName) {
    return new FakeElement(this, tagName);
  }

  getElementById(id) {
    const visit = node => {
      if (node.id === id) {
        return node;
      }
      for (const child of node.children) {
        const found = visit(child);
        if (found) {
          return found;
        }
      }
      return null;
    };
    return visit(this.documentElement);
  }
}

class FakeEventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(listener);
  }

  off(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, ...args) {
    for (const listener of this.listeners.get(type) || []) {
      listener(type, ...args);
    }
  }
}

function button(doc, id, label = "") {
  const element = doc.createXULElement("toolbarbutton");
  element.id = id;
  if (label) {
    element.setAttribute("label", label);
  }
  return element;
}

function singleDocument() {
  const doc = new FakeDocument("about:message");
  const messageHeader = doc.createElement("header");
  messageHeader.id = "messageHeader";
  const toolbar = doc.createXULElement("hbox");
  toolbar.id = "header-view-toolbar";
  const archive = button(doc, "hdrArchiveButton", "Archivieren");
  const junk = button(doc, "hdrJunkButton", "Spam");
  const trash = button(doc, "hdrTrashButton", "Löschen");
  const more = button(doc, "otherActionsButton", "Mehr");
  const popup = doc.createXULElement("menupopup");
  popup.id = "otherActionsPopup";
  const existing = doc.createXULElement("menuitem");
  existing.id = "existingItem";
  popup.append(existing);
  more.append(popup);
  toolbar.append(archive, junk, trash, more);
  messageHeader.append(toolbar);
  doc.body.append(messageHeader);
  return { doc, messageHeader, toolbar, archive, junk, trash, popup };
}

function multipleDocument() {
  const doc = new FakeDocument(
    "chrome://messenger/content/multimessageview.xhtml"
  );
  const headingWrapper = doc.createElement("div");
  headingWrapper.id = "headingWrapper";
  const toolbar = doc.createXULElement("hbox");
  toolbar.id = "header-view-toolbar";
  const archive = button(doc, "hdrArchiveButton", "Archivieren");
  const trash = button(doc, "hdrTrashButton", "Löschen");
  toolbar.append(archive, trash);
  headingWrapper.append(toolbar);
  doc.body.append(headingWrapper);
  return { doc, headingWrapper, toolbar, archive, trash };
}

const context = vm.createContext({
  ChromeUtils: {
    importESModule() {
      return {
        ExtensionCommon: {
          EventEmitter: FakeEventEmitter,
          EventManager: class {
            api() {
              return {};
            }
          },
          ExtensionAPI: class {}
        }
      };
    }
  },
  Services: {
    obs: { addObserver() {}, removeObserver() {}, notifyObservers() {} },
    wm: { getEnumerator() { return { hasMoreElements() { return false; } }; } }
  },
  console
});

const source = fs.readFileSync("api/headerLayout/implementation.js", "utf8");
vm.runInContext(
  `${source}\n` +
    `unreadIconUrl = "moz-extension://test/unread.svg";\n` +
    `fileIconUrl = "moz-extension://test/file.svg";\n` +
    `globalThis.testApi = { documentKind, customizeSingleDocument, customizeMultipleDocument, actionEmitter };`,
  context
);

const api = context.testApi;
assert.equal(typeof context.header_layout, "function");
assert.equal(api.documentKind(new FakeDocument("about:message")), "single");
assert.equal(
  api.documentKind(
    new FakeDocument("chrome://messenger/content/multimessageview.xhtml")
  ),
  "multiple"
);

const actions = [];
api.actionEmitter.on("header-action", (event, action) => actions.push(action));

const single = singleDocument();
assert.equal(api.customizeSingleDocument(single.doc), true);
assert.ok(single.doc.getElementById("mailAddressFilerUnreadButton"));
assert.ok(single.doc.getElementById("mailAddressFilerSingleFileButton"));
const actionRail = single.doc.getElementById("mailAddressFilerActionRail");
assert.equal(actionRail.parentElement, single.messageHeader);
assert.equal(single.messageHeader.firstElementChild, actionRail);
assert.deepEqual(
  actionRail.children.map(item => item.id),
  ["mailAddressFilerUnreadButton", "mailAddressFilerSingleFileButton"]
);
assert.ok(single.doc.getElementById("mailAddressFilerHeaderStyle"));
assert.match(
  single.doc.getElementById("mailAddressFilerHeaderStyle").textContent,
  /mail-address-filer_example_local-messageDisplayAction-toolbarbutton/
);
assert.match(
  single.doc.getElementById("mailAddressFilerHeaderStyle").textContent,
  /#0a78c7/
);
assert.match(
  single.doc.getElementById("mailAddressFilerHeaderStyle").textContent,
  /#8f2041/
);
assert.deepEqual(
  single.popup.children.slice(0, 4).map(item => item.id),
  [
    "mailAddressFilerArchiveMenuItem",
    "mailAddressFilerJunkMenuItem",
    "mailAddressFilerMenuSeparator",
    "existingItem"
  ]
);
single.doc.getElementById("mailAddressFilerArchiveMenuItem").trigger("command");
single.doc.getElementById("mailAddressFilerJunkMenuItem").trigger("command");
assert.equal(single.archive.clickCount, 1);
assert.equal(single.junk.clickCount, 1);
single.doc.getElementById("mailAddressFilerUnreadButton").trigger("click");
single.doc.getElementById("mailAddressFilerSingleFileButton").trigger("click");
assert.deepEqual(actions, ["unread", "file"]);

const multiple = multipleDocument();
actions.length = 0;
assert.equal(api.customizeMultipleDocument(multiple.doc), true);
assert.ok(multiple.doc.getElementById("mailAddressFilerUnreadButton"));
assert.ok(multiple.doc.getElementById("mailAddressFilerMultiFileButton"));
assert.ok(multiple.doc.getElementById("mailAddressFilerMultiMoreButton"));
assert.ok(multiple.doc.getElementById("mailAddressFilerArchiveMenuItem"));
assert.ok(multiple.doc.getElementById("mailAddressFilerJunkMenuItem"));
const multipleRail = multiple.doc.getElementById("mailAddressFilerActionRail");
assert.equal(multipleRail.parentElement, multiple.headingWrapper);
assert.equal(multiple.headingWrapper.firstElementChild, multipleRail);
assert.deepEqual(
  multipleRail.children.map(item => item.id),
  ["mailAddressFilerUnreadButton", "mailAddressFilerMultiFileButton"]
);
assert.deepEqual(
  multiple.toolbar.children.map(item => item.id),
  ["hdrArchiveButton", "hdrTrashButton", "mailAddressFilerMultiMoreButton"]
);

multiple.doc.getElementById("mailAddressFilerUnreadButton").trigger("click");
multiple.doc.getElementById("mailAddressFilerMultiFileButton").trigger("click");
multiple.doc.getElementById("mailAddressFilerJunkMenuItem").trigger("command");
multiple.doc.getElementById("mailAddressFilerArchiveMenuItem").trigger("command");
assert.deepEqual(actions, ["unread", "file", "junk"]);
assert.equal(multiple.archive.clickCount, 1);

console.log("header layout tests passed");
