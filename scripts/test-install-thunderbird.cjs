"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {localEndpoint, packagePath, createClient} = require('./install-thunderbird.cjs');
test('Only numeric loopback endpoint; no remote, userinfo, path or redirect target', () => {
  assert.equal(localEndpoint('http://127.0.0.1:47899'),'http://127.0.0.1:47899');
  for (const value of ['https://example.com','http://localhost:1234','http://127.0.0.1:1234/path',
    'http://user@127.0.0.1:1234','http://127.0.0.1:99999']) assert.throws(()=>localEndpoint(value));
});
test('Project containment, disconnected helper, queue and confirmed terminal states', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'tb-install-client-'));
  try {
    const file = path.join(root,'test.xpi'); await fs.writeFile(file,'fixture');
    await assert.rejects(packagePath(__filename,root),/Projektordner/);
    let connected=false, jobs=[], posts=0;
    const client=createClient('http://127.0.0.1:47899',{root,fetchImpl:async(url,options)=>{
      assert.equal(options.redirect,'error');
      if(url.endsWith('/api/health')) return Response.json({app:'projektpilot'});
      if(url.endsWith('/state')) return Response.json({connected,jobs});
      posts++; assert.equal(JSON.parse(options.body).path,await fs.realpath(file));
      jobs=[{id:'fixture',kind:'XPI',status:'queued',version:'1.0'}];
      return Response.json(jobs[0]);
    }});
    await assert.rejects(client.install(file),/nicht verbunden/); assert.equal(posts,0);
    connected=true;
    assert.equal((await client.install(file)).status,'queued');
    await assert.rejects(client.install(file),/bereits/); assert.equal(posts,1);
    assert.equal((await client.wait('fixture',0)).waiting,true);
    for(const status of ['installed','failed','cancelled']) {
      jobs[0].status=status; assert.equal((await client.wait('fixture',0)).status,status);
    }
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('Wrong service and failed requests cannot claim installation',async()=>{
  const wrong=createClient('http://127.0.0.1:47899',{fetchImpl:async()=>Response.json({app:'other'})});
  await assert.rejects(wrong.status(),/kein Projektpilot/);
  const bad=createClient('http://127.0.0.1:47899',{fetchImpl:async()=>Response.json({error:'denied'},{status:403})});
  await assert.rejects(bad.status(),/denied/);
});
