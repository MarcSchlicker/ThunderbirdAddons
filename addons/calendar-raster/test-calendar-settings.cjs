"use strict";
const {test}=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), vm=require("node:vm"), path=require("node:path");
const read=n=>fs.readFileSync(path.join(__dirname,n),"utf8");
function monthContext() {
  const elements=new Map();
  const element=()=>new Proxy({value:"",dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},addEventListener(){},replaceChildren(){},appendChild(){},append(){},querySelectorAll(){return []}}, {get:(t,k)=>k in t?t[k]:()=>{}});
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},querySelector:element,querySelectorAll:()=>[],createElement:element,body:element(),documentElement:element(),addEventListener(){}};
  const c=vm.createContext({document,URL,URLSearchParams,Date,Intl,console,setTimeout,clearTimeout,window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},messenger:{storage:{onChanged:{addListener(){}}},runtime:{onMessage:{addListener(){}}}}});
  vm.runInContext(read("space/month.js").replace(/\ninit\(\);\s*$/,"\n"),c);return c;
}
test("calendar colour is written to Thunderbird and survives a fresh calendar wrapper",async()=>{
  const properties={color:'#abcdef'}, manager={getCalendarById:()=>calendar()};
  const calendar=()=>({id:'stable',name:'Synthetic',setProperty:(k,v)=>properties[k]=v,getProperty:k=>properties[k],uri:{spec:''}});
  const c=vm.createContext({ChromeUtils:{generateQI:()=>()=>{},importESModule:name=>name.includes('ExtensionCommon')?{ExtensionCommon:{ExtensionAPI:class{},EventManager:class{api(){return {}}}}}:{cal:{manager}}}});
  vm.runInContext(read('api/hourGridBridge/implementation.js'),c);
  const api=new c.hour_grid_bridge().getAPI({}).hourGridBridge;
  const updated=await api.updateCalendar(JSON.stringify({calendarId:'stable',color:'#123456'}));
  assert.equal(updated.color,'#123456');assert.equal(calendar().getProperty('color'),'#123456');
});
test("manager reports a provider overwrite instead of claiming the colour was saved",async()=>{
  const statuses=[],state={calendars:[{id:'stable',color:'#abcdef'}]};
  const c=vm.createContext({state,tb:{storage:{local:{set:async()=>{}}},runtime:{sendMessage:async()=>({color:'#123456'})}},calendarKey:c=>c.id,saveAddonVisibility:async()=>{},setStatus:(el,text,error)=>statuses.push({error}),calendarStatus:{},t:x=>x,loadCalendars:async()=>{},Date});
  const code=read('space/manager.js');vm.runInContext(code.slice(code.indexOf('async function saveCalendar('),code.indexOf('function openRemoveDialog(')),c);
  await c.saveCalendar({id:'stable',source:'thunderbird'},{querySelector:s=>({value:s.includes('name')?'Synthetic':'#123456',checked:true})});
  assert.equal(statuses.at(-1).error,true);
});
test("standard profile draws no personal work-time blocks",()=>{
  const c=monthContext();vm.runInContext(`state.settings.calendarTypes=[normalizeCalendarType({id:'test-person',name:'Synthetic',kind:'person',workCalendarEnabled:true})];
    state.settings.viewProfiles=normalizeViewProfiles([]);state.settings.activeViewProfileId='standard';
    var overlays=0;var tracks=[{dataset:{halfStart:0,halfEnd:1440},appendChild(){overlays++}}];
    appendPersonWorkOverlays(tracks,new Date(2026,9,26));`,c);
  assert.equal(vm.runInContext("overlays",c),0);
});
test("settings expose four collapsible sections and no sidebar diamond",()=>{
  const html=read("space/month.html");
  for(const id of ["settings-people","settings-profiles","advanced-settings","settings-calendar-management"])assert.match(html,new RegExp('<details[^>]*id="'+id+'"'));
  const sidebar=html.slice(html.indexOf('<aside'),html.indexOf('</aside>'));
  assert.ok(!sidebar.includes('id="add-calendar-type"'));
});
