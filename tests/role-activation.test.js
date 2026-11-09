const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createSystem}=require('../src/system/store');
const {createChat}=require('../src/chat/service');
const roles=['HD','ADMIN','SUPER_ADMIN'];
async function serve(router,run){const app=require('express')();app.use(require('express').json());app.use(router);const server=require('node:http').createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await run('http://127.0.0.1:'+server.address().port);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
const http={auth(req,_res,next){req.user={id:1,role:req.headers['x-test-role']||'SHOW_ONLY'};req.sessionToken='fixture';next();},csrf(req){if(req.headers['x-csrf-token']!=='fixture')throw Object.assign(Error(),{statusCode:403});},error(res,e){res.status(e.statusCode||503).json({success:false});}};
test('HD monitoring is GET status only; administrative endpoints reject HD before services or CSRF',async()=>{
 let reads=0,writes=0;const system={async status(){reads++;return {components:{frontend:'UNKNOWN'}};},async mappings(){return {data:[]};},async history(){return {data:[]};},async jobs(){return {data:[]};},async saveMapping(){writes++;return {success:true};},async recipient(){writes++;},async report(){writes++;}};
 await serve(require('../src/system/routes').createRoutes({http,enabled:()=>true,system}),async base=>{
  for(const role of roles){const headers={'x-test-role':role,'x-csrf-token':'fixture','content-type':'application/json'};assert.equal((await fetch(base+'/status',{headers})).status,200);
   for(const path of ['/mappings','/history','/backups'])assert.equal((await fetch(base+path,{headers})).status,role==='HD'?403:200);
   if(role==='HD')for(const path of ['/mappings','/alert-target','/frontend-heartbeat'])assert.equal((await fetch(base+path,{method:'POST',headers,body:'{}'})).status,403);
  }assert.equal(reads,3);assert.equal(writes,0);
 });
 await serve(require('../src/system/routes').createRoutes({http,enabled:()=>false,system}),async base=>{for(const role of roles)assert.equal((await fetch(base+'/status',{headers:{'x-test-role':role}})).status,503);});
});
test('HD actual status service is read only, masks worker routing identity, retains UNKNOWN without probes',async()=>{
 const sql=[];const readPool={async execute(q){sql.push(q);if(q==='SELECT 1')return [[{ok:1}]];if(q.includes('FROM hd2_system_state'))return [[]];if(q.includes('FROM hd2_courier_workers'))return [[{bot_id:'private-worker',expires_ms:1800000060000}]];if(q.includes('FROM hd2_courier_outbox'))return [[{pending:0,delivered:0,failed:0,retry:0,queueAgeSeconds:0}]];if(q.includes('FROM hd2_courier_inbox'))return [[{incomingPending:0,incomingFailed:0}]];if(q.includes('FROM hd2_system_incidents'))return [[]];throw Error('Unexpected SQL');}};
 const system=createSystem({readPool,writePool:{getConnection(){assert.fail('HD must never write');}},now:()=>1800000000000});const status=await system.status({role:'HD'});assert.equal(status.components.frontend,'UNKNOWN');assert.equal(status.components.tunnel,'UNKNOWN');assert.equal(status.components.mysql,'ONLINE');assert.deepEqual(status.workers,[]);assert.ok(sql.every(q=>q.startsWith('SELECT ')));
 await assert.rejects(system.status({role:'SHOW_ONLY'}),{statusCode:403});await assert.rejects(system.saveMapping({role:'HD'},{}),{statusCode:403});await assert.rejects(system.recipient({role:'ADMIN'},{}),{statusCode:403});
});
function chatFixture(role,patch={}){
 const id=randomUUID(),actor={id:7,name:'Fixture',username:'fixture',role,is_active:1},order={id,access_module:'TIAL',module:'TIAL',command:'order',status:'IN_PROGRESS',owner_user_id:7,version:2,bot_id:'fixture-bot',chat_id:'-100123',thread_id:'42',message_id:'101'};
 let state={requests:[],outbox:[],messages:[],audit:[]};const options={actor,order,modules:['TIAL'],session:true,route:true,...patch};
 const pool={async getConnection(){let snapshot;return {async beginTransaction(){snapshot=structuredClone(state);},async commit(){},async rollback(){state=snapshot;},release(){},async execute(sql,p=[]){
  if(sql.includes('FROM users'))return [[options.actor]];
  if(sql.includes('FROM hd2_user_modules'))return [options.modules.map(module=>({module}))];
  if(sql.includes('FROM hd2_sessions'))return [options.session?[{token_hash:'fixture'}]:[]];
  if(sql.startsWith('SELECT * FROM hd2_orders'))return [[options.order]];
  if(sql.startsWith('INSERT INTO hd2_web_requests')){if(!state.requests.some(r=>r.requestId===p[1]))state.requests.push({requestId:p[1],payload_hash:p[3],result:null});return [{}];}
  if(sql.includes('FROM hd2_web_requests'))return [state.requests.filter(r=>r.requestId===p[1])];
  if(sql.startsWith('UPDATE hd2_web_requests')){state.requests.find(r=>r.requestId===p[2]).result=p[0];return [{}];}
  if(sql.includes('FROM hd2_system_mappings')){assert.deepEqual(p,['fixture-bot','-100123','42','TIAL']);return [options.route?[{id:'fixture-route'}]:[]];}
  if(sql.startsWith('INSERT INTO hd2_courier_outbox')){state.outbox.push({id:p[0],bot_id:p[1],idem_key:p[2],payload_hash:p[3],payload:JSON.parse(p[4])});return [{}];}
  if(sql.includes('FROM hd2_courier_outbox'))return [state.outbox.filter(r=>r.bot_id===p[0]&&r.idem_key===p[1])];
  if(sql.startsWith('INSERT INTO hd2_chat_messages')){state.messages.push(p);return [{}];}
  if(sql.startsWith('INSERT INTO hd2_audit')){state.audit.push(p);return [{}];}
  if(sql.startsWith('INSERT INTO hd2_live_events'))return [{}];
  throw Error('Unexpected chat fixture SQL: '+sql);
 }};}};return {id,options,get state(){return state;},chat:createChat({readPool:pool,writePool:pool})};
}
for(const role of roles)test(`${role} chat requires current ownership, module, session and verified original topic; replay stays unique`,async()=>{
 const f=chatFixture(role),body={requestId:randomUUID(),version:2,text:'Synthetic reply'};const result=await f.chat.send(f.id,'fixture',7,body);assert.equal(result.status,'ANTRE');assert.deepEqual(await f.chat.send(f.id,'fixture',7,body),result);assert.equal(f.state.outbox.length,1);assert.equal(f.state.messages.length,1);assert.equal(f.state.audit.length,1);
 const payload=f.state.outbox[0].payload;assert.equal(payload.chat_id,'-100123');assert.equal(payload.telegram_thread_id,'42');assert.equal(payload.reply_to_message_id,'101');assert.equal(f.options.order.status,'IN_PROGRESS');assert.equal(f.options.order.version,2);
 for(const [patch,code] of [[{modules:[]},404],[{session:false},401],[{route:false},403],[{actor:{id:7,role,is_active:0}},403],[{order:{...f.options.order,owner_user_id:8}},409],[{order:{...f.options.order,status:'DONE'}},409],[{order:{...f.options.order,version:3}},409]]){const rejected=chatFixture(role,patch);await assert.rejects(rejected.chat.send(rejected.id,'fixture',7,{...body,requestId:randomUUID()}),{statusCode:code});assert.equal(rejected.state.outbox.length,0);assert.equal(rejected.state.messages.length,0);assert.equal(rejected.state.audit.length,0);}
});
test('SHOW_ONLY and trial remain unable to enqueue chat; current database role overrides stale session',async()=>{
 for(const actor of [{id:7,role:'SHOW_ONLY',is_active:1},{id:7,role:'HD',username:'trial_yanto',is_active:1}]){const f=chatFixture('HD',{actor});await assert.rejects(f.chat.send(f.id,'fixture',7,{requestId:randomUUID(),version:2,text:'Synthetic'}),{statusCode:403});assert.equal(f.state.outbox.length,0);}
});
test('operational build includes every implemented client feature without enabling any server or sender',async()=>{
 const {environment,build}=require('../scripts/build-operational-frontend');const source={VITE_API_BASE_URL:'https://localhost:8443',COURIER_SEND_ENABLED:'false',HDWORK2_LIVE_CHAT_ENABLED:'false'},env=environment(source);for(const flag of ['VITE_HDWORK2_AUTH_COOKIE','VITE_HDWORK2_OPERATIONS','VITE_HDWORK2_LIVE_CHAT'])assert.equal(env[flag],'true');assert.equal(env.COURIER_SEND_ENABLED,'false');assert.equal(env.HDWORK2_LIVE_CHAT_ENABLED,'false');assert.equal(source.VITE_HDWORK2_LIVE_CHAT,undefined);
 for(const value of ['http://localhost:8443','https://user:pass@example.test','https://example.test/path','https://example.test/?token=secret'])assert.throws(()=>environment({VITE_API_BASE_URL:value}));let calls=0;assert.throws(()=>build({argv:[],spawn(){calls++;}}));assert.equal(calls,0);await build({env:source,argv:['--build'],verifyBuild:async()=> 'a'.repeat(64),spawn(_cmd,args,opts){calls++;assert.ok(args.includes('build'));assert.equal(opts.env.VITE_HDWORK2_LIVE_CHAT,'true');return {status:0};}});assert.equal(calls,1);
});
test('all workspace pages keep identical module data restrictions for HD, ADMIN and SUPER_ADMIN',()=>{
 const {filters,where,transition}=require('../src/operations/policy');
 for(const role of roles){const user={id:7,role,is_active:1,modules:['B2B']};for(const area of ['B2C','TIAL','LOGIC','ASSUREN','B2B','REPLACEMENT']){const f=filters({area},user),query=where(f,user);assert.deepEqual(f.allowed,area==='B2B'?['B2B']:[]);assert.deepEqual(query.values,area==='B2B'?['B2B']:[]);if(area!=='B2B')assert.match(query.sql,/access_module IN \(''\)/);}
  if(role!=='HD')assert.throws(()=>transition({command:'b2b',module:'B2B',status:'WAITING'},user,{action:'PICK'}),{statusCode:403});
 }
});
