const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
test('all shipped Thunderbird Experiments declare a finite maximum version', () => {
    for (const name of ['calendar-raster', 'daily-planner', 'mail-address-filer', 'mobile-module-bridge']) {
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'addons', name, 'manifest.json'), 'utf8'));
        assert(manifest.experiment_apis);
        assert.equal(manifest.browser_specific_settings.gecko.strict_max_version, '153.*');
    }
});
