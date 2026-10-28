const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
async function run() {
  let saved = {}, opened = [], fail = false;
  const context = vm.createContext({URL, btoa, crypto:webcrypto,
    setInterval:()=>1, clearInterval(){},
    messenger:{runtime:{getURL:x=>x},
      tabs:{create(){throw new Error('Login must not use an embedded tab');}},
      windows:{openDefaultBrowser:async url=>{if(fail)throw new Error('launch failed');opened.push(url);}},
      storage:{local:{get:async()=>structuredClone(saved),set:async value=>{saved=structuredClone(value);}}}},
  });
  const source=fs.readFileSync(path.join(__dirname,'../background.js'),'utf8');
  vm.runInContext(source.slice(0,source.indexOf('tb.browserAction.onClicked')),context);
  vm.runInContext(`nextcloudFetch = async()=>({ok:true,json:async()=>({
    login:'https://cloud.test/login/v2/flow/fixture',
    poll:{endpoint:'https://cloud.test/login/v2/poll',token:'fixture-token'}
  })});`,context);
  await vm.runInContext("startNextcloudBrowserLogin({serverUrl:'https://cloud.test'})",context);
  assert.deepEqual(opened,['https://cloud.test/login/v2/flow/fixture']);
  assert.equal(saved.moduleBridgeState.nextcloudLogin.pollToken,'fixture-token');
  vm.runInContext('nextcloudFetch=async()=>({ok:false,status:404});',context);
  assert.equal((await vm.runInContext('pollPendingNextcloudLogin()',context)).pending,true);
  vm.runInContext(`
    var credentialWrites = 0, syncRuns = 0;
    bridge = () => ({saveNextcloudCredential:async(server,user,password)=>{
      if(server !== 'https://cloud.test' || user !== 'fixture-user' || password !== 'fixture-password')
        throw new Error('Unexpected credential routing');
      credentialWrites++; return {ok:true};
    }});
    synchronizeNextcloud = async()=>{syncRuns++; return {ok:true};};
    nextcloudFetch = async()=>({ok:true,status:200,json:async()=>({
      server:'https://cloud.test',loginName:'fixture-user',appPassword:'fixture-password'
    })});
  `,context);
  const completed=await vm.runInContext('pollPendingNextcloudLogin()',context);
  assert.equal(completed.completed,true);
  assert.equal(saved.moduleBridgeState.nextcloud.username,'fixture-user');
  assert.equal(saved.moduleBridgeState.nextcloudLogin,null);
  assert.equal(vm.runInContext('credentialWrites',context),1);
  assert.equal(vm.runInContext('syncRuns',context),1);
  assert(!JSON.stringify(saved).includes('fixture-password'),'Password stays out of ordinary extension storage');
  await vm.runInContext('cancelNextcloudBrowserLogin()',context);
  assert.equal(saved.moduleBridgeState.nextcloudLogin,null);
  vm.runInContext(`nextcloudFetch = async()=>({ok:true,json:async()=>({
    login:'https://cloud.test/login/v2/flow/fixture',
    poll:{endpoint:'https://cloud.test/login/v2/poll',token:'fixture-token'}
  })});`,context);
  // Late responses from an obsolete flow must never activate it or damage
  // the replacement login, even though the request itself already started.
  for (const replacement of [null, 'new-token']) {
    await vm.runInContext(`updateState({nextcloud:null,nextcloudLogin:{
      serverUrl:'https://cloud.test',appFolder:'Thunderbird',
      pollEndpoint:'https://cloud.test/login/v2/poll',pollToken:'old-token',
      startedAt:new Date().toISOString(),lastError:null
    }})`,context);
    let release, started;
    const reached=new Promise(resolve=>{started=resolve;});
    context.delayedPoll=()=>{started();return new Promise(resolve=>{release=resolve;});};
    vm.runInContext('nextcloudFetch=delayedPoll',context);
    const pending=vm.runInContext('pollPendingNextcloudLogin()',context);
    await reached;
    await vm.runInContext('cancelNextcloudBrowserLogin()',context);
    if(replacement) await vm.runInContext(`updateState({nextcloudLogin:{
      serverUrl:'https://cloud.test',appFolder:'Thunderbird',
      pollEndpoint:'https://cloud.test/login/v2/poll',pollToken:'new-token',
      startedAt:new Date().toISOString(),lastError:null
    }})`,context);
    release({ok:true,status:200,json:async()=>({server:'https://cloud.test',
      loginName:'fixture-user',appPassword:'fixture-password'})});
    await pending;
    assert.equal(saved.moduleBridgeState.nextcloud,null,'Late approval cannot activate a cancelled login');
    assert.equal(saved.moduleBridgeState.nextcloudLogin?.pollToken || null,replacement);
    assert.equal(vm.runInContext('credentialWrites',context),1,'Obsolete response never reaches the credential writer');
    assert.equal(vm.runInContext('syncRuns',context),1,'Obsolete response cannot start synchronization');
  }
  vm.runInContext(`nextcloudFetch = async()=>({ok:true,json:async()=>({
    login:'https://cloud.test/login/v2/flow/fixture',
    poll:{endpoint:'https://cloud.test/login/v2/poll',token:'fixture-token'}
  })});`,context);
  fail=true;
  await assert.rejects(vm.runInContext("startNextcloudBrowserLogin({serverUrl:'https://cloud.test'})",context),/Standardbrowser/);
  assert.equal(saved.moduleBridgeState.nextcloudLogin,null,'Failed browser launch must not leave a pending login');
  console.log('PASS: system browser login, pending/completed approval, credential routing, sync start and launch failure cleanup');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
