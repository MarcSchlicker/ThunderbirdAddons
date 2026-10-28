// This Source Code Form is subject to the Mozilla Public License, v. 2.0.
// Certificate encoding uses the unmodified node-forge release; TLS itself is NSS.
var TBHubTLS = {
  async createIdentity(crypto, forge) {
    const keys = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true, ["sign", "verify"]
    );
    const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
    const privateKey = forge.pki.privateKeyFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(bytes).getBytes()));
    const publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e);
    const certificate = forge.pki.createCertificate();
    certificate.publicKey = publicKey;
    certificate.serialNumber = "01" + Array.from(crypto.getRandomValues(new Uint8Array(19)), byte => byte.toString(16).padStart(2, "0")).join("");
    certificate.validity.notBefore = new Date(Date.now() - 5 * 60 * 1000);
    certificate.validity.notAfter = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000);
    const subject = [{ name: "commonName", value: "TB-Connect Local Hub" }];
    certificate.setSubject(subject);
    certificate.setIssuer(subject);
    certificate.setExtensions([
      { name: "basicConstraints", cA: false, critical: true },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
      { name: "extKeyUsage", serverAuth: true },
      { name: "subjectAltName", altNames: [{ type: 7, ip: "127.0.0.1" }, { type: 2, value: "localhost" }] }
    ]);
    certificate.sign(privateKey, forge.md.sha256.create());
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
    const fingerprint = forge.md.sha256.create().update(der).digest().toHex();
    const password = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
    // Forge's PFX salt/IV generation must have a native secure RNG in this scope.
    const p12 = forge.pkcs12.toPkcs12Asn1(privateKey, [certificate], password, { algorithm: "aes256", count: 100000 });
    return { p12: Uint8Array.from(forge.asn1.toDer(p12).getBytes(), c => c.charCodeAt(0)), password, fingerprint };
  },

  async ensure(extension, environment) {
    const { Cc, Ci, Services, IOUtils, PathUtils, crypto } = environment;
    const certDB = Cc["@mozilla.org/security/x509certdb;1"].getService(Ci.nsIX509CertDB);
    const metadataPath = PathUtils.join(PathUtils.profileDir, "tb-connect-hub-tls.json");
    if (await IOUtils.exists(metadataPath)) {
      const metadata = await IOUtils.readJSON(metadataPath);
      const certificate = certDB.findCertByDBKey(metadata.dbKey);
      if (!certificate || certificate.sha256Fingerprint.replaceAll(":", "").toLowerCase() !== metadata.fingerprint ||
          certificate.validity.notAfter / 1000 <= Date.now()) {
        throw new Error("Das gespeicherte Hub-Zertifikat fehlt oder ist abgelaufen. Gerätevertrauen muss ausdrücklich erneuert werden.");
      }
      return { certificate, fingerprint: metadata.fingerprint };
    }
    const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
    const scope = { crypto, setTimeout, clearTimeout };
    scope.self = scope;
    scope.window = scope;
    Services.scriptloader.loadSubScript(extension.getURL("vendor/forge.min.js"), scope);
    const identity = await this.createIdentity(crypto, scope.forge);
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(PathUtils.join(PathUtils.profileDir, "tb-connect-tls-import-" + Services.uuid.generateUUID().toString().replace(/[{}]/g, "") + ".p12"));
    file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    try {
      await IOUtils.write(file.path, identity.p12);
      if (certDB.importPKCS12File(file, identity.password) !== 0) throw new Error("Das Hub-Zertifikat konnte nicht sicher importiert werden.");
      const certificate = certDB.getCerts().find(cert => cert.sha256Fingerprint.replaceAll(":", "").toLowerCase() === identity.fingerprint);
      if (!certificate) throw new Error("Das importierte Hub-Zertifikat wurde nicht gefunden.");
      await IOUtils.writeJSON(metadataPath, { dbKey: certificate.dbKey, fingerprint: identity.fingerprint });
      return { certificate, fingerprint: identity.fingerprint };
    } finally {
      await IOUtils.remove(file.path, { ignoreAbsent: true });
    }
  }
};
