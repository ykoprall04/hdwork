const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID,createHash,createHmac}=require('node:crypto');
const settings=require('../src/system/command-settings');
const {createSystem}=require('../src/system/store');

function fixture(){
 const state={rows:Object.fromEntries(settings.commands.map(k=>[k,{command:k,enabled:1,version:0}])),audit:[],requests:new Map(),queries:[]};
 let snapshot;
 const c={async beginTransaction(){snapshot=structuredClone({rows:state.rows,audit:state.audit,requests:state.requests});},async commit(){},async rollback(){Object.assign(state,snapshot);},release(){},async execute(sql,args=[]){
  state.queries.push(sql);
  if(sql.startsWith('SELECT id,role'))return [[{id:1,role:state.actorRole||'SUPER_ADMIN',is_active:1}]];
  if(sql.startsWith('SELECT token_hash'))return [state.expired?[]:[{token_hash:'synthetic'}]];
  if(sql.startsWith('INSERT INTO hd2_system_requests')){if(!state.requests.has(args[1]))state.requests.set(args[1],{payload_hash:args[2]});return [{}];}
  if(sql.startsWith('SELECT payload_hash'))return [[state.requests.get(args[1])]];
  if(sql.startsWith('UPDATE hd2_system_requests')){state.requests.get(args[2]).result=args[0];return [{}];}
  if(sql.startsWith('SELECT command,enabled')){if(state.offline)throw Error('synthetic-offline');return [Object.values(state.rows)];}
  if(sql.startsWith('SELECT enabled,version'))return [[state.rows[args[0]]]];
  if(sql.startsWith('UPDATE hd2_global_commands')){const r=state.rows[args[1]];r.enabled=args[0]?1:0;r.version++;return [{}];}
  if(sql.startsWith('INSERT INTO hd2_audit')){if(state.auditFailure)throw Error('synthetic-audit-offline');state.audit.push(JSON.parse(args[3]));return [{}];}
  throw Error('UNEXPECTED_MOCK_QUERY');
 }};
 const pool={execute:(...a)=>c.execute(...a),getConnection:async()=>c};
 const service=createSystem({env:{},readPool:pool,writePool:pool,commandReadiness:async()=>({supported:state.ready!==false,ready:state.ready!==false,commands:Object.fromEntries(Object.entries(state.rows).map(([k,r])=>[k,{enabled:!!r.enabled,version:r.version}]))})});
 return {state,service,pool};
}
const superUser={id:1,role:'SUPER_ADMIN',sessionToken:'synthetic-session'};
const input=(command,enabled,version=0)=>({command,enabled,version,requestId:randomUUID()});

