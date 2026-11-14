const test=require('node:test'),assert=require('node:assert/strict');
const {parseCommand}=require('../src/b2c-workflow/commands');
const {createGroupPolicy,validateGroups}=require('../src/courier/groups');
const {configuration}=require('../src/courier/integration-config');
const {MysqlStore}=require('../src/courier/mysql-store');
const {mockPool}=require('./helpers/courier-db');
const {createB2CProcessor}=require('../src/b2c-workflow/workflow');
const {filters,where,transition,moduleOf}=require('../src/operations/policy');
const {reader}=require('../src/operations/read');
const botId='synthetic-four',botUsername='SyntheticFourBot';
const groups=[{chatId:'-1007001',threadId:null,threadMode:'non_topic',profile:'TIAL1',commands:['order','req']},...['ASSUREN','B2B','REPLACEMENT'].map((profile,i)=>({chatId:'-1007002',threadId:String(i+10),threadMode:'thread',profile,commands:[profile.toLowerCase()]}))];
const text=module=>module==='TIAL'?'/order\nSC/IN:X-AO100\nNO INET:00012345\nSN ONT:SYNTHETIC\nSTO:ABC\nKETERANGAN:fixture\nNIK:SYNTHETIC':`/${module.toLowerCase()}\nSC/IN:ORDER-100\nNO INET/TELP:00012345\nSTO:ABC\nTRANSAKSI:PERBAIKAN\nKETERANGAN:fixture`;
function event(i=0,overrides={}){const g=groups[i];return {version:1,bot_id:botId,update_id:String(i+1),event:{kind:'message',chat_id:g.chatId,message_id:String(i+100),telegram_thread_id:g.threadId,sender_id:'9',reply_to_message_id:null,timestamp:1700000000,text:text(i===0?'TIAL':g.profile),attachments:[],...overrides}};}
function fixture(){const pool=mockPool(),store=new MysqlStore({pool,botId,orderedInbox:true});const config={enabled:true,botId,botUsername,identityKey:'synthetic-private-identity-0000000000',dedupeBy:'sc_in',webOnly:true,actors:[],groups:groups.map(g=>({module:g.profile==='TIAL1'?'TIAL':g.profile,chatId:g.chatId,threadId:g.threadId,threadMode:g.threadMode,commandProfile:g.profile,allowedCommands:g.commands}))};return {pool,store,processor:createB2CProcessor({store,config}),policy:createGroupPolicy({botId,botUsername,groups})};}

