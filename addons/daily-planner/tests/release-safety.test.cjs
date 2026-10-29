"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),vm=require("node:vm"),{spawnSync}=require("node:child_process");
const native=fs.readFileSync(path.join(__dirname,"../api/hourGridBridge/implementation.js"),"utf8");
const background=fs.readFileSync(path.join(__dirname,"../background.js"),"utf8");
function nativeMethod(prototype,signature,next,context){
 const start=native.indexOf(signature,native.indexOf(prototype));const end=native.indexOf(next,start);
 assert.ok(start>=0&&end>start);return vm.runInNewContext("({"+native.slice(start,end).replace(/,\s*$/,"")+"})",context);
}
test("legacy planner TCP is loopback only and never advertises pairing over UDP",async()=>{
 const binds=[];let discovery=0,enumerations=0;
 const socket={port:47830,init:(...args)=>binds.push(args),asyncListen:()=>{}};
 const method=nativeMethod("MobileSyncServer.prototype =","async start() {","\n  stop()",{
  Cc:{"@mozilla.org/network/server-socket;1":{createInstance:()=>socket}},Ci:{nsIServerSocket:{}},
  mobileSyncAddresses:async()=>{enumerations++;return ["192.168.1.25"];},serializedError:String,
 });
 const target={port:47830,discovery:{start:()=>{discovery++;}},status:()=>({})};
 await method.start.call(target);
 assert.equal(binds[0][1],true,"No unencrypted TCP listener on LAN");
 assert.equal(discovery,0,"No legacy pairing broadcast");assert.equal(enumerations,0);
 assert.deepEqual(Array.from(target.addresses),["127.0.0.1"]);
});
test("legacy discovery socket cannot expose pairing secrets on the LAN",()=>{
 const binds=[];const socket={port:47831,init:(...args)=>binds.push(args),asyncListen:()=>{}};
 const method=nativeMethod("MobileDiscoveryServer.prototype =","start() {","\n  stop()",{
  Cc:{"@mozilla.org/network/udp-socket;1":{createInstance:()=>socket}},Ci:{nsIUDPSocket:{}},
  Services:{scriptSecurityManager:{getSystemPrincipal:()=>({})}},
 });method.start.call({port:47831});assert.equal(binds[0][1],true);
});
test("legacy pairing APIs reject before reading or rotating credentials",async()=>{
 let reads=0,writes=0,starts=0;
 const context=vm.createContext({newMobileToken:()=>{writes++;return "synthetic";},mobilePairing:async()=>{reads++;return {token:"synthetic"};},
  mobileBridge:()=>{starts++;throw Error("Unexpected native call");},
  tb:{storage:{local:{set:async()=>{writes++;}}}},MOBILE_SYNC_PORT:47830,mobileSyncStarted:false,
  errorText:error=>error.message,isPrivateMobileAddress:()=>true});
 const segments=[["async function startMobilePairing()","async function publishMobileSnapshot()"],
 ["async function mobileSyncStatus()","async function updateState("]];
 for(const [a,b] of segments){const start=background.indexOf(a),end=background.indexOf(b,start);assert.ok(start>=0&&end>start);vm.runInContext(background.slice(start,end),context);}
 for(const name of ["startMobilePairing","ensureMobileSync","mobilePairingCode","rotateMobilePairing"]){
  await assert.rejects(context[name]("192.168.1.25"),/Modul-Hub/);
 }
 const status=await context.mobileSyncStatus();assert.equal(status.requiresModuleHub,true);assert.equal(status.running,false);
 assert.equal(reads,0);assert.equal(writes,0);assert.equal(starts,0);
});
test("built normal planner XPI contains each entry once",{skip:process.platform!=="win32"},()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"tb-planner-release-test-"));const output=path.join(directory,"planner.xpi");
 try{
  const build=spawnSync("pwsh",["-NoProfile","-File",path.resolve(__dirname,"../build-xpi.ps1"),"-OutputPath",output],{encoding:"utf8"});
  assert.equal(build.status,0,build.stderr||build.stdout);
  const listing=spawnSync("tar.exe",["-tf",output],{encoding:"utf8"});assert.equal(listing.status,0,listing.stderr);
  const names=listing.stdout.trim().split(/\r?\n/);assert.equal(new Set(names).size,names.length,"Duplicate archive paths are rejected by the marketplace");
 }finally{
  assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert.match(path.basename(directory),/^tb-planner-release-test-/);
  fs.rmSync(directory,{recursive:true,force:true});
 }
});

test("connection dialog points to the TLS Hub without starting old pairing",async()=>{
 const ui=fs.readFileSync(path.join(__dirname,"../planner/app.js"),"utf8");
 const from=ui.indexOf("async function openMobileSync() {"),to=ui.indexOf("function closeMobileSync()",from);
 let refreshes=0;const nodes={"#mobile-advanced-pairing":{hidden:false},"#restart-mobile-pairing":{hidden:false},"#mobile-sync-dialog":{open:false,showModal(){this.open=true;}}};
 const context=vm.createContext({$:key=>nodes[key],refreshMobileSyncStatus:async()=>{refreshes++;},send:async()=>{throw Error("Unexpected legacy pairing request");}});
 vm.runInContext(ui.slice(from,to),context);await context.openMobileSync();
 assert.equal(refreshes,1);assert.equal(nodes["#mobile-sync-dialog"].open,true);
 assert.equal(nodes["#mobile-advanced-pairing"].hidden,true);assert.equal(nodes["#restart-mobile-pairing"].hidden,true);
});
