"use strict";

const assert = require("node:assert/strict");
const routing = require("./routing.js");

const accounts = [
  {
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
  }
];

const mappings = {
  "user@example.com": { folderId: "done-a" },
  "alias@example.com": { folderId: "inbox-a" }
};

assert.equal(
  routing.normalizeEmail("User <USER@Example.com>"),
  "user@example.com"
);
assert.deepEqual(
  routing.emailsFrom(["User <user@example.com>", "alias@example.com"]),
  ["user@example.com", "alias@example.com"]
);
assert.equal(
  routing.findIdentityEmail(
    {
      author: "Sender <sender@example.net>",
      recipients: ["Alias <alias@example.com>"]
    },
    accounts[0],
    mappings
  ),
  "alias@example.com"
);
assert.equal(
  routing.findIdentityEmail(
    {
      author: "User <user@example.com>",
      recipients: ["recipient@example.net"]
    },
    accounts[0],
    mappings
  ),
  "user@example.com"
);

const folders = routing.flattenFolders(accounts);
assert.equal(folders.length, 2);
assert.equal(routing.findFolder(folders, mappings["user@example.com"]).name, "Erledigt");
assert.equal(
  routing.findFolder(folders, {
    folderId: "missing",
    accountId: "account-a",
    path: "/Erledigt"
  }).id,
  "done-a"
);

console.log("routing tests passed");