test('four global defaults ON; no bot/group key in settings',async()=>{
 const {pool}=fixture(),value=await settings.read(pool);
 assert.deepEqual(Object.keys(value.commands).sort(),[...settings.commands].sort());
 for(const row of Object.values(value.commands))assert.deepEqual(row,{enabled:true,version:0});
});
for(const command of settings.commands)test(`${command}: OFF/ON, atomic audit and idempotent retry`,async()=>{
 const {service,state}=fixture(),off=input(command,false);
 assert.equal((await service.saveCommandSettings(superUser,off)).enabled,false);
 await service.saveCommandSettings(superUser,off);
 assert.equal(state.audit.length,1);assert.deepEqual(state.audit[0],{command,before:true,after:false,requestId:off.requestId});
 const on=await service.saveCommandSettings(superUser,input(command,true,1));assert.equal(on.enabled,true);assert.equal(on.version,2);
 for(const other of settings.commands.filter(k=>k!==command))assert.equal(state.rows[other].version,0);
});
test('stale version rejected and audit failure rolls back switch',async()=>{
 const {service,state}=fixture();await assert.rejects(service.saveCommandSettings(superUser,input('order',false,9)),{statusCode:409});
 state.auditFailure=true;await assert.rejects(service.saveCommandSettings(superUser,input('order',false)));assert.equal(state.rows.order.enabled,1);assert.equal(state.audit.length,0);
});
test('Super Admin authorization is rechecked in transaction, including live session',async()=>{
 const {service,state}=fixture();for(const role of ['ADMIN','HD','SHOW_ONLY']){
  await assert.rejects(service.commandSettings({...superUser,role}),{statusCode:403});
  await assert.rejects(service.saveCommandSettings({...superUser,role},input('order',false)),{statusCode:403});
 }
 state.actorRole='ADMIN';await assert.rejects(service.saveCommandSettings(superUser,input('order',false)),{statusCode:403});
 state.actorRole='SUPER_ADMIN';state.expired=true;await assert.rejects(service.saveCommandSettings(superUser,input('order',false)),{statusCode:401});
});
test('strict settings validation and database failure never invent ON response',async()=>{
 const {pool,state}=fixture();for(const command of ['MO','unknown','__proto__'])assert.throws(()=>settings.validate(input(command,false)),{statusCode:400});
 assert.throws(()=>settings.validate({...input('mo',false),enabled:0}),{statusCode:400});
 delete state.rows.req;await assert.rejects(settings.read(pool),{statusCode:503});state.offline=true;await assert.rejects(settings.read(pool));
});
test('additive grants accept only exact SELECT / writer UPDATE, no broad access',()=>{
 const {policies,reviewOperationalGrants}=require('../src/config/operational-grants');
 for(const role of ['systemRead','systemWrite','courierSendChatFifo']){
  const base=Object.entries(policies[role]).map(([table,ps])=>({g:`GRANT ${ps.join(', ')} ON hdwork2.${table} TO 'mock'@'localhost'`}));
  assert.equal(reviewOperationalGrants(base,role).ok,true);
  const extra=p=>({g:`GRANT ${p} ON hdwork2.hd2_global_commands TO 'mock'@'localhost'`});
  assert.equal(reviewOperationalGrants([...base,extra('SELECT')],role).ok,true);
  assert.equal(reviewOperationalGrants([...base,extra('UPDATE')],role).ok,role.includes('Write'));
  assert.equal(reviewOperationalGrants([...base,extra('DELETE')],role).ok,false);
 }
});
test('internal settings require signed loopback request; cache refresh never calls Telegram',async()=>{
 const botId='mock_bot',key='k'.repeat(32);let reads=0,nonces=0;
 const app=require('../src/courier/integration-app').createIntegrationApp({store:{},runtime:{reserveNonce:async()=>nonces++},policy:{},botId,key,commandSettings:async()=>{reads++;return {commands:{}};}});
 const server=require('node:http').createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const path='/internal/courier/v1/commands',url='http://127.0.0.1:'+server.address().port+path;
 try{
  assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);assert.equal(reads,0);
  const raw='{}',stamp=String(Math.floor(Date.now()/1000)),nonce=randomUUID().replaceAll('-','');
  const sig=createHmac('sha256',key).update([botId,stamp,nonce,'POST',path,createHash('sha256').update(raw).digest('hex')].join('\n')).digest('hex');
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-courier-id':botId,'x-courier-time':stamp,'x-courier-nonce':nonce,'x-courier-signature':sig},body:raw});
  assert.equal(response.status,200);assert.equal(reads,1);assert.equal(nonces,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('Super Admin HTTP settings API enforces CSRF and refuses ADMIN',async()=>{
 const express=require('express');let writes=0;
 const http={auth(req,_res,next){req.user={id:1,role:req.headers['x-role']};req.sessionToken='mock';next();},csrf(req){if(req.headers['x-csrf-token']!=='mock')throw {statusCode:403};},error(res,e){res.status(e.statusCode||503).json({success:false});}};
 const app=express();app.use(express.json());app.use(require('../src/system/routes').createRoutes({http,enabled:()=>true,system:{commandSettings:async()=>({commands:{}}),saveCommandSettings:async()=>{writes++;return {success:true};}}}));
 const server=require('node:http').createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/commands';
 try{
  assert.equal((await fetch(url,{headers:{'x-role':'ADMIN'}})).status,403);
  assert.equal((await fetch(url,{headers:{'x-role':'SUPER_ADMIN'}})).status,200);
  assert.equal((await fetch(url,{method:'POST',headers:{'x-role':'SUPER_ADMIN','content-type':'application/json'},body:'{}'})).status,403);assert.equal(writes,0);
  assert.equal((await fetch(url,{method:'POST',headers:{'x-role':'SUPER_ADMIN','content-type':'application/json','x-csrf-token':'mock'},body:'{}'})).status,200);assert.equal(writes,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('manual migration creates exactly one global table with four ON defaults',()=>{
 const sql=require('node:fs').readFileSync(require('node:path').join(__dirname,'../database/manual/021_hdwork2_global_commands.sql'),'utf8');
 assert.equal((sql.match(/CREATE TABLE/g)||[]).length,1);
 assert.match(sql,/enabled BOOLEAN NOT NULL DEFAULT TRUE/);
 assert.match(sql,/VALUES \('order'\),\('req'\),\('config_psb'\),\('mo'\)/);
 assert.doesNotMatch(sql,/\b(?:ALTER|DROP|DELETE|TRUNCATE)\s+(?:TABLE\s+)?hd2_(?:orders|courier|audit)/i);
});
test('internal settings outage logs static failure at most once per minute',async()=>{
 let now=1700000000000;const botId='mock_bot',key='k'.repeat(32),emits=[];
 const logger=require('../src/observability/raw-log').logger(),original=logger.emit;
 logger.emit=(...args)=>emits.push(args);
 const app=require('../src/courier/integration-app').createIntegrationApp({store:{},runtime:{reserveNonce:async()=>{}},policy:{},botId,key,now:()=>now,commandSettings:async()=>{throw Error('SYNTHETIC_PRIVATE_FAILURE');}});
 const server=require('node:http').createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const path='/internal/courier/v1/commands';
 try{
  for(const elapsed of [0,4000,8000,60000]){
   now=1700000000000+elapsed;const stamp=String(Math.floor(now/1000)),nonce=randomUUID().replaceAll('-',''),raw='{}';
   const sig=createHmac('sha256',key).update([botId,stamp,nonce,'POST',path,createHash('sha256').update(raw).digest('hex')].join('\n')).digest('hex');
   const response=await fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{'content-type':'application/json','x-courier-id':botId,'x-courier-time':stamp,'x-courier-nonce':nonce,'x-courier-signature':sig},body:raw});
   assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/SYNTHETIC_PRIVATE_FAILURE/);
  }
  const failures=emits.filter(args=>args[0]==='COMMAND_SETTINGS_API_FAILED');assert.equal(failures.length,2);assert.ok(failures.every(args=>args.length===2));
 }finally{logger.emit=original;server.closeAllConnections();await new Promise(r=>server.close(r));}
});
