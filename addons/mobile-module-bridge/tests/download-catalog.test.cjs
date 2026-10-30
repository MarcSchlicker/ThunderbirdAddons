const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
function catalog(text) {
  const context = vm.createContext({});
  vm.runInContext(text, context);
  return context.ModuleBridgeCatalog;
}
test('source catalog has no implicit binary download or obsolete version paths', () => {
  const text = fs.readFileSync(path.join(__dirname, '../module-catalog.js'), 'utf8');
  for (const module of catalog(text)) if (module.desktop) assert.equal(module.desktop.install.xpi, null);
  assert(!text.includes('Release/'));
});
test('actual XPI separates source and release URLs and derives current artifact names', { skip: process.platform !== 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-catalog-test-'));
  const output = path.join(dir, 'hub.xpi');
  function build(args) {
    return spawnSync('pwsh.exe', ['-NoProfile', '-File', path.join(root, 'addons/mobile-module-bridge/build-xpi.ps1'), '-OutputPath', output, ...args], { encoding: 'utf8' });
  }
  function read() {
    const result = spawnSync('tar.exe', ['-xOf', output, 'module-catalog.js'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return catalog(result.stdout);
  }
  try {
    let result = build(['-DownloadBaseUrl', 'https://source.example.invalid/tree/', '-XpiBaseUrl', 'https://assets.example.invalid/release/']);
    assert.equal(result.status, 0, result.stderr);
    const modules = read();
    for (const [index, name] of ['daily-planner', 'calendar-raster', 'mail-address-filer'].entries()) {
      const version = JSON.parse(fs.readFileSync(path.join(root, 'addons', name, 'manifest.json'), 'utf8')).version;
      assert.equal(modules[index].desktop.install.xpi, `https://assets.example.invalid/release/${name}-${version}.xpi`);
    }
    assert.equal(modules[0].mobile.package.url, 'https://source.example.invalid/tree/addons/daily-planner/tb-connect-mobile.json');
    result = build(['-DownloadBaseUrl', 'https://source.example.invalid/tree']);
    assert.equal(result.status, 0, result.stderr);
    for (const module of read()) if (module.desktop) assert.equal(module.desktop.install.xpi, null);
    for (const url of ['http://example.invalid', 'https://user:password@example.invalid', 'https://example.invalid/?token=x', 'https://example.invalid/#fragment']) {
      assert.notEqual(build(['-XpiBaseUrl', url]).status, 0, 'must reject unsafe base');
    }
  } finally {
    // This unique directory contains only artifacts produced by this test.
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
