"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/api/hourGridBridge/implementation.js','utf8');
const code=source.slice(source.indexOf('async function refreshCalendarsNow('), source.indexOf('// Signal invalidation'));
test('explicit refresh waits for provider completion, reports failures/timeouts and removes observers',async()=>{
  const timers=new Map(), observers=new Map(), called=[];let id=0;
  const calendars=new Map(['ok','error','slow','throws'].map(key=>[key,{name:key,type:'caldav',
    addObserver:o=>observers.set(key,o),removeObserver:o=>{assert.equal(o,observers.get(key));observers.delete(key);},
    refresh(){called.push(key);if(key==='ok')observers.get(key).onLoad();if(key==='error')observers.get(key).onError();if(key==='throws')throw Error('fixture');}
  }]));
  calendars.set('local',{name:'local',type:'storage'});
  const context=vm.createContext({calendarById:key=>calendars.get(key),ChromeUtils:{generateQI:()=>()=>{},importESModule:()=>({
    setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key)
  })}});
  vm.runInContext(code,context);
  const pending=context.refreshCalendarsNow(JSON.stringify(['ok','error','slow','throws','local','missing','ok']));
  assert.equal(observers.size,1,'only unfinished provider remains');
  assert.equal(timers.size,1);
  [...timers.values()][0]();
  const result=JSON.parse(JSON.stringify(await pending));
  assert.equal(result.ok,false);
  assert.deepEqual(Object.fromEntries(result.calendars.map(c=>[c.id,c.status])),{ok:'received',error:'failed',slow:'pending',throws:'failed',local:'local',missing:'missing'});
  assert.equal(observers.size,0);assert.equal(timers.size,0);
  assert.deepEqual(called,['ok','error','slow','throws']);
  assert.equal((await context.refreshCalendarsNow('["ok","local"]')).ok,true);
  await assert.rejects(context.refreshCalendarsNow('{}'),/Kalenderauswahl/);
});
