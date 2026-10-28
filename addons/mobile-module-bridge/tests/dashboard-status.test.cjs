const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ Date, Intl });
const source = fs.readFileSync(path.join(__dirname, '../dashboard/app.js'), 'utf8');
vm.runInContext(source.slice(source.indexOf('function moduleReceiptTime'), source.indexOf('function moduleBadge')), context);
context.module = { id: 'planner', mobileSelected: true, sync: { updatedAt: 'new' } };
context.phone = {
  id: 'phone', kind: 'mobile', lastSyncAt: new Date().toISOString(),
  moduleInstallations: { planner: { status: 'Installiert' } },
  moduleReceipts: { planner: { confirmedAt: new Date().toISOString(), confirmedUpdatedAt: 'old' } },
};
assert.equal(vm.runInContext('moduleTone(module, [phone])', context), 'pending', 'Old receipt must not turn new data green');
context.phone.moduleReceipts.planner.confirmedUpdatedAt = 'new';
assert.equal(vm.runInContext('moduleTone(module, [phone])', context), 'success');
context.secondPhone = structuredClone(context.phone);
context.secondPhone.id = 'second';
context.secondPhone.moduleReceipts.planner.confirmedUpdatedAt = 'old';
assert.equal(vm.runInContext('moduleTone(module, [phone, secondPhone])', context), 'pending', 'One current phone cannot hide another stale installed phone');
context.secondPhone.moduleInstallations.planner.status = 'Fehler beim Laden';
assert.equal(vm.runInContext('moduleTone(module, [phone, secondPhone])', context), 'error');
console.log('PASS: only the current revision on every installed phone is green; download errors remain red');
