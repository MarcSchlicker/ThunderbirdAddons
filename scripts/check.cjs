'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const excluded = new Set(['.git', 'dist', 'build', 'release', 'node_modules', 'apps', 'third_party']);
function walk(directory) {
  return fs.readdirSync(directory, {withFileTypes:true}).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? (excluded.has(entry.name) ? [] : walk(file)) : [file];
  });
}
let failures = 0;
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, {cwd, encoding:'utf8'});
  if (result.status !== 0 || result.error) {
    failures++;
    console.error(result.stderr || result.stdout || result.error);
  } else if (result.stdout.trim()) console.log(result.stdout.trim());
}
const files = walk(root);
for (const file of files) {
  if (/\.(?:c?js)$/.test(file)) run(['--check', file]);
  if (file.endsWith('.json')) {
    try { JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch { failures++; console.error('Invalid JSON: ' + path.relative(root,file)); }
  }
  if (file.endsWith('.md')) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = match[1].split('#')[0];
      if (!link || /^[a-z][a-z\d+.-]*:/i.test(link)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(link)))) {
        failures++; console.error('Broken local link: ' + path.relative(root,file) + ' → ' + link);
      }
    }
  }
}
const tests = [
  ['calendar-raster', 'test-person-calendar.cjs'],
  ['calendar-raster', 'test-people-panel.cjs'],
  ['daily-planner', 'tests/core.test.js'],
  ['mail-address-filer', 'test-routing.js'],
  ['mail-address-filer', 'test-background.js'],
  ['mail-address-filer', 'test-header-layout.js'],
];
for (const [addon, test] of tests) run([test], path.join(root, 'addons', addon));
console.log(`${files.length} source files checked; ${failures} failures.`);
process.exitCode = failures ? 1 : 0;
