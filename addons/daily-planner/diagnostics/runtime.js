'use strict';
(function(root) {
  const apps = {'hour-grid-month-view@example.local':'calendar-raster','daily-planner@example.local':'daily-planner','mail-address-filer@example.local':'mail-address-filer'};
  const enabled = info => typeof info?.releaseName === 'string' && /^test_[A-Za-z0-9._-]{1,64}$/.test(info.releaseName);
  function safeReport(report) {
    const fields=['schemaVersion','runId','startedAt','finishedAt','app','version','releaseName','build','platform','trigger','checks'];
    const ids=['build-metadata','extension-bridge','configuration-shape','storage-roundtrip','domain-smoke','real-account-exchange','probe-cleanup','run-control'];
    const codes=['OK','NOT_RUN','CHECK_FAILED','TIMEOUT','CANCELED','NOT_AVAILABLE','MANUAL_REQUIRED','CLEANUP_FAILED','WORKER_FAILED'];
    const timestamp=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value);
    return report?.schemaVersion===1 && Object.keys(report).every(key=>fields.includes(key)) &&
      /^[a-f0-9-]{36}$/.test(report.runId) && timestamp(report.startedAt) && timestamp(report.finishedAt) &&
      Object.values(apps).includes(report.app) && /^[0-9][A-Za-z0-9.+_-]{0,63}$/.test(report.version) &&
      enabled(report) && /^[A-Za-z0-9._-]{1,64}$/.test(report.build) && report.platform==='Thunderbird' &&
      report.trigger==='button' && Array.isArray(report.checks) && report.checks.length<=10 && report.checks.every(check=>
        Object.keys(check).every(key=>['id','status','code','durationMs'].includes(key)) && ids.includes(check.id) &&
        ['passed','failed','skipped'].includes(check.status) && codes.includes(check.code) &&
        Number.isInteger(check.durationMs) && check.durationMs>=0 && check.durationMs<=60000);
  }
  function metadata(manifest, info) {
    return {app:apps[manifest.id || manifest.browser_specific_settings?.gecko?.id] || 'unknown',
      version:/^[0-9][A-Za-z0-9.+_-]{0,63}$/.test(manifest.version) ? manifest.version : 'unknown',
      releaseName:enabled(info) ? info.releaseName : 'release',
      build:/^[A-Za-z0-9._-]{1,64}$/.test(info?.build) ? info.build : 'source', platform:'Thunderbird'};
  }
  function createRunner({metadata:meta, workerUrl, probe, onProgress = () => {}, timeoutMs = 5000}) {
    let active = null;
    return {run() {
      if(active) return active.promise;
      const database = 'tb-diagnostics-' + crypto.randomUUID();
      const worker = new Worker(workerUrl);
      const checkIds=['build-metadata','extension-bridge','configuration-shape','storage-roundtrip','domain-smoke','real-account-exchange'];
      const report = {schemaVersion:1,runId:crypto.randomUUID(),startedAt:new Date().toISOString(),...meta,trigger:'button',checks:checkIds.map(id=>({id,status:'skipped',code:'NOT_RUN',durationMs:0}))};
      let currentId=null;
      let timer, finished = false, resolve;
      const promise = new Promise(done => {resolve=done;});
      active = {promise, cancel:() => finish('CANCELED')};
      function finish(code) {
        if(finished) return;
        finished=true; clearTimeout(timer); worker.terminate();
        if(code && currentId) report.checks[checkIds.indexOf(currentId)]={id:currentId,status:code==='CANCELED'?'skipped':'failed',code,durationMs:0};
        // Terminating the worker closes its IndexedDB connection. Only this run's
        // isolated database is deleted; no extension settings are written.
        const cleanup = indexedDB.deleteDatabase(database);
        let cleaned = false;
        const complete = result => {
          if(cleaned) return; cleaned=true;
          report.checks.push({id:'probe-cleanup',status:result ? 'passed':'failed',code:result ? 'OK':'CLEANUP_FAILED',durationMs:0});
          if(code) report.checks.push({id:'run-control',status:code === 'CANCELED' ? 'skipped':'failed',code,durationMs:0});
          report.finishedAt=new Date().toISOString(); active=null; resolve(report);
        };
        const cleanupTimer=setTimeout(()=>complete(false),2000);
        const done=ok=>{clearTimeout(cleanupTimer);complete(ok);};
        cleanup.onsuccess=()=>done(true); cleanup.onerror=()=>done(false); cleanup.onblocked=()=>done(false);
      }
      worker.onmessage = async ({data}) => {
        if(finished) return;
        if(data.type==='start-check') {
          clearTimeout(timer); currentId=data.id;
          timer=setTimeout(()=>finish('TIMEOUT'),timeoutMs);
          onProgress(data.id);
        } else if(data.type==='result') {
          clearTimeout(timer); currentId=null; report.checks[checkIds.indexOf(data.result.id)]=data.result;
        } else if(data.type==='probe') {
          // These host adapters only read settings/API readiness. A late reply
          // after worker termination is discarded and cannot change user data.
          let status='failed';
          try { status=await probe(data.id); } catch { /* fixed error codes only */ }
          if(!finished) worker.postMessage({type:'probe-result',id:data.id,status});
        } else if(data.type==='complete') finish();
        else if(data.type==='fatal') finish('WORKER_FAILED');
      };
      worker.onerror=()=>finish('WORKER_FAILED');
      worker.postMessage({type:'run',metadata:meta,database});
      return promise;
    }, cancel() {active?.cancel();}};
  }
  root.TbDiagnostics = {enabled,metadata,createRunner,safeReport};
})(globalThis);