test('four workspace parser/routing uses exact chat-topic pairs and rejects mismatched commands',()=>{
 const {policy}=fixture();for(let i=0;i<4;i++){const e=event(i);assert.equal(policy.ingress(e).event.telegram_thread_id,groups[i].threadId);assert.equal(parseCommand(e.event.text,groups[i].profile,botUsername).valid,true);}
 for(const changes of [{telegram_thread_id:null},{telegram_thread_id:'999'},{text:text('ASSUREN')},{kind:'edited_message'}])assert.throws(()=>policy.ingress(event(2,changes)));
 assert.throws(()=>validateGroups([...groups,groups[1]]));
 assert.throws(()=>validateGroups([{...groups[1],commands:['order']}]));
 for(const replacement of ['SC/IN:-','NO INET/TELP:letters','STO:!','TRANSAKSI:-']){
  const field=replacement.split(':')[0];const body=text('B2B').split('\n').map(l=>l.startsWith(field+':')?replacement:l).join('\n');assert.equal(parseCommand(body,'B2B',botUsername).valid,false);
 }
 assert.equal(parseCommand(text('B2B')+'\nINET:12345','B2B',botUsername).valid,false);
 assert.equal(parseCommand(text('TIAL').replace('NO INET:','NO INET/TELP:'),'TIAL1',botUsername).fields['NO INET'],'00012345');
});
test('courier config refuses read-only or unspecified mode before any driver or socket',()=>{
 const env={HDWORK2_LOCAL_READ_ONLY:'false',COURIER_ENABLED:'true',COURIER_INTEGRATION_ENABLED:'true',COURIER_STORE:'mysql',COURIER_SCHEMA_READY:'true',HDWORK2_OPERATIONS_ENABLED:'true',HDWORK2_AUTH_V2:'true',B2C_COMMAND_SCHEMA_READY:'true',COURIER_DB_NAME:'hdwork2',COURIER_DB_HOST:'127.0.0.1',COURIER_DB_USER:'synthetic_courier',COURIER_DB_PASSWORD:'synthetic-only',COURIER_BOT_ID:botId,COURIER_BOT_USERNAME:botUsername,COURIER_SERVICE_KEY:'synthetic-service-key-000000000000000000',COURIER_IDENTITY_KEY:'synthetic-identity-key-000000000000000000',COURIER_COMMAND_GROUPS_JSON:JSON.stringify(groups)};
 const result=configuration(env);assert.deepEqual(result.workflow.groups.map(g=>g.module),['TIAL','ASSUREN','B2B','REPLACEMENT']);assert.equal(result.workflow.groups[2].threadId,'11');
 for(const value of ['true',undefined])assert.throws(()=>configuration({...env,HDWORK2_LOCAL_READ_ONLY:value}));
 assert.equal(require.cache[require.resolve('../src/config/database')],undefined);
});
test('four workspaces persist through the actual inbox processor into isolated SQL fixtures',async()=>{
 const {pool,store,processor,policy}=fixture();for(let i=0;i<4;i++)await store.accept(policy.ingress(event(i)));
 while(await processor.processNext()){}
 assert.equal(pool.state.orders.length,4);assert.deepEqual(pool.state.orders.map(moduleOf),['TIAL','ASSUREN','B2B','REPLACEMENT']);
 assert.ok(pool.state.orders.every(o=>o.status==='WAITING'&&o.inet==='00012345'&&o.telegram_timestamp===1700000000));
  assert.deepEqual(pool.state.liveEvents.map(e=>e.module),['TIAL','ASSUREN','B2B','REPLACEMENT']);assert.equal(pool.state.outbox.length,4);
  assert.ok(pool.state.outbox.every(row=>JSON.parse(row.payload).text==='✅ Berhasil! Order diterima.'));
 assert.ok(pool.calls.every(sql=>!/^USE /i.test(sql)&&!sql.includes('hd_b2c')));
});
test('concurrent replay inserts one inbox/order; distinct duplicates retain the first canonical order',async()=>{
 const {pool,store,processor}=fixture(),e=event(2);
 const receipts=await Promise.all(Array.from({length:8},()=>store.accept(e)));assert.equal(receipts.filter(r=>!r.duplicate).length,1);
 await Promise.all([processor.processNext(),processor.processNext()]);assert.equal(pool.state.orders.length,1);
 const original=structuredClone(pool.state.orders[0]);
 await store.accept({...e,update_id:'900',event:{...e.event,message_id:'900'}});await processor.processNext();
 const duplicate=pool.state.orders[1];assert.equal(duplicate.status,'DUPLICATE');assert.deepEqual(pool.state.liveEvents.map(e=>e.kind),['arrival','change']);assert.equal(duplicate.duplicate_of,original.id);assert.deepEqual(pool.state.orders[0],original);
 await store.accept({...e,update_id:'901',event:{...e.event,message_id:'901',reply_to_message_id:'900',text:'DONE'}});await processor.processNext();
  assert.deepEqual(pool.state.orders[0],original);assert.equal(duplicate.status,'DUPLICATE');assert.equal(pool.state.outbox.length,2);
  assert.equal(new Set(pool.state.outbox.map(row=>row.idem_key)).size,2);
});
test('failed insert rolls reservation back; ordered retry cannot let later duplicate win',async()=>{
 const {pool,store,processor}=fixture();let now=1000;store.now=()=>now;
 await store.accept(event(1));await store.accept({...event(1),update_id:'50',event:{...event(1).event,message_id:'150'}});
 pool.failAt='INSERT INTO hd2_orders';await assert.rejects(processor.processNext(),{statusCode:503});assert.equal(pool.state.orders.length,0);assert.equal(pool.state.keys.length,0);
 pool.failAt=null;assert.equal(await processor.processNext(),false);now+=2000;
 assert.equal(await processor.processNext(),true);assert.equal(await processor.processNext(),true);assert.equal(pool.state.orders[0].message_id,'101');assert.equal(pool.state.orders[1].duplicate_of,pool.state.orders[0].id);
});
test('new command keeps module scope and dashboard fields mask subscriber numbers',async()=>{
 const user={id:1,role:'HD',is_active:1,name:'Synthetic',modules:['B2B']};const f=filters({area:'B2B',command:'b2b'},user),w=where(f,user);assert.deepEqual(f.allowed,['B2B']);assert.match(w.sql,/'assuren','b2b','replacement'/);assert.equal(where(filters({area:'ASSUREN'},user),user).values.length,0);
 const id='12345678-1234-4123-8123-123456789abc';const row={id,command:'b2b',module:'B2B',status:'WAITING',version:0,telegram_timestamp:1700000000,inet:'00012345',command_fields:{'SC/IN':'ORDER-100','NO INET/TELP':'00012345',STO:'ABC',TRANSAKSI:'PERBAIKAN'}};
 const c={async query(){},async beginTransaction(){},async commit(){},async rollback(){},release(){},async execute(sql,p){if(sql.includes('JOIN hd2_courier_outbox')){assert.deepEqual(p,[id]);return [[]];}if(sql.includes('FROM hd2_orders')){assert.ok(p.includes('B2B'));return [[row]];}return [[]];}};
 const detail=await reader({async getConnection(){return c;}}).detail(id,user);assert.ok(!detail.fields['NO INET/TELP'].includes('00012345'));assert.equal(detail.fields.STO,'ABC');
 const picked=transition({...row,owner_user_id:null},user,{action:'PICK'});assert.equal(picked.next.status,'IN_PROGRESS');const active={...row,...picked.next};assert.equal(transition(active,user,{action:'DONE',confirm:true}).next.status,'DONE');assert.throws(()=>transition(active,{...user,id:2},{action:'DONE',confirm:true}),{statusCode:409});assert.throws(()=>transition(row,{...user,modules:['ASSUREN']},{action:'PICK'}),{statusCode:403});
});
test('outgoing replies stay on exact original topic and never authorize another workspace',async()=>{
 const {policy}=fixture();const payload={method:'sendMessage',chat_id:groups[2].chatId,telegram_thread_id:'11',thread_mode:'thread',reply_to_message_id:'102',text:'Synthetic'};
 const connection={async execute(){return [[{command:'b2b',thread_id:'11'}]];}};
 assert.equal(await policy.outgoing(payload,connection),true);assert.equal(await policy.outgoing({...payload,telegram_thread_id:'10'},connection),false);assert.equal(await policy.outgoing(payload,{async execute(){return [[{command:'b2b',thread_id:'10'}]];}}),false);
});
test('signed Express ingress ACKs four categories after fixture commit; replay cannot add an order',async()=>{
 const {createIntegrationApp}=require('../src/courier/integration-app'),http=require('node:http'),{randomBytes,createHash,createHmac}=require('node:crypto');
 const {pool,store,processor,policy}=fixture(),key='synthetic-service-only-000000000000000000',nonces=new Set();
 const runtime={async reserveNonce(n){if(nonces.has(n.nonce))throw Object.assign(Error(),{statusCode:401});nonces.add(n.nonce);},async assertWorker(w){if(w?.id!=='synthetic-worker')throw Object.assign(Error(),{statusCode:409});}};
 const server=http.createServer(createIntegrationApp({botId,key,policy,runtime,store,receive:true,send:false}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const route='/internal/courier/v1/events',url='http://127.0.0.1:'+server.address().port;
 function signed(e){const body=JSON.stringify({...e,worker:{id:'synthetic-worker'}}),stamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(16).toString('hex');const msg=[botId,stamp,nonce,'POST',route,createHash('sha256').update(body).digest('hex')].join('\n');return {method:'POST',body,headers:{'Content-Type':'application/json','X-Courier-Id':botId,'X-Courier-Time':stamp,'X-Courier-Nonce':nonce,'X-Courier-Signature':createHmac('sha256',key).update(msg).digest('hex')}};}
 try{
  for(let i=0;i<4;i++){const response=await fetch(url+route,signed(event(i)));assert.equal(response.status,200);const ack=await response.json();assert.equal(ack.ok,true);assert.ok(pool.state.inbox.some(row=>row.id===ack.receipt_id));}
  const retry=await fetch(url+route,signed(event(2)));assert.equal((await retry.json()).duplicate,true);
  while(await processor.processNext()){}assert.equal(pool.state.orders.length,4);assert.equal(pool.state.outbox.length,4);
  assert.ok(pool.state.outbox.every(row=>JSON.parse(row.payload).text==='✅ Berhasil! Order diterima.'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('insert payload columns and generated workspace mapping fit migration declarations without running SQL',()=>{
 const fs=require('node:fs'),base=fs.readFileSync('database/manual/004_hdwork2_courier.sql','utf8'),commands=fs.readFileSync('database/manual/006_hdwork2_commands.sql','utf8'),operations=fs.readFileSync('database/manual/008_hdwork2_operations.sql','utf8'),source=fs.readFileSync('src/b2c-workflow/command-storage.js','utf8');
 const columns=/INSERT INTO hd2_orders \(([^)]+)\)/.exec(source)[1].split(',');for(const c of columns)assert.match(base+commands,new RegExp('\\b'+c+'\\s+'));
 assert.match(operations,/ELSE module END/);assert.ok(!columns.includes('access_module'));assert.match(source,/message_id=\? FOR SHARE/);assert.doesNotMatch(source,/UPDATE hd2_orders/);
});
