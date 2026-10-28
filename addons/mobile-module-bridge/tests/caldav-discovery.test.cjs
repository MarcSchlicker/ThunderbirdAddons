// Uses the bundled Playwright runtime (NODE_PATH), not an app dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.PW_BROWSER_CHANNEL ? {channel:process.env.PW_BROWSER_CHANNEL} : {})});
  try {
    const page = await browser.newPage();
    await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../nextcloud-caldav.js'),'utf8') + '\nwindow.caldav = NextcloudCalDav;'});
    const result = await page.evaluate(async () => {
      const multistatus = prop => `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:response><d:href>/nextcloud/remote.php/dav/</d:href><d:propstat><d:prop>${prop}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
      const fixtures = [
        multistatus('<d:current-user-principal><d:href>/nextcloud/remote.php/dav/principals/users/test/</d:href></d:current-user-principal>'),
        multistatus('<c:calendar-home-set><d:href>/nextcloud/remote.php/dav/calendars/test/</d:href></c:calendar-home-set>'),
        multistatus('<d:displayname>Privat &amp; Familie</d:displayname><d:resourcetype><c:calendar/></d:resourcetype><a:calendar-color>#168a63ff</a:calendar-color><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>')
          .replace('/nextcloud/remote.php/dav/</d:href>', '/nextcloud/remote.php/dav/calendars/test/private/</d:href>')
      ];
      const requests = [];
      const discovered = await caldav.discover('https://cloud.test/nextcloud', async (url, options) => {
        requests.push({url, method:options.method, depth:options.headers.Depth});
        const xml = fixtures.shift();
        return {status:207, text:async () => xml};
      });
      let creation;
      const created = await caldav.create('https://cloud.test/nextcloud', discovered.home, 'A < B & C', '#168a63', 'request-1', async (url, options) => {
        creation = {url, ...options}; return {status:201};
      });
      const rejected = [];
      for (const url of ['https://evil.test/leak','http://cloud.test/nextcloud/','https://cloud.test/another-app/']) {
        try { caldav.safeUrl(url,'https://cloud.test/nextcloud'); } catch { rejected.push(url); }
      }
      let dtdRejected = false;
      try { caldav.responses('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///secret">]><x/>'); } catch { dtdRejected = true; }
      let overwriteRejected = false;
      try { await caldav.create('https://cloud.test/nextcloud', discovered.home, 'Existing', '#168a63', 'request-2', async () => ({status:412})); }
      catch { overwriteRejected = true; }
      let largeRejected = false;
      try { await caldav.discover('https://cloud.test/nextcloud', async () => new Response('x'.repeat(1024*1024+1), {status:207})); }
      catch { largeRejected = true; }
      return {discovered, requests, creation, created, rejected, dtdRejected, overwriteRejected, largeRejected};
    });
    assert.equal(result.discovered.calendars.length, 1);
    assert.equal(result.discovered.calendars[0].name, 'Privat & Familie');
    assert.equal(result.discovered.calendars[0].color, '#168a63');
    assert.equal(result.requests[2].depth, '1');
    assert(result.creation.body.includes('A &lt; B &amp; C'));
    assert.equal(result.creation.headers['If-None-Match'], '*');
    assert.equal(result.rejected.length, 3);
    assert.equal(result.dtdRejected, true);
    assert.equal(result.overwriteRejected, true);
    assert.equal(result.largeRejected, true);
    console.log('PASS: real browser XML discovery, subdirectory URLs, color, safe origin/path, XML escaping, DTD rejection and no-overwrite creation');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
