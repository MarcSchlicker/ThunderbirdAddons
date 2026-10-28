const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../background.js','utf8');
const code=source.slice(source.indexOf('function mobileRevisionConfirmed('),source.indexOf('async function syncDesktopAdapters('));
const revisions={'de.tbconnect.modules.daily-planner':{updatedAt:'2026-10-27T12:00:00Z'},'de.tbconnect.modules.calendar':{updatedAt:'2026-10-27T12:01:00Z'}};
function fixture({phone=true,ack=true,calendar=true,storage=true}={}) {
  const calls=[];let time=0;let polls=0;
  const receipts=Object.fromEntries(Object.entries(revisions).map(([id,x])=>[id,{confirmedAt:'2026-10-27T12:02:00Z',confirmedUpdatedAt:x.updatedAt}]));
  const status=()=>({running:true,peers:phone?[{kind:'mobile',moduleReceipts:ack&&++polls>2?receipts:{}}]:[]});
  class Clock extends Date {static now(){return time;}}
  const context=vm.createContext({Date:Clock,statePushQueue:Promise.resolve(),setTimeout:fn=>{time+=1000;fn();},
    bridge:()=>({getStatus:async()=>status(),getStates:async()=>JSON.stringify(revisions)}),
    persistIncomingStates:async options=>{assert.equal(options.strict,true);calls.push('storage');if(!storage)throw Error('fixture');},
    tb:{runtime:{sendMessage:async(id,msg)=>{calls.push(msg.type);return msg.type==='syncCalendarProviders'?{ok:calendar,calendars:[{name:'Synthetic calendar',status:calendar?'received':'failed'}]}:{sent:true,received:true};}}}
  });vm.runInContext(code,context);return {context,calls};
}
test('desktop sync sends planner, refreshes calendars and waits for actual phone revision receipts',async()=>{
 const {context,calls}=fixture();const result=await context.manualDesktopSync();assert.equal(result.complete,true);assert.equal(result.pending,false);assert.deepEqual(calls,['syncCalendarProviders','forceModuleSync','storage','forceModuleSync']);
});
test('offline or unconfirmed phone never reports complete',async()=>{
 for(const options of [{phone:false},{ack:false}]) {const {context}=fixture(options);const result=await context.manualDesktopSync();assert.equal(result.complete,false);assert.equal(result.pending,true);}
});
test('provider and snapshot errors are partial even with phone acknowledgement',async()=>{
 for(const options of [{calendar:false},{storage:false}]) {const {context}=fixture(options);const result=await context.manualDesktopSync();assert.equal(result.complete,false);assert.equal(result.pending,false);assert(result.parts.some(p=>!p.ok));}
});
test('requesting add-on is skipped initially and receives one narrow final reply',async()=>{
 const {context,calls}=fixture();await context.manualDesktopSync({skipCalendarRefresh:true,skipPlanner:true});assert.deepEqual(calls,['storage','forceModuleSync']);
});

test('phone data arriving while waiting is explicitly read back into the desktop before completion',async()=>{
 const {context}=fixture();let phoneData=false,desktopHasPhoneData=false,polls=0;
 context.tb.runtime.sendMessage=async(id,message)=>{
  if(message.type==='forceModuleSync')desktopHasPhoneData=phoneData;
  return message.type==='syncCalendarProviders'?{ok:true,calendars:[]}:{sent:true,received:true};
 };
 const receipts=Object.fromEntries(Object.entries(revisions).map(([id,x])=>[id,{confirmedAt:'2026-10-27T12:02:00Z',confirmedUpdatedAt:x.updatedAt}]));
 context.bridge=()=>({getStates:async()=>JSON.stringify(revisions),getStatus:async()=>{
   if(++polls>=3)phoneData=true;
   return {running:true,peers:[{kind:'mobile',moduleReceipts:phoneData?receipts:{}}]};
 }});
 const result=await context.manualDesktopSync();assert.equal(result.complete,true);
 assert.equal(desktopHasPhoneData,true,'Phone acknowledgement alone is not a desktop receive');
});

test('a failed final desktop receive cannot be reported as complete',async()=>{
 const {context}=fixture();let requests=0;
 context.tb.runtime.sendMessage=async(id,message)=>{
  if(message.type==='forceModuleSync' && ++requests>1)throw Error('synthetic final receive failure');
  return message.type==='syncCalendarProviders'?{ok:true,calendars:[]}:{sent:true,received:true};
 };
 const result=await context.manualDesktopSync();assert.equal(result.complete,false);assert.equal(result.pending,false);
 assert.equal(result.parts.find(p=>p.name==='Empfang am Desktop').ok,false);
});
