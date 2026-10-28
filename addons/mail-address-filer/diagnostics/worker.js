'use strict';
const pending = new Map();
const ask = id => new Promise(resolve=>{pending.set(id,resolve);postMessage({type:'probe',id});});
const request = value => new Promise((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(new Error('IDB_FAILED'));});
async function storageProbe(name) {
  const opening=indexedDB.open(name,1);
  opening.onupgradeneeded=()=>opening.result.createObjectStore('probe');
  const db=await request(opening);
  try {
    let transaction=db.transaction('probe','readwrite');
    await new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=reject;transaction.objectStore('probe').put('roundtrip','test');});
    transaction=db.transaction('probe','readonly');
    return await request(transaction.objectStore('probe').get('test')) === 'roundtrip';
  } finally {db.close();}
}
async function execute({metadata,database}) {
  const checks = [
    ['build-metadata',()=>metadata.app!=='unknown' && /^test_[A-Za-z0-9._-]{1,64}$/.test(metadata.releaseName)],
    ['extension-bridge',()=>ask('extension-bridge')],
    ['configuration-shape',()=>ask('configuration-shape')],
    ['storage-roundtrip',()=>storageProbe(database)],
    ['domain-smoke',()=>{
      if(metadata.app==='daily-planner') {
        importScripts('../core.js');
        return DailyPlannerCore.shiftDateKey('2028-02-28',1)==='2028-02-29' && DailyPlannerCore.shiftDateKey('2026-12-31',1)==='2027-01-01';
      }
      if(metadata.app==='mail-address-filer') {
        importScripts('../routing.js');
        return MailAddressRouting.normalizeEmail('User <USER@Example.org>')==='user@example.org';
      }
      return 'skipped';
    }],
    ['real-account-exchange',()=> 'skipped'],
  ];
  for(const [id,run] of checks) {
    postMessage({type:'start-check',id});
    const started=performance.now();
    let status='failed',code='CHECK_FAILED';
    try {
      const result=await run();
      if(result===true || result==='passed') {status='passed';code='OK';}
      else if(result==='skipped') {status='skipped';code=id==='real-account-exchange'?'MANUAL_REQUIRED':'NOT_AVAILABLE';}
    } catch { /* Never export arbitrary exception messages or stacks. */ }
    postMessage({type:'result',result:{id,status,code,durationMs:Math.round(performance.now()-started)}});
  }
  postMessage({type:'complete'});
}
onmessage=({data})=>{
  if(data.type==='probe-result') {pending.get(data.id)?.(data.status);pending.delete(data.id);}
  if(data.type==='run') execute(data).catch(()=>postMessage({type:'fatal'}));
};
