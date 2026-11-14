const test=require('node:test'),assert=require('node:assert/strict');
const {parseCommand}=require('../src/b2c-workflow/commands');
const {MysqlStore}=require('../src/courier/mysql-store');
const {createB2CProcessor}=require('../src/b2c-workflow/workflow');
const {createGroupPolicy}=require('../src/courier/groups');
const {mockPool}=require('./helpers/courier-db');
const base='/order\nSC/IN: free PREFIX-AOi123_suffix\nNO INET:000123\nSN ONT: SN1\nSTO:ABC\nKETERANGAN:test\nNIK:TEST';
test('transaction extraction, labels, suffix, required/optional and profile validation',()=>{
 for(const code of ['AOi123','PDAk123','MOk123','DOk123']){
  const raw=`free DGPS123-${code}_ignored-other-AO123`;
  assert.equal(parseCommand(`/config_psb\nOrder ID DSC :${raw}\nSTO:ABC`,'TIAL1').sc_in,`DGPS123-${code}`);
  assert.equal(parseCommand(`/MO\nsc / in:${raw}\nsto:ABC`,'TIAL2').sc_in,code);
 }
 assert.equal(parseCommand(base,'TIAL1').fields['NO VOICE'],null);
 assert.equal(parseCommand(base,'SOLVER1').valid,false);
 for(const name of ['SC/IN','NO INET','SN ONT','STO','KETERANGAN','NIK'])for(const value of ['', ' ', '-']){
  const lines=base.split('\n').filter(s=>!s.startsWith(name+':'));assert.equal(parseCommand(lines.join('\n'),'TIAL1').valid,false);
  assert.equal(parseCommand([...lines,`${name}:${value}`].join('\n'),'TIAL1').valid,false);
 }
 assert.equal(parseCommand(base.replace('AOi123','MOk123'),'TIAL1').valid,false);
 for(const [cmd,label] of [['config_psb','Order ID'],['MO','SC/IN']])for(const field of [label,'STO'])for(const value of ['', ' ', '-'])assert.equal(parseCommand(`/${cmd}\n${field===label?'STO:X':label+':PREFIX-AOi1'}\n${field}:${value}`,'TIAL1').valid,false);
 const request='/req  Isi asli\n  jangan ubah';assert.equal(parseCommand(request,'SOLVER1').original,request);
});
test('command formats report safe reasons while keeping unrecognized commands unclassified',()=>{
 const badPhone=parseCommand(base.replace('NO INET:000123','NO INET:12x'),'TIAL1');
 assert.equal(badPhone.valid,false);assert.equal(badPhone.command,'order');assert.deepEqual(badPhone.errors,['NO INET (format)']);
 const badService=parseCommand('/config_psb\nOrder ID:X-AO1\nSTO:ABC\nSERVICE:4P','TIAL1');
 assert.equal(badService.command,'config_psb');assert.ok(badService.errors.includes('SERVICE (format)'));
 const badWorkspace=parseCommand('/b2b\nSC/IN:X-1\nNO INET/TELP:abc\nSTO:ABC\nTRANSAKSI:INSTALL','B2B');
 assert.equal(badWorkspace.command,'b2b');assert.deepEqual(badWorkspace.errors,['NO INET/TELP (format)']);
 assert.equal(parseCommand('/login token','TIAL1').command,undefined);
});
test('valid orders enqueue one success reply after storage; retries preserve idempotency and duplicate rules',async()=>{
 const pool=mockPool(),store=new MysqlStore({pool,botId:'sandbox',env:{}}),group={chatId:'-1001',threadId:'12',threadMode:'thread',profile:'TIAL1',commands:['order','req','config_psb','mo']};
 const policy=createGroupPolicy({botId:'sandbox',botUsername:'HDWorkOpsBot',groups:[group]}),config={enabled:true,botId:'sandbox',botUsername:'HDWorkOpsBot',identityKey:'synthetic-command-test-key-00000000',dedupeBy:'both',groups:[{module:'TIAL',chatId:group.chatId,threadId:group.threadId,threadMode:group.threadMode,commandProfile:'TIAL1'}],actors:[{id:'9',name:'Synthetic'}]};
 const workflow=createB2CProcessor({store,config});
 const body=(uid,messageId)=>({version:1,bot_id:'sandbox',update_id:String(uid),event:{kind:'message',chat_id:group.chatId,message_id:String(messageId),telegram_thread_id:group.threadId,sender_id:'9',reply_to_message_id:null,timestamp:1700000000,text:base,attachments:[]}});
 for(const [uid,messageId] of [[1,101],[2,102]]){const value=policy.ingress(body(uid,messageId));await store.accept(value);await workflow.processNext();}
 assert.equal(pool.state.orders.length,2);assert.equal(pool.state.orders[1].status,'DUPLICATE');
 assert.equal(pool.state.outbox.length,2);const successReplies=pool.state.outbox.map(row=>JSON.parse(row.payload));for(const payload of successReplies){assert.equal(payload.text,'✅ Berhasil! Order diterima.');assert.equal(payload.telegram_thread_id,'12');}assert.deepEqual(successReplies.map(x=>x.reply_to_message_id).sort(),['101','102']);
 const auth=await pool.getConnection();try{assert.equal(await policy.outgoing(successReplies[0],auth),true);assert.equal(await policy.outgoing({...successReplies[0],text:'❌ Gagal! Format order salah. Alasan: NO INET (format)'},auth),false);}finally{auth.release();}
 await store.accept(policy.ingress(body(2,102)));assert.equal(await workflow.processNext(),false);assert.equal(pool.state.outbox.length,2);
});
test('invalid routed orders get one reasoned reply but never create an order; enqueue waits for successful storage transaction',async()=>{
 const pool=mockPool(),store=new MysqlStore({pool,botId:'sandbox',env:{}}),group={chatId:'-1001',threadId:null,threadMode:'non_topic',profile:'TIAL1',commands:['order','req','config_psb','mo']};
 const policy=createGroupPolicy({botId:'sandbox',botUsername:'HDWorkOpsBot',groups:[group]}),config={enabled:true,botId:'sandbox',botUsername:'HDWorkOpsBot',identityKey:'synthetic-command-test-key-00000000',dedupeBy:'both',groups:[{module:'TIAL',chatId:group.chatId,threadId:null,threadMode:'non_topic',commandProfile:'TIAL1'}],actors:[{id:'9',name:'Synthetic'}]},workflow=createB2CProcessor({store,config});
 const body={version:1,bot_id:'sandbox',update_id:'9',event:{kind:'message',chat_id:'-1001',message_id:'109',telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1700000000,text:base.replace('NO INET:000123','NO INET:12x'),attachments:[]}};
 await store.accept(policy.ingress(body));await workflow.processNext();assert.equal(pool.state.orders.length,0);assert.equal(pool.state.outbox.length,1);
 const queued=JSON.parse(pool.state.outbox[0].payload);assert.equal(queued.text,'❌ Gagal! Format order salah. Alasan: NO INET (format)');assert.equal(queued.reply_to_message_id,'109');
 await store.accept(policy.ingress(body));assert.equal(await workflow.processNext(),false);assert.equal(pool.state.outbox.length,1);
 const c=await pool.getConnection();try{assert.equal(await policy.outgoing(queued,c),true);assert.equal(await policy.outgoing({...queued,text:queued.text+' changed'},c),false);assert.equal(await policy.outgoing({...queued,reply_to_message_id:'999'},c),false);}finally{c.release();}
 assert.ok(pool.calls.some(sql=>sql.startsWith('SELECT payload FROM hd2_courier_inbox')));
 assert.ok(!pool.calls.some(sql=>sql.startsWith('SELECT')&&sql.includes('hd2_audit')));
 assert.equal(pool.state.audit.filter(r=>r.action==='ORDER_FORMAT_REJECTED').length,1);
 const failedPool=mockPool(),failedStore=new MysqlStore({pool:failedPool,botId:'sandbox',env:{}}),failedWorkflow=createB2CProcessor({store:failedStore,config});
 await failedStore.accept(policy.ingress({...body,update_id:'10',event:{...body.event,message_id:'110',text:base}}));failedPool.failCommit=true;
 await assert.rejects(failedWorkflow.processNext());assert.equal(failedPool.state.orders.length,0);assert.equal(failedPool.state.outbox.length,0);
});
test('format-rejection authorization works under Courier grants without audit SELECT',async()=>{
 const {policies,reviewOperationalGrants}=require('../src/config/operational-grants');
 const grants=Object.entries(policies.courier).flatMap(([table,privileges])=>privileges.map(privilege=>({grant:`GRANT ${privilege} ON hdwork2.${table} TO courier-fixture`})));
 assert.equal(reviewOperationalGrants(grants,'courier').ok,true);
 assert.equal(policies.courier.hd2_audit.includes('SELECT'),false);
 const pool=mockPool(),store=new MysqlStore({pool,botId:'sandbox',env:{}}),group={chatId:'-1001',threadId:null,threadMode:'non_topic',profile:'TIAL1',commands:['order','req','config_psb','mo']};
 const policy=createGroupPolicy({botId:'sandbox',botUsername:'HDWorkOpsBot',groups:[group]});
 const payload={version:1,bot_id:'sandbox',update_id:'45',event:{kind:'message',chat_id:'-1001',message_id:'145',telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1700000000,text:base.replace('NO INET:000123','NO INET:bad'),attachments:[]}};
 await store.accept(policy.ingress(payload));
 await createB2CProcessor({store,config:{enabled:true,webOnly:true,botId:'sandbox',botUsername:'HDWorkOpsBot',identityKey:'synthetic-command-test-key-00000000',dedupeBy:'both',groups:[{module:'TIAL',chatId:'-1001',threadId:null,threadMode:'non_topic',commandProfile:'TIAL1',allowedCommands:['order','req','config_psb','mo']}],actors:[]}}).processNext();
 const reply=JSON.parse(pool.state.outbox[0].payload),connection=await pool.getConnection();
 try{assert.equal(await policy.outgoing(reply,connection),true);assert.ok(!pool.calls.some(sql=>sql.startsWith('SELECT')&&sql.includes('hd2_audit')));}finally{connection.release();}
});
test('full-history cross-chat TIAL dedup, final canonical, repeat commands, replay, concurrency',async()=>{
 const pool=mockPool(),store=new MysqlStore({pool,botId:'sandbox'});
 const workflow=createB2CProcessor({store,config:{enabled:true,botId:'sandbox',identityKey:'synthetic-command-test-key-00000000',dedupeBy:'both',groups:['-1001','-1002'].map((chatId,i)=>({module:'TIAL',chatId,threadId:null,threadMode:'non_topic',commandProfile:i?'TIAL2':'TIAL1'})),actors:[{id:'9',name:'HD Test'}]}});
 const event=(update,text=base)=>({version:1,bot_id:'sandbox',update_id:String(update),event:{kind:'message',chat_id:update%2?'-1001':'-1002',message_id:String(update),telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1700000000+update*86400,text,attachments:[]}});
 await store.accept(event(1));await workflow.processNext();pool.state.orders[0].status='DONE';
 await store.accept(event(2));await store.accept(event(3));await Promise.all([workflow.processNext(),workflow.processNext()]);
 assert.deepEqual(pool.state.orders.map(o=>o.status),['DONE','DUPLICATE','DUPLICATE']);
 assert.equal(pool.state.orders[2].duplicate_of,pool.state.orders[0].id);
 await store.accept(event(3));await workflow.processNext();assert.equal(pool.state.orders.length,3);
 for(const text of ['/config_psb\nOrder ID:PREFIX-AOi123\nSTO:A','/MO\nSC/IN:PREFIX-AOi123\nSTO:A','/req bebas']){
  for(let j=0;j<2;j++){const n=pool.state.inbox.length+1;await store.accept(event(n,text));await workflow.processNext();}
 }
 assert.equal(pool.state.orders.length,9);assert.equal(pool.state.orders.filter(o=>o.status==='WAITING').length,6);
 assert.equal(pool.state.orders[0].raw_text,base);assert.equal(pool.state.orders[0].sender_id,'9');
 await store.accept(event(20,'/order\nSC/IN:bad'));await workflow.processNext();assert.equal(pool.state.orders.length,9);
});
