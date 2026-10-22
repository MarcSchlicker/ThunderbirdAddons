'use strict';
(async()=>{
  const api=globalThis.messenger || globalThis.browser;
  const byId=id=>document.getElementById(id);
  let report=null,runner;
  try {
    const info=await (await fetch(api.runtime.getURL('diagnostics/build-info.json'))).json();
    const meta=TbDiagnostics.metadata(api.runtime.getManifest(),info);
    byId('build').textContent=`${meta.app} · ${meta.version} · ${meta.releaseName} · ${meta.build}`;
    if(!TbDiagnostics.enabled(info)) {byId('status').textContent='Diagnose deaktiviert: Nur test_-Pakete sind freigeschaltet.';return;}
    const probe=async id=>{
      if(id==='extension-bridge') {
        if(meta.app==='mail-address-filer') return typeof api.headerLayout?.start==='function'?'passed':'failed';
        if(typeof api.hourGridBridge?.getBridgeStatus!=='function') return 'failed';
        return (await api.hourGridBridge.getBridgeStatus())?.ok===true?'passed':'failed';
      }
      if(id==='configuration-shape') {
        const keys=meta.app==='calendar-raster'?['peoplePanelOpen','peopleSearch']:meta.app==='mail-address-filer'?['routingSettings']:['dailyPlannerState'];
        const config=await api.storage.local.get(keys);
        if(meta.app==='calendar-raster') return (config.peoplePanelOpen===undefined || typeof config.peoplePanelOpen==='boolean') && (config.peopleSearch===undefined || typeof config.peopleSearch==='string')?'passed':'failed';
        const value=config[keys[0]];
        return value===undefined || (value!==null && typeof value==='object' && !Array.isArray(value))?'passed':'failed';
      }
      return 'skipped';
    };
    runner=TbDiagnostics.createRunner({metadata:meta,workerUrl:api.runtime.getURL('diagnostics/worker.js'),probe,
      onProgress:id=>{byId('status').textContent='Prüfung läuft: '+id;}});
    byId('run').disabled=false;
    byId('status').textContent='Bereit. Kalender-/Mail-Schreibtests und echter Geräteabgleich werden nicht automatisch gestartet.';
  } catch {byId('status').textContent='Diagnose nicht verfügbar: BUILD_METADATA_FAILED';return;}
  byId('run').addEventListener('click',async()=>{
    if(byId('run').disabled) return;
    byId('run').disabled=true;byId('cancel').disabled=false;byId('copy').disabled=true;byId('export').disabled=true;
    report=await runner.run();
    const text=JSON.stringify(report,null,2);
    byId('preview').textContent=text;
    const failed=report.checks.filter(x=>x.status==='failed').length;
    const skipped=report.checks.filter(x=>x.status==='skipped').length;
    byId('status').textContent=`Fertig: ${failed} Fehler, ${skipped} übersprungen. Details stehen in der Exportvorschau.`;
    byId('cancel').disabled=true;byId('copy').disabled=false;byId('export').disabled=false;
    // Only diagnostic reports are retained here, never account or calendar values.
    try {
      const key='tbDiagnosticsHistory';
      const previous=(await api.storage.local.get(key))[key];
      const history=Array.isArray(previous)?previous.filter(TbDiagnostics.safeReport).slice(-9):[];
      await api.storage.local.set({[key]:[...history,report]});
    } catch {byId('status').textContent+=' Lokales Speichern fehlgeschlagen: HISTORY_FAILED';}
    finally {byId('run').disabled=false;}
  });
  byId('cancel').addEventListener('click',()=>runner.cancel());
  byId('copy').addEventListener('click',async()=>{
    try {await navigator.clipboard.writeText(JSON.stringify(report,null,2));byId('status').textContent='Protokoll kopiert.';}
    catch {byId('status').textContent='Kopieren nicht verfügbar. Bitte Diagnose exportieren verwenden.';}
  });
  byId('export').addEventListener('click',()=>{
    if(!report) return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`diagnose-${report.app}-${report.runId}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  window.addEventListener('pagehide',()=>runner?.cancel(),{once:true});
})();
