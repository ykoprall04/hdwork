const test=require('node:test'),assert=require('node:assert/strict');
const {createReporter,inspect,presentation}=require('../src/system/command-readiness');
const commands=()=>Object.fromEntries(['order','req','config_psb','mo'].map(k=>[k,{enabled:true,version:0}]));
const pool={execute:async()=>[[{bot_id:'sandbox',expires_ms:999999}]]};

test('new Web + old Courier: unsupported never presents stored OFF as effective',async()=>{
 const saved=commands();saved.order={enabled:false,version:1};
 const status=await inspect(pool,{now:()=>100,fetchStatus:async()=>{throw Error('legacy 404');}});
 const view=presentation(saved,status);assert.equal(view.capability.ready,false);assert.equal(view.effective.order.state,'UNAVAILABLE');assert.equal(view.effective.order.enabled,null);
});
test('capability is bound to one active bot, current worker lease and fresh applied settings',async()=>{
 let now=100,live=true;
 const reporter=createReporter({botId:'sandbox',now:()=>now,runtime:{assertWorker:async w=>{if(!live||w?.id!=='fixture')throw Error('stale');}}});
 assert.equal((await reporter.status()).ready,false);
 await assert.rejects(reporter.applied({protocol:'global-commands-v1',commands:commands(),worker:{id:'old'}}));
 await reporter.applied({protocol:'global-commands-v1',commands:commands(),worker:{id:'fixture',lease_token:'never-return'}});
 assert.equal((await reporter.status()).ready,true);assert.doesNotMatch(JSON.stringify(await reporter.status()),/never-return|lease_token/);
 const saved=commands();saved.order={enabled:false,version:1};
 let status=await inspect(pool,{now:()=>now,fetchStatus:()=>reporter.status()});
 assert.equal(presentation(saved,status).effective.order.state,'PENDING');
 await reporter.applied({protocol:'global-commands-v1',commands:saved,worker:{id:'fixture'}});
 status=await inspect(pool,{now:()=>now,fetchStatus:()=>reporter.status()});
 assert.deepEqual(presentation(saved,status).effective.order,{state:'EFFECTIVE',enabled:false,version:1});
 now+=6001;assert.equal((await reporter.status()).ready,false);
 now=100;live=false;assert.equal((await reporter.status()).ready,false);
});
test('multiple, expired, wrong bot or failed status all refuse effective confirmation',async()=>{
 for(const workers of [[],[{bot_id:'sandbox',expires_ms:1}],[{bot_id:'sandbox',expires_ms:999999},{bot_id:'other',expires_ms:999999}]])assert.equal((await inspect({execute:async()=>[workers]},{now:()=>100,fetchStatus:async()=>assert.fail()})).ready,false);
 assert.equal((await inspect(pool,{now:()=>100,fetchStatus:async()=>({protocol:'global-commands-v1',botId:'other',ready:true,commands:commands()})})).ready,false);
});
test('new Web rejects OFF before mutation with old/unready Courier; ON remains available',async()=>{
 const {createSystem}=require('../src/system/store');let connections=0;
 const service=createSystem({readPool:pool,writePool:{getConnection:async()=>{connections++;throw Error('fixture');}},commandReadiness:async()=>({supported:false,ready:false})});
 const user={id:1,role:'SUPER_ADMIN',sessionToken:'fixture'};
 await assert.rejects(service.saveCommandSettings(user,{command:'order',enabled:false,version:0,requestId:require('node:crypto').randomUUID()}),{statusCode:409});assert.equal(connections,0);
 await assert.rejects(service.saveCommandSettings(user,{command:'order',enabled:true,version:0,requestId:require('node:crypto').randomUUID()}),/fixture/);assert.equal(connections,1);
});
test('old Web routes + new Courier protocol stay independent, signed cache report confirms effective state',async()=>{
 const http=require('node:http'),express=require('express'),crypto=require('node:crypto'),vm=require('node:vm');
 const h={auth(req,_res,next){req.user={id:1,role:'SUPER_ADMIN'};next();},error(res,e){res.status(e.statusCode||503).end();}};
 const oldSource=require('./helpers/global-command-baseline.cjs').source('legacy-routes.js'),module={exports:{}};
 vm.runInNewContext(oldSource,{module,require:name=>name==='../access/http'?h:name==='./policy'?require('../src/system/policy'):require(name)});
 const oldWeb=express();oldWeb.use(module.exports.createRoutes({system:{status:async()=>({components:{}})},http:h,enabled:()=>true}));
 const web=http.createServer(oldWeb);await new Promise(r=>web.listen(0,'127.0.0.1',r));
 const botId='sandbox',key='k'.repeat(32),saved=commands();saved.order={enabled:false,version:1};
 const runtime={reserveNonce:async()=>{},assertWorker:async w=>{if(w?.id!=='fixture')throw Object.assign(Error(),{statusCode:409});}};
 const app=require('../src/courier/integration-app').createIntegrationApp({store:{},runtime,policy:{},botId,key,commandSettings:async()=>({commands:saved})});
 const courier=http.createServer(app);await new Promise(r=>courier.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+courier.address().port;
 const send=async(path,body)=>{const raw=JSON.stringify(body),stamp=String(Math.floor(Date.now()/1000)),nonce=crypto.randomUUID().replaceAll('-','');const sig=crypto.createHmac('sha256',key).update([botId,stamp,nonce,'POST',path,crypto.createHash('sha256').update(raw).digest('hex')].join('\n')).digest('hex');return fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-courier-id':botId,'x-courier-time':stamp,'x-courier-nonce':nonce,'x-courier-signature':sig},body:raw});};
 try{
  assert.equal((await fetch('http://127.0.0.1:'+web.address().port+'/commands')).status,404);
  const config=await (await send('/internal/courier/v1/commands',{})).json();assert.equal(config.commands.order.enabled,false);
  assert.equal((await send('/internal/courier/v1/commands/applied',{protocol:'global-commands-v1',commands:config.commands,worker:{id:'fixture'}})).status,200);
  const status=await (await fetch(base+'/internal/courier/v1/commands/status')).json();assert.equal(status.ready,true);assert.equal(status.commands.order.enabled,false);
  assert.equal((await fetch(base+'/internal/courier/v1/commands/status',{headers:{origin:'http://untrusted.invalid'}})).status,403);
  const view=await inspect(pool,{now:()=>100,fetchStatus:async()=>status});assert.equal(view.ready,true);assert.equal(presentation(saved,view).effective.order.state,'EFFECTIVE');
 }finally{for(const server of [web,courier]){server.closeAllConnections();await new Promise(r=>server.close(r));}}
});
