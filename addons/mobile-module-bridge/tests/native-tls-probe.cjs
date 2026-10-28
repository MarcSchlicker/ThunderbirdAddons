const fs=require('node:fs'),tls=require('node:tls'),crypto=require('node:crypto');
const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
function exchange(expected,version="TLSv1.3"){return new Promise((resolve,reject)=>{
 const socket=tls.connect({host:'127.0.0.1',port:fixture.tlsPort,rejectUnauthorized:false,minVersion:version,maxVersion:version},()=>{
  const pin=crypto.createHash('sha256').update(socket.getPeerCertificate().raw).digest('hex');
  if(pin!==expected){socket.destroy();reject(new Error('pin mismatch'));return;}
  socket.write('GET /v1/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
 });let body='';socket.on('data',b=>{body+=b;const h=body.indexOf('\r\n\r\n');if(h>=0){const n=Number(/Content-Length: (\d+)/i.exec(body.slice(0,h))?.[1]);if(n&&Buffer.byteLength(body.slice(h+4))>=n){resolve({protocol:socket.getProtocol(),status:body.split('\r\n')[0],body});socket.end();}}});socket.on('error',reject);socket.setTimeout(10000,()=>socket.destroy(new Error('timeout')));
});}
(async()=>{const legacy=await exchange(fixture.tlsFingerprint,"TLSv1.2");const ok=await exchange(fixture.tlsFingerprint);if(!ok.body.includes('synthetic-workspace'))throw Error('unexpected health result');let rejected=false;try{await exchange('0'.repeat(64));}catch(e){rejected=/pin mismatch/.test(e.message);}if(!rejected)throw Error('Wrong pin accepted');const report={synthetic:true,nativeThunderbirdTls:true,versions:[legacy.protocol,ok.protocol],status:ok.status,wrongPinRejected:rejected};fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));console.log(JSON.stringify(report));})().catch(e=>{console.error(e.message);process.exitCode=1});
