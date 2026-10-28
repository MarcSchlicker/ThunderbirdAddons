"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),https=require("node:https"),http=require("node:http"),crypto=require("node:crypto"),path=require("node:path");
const forgeScope={crypto:crypto.webcrypto,Uint8Array,ArrayBuffer,console,setTimeout,clearTimeout};
forgeScope.window=forgeScope;forgeScope.self=forgeScope;vm.createContext(forgeScope);
vm.runInContext(fs.readFileSync(path.join(__dirname,"../vendor/forge.min.js"),"utf8"),forgeScope);
const forge=forgeScope.forge;
const context=vm.createContext({Uint8Array,Date});
vm.runInContext(fs.readFileSync(path.join(__dirname,"../api/moduleBridge/tls.js"),"utf8"),context);
let identityPromise;
const identity=()=>identityPromise??=context.TBHubTLS.createIdentity(crypto.webcrypto,forge);

test("per-profile TLS identity uses a unique secure key, self-signed leaf and SHA256 pin",async()=>{
 const value=await identity();
 const pfx=forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(value.p12).getBytes()),value.password);
 const cert=pfx.getBags({bagType:forge.pki.oids.certBag})[forge.pki.oids.certBag][0].cert;
 const parsed=new crypto.X509Certificate(forge.pki.certificateToPem(cert));
 assert.equal(parsed.ca,false);assert.equal(parsed.publicKey.asymmetricKeyDetails.modulusLength,3072);
 assert.equal(parsed.verify(parsed.publicKey),true);
 assert.equal(parsed.fingerprint256.replaceAll(":","").toLowerCase(),value.fingerprint);
 assert(!JSON.stringify({fingerprint:value.fingerprint}).includes(value.password));
 const second=await context.TBHubTLS.createIdentity(crypto.webcrypto,forge);
 assert.notEqual(second.fingerprint,value.fingerprint);assert.notEqual(second.password,value.password);
});

test("real TLS accepts the exact pinned identity and refuses a different peer",async()=>{
 const value=await identity();
 const server=https.createServer({pfx:Buffer.from(value.p12),passphrase:value.password,minVersion:"TLSv1.2"},(req,res)=>res.end("synthetic-data"));
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try {
  const request=pin=>new Promise((resolve,reject)=>{
   const req=https.get({host:"127.0.0.1",port:server.address().port,rejectUnauthorized:false,agent:false},res=>{let body="";res.on("data",b=>body+=b);res.on("end",()=>resolve(body));});
   // This test trusts exactly the negotiated certificate, like the mobile pin verifier.
   req.on("socket",socket=>socket.on("secureConnect",()=>{
    const fingerprint=crypto.createHash("sha256").update(socket.getPeerCertificate().raw).digest("hex");
    if(fingerprint!==pin)req.destroy(new Error("pin mismatch"));
   }));req.on("error",reject);
  });
  assert.equal(await request(value.fingerprint),"synthetic-data");
  await assert.rejects(request("0".repeat(64)),/pin mismatch/);
  await assert.rejects(new Promise((resolve,reject)=>{const req=http.get({host:"127.0.0.1",port:server.address().port},resolve);req.on("error",reject);}),/socket hang up|reset/i);
 } finally {await new Promise(resolve=>server.close(resolve));}
});

function nativeServer(waitForIdentity=async()=>{}) {
 const calls=[];let listening=0;
 const socket=()=>({port:47832,init:(port,loopback)=>calls.push({port,loopback}),asyncListen:()=>listening++,setVersionRange:(min,max)=>calls.push({min,max}),setRequestClientCertificate(){},close(){calls.push({closed:true});}});
 const scope={URL,console,Date,IOUtils:{},PathUtils:{},crypto:crypto.webcrypto,
  ChromeUtils:{generateQI:()=>()=>{},importESModule:name=>name.includes("ExtensionCommon")?{ExtensionCommon:{ExtensionAPI:class{}}}:{ExtensionParent:{},ExtensionStorage:{},ExtensionStorageIDB:{}}},
  Services:{scriptloader:{loadSubScript:(_url,target)=>target.TBHubTLS={ensure:async()=>{await waitForIdentity();return {certificate:{synthetic:true},fingerprint:"a".repeat(64)};}}},obs:{addObserver(){},removeObserver(){}}},
  Cc:new Proxy({}, {get:()=>({createInstance:socket})}),Ci:{nsIServerSocket:{},nsITLSServerSocket:{REQUEST_NEVER:0}}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(__dirname,"../api/moduleBridge/implementation.js"),"utf8"),scope);
 const server=vm.runInContext('new ModuleBridgeServer(47832,"workspace","token",{getURL:x=>x})',scope);
 server.listAddresses=async()=>[];return {server,calls,get listening(){return listening;}};
}

test("native server binds plaintext to loopback and serializes TLS startup",async()=>{
 const fixture=nativeServer(),{server,calls}=fixture;
 await Promise.all([server.start(),server.start()]);
 assert.equal(fixture.listening,2);assert.equal(calls[0].loopback,true);assert.equal(calls[1].loopback,false);
 assert(calls.some(x=>x.min===0x0303&&x.max===0x0304));
 assert.equal(server.status().transportSecurity,"tls-pinned");assert.equal(server.status().tlsFingerprint,"a".repeat(64));
});

test("stopping during certificate creation cannot reopen a network listener",async()=>{
 let release,entered;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);
 const fixture=nativeServer(async()=>{entered();await gate;});
 const pending=fixture.server.start();await ready;fixture.server.stop();release();await pending;
 assert.equal(fixture.listening,1);assert.equal(fixture.server.tlsSocket,null);
});
