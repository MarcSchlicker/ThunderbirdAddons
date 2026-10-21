"use strict";

const assert = require("node:assert/strict");

const headerActions = { listener: null, addListener(listener) { this.listener = listener; } };
const installed = { listener: null, addListener(listener) { this.listener = listener; } };
const displayed = { listener: null, addListener(listener) { this.listener = listener; } };

const calls = {
  moves: [],
  updates: [],
  notifications: [],
  optionsOpened: 0,
  headerStarted: 0
};

const account = {
  id: "account-a",
  name: "Arbeit",
  identities: [
    { email: "user@example.com" },
    { email: "alias@example.com" }
  ],
  rootFolder: {
    id: "root-a",
    isRoot: true,
    subFolders: [
      {
        id: "inbox-a",
        accountId: "account-a",
        name: "Posteingang",
        path: "/Inbox",
        subFolders: []
      },
      {
        id: "done-a",
        accountId: "account-a",
        name: "Erledigt",
        path: "/Erledigt",
        subFolders: []
      }
    ]
  }
};

const message = {
  id: 42,
  author: "Sender <sender@example.net>",
  recipients: ["Alias <alias@example.com>"],
  folder: {
    id: "inbox-a",
    accountId: "account-a"
  }
};

const secondMessage = {
  ...message,
  id: 43,
  author: "Other sender <other@example.net>"
};

let storedSettings = {
  routingSettings: {
    version: 1,
    mappings: {
      "alias@example.com": {
        folderId: "done-a",
        accountId: "account-a",
        path: "/Erledigt",
        name: "Erledigt"
      }
    }
  }
};

global.MailAddressRouting = require("./routing.js");
global.messenger = {
  accounts: {
    async list() {
      return [account];
    }
  },
  headerLayout: {
    onAction: headerActions,
    start() {
      calls.headerStarted += 1;
    }
  },
  mailTabs: {
    async getSelectedMessages() {
      return { messages: [message, secondMessage] };
    }
  },
  messageDisplay: {
    onMessageDisplayed: displayed,
    async getDisplayedMessage() {
      return message;
    }
  },
  messageDisplayAction: {
    onClicked: {
      addListener(listener) {
        calls.fileListener = listener;
      }
    }
  },
  messages: {
    async continueList() {
      return { messages: [] };
    },
    async move(...args) {
      calls.moves.push(args);
    },
    async update(...args) {
      calls.updates.push(args);
    }
  },
  notifications: {
    async create(details) {
      calls.notifications.push(details);
    }
  },
  runtime: {
    onInstalled: installed,
    async getBrowserInfo() {
      return { version: "153.0.1" };
    },
    getURL(path) {
      return `moz-extension://test/${path}`;
    },
    async openOptionsPage() {
      calls.optionsOpened += 1;
    }
  },
  storage: {
    local: {
      async get() {
        return storedSettings;
      }
    }
  },
  tabs: {
    async query() {
      return [{ id: 7 }];
    }
  }
};

const realSetTimeout = global.setTimeout;
global.setTimeout = callback => {
  callback();
  return 0;
};

require("./background.js");

(async () => {
  assert.equal(typeof headerActions.listener, "function");
  assert.equal(typeof calls.fileListener, "function");
  assert.equal(calls.headerStarted, 1);

  await calls.fileListener({ id: 7 });
  assert.deepEqual(calls.moves, [
    [[42, 43], "done-a", { isUserAction: true }]
  ]);
  assert.deepEqual(calls.updates, [
    [42, { read: true }],
    [43, { read: true }]
  ]);

  calls.updates.length = 0;
  await headerActions.listener("unread");
  assert.deepEqual(calls.updates, [
    [42, { read: false }],
    [43, { read: false }]
  ]);

  calls.updates.length = 0;
  await headerActions.listener("junk");
  assert.deepEqual(calls.updates, [
    [42, { junk: true }],
    [43, { junk: true }]
  ]);

  calls.moves.length = 0;
  calls.updates.length = 0;
  await headerActions.listener("file");
  assert.deepEqual(calls.moves, [
    [[42, 43], "done-a", { isUserAction: true }]
  ]);
  assert.deepEqual(calls.updates, [
    [42, { read: true }],
    [43, { read: true }]
  ]);

  storedSettings = {
    routingSettings: {
      version: 1,
      mappings: {}
    }
  };
  calls.moves.length = 0;
  calls.updates.length = 0;
  await calls.fileListener({ id: 7 });
  assert.equal(calls.moves.length, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.optionsOpened, 1);
  assert.equal(calls.notifications.at(-1).title, "Zielordner fehlt");

  console.log("background behavior tests passed");
  storedSettings.routingSettings.mappings = {
    "alias@example.com": { folderId: "deleted-folder", accountId: "account-a", path: "/Gone", name: "Gone" }
  };
  calls.moves.length = 0;
  calls.updates.length = 0;
  await calls.fileListener({ id: 7 });
  assert.equal(calls.moves.length, 0, "A removed destination must not move a message elsewhere");
  assert.equal(calls.updates.length, 0, "A removed destination must not change read state");
  assert.equal(calls.notifications.at(-1).title, "Zielordner fehlt");
  console.log("deleted destination notification test passed");
})()
  .finally(() => {
    global.setTimeout = realSetTimeout;
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
