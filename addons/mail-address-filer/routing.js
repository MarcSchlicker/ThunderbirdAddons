(function (root, factory) {
  const api = factory();
  root.MailAddressRouting = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EMAIL_PATTERN = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi;

  function normalizeEmail(value) {
    const matches = String(value || "").match(EMAIL_PATTERN);
    return matches?.[0]?.toLowerCase() || "";
  }

  function emailsFrom(value) {
    const values = Array.isArray(value) ? value : [value];
    const result = [];

    for (const entry of values) {
      const matches = String(entry || "").match(EMAIL_PATTERN) || [];
      for (const match of matches) {
        const normalized = match.toLowerCase();
        if (!result.includes(normalized)) {
          result.push(normalized);
        }
      }
    }

    return result;
  }

  function messageAddresses(message) {
    return new Set([
      ...emailsFrom(message?.author),
      ...emailsFrom(message?.recipients),
      ...emailsFrom(message?.ccList),
      ...emailsFrom(message?.bccList)
    ]);
  }

  function identityEmails(account) {
    const result = [];
    for (const identity of account?.identities || []) {
      const email = normalizeEmail(identity?.email);
      if (email && !result.includes(email)) {
        result.push(email);
      }
    }
    return result;
  }

  function configuredEmails(mappings) {
    return Object.keys(mappings || {})
      .map(normalizeEmail)
      .filter((email, index, all) => email && all.indexOf(email) === index);
  }

  function findIdentityEmail(message, account, mappings) {
    const addresses = messageAddresses(message);
    const configured = configuredEmails(mappings);
    const configuredSet = new Set(configured);
    const accountEmails = identityEmails(account);
    const accountConfigured = accountEmails.filter(email => configuredSet.has(email));

    for (const email of accountConfigured) {
      if (addresses.has(email)) {
        return email;
      }
    }

    for (const email of configured) {
      if (addresses.has(email)) {
        return email;
      }
    }

    if (accountConfigured.length === 1) {
      return accountConfigured[0];
    }

    const defaultEmail = accountEmails[0];
    if (defaultEmail && configuredSet.has(defaultEmail)) {
      return defaultEmail;
    }

    return configured.length === 1 ? configured[0] : "";
  }

  function folderChildren(folder) {
    return Array.isArray(folder?.subFolders) ? folder.subFolders : [];
  }

  function flattenFolders(accounts) {
    const folders = [];
    const seen = new Set();

    function visit(folder, account, depth) {
      if (!folder || typeof folder !== "object") {
        return;
      }

      const key = folder.id || `${folder.accountId || account?.id || ""}:${folder.path || folder.name || ""}`;
      if (key && seen.has(key)) {
        return;
      }
      if (key) {
        seen.add(key);
      }

      if (!folder.isRoot) {
        folders.push({
          ...folder,
          accountId: folder.accountId || account?.id || "",
          accountName: account?.name || "",
          depth
        });
      }

      for (const child of folderChildren(folder)) {
        visit(child, account, folder.isRoot ? depth : depth + 1);
      }
    }

    for (const account of accounts || []) {
      if (account?.rootFolder) {
        visit(account.rootFolder, account, 0);
      }
      for (const folder of account?.folders || []) {
        visit(folder, account, 0);
      }
    }

    return folders;
  }

  function findFolder(folders, descriptor) {
    if (!descriptor) {
      return null;
    }

    if (descriptor.folderId) {
      const byId = folders.find(folder => folder.id === descriptor.folderId);
      if (byId) {
        return byId;
      }
    }

    return (
      folders.find(
        folder =>
          folder.accountId === descriptor.accountId &&
          folder.path === descriptor.path
      ) || null
    );
  }

  return {
    emailsFrom,
    findFolder,
    findIdentityEmail,
    flattenFolders,
    identityEmails,
    messageAddresses,
    normalizeEmail
  };
});
