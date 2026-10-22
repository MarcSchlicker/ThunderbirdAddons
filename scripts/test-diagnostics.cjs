'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const {summarize}=require('./summarize-diagnostics.cjs');
const root=path.resolve(__dirname,'..');
const sentinel='private-person@example.invalid?token=do-not-export';
let releaseName='test_browser';
const server=http.createServer((req,res)=>{
  const requested=new URL(req.url,'http://localhost').pathname;
  if(requested.endsWith('/diagnostics/build-info.json')) {
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({releaseName,build:'browser-fixture'}));return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(requested));
  if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css'})[path.extname(file)]||'text/plain');
  res.end(fs.readFileSync(file));
});
async function pageFor(browser,addon,{broken=false,hang=false}={}) {
  const page=await browser.newPage({acceptDownloads:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'addons',addon,'manifest.json'),'utf8'));
  const base=`http://127.0.0.1:${server.address().port}/addons/${addon}/`;
  await page.addInitScript(({manifest,base,sentinel,broken,hang})=>{
    let saved={peoplePanelOpen:true,peopleSearch:sentinel,dailyPlannerState:{tasks:[],notes:sentinel},routingSettings:{mappings:{}},tbDiagnosticsHistory:[{schemaVersion:1,secret:sentinel}]};
    globalThis.testSaved=()=>saved;
    globalThis.messenger={runtime:{getURL:p=>base+p,getManifest:()=>manifest,onMessage:{addListener(){}},sendMessage:async()=>({})},
      tabs:{create:async({url})=>{globalThis.lastOpened=url;}},
      storage:{onChanged:{addListener(){}},local:{get:async()=>structuredClone(saved),set:async data=>Object.assign(saved,structuredClone(data))}},
      hourGridBridge:{getBridgeStatus:async()=>{if(hang)return new Promise(()=>{});if(broken)throw new Error(sentinel);return {ok:true};}},
      headerLayout:{start(){}}};
  },{manifest,base,sentinel,broken,hang});
  return {page,base};
}
async function run(page) {
  await page.getByRole('button',{name:'Diagnose starten',exact:true}).click();
  await page.getByRole('button',{name:'Diagnose exportieren',exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.getElementById('export').disabled,{timeout:10000});
  return JSON.parse(await page.locator('#preview').textContent());
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.env.PW_BROWSER_CHANNEL||'msedge',headless:true});
  try {
    for(const addon of ['calendar-raster','daily-planner','mail-address-filer']) {
      const {page,base}=await pageFor(browser,addon);
      await page.goto(base+'diagnostics/index.html');
      const report=await run(page);
      assert.equal(summarize(report).counts.failed,0);
      assert(report.checks.some(x=>x.status==='skipped' && x.code==='MANUAL_REQUIRED'));
      assert(!JSON.stringify(report).includes(sentinel));
      assert.equal(await page.evaluate(()=>testSaved().tbDiagnosticsHistory.some(x=>'secret' in x)),false);
      const downloadPromise=page.waitForEvent('download');
      await page.getByRole('button',{name:'Diagnose exportieren',exact:true}).click();
      const download=await downloadPromise;
      const output=path.join(root,'dist','diagnostics-tests',addon+'.json');fs.mkdirSync(path.dirname(output),{recursive:true});
      await download.saveAs(output);
      assert.deepEqual(summarize(JSON.parse(fs.readFileSync(output,'utf8'))),summarize(report));
      if(addon==='calendar-raster') {
        const same=await page.evaluate(async()=>{
          const runner=TbDiagnostics.createRunner({metadata:JSON.parse(document.getElementById('preview').textContent),
            workerUrl:messenger.runtime.getURL('diagnostics/worker.js'),probe:async()=> 'passed'});
          const first=runner.run();const duplicate=runner.run();await first;return first===duplicate;
        });
        assert.equal(same,true,'Concurrent callers share one diagnostic run');
        for(let n=0;n<11;n++) {
          await page.waitForFunction(()=>!document.getElementById('run').disabled);
          await run(page);
        }
        await page.waitForFunction(()=>testSaved().tbDiagnosticsHistory.length===10);
        assert.equal(await page.evaluate(()=>testSaved().tbDiagnosticsHistory.length),10);
      }
      await page.close();
    }
    releaseName='release';
    let {page,base}=await pageFor(browser,'calendar-raster');
    await page.goto(base+'popup/popup.html');
    assert.equal(await page.getByRole('button',{name:'Diagnose',exact:true}).isDisabled(),true);
    await page.goto(base+'diagnostics/index.html');
    await page.getByText('Diagnose deaktiviert:',{exact:false}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Diagnose starten',exact:true}).isDisabled(),true);
    await page.close();
    releaseName='test_browser';
    ({page,base}=await pageFor(browser,'calendar-raster',{broken:true}));
    await page.goto(base+'popup/popup.html');
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Diagnose'&&!b.disabled));
    await page.getByRole('button',{name:'Diagnose',exact:true}).click();
    assert.equal(await page.evaluate(()=>lastOpened),base+'diagnostics/index.html');
    await page.goto(base+'diagnostics/index.html');
    const failed=await run(page);
    assert(failed.checks.some(x=>x.id==='extension-bridge'&&x.status==='failed'));
    assert(!JSON.stringify(failed).includes(sentinel));
    await page.close();
    ({page,base}=await pageFor(browser,'calendar-raster',{hang:true}));
    await page.goto(base+'diagnostics/index.html');
    const timed=await run(page);
    assert(timed.checks.some(x=>x.id==='extension-bridge'&&x.code==='TIMEOUT'));
    assert(timed.checks.some(x=>x.id==='configuration-shape'&&x.code==='NOT_RUN'));
    assert.equal(await page.evaluate(async()=> (await indexedDB.databases()).filter(x=>x.name.startsWith('tb-diagnostics-')).length),0);
    await page.reload();
    await page.getByRole('button',{name:'Diagnose starten',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('extension-bridge'));
    await page.getByRole('button',{name:'Abbrechen',exact:true}).click();
    await page.waitForFunction(()=>!document.getElementById('export').disabled);
    const canceled=JSON.parse(await page.locator('#preview').textContent());
    assert(canceled.checks.some(x=>x.code==='CANCELED'));
    await page.close();
    console.log('PASS: actual diagnosis buttons, three worker runs, JSON download/re-import, privacy sentinels, stable-build disable, failure, timeout termination and cancellation (host APIs simulated).');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
