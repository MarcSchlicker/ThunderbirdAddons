const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.TB_PLANNER_TEST_SOURCE || __dirname+'/../background.js','utf8');
const code=source.slice(source.indexOf('async function syncStateWithModuleBridge('),source.indexOf('function queueModuleBridgeSnapshot('));
function fixture(reply){const sent=[],saved=[];let current={tasks:[],emails:[{id:'mail'}]};
 let startedResolve;const started=new Promise(resolve=>{startedResolve=resolve;});
 const context=vm.createContext({console,MODULE_BRIDGE_MODULE_ID:'planner',MODULE_BRIDGE_CLIENT_ID:'desktop',MODULE_BRIDGE_STATUS_KEY:'status',
loadState:async()=>structuredClone(current),readCalendarData:async()=>[],postModuleBridgeState:async payload=>{sent.push(payload);startedResolve();if(reply instanceof Error)throw reply;return reply;},
saveState:async state=>saved.push(state),tb:{storage:{local:{set:async()=>{}}}}});vm.runInContext(source.slice(source.indexOf('function mergeModuleBridgeTasks('),source.indexOf('async function postModuleBridgeState(')) + source.slice(source.indexOf('function validMobileTask('),source.indexOf('async function pullMobileChanges(')) + source.slice(source.indexOf('function validDueDate('),source.indexOf('function formatDueDate(')) + code,context);return {context,sent,saved,started,setCurrent:value=>{current=value;}};}
test('manual planner sync sends desktop mail references and applies the received phone tasks',async()=>{
 const {context,sent,saved}=fixture({ok:true,state:{tasks:[{id:'phone-task',text:'Phone task',updatedAt:'2026-10-27T12:00:00Z'}]}});const result=await context.syncStateWithModuleBridge({strict:true});assert.equal(result.sent,true);assert.equal(result.received,true);assert.equal(sent[0].state.emails[0].id,'mail');assert.equal(saved[0].tasks[0].id,'phone-task');
});
test('manual planner sync exposes missing, malformed and failed Hub responses',async()=>{
 for(const reply of [null,{}, {ok:false},new Error('offline')]) {const {context}=fixture(reply);await assert.rejects(context.syncStateWithModuleBridge({strict:true}));}
});

test('a delayed Hub reply cannot overwrite mail added or removed during the request',async()=>{
 for(const emails of [[{id:'new-mail'}],[]]) {
  let release;const response=new Promise(resolve=>{release=resolve;});
  const {context,saved,started,setCurrent}=fixture(response);
  const pending=context.syncStateWithModuleBridge({strict:true});await started;
  setCurrent({tasks:[{id:'edited-locally',text:'Edited on desktop',updatedAt:'2026-10-27T14:00:00Z'}],emails,settings:{showCompleted:false},deletedTasks:[{id:'removed-task',deletedAt:'2026-10-27T15:00:00Z'}]});
  release({ok:true,state:{tasks:[{id:'phone-task',text:'Phone task',updatedAt:'2026-10-27T12:00:00Z'}, {id:'edited-locally',text:'Old remote text',updatedAt:'2026-10-27T11:00:00Z'}, {id:'removed-task',text:'Old remote task',updatedAt:'2026-10-27T12:00:00Z'}]}});await pending;
  assert.deepEqual(saved[0].emails,emails,'The current desktop mail list must survive');
  assert.equal(saved[0].settings.showCompleted,false);
  assert.equal(saved[0].tasks.find(task=>task.id==='edited-locally').text,'Edited on desktop');
  assert.equal(saved[0].tasks.some(task=>task.id==='removed-task'),false);
  assert.equal(saved[0].tasks.some(task=>task.id==='phone-task'),true);
 }
});
