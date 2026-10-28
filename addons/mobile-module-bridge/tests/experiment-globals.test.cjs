const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Extension experiments are not DOM windows: URL is not necessarily a global.
const source = fs.readFileSync(path.join(__dirname, '../api/moduleBridge/implementation.js'), 'utf8');
const imported = [];
const context = vm.createContext({ExtensionAPI:class {}, Services:{}, ChromeUtils:{generateQI:() => () => {}}});
context.Cu = {importGlobalProperties(names) {
  imported.push(...names);
  for (const name of names) {
    assert.equal(name, 'URL');
    context[name] = URL;
  }
}};
vm.runInContext(source.slice(source.indexOf('const MAX_REQUEST_BYTES')), context);
assert.equal(vm.runInContext("nextcloudCredentialIdentity('https://cloud.test/nextcloud').hostname", context), 'https://cloud.test');
assert.equal(vm.runInContext("nextcloudCredentialIdentity('https://cloud.test/nextcloud').realm", context), 'TB-Connect Nextcloud /nextcloud');
assert.deepEqual(imported, ['URL']);
assert.throws(() => vm.runInContext("nextcloudCredentialIdentity('http://cloud.test')", context), /HTTPS/);
console.log('PASS: experiment without DOM globals imports URL and validates Nextcloud identity');
