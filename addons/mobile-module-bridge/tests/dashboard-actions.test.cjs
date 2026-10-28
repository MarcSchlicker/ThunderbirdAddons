// Real dashboard DOM; extension/server responses are deterministic fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({headless:true, channel:process.env.PW_BROWSER_CHANNEL || 'msedge'});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://dashboard.test/**', route => {
      const name = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      const file = path.join(__dirname, '../dashboard', name);
      if (!['index.html', 'app.js', 'style.css'].includes(name)) return route.fulfill({body:''});
      return route.fulfill({body:fs.readFileSync(file), contentType:name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'});
    });
    await page.addInitScript(() => {
      window.calls = [];
      window.config = null;
      window.failSync = false;
      window.messenger = {
        storage:{local:{get:async () => ({}),set:async () => {}}},
        runtime:{sendMessage:async message => {
          window.calls.push(message);
          if (message.type === 'getDashboardData') return {ok:true,status:{running:true,port:47832,addresses:['192.168.1.100'],peers:[]},catalog:[],nextcloud:window.config};
          if (message.type === 'configureNextcloud') {
            window.config = {configured:true,serverUrl:message.nextcloud.serverUrl,lastSyncAt:new Date().toISOString(),appFolder:'Thunderbird'};
            return {ok:true};
          }
          if (message.type === 'startNextcloudLogin') return {ok:true,nextcloudLogin:{appFolder:'Thunderbird'}};
          if (message.type === 'syncNextcloud') return window.failSync ? {ok:false,error:'Dateizugriff verweigert (403)'} : {ok:true,modules:2,remotePath:'Thunderbird'};
          if (message.type === 'listNextcloudCalendars') return {ok:true,calendars:[{name:'Privat',color:'#168a63',url:'https://cloud.test/remote.php/dav/calendars/test/private/'}]};
          if (message.type === 'connectNextcloudCalendar') return {ok:true,name:message.name || 'Privat',alreadyRegistered:true};
          if (message.type === 'addModuleSource') return {ok:true,module:{name:'Testmodul'}};
          if (message.type === 'startPairing') return {ok:true,status:{port:47832,addresses:['192.168.1.100']},sessionId:'fixture-session',secret:'fixture-secret'};
          throw new Error('Unhandled action: ' + message.type);
        }}
      };
    });
    page.on('dialog', dialog => dialog.accept());
    await page.goto('https://dashboard.test/');
    await page.waitForFunction(() => document.querySelector('#connection-title').textContent.includes('bereit'));
    assert(await page.locator('#nextcloud-sync-button').isDisabled());
    await page.locator('#nextcloud-server').fill('https://cloud.test');
    await page.locator('#nextcloud-save-button').click();
    await page.waitForFunction(() => calls.some(x => x.type === 'startNextcloudLogin'));
    await page.getByText('Erweitert: Mit App-Passwort verbinden').click();
    await page.locator('#nextcloud-username').fill('test');
    await page.locator('#nextcloud-password').fill('fixture-only');
    await page.locator('#nextcloud-password-save').click();
    await page.waitForFunction(() => document.querySelector('#nextcloud-status').classList.contains('is-active'));
    assert.equal(await page.locator('#nextcloud-password').inputValue(), '');
    await page.locator('#nextcloud-sync-button').click();
    await page.waitForFunction(() => document.querySelector('#action-feedback').textContent.includes('Abgleich abgeschlossen'));
    await page.evaluate(() => { window.failSync = true; });
    await page.locator('#nextcloud-sync-button').click();
    await page.waitForFunction(() => document.querySelector('#action-feedback').textContent.includes('403'));
    assert(await page.locator('#nextcloud-sync-button').isEnabled());
    await page.locator('#caldav-refresh').click();
    await page.getByRole('button', {name:'In Thunderbird hinzufügen', exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#caldav-status').textContent.includes('bereits eingebunden'));
    await page.locator('#caldav-name').fill('Testkalender');
    await page.locator('#caldav-create').click();
    await page.waitForFunction(() => calls.some(x => x.type === 'connectNextcloudCalendar' && x.create && x.requestId));
    await page.locator('#source-url').fill('https://modules.test/tb-connect-module.json');
    await page.locator('#source-form button').click();
    await page.waitForFunction(() => document.querySelector('#action-feedback').textContent.includes('Modulquelle wurde gespeichert'));
    for (const id of ['refresh-button','connection-refresh-button','module-refresh-button']) await page.locator('#'+id).click();
    await page.locator('#pair-button').click();
    await page.waitForFunction(() => !document.querySelector('#pairing-card').hidden);
    assert((await page.locator('#pairing-code').inputValue()).startsWith('tb-connect://pair?host='));
    assert.deepEqual(errors, []);
    console.log('PASS: dashboard login, app-password, success/error feedback, CalDAV list/add/create, module source, refresh and pairing action');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
