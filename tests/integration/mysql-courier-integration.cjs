// Native MySQL, fake Telegram only. No operational schema or service activation.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { randomUUID, createHash, createHmac, randomBytes } = require('node:crypto');
const {schemaStatements,approvedAccount,durationStats,pickRace,auditLinks,runtime:loadRuntime,childEnvironment}=require('../helpers/e2e-contracts.cjs');

async function run({ env = process.env, argv = process.argv.slice(2), driverFactory = () => require('mysql2/promise') } = {}) {
  if (argv.length !== 1 || argv[0] !== '--run-courier-disposable') throw Error('Courier rehearsal disabled');
  const guard = require('../../ops/mysql/disposable-guard'), options = guard.config(env, ['--run-disposable']);
  const pool = driverFactory().createPool(options), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hdwork-batch12-'));
  fs.chmodSync(temp, 0o700);
  const botId = 'hdwork-new', key = 'synthetic-service-roundtrip-'.repeat(2), jwtKey = 'synthetic-jwt-roundtrip-'.repeat(2);
  const groups = ['TIAL1','TIAL2','SOLVER1'].map((profile,i) => ({ chatId: String(-1001-i), threadId: null,
    threadMode: 'non_topic', profile, commands: i === 2 ? ['config_psb','mo'] : ['order','req'] }));
  let server, webServer, worker, liveAbort, liveRead, shift = 0, databaseFault = false;
  const oldFlag = process.env.HDWORK2_OPERATIONS_ENABLED;
  try {
    const c = await pool.getConnection();
    try {
      await guard.verifyTarget(c, options.database);
      for (const sql of guard.migrationStatements()) await c.query(sql);
      for (const name of ['007_hdwork2_auth.sql','008_hdwork2_operations.sql','009_hdwork2_courier_runtime.sql','010_hdwork2_account_approval.sql','011_hdwork2_registration_rejection.sql']) {
        if(name==='009_hdwork2_courier_runtime.sql')await c.execute("INSERT INTO hd2_courier_inbox(id,bot_id,update_id,payload_hash,payload,state,due_ms) VALUES (?,'migration-fixture','1',?,?,'IGNORED',0)",[randomUUID(),'a'.repeat(64),JSON.stringify({synthetic:true})]);
        for(const sql of schemaStatements([name]))await c.query(sql);
      }
      const [[preserved]]=await c.execute("SELECT state,received_seq FROM hd2_courier_inbox WHERE bot_id='migration-fixture'");
      assert.equal(preserved.state,'IGNORED');assert.ok(Number(preserved.received_seq)>0);
    } finally { c.release(); }
    process.env.HDWORK2_OPERATIONS_ENABLED = 'true';
    const { MysqlStore } = require('../../src/courier/mysql-store');
    const faultPool = { execute: (...a) => pool.execute(...a), async getConnection() { if(databaseFault) throw Error('Synthetic database offline'); return pool.getConnection(); } };
    const store = new MysqlStore({ pool: faultPool, botId, now: () => Date.now()+shift, orderedInbox:true });
    const runtime = new (require('../../src/courier/runtime-store').RuntimeStore)(store);
    const policy = require('../../src/courier/groups').createGroupPolicy({botId, botUsername:'HDWorkOpsBot', groups});
    const { createIntegrationApp } = require('../../src/courier/integration-app');
    server = require('node:http').createServer(createIntegrationApp({store,runtime,policy,botId,key,receive:true,send:true}));
    await new Promise(r => server.listen(0,'127.0.0.1',r));
    const internalUrl='http://127.0.0.1:'+server.address().port;
    async function python(data) {
      const child = spawn(env.HDWORK2_TEST_PYTHON || (process.platform==='win32'?'python':'python3'),['tests/helpers/courier-roundtrip.py','--mock-only'],{cwd:path.resolve(__dirname,'../..'),env:childEnvironment(process.env,{PYTHONPATH:'courier_bot'}),windowsHide:true,stdio:['pipe','pipe','pipe']});
      let out='',err=''; child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
      child.stdin.end(JSON.stringify({server:internalUrl,journal:path.join(temp,'journal.sqlite'),groups,...data}));
      const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
      assert.equal(code,0,'Fake Python transport failed (payload/credentials suppressed)');
      return JSON.parse(out);
    }
    const { createService } = require('../../src/access/service'), { createStore } = require('../../src/access/store');
    const auth=createService(createStore(pool),jwtKey), password='synthetic-password-only';
    await auth.bootstrap({name:'Synthetic Admin',username:'admin',password});
    const accounts=[];
    for (const [i,role] of ['HD','HD','SHOW_ONLY'].entries()) {
      const {id}=await approvedAccount(auth,1,{name:'Synthetic HD '+i,username:'person'+i,password,role,is_active:true,modules:i===2?['REQ']:['TIAL','REQ','LOGIC_PSB','LOGIC_MO']});
      accounts.push({id,...await auth.login('person'+i,password)});
    }
    const operationalEnv={HDWORK2_OPERATIONS_ENABLED:'true',HDWORK2_AUTH_V2:'true',DB_NAME:'hdwork2',JWT_SECRET:jwtKey,FRONTEND_ORIGINS:'https://app.example.invalid'};
    const {operations:routes}=loadRuntime(pool,operationalEnv);
    const app=require('express')();app.use(require('express').json());app.use('/api/operations',routes);
    webServer=require('node:http').createServer(app);await new Promise(r=>webServer.listen(0,'127.0.0.1',r));
    const webUrl='http://127.0.0.1:'+webServer.address().port;
    async function web(route,who=accounts[0],body) {
      return fetch(webUrl+'/api/operations'+route,{method:body?'POST':'GET',headers:{Cookie:'__Host-hdwork2-session='+who.token,
        ...(body?{'Content-Type':'application/json',Origin:operationalEnv.FRONTEND_ORIGINS,'X-CSRF-Token':auth.csrf(who.token)}:{})},...(body?{body:JSON.stringify(body)}:{})});
    }
    assert.equal((await fetch(webUrl+'/api/operations/orders')).status,401);
    assert.deepEqual((await (await web('/orders')).json()).data,[]);
    liveAbort=new AbortController();const frames=[];
    const stream=await fetch(webUrl+'/api/operations/events',{headers:{Cookie:'__Host-hdwork2-session='+accounts[0].token},signal:liveAbort.signal});
    assert.equal(stream.status,200);
    liveRead=(async()=>{const reader=stream.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;frames.push(Buffer.from(value).toString());}}catch(e){if(!liveAbort.signal.aborted)throw e;}})();
    async function wait(check) { const until=Date.now()+10000;while(!await check()){if(Date.now()>until)throw Error('Disposable wait timed out');await new Promise(r=>setTimeout(r,25));} }
    await wait(()=>frames.join('').split('event: reset').length>=3);
    const raw='/order@HDWorkOpsBot\nSC/IN:X-AOi001\nNO INET:000123\nSN ONT:SN1\nSTO:ABC\nKETERANGAN:test\nNIK:SYNTHETIC';
    const inputs=[raw,raw,'/req@HDWorkOpsBot original request','/CONFIG_PSB\nOrder ID:X-AOi002\nSTO:ABC','/MO@hdworkopsbot\nSC/IN:X-MOk003\nSTO:ABC',raw,'/MO\nSC/IN:X-MOk004\nSTO:ABC','DONE'];
    const updates=inputs.map((text,i)=>({update_id:101+i,message:{message_id:501+i,chat:{id:[-1001,-1002,-1001,-1003,-1003,-999,-1001,-1001][i]},from:{id:9},date:1762315200+(i===1?86400:0),text,...(i===7?{reply_to_message:{message_id:501}}:{})}}));
    const first=await python({poll:true,updates,lose_event_ack:true});
    assert.equal(first.offset,109);assert.equal(first.states.PENDING,5);assert.equal(first.states.IGNORED,2); // Unmapped source is discarded before journal serialization.
    assert.equal(Object.values(first.states).reduce((a,b)=>a+b,0),7);
    const processor=require('../../src/b2c-workflow/workflow').createB2CProcessor({store,config:{enabled:true,webOnly:true,botId,botUsername:'HDWorkOpsBot',identityKey:'synthetic-order-identity-'.repeat(2),dedupeBy:'sc_in',actors:[],groups:groups.map(g=>({module:g.profile==='SOLVER1'?'LOGIC_PSB':'TIAL',chatId:g.chatId,threadId:null,threadMode:'non_topic',commandProfile:g.profile,allowedCommands:g.commands}))}});
    worker=require('../../src/courier/inbox-worker').startInboxWorker(processor);
    const resumed=await python({poll:true,rounds:2});assert.equal(resumed.states.ACKED,5);assert.equal(resumed.offset,109);
    await wait(async()=>Number((await pool.query('SELECT COUNT(*) AS n FROM hd2_orders'))[0][0].n)===5);
    await worker.close();worker=null;
    await wait(()=>frames.join('').includes('"arrival":true'));
    assert.doesNotMatch(frames.join(''),/X-AOi|SYNTHETIC|telegram_message|raw_text|NIK/);
    const [orders]=await pool.query('SELECT id,chat_id,message_id,status,duplicate_of FROM hd2_orders ORDER BY telegram_timestamp,message_id');
    const canonical=orders.find(o=>o.message_id==='501'),duplicate=orders.find(o=>o.message_id==='502');
    assert.equal(canonical.chat_id,'-1001');assert.equal(duplicate.chat_id,'-1002');assert.equal(duplicate.duplicate_of,canonical.id);assert.equal(duplicate.status,'DUPLICATE');
    assert.equal((await (await web('/orders?area=TIAL')).json()).data.length,2)
    assert.equal((await (await web('/orders?area=TIAL&tab=duplicates')).json()).data.length,1);
    assert.equal((await (await web('/orders?area=LOGIC')).json()).data.length,2);
    const reqOrder=(await (await web('/orders?command=req')).json()).data[0];
    assert.equal((await (await web('/orders/'+reqOrder.id)).json()).requestText,' original request');
    assert.equal((await (await web('/orders?area=TIAL',accounts[2])).json()).data.length,1);
    assert.equal((await web('/orders/'+canonical.id,accounts[2])).status,404);
    async function action(id,who,action,note,confirm) {
      const d=await (await web('/orders/'+id,who)).json();
      const response=await web('/orders/'+id+'/actions',who,{requestId:randomUUID(),version:d.data.version,action,...(note!==undefined?{note}:{}),...(confirm?{confirm:true}:{})});
      assert.equal(response.status,200,action+' failed');
    }
    assert.equal((await web('/orders',accounts[0],{requestId:randomUUID(),module:'TIAL',reference:'FORBIDDEN',description:'No manual orders'})).status,403);
    const beforePick=Number((await pool.query('SELECT COUNT(*) AS n FROM hd2_courier_outbox'))[0][0].n);
    const {winner}=await pickRace((i,body)=>web('/orders/'+canonical.id+'/actions',accounts[i],body));
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM hd2_courier_outbox'))[0][0].n),beforePick+1);
    const other=1-winner;await action(canonical.id,accounts[other],'TAKEOVER');
    const stale=await (await web('/orders/'+canonical.id,accounts[winner])).json();
    assert.equal(stale.data.status,'IN_PROGRESS');assert.equal(stale.data.feedback.status,'ANTRE');
    assert.equal((await web('/orders/'+canonical.id+'/actions',accounts[winner],{requestId:randomUUID(),version:stale.data.version,action:'DONE'})).status,409);
    await action(canonical.id,accounts[other],'DONE','checked');
    const before=Number((await pool.query('SELECT COUNT(*) AS n FROM hd2_courier_outbox'))[0][0].n);
    await action(canonical.id,accounts[0],'REOPEN',undefined,true);
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM hd2_courier_outbox'))[0][0].n),before);
    await action(canonical.id,accounts[0],'FAILED','synthetic reason');
    await action(duplicate.id,accounts[0],'CONTINUE_DUPLICATE');await action(duplicate.id,accounts[0],'REJECT_DUPLICATE');
    await action(duplicate.id,accounts[1],'REOPEN',undefined,true);await action(duplicate.id,accounts[1],'REJECT_DUPLICATE');
    for(const order of orders.filter(o=>!['501','502'].includes(o.message_id))){await action(order.id,accounts[0],'PICK');await action(order.id,accounts[0],'DONE');}
    await auditLinks(pool,canonical.id);
    const stats=await (await web('/recap?area=ALL')).json();durationStats(stats.data);assert.equal(stats.data.durationCount,4);
    const overview=await (await web('/overview')).json();durationStats(overview.all);assert.equal(overview.all.durationSeconds,overview.TIAL.durationSeconds+overview.LOGIC.durationSeconds);
    const [queued]=await pool.query('SELECT payload FROM hd2_courier_outbox');
    const payloads=queued.map(r=>typeof r.payload==='string'?JSON.parse(r.payload):r.payload);
    assert.ok(payloads.some(p=>p.text==='✅ Done (ACTCOMP)\nchecked\nJgn lupa VALINS after PS. Salam, Synthetic HD '+other+'!'));
    assert.equal(payloads.filter(p=>p.text==='✅ Done').length,3);
    assert.ok(payloads.some(p=>p.text==='❌ synthetic reason'));assert.ok(payloads.some(p=>p.text==='❌ Duplikat Order'));
    const lost=await python({send:true,lose_outbox_ack:true});assert.equal(lost.sent.length,1);assert.equal(lost.pendingAck,true);
    const delivered=await python({send:true,rounds:20});assert.equal(delivered.pendingAck,false);assert.equal(delivered.sent.length,payloads.length-1);
    const canonicalJson=value=>JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])));
    const expected=payloads.map(p=>createHash('sha256').update(canonicalJson(p)).digest('hex')).sort();
    assert.deepEqual([...lost.sent,...delivered.sent].sort(),expected);
    assert.equal(Number((await pool.query("SELECT COUNT(*) AS n FROM hd2_courier_outbox WHERE state='SENT'"))[0][0].n),payloads.length);
    assert.equal((await (await web('/orders/'+canonical.id)).json()).data.feedback.status,'TERKIRIM');
    // Strict FIFO blocks later work while its predecessor is backing off.
    const extra=number=>({version:1,bot_id:botId,update_id:String(number),event:{kind:'message',chat_id:'-1001',message_id:String(number),telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1762315200,text:'/req next '+number,attachments:[]}});
    const firstPending=await store.accept(extra(900)),secondPending=await store.accept(extra(901));
    await pool.execute('UPDATE hd2_courier_inbox SET due_ms=? WHERE id=?',[Date.now()+60000,firstPending.receipt_id]);
    assert.equal(await processor.processNext(),false);
    assert.equal((await pool.execute('SELECT state FROM hd2_courier_inbox WHERE id=?',[secondPending.receipt_id]))[0][0].state,'PENDING');
    await pool.execute('UPDATE hd2_courier_inbox SET due_ms=0 WHERE id=?',[firstPending.receipt_id]);
    await processor.processNext();await processor.processNext();
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM hd2_orders'))[0][0].n),7);
    // Competing owners and durable nonce replay after a fresh verifier/runtime.
    const a=randomUUID(),b=randomUUID();const leases=await Promise.allSettled([runtime.lease('acquire',{worker_id:a}),runtime.lease('acquire',{worker_id:b})]);
    assert.equal(leases.filter(r=>r.status==='fulfilled').length,1);
    const index=leases.findIndex(r=>r.status==='fulfilled'),old=leases[index].value,owner=index===0?a:b;
    shift+=60001;await assert.rejects(runtime.assertWorker({id:owner,lease_token:old.lease_token}),{statusCode:409});
    const fresh=await runtime.lease('acquire',{worker_id:b});await assert.rejects(runtime.lease('renew',{worker_id:owner,lease_token:old.lease_token}),{statusCode:409});
    await runtime.lease('release',{worker_id:b,lease_token:fresh.lease_token});
    const nonce={nonce:randomBytes(16).toString('hex'),expiresMs:Date.now()+shift+120000};
    await runtime.reserveNonce(nonce);await assert.rejects(new (require('../../src/courier/runtime-store').RuntimeStore)(store).reserveNonce(nonce),{statusCode:401});
    // Database connection failure => generic 503, no false persistent ACK.
    function packet(body,route) { const raw=JSON.stringify(body),stamp=String(Math.floor(Date.now()/1000)),n=randomBytes(16).toString('hex');const msg=[botId,stamp,n,'POST',route,createHash('sha256').update(raw).digest('hex')].join('\n');return {method:'POST',headers:{'Content-Type':'application/json','X-Courier-Id':botId,'X-Courier-Time':stamp,'X-Courier-Nonce':n,'X-Courier-Signature':createHmac('sha256',key).update(msg).digest('hex')},body:raw}; }
    const recoveringWorker=randomUUID(),recoveringLease=await runtime.lease('acquire',{worker_id:recoveringWorker});
    const recoveringBody={...extra(999),worker:{id:recoveringWorker,lease_token:recoveringLease.lease_token}};
    databaseFault=true;const failed=await fetch(internalUrl+'/internal/courier/v1/events',packet(recoveringBody,'/internal/courier/v1/events'));
    assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/database|password|SQL|Synthetic/);databaseFault=false;
    const recovered=await fetch(internalUrl+'/internal/courier/v1/events',packet(recoveringBody,'/internal/courier/v1/events'));assert.equal(recovered.status,200);
    const recoveredReceipt=await recovered.json();assert.ok(recoveredReceipt.receipt_id);
    const redelivered=await (await fetch(internalUrl+'/internal/courier/v1/events',packet(recoveringBody,'/internal/courier/v1/events'))).json();
    assert.equal(redelivered.duplicate,true);assert.equal(redelivered.receipt_id,recoveredReceipt.receipt_id);
    await runtime.lease('release',{worker_id:recoveringWorker,lease_token:recoveringLease.lease_token});
    await processor.processNext();assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM hd2_orders'))[0][0].n),8);
    // Server-authorized send rejects an unanchored queued payload without emitting it.
    await store.enqueue('unsafe-test-only',{method:'sendMessage',chat_id:'-999',telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:'55',text:'synthetic'});
    assert.deepEqual(await store.claim(1,{authorize:(p,c)=>policy.outgoing(p,c)}),[]);
    assert.equal((await pool.query("SELECT state FROM hd2_courier_outbox WHERE idem_key='unsafe-test-only'"))[0][0].state,'DEAD');
    const retryId=await store.enqueue('retry-test-only',payloads[0]);
    const claims=(await Promise.all([store.claim(),store.claim()])).flat();assert.equal(claims.length,1);
    let retryJob=claims[0];
    for(let attempt=1;attempt<=5;attempt++){
      assert.equal(retryJob.attempt,attempt);
      await store.settle(retryId,{lease_token:retryJob.lease_token,result:'retry',error_code:'RATE_LIMIT',retry_after:attempt===1?3:0});
      assert.deepEqual(await store.claim(),[]);shift+=64000;
      if(attempt<5)[retryJob]=await store.claim();
    }
    assert.equal((await pool.execute('SELECT state FROM hd2_courier_outbox WHERE id=?',[retryId]))[0][0].state,'DEAD');
    const expiredId=await store.enqueue('lease-expiry-test-only',payloads[0]);const [expiredJob]=await store.claim();shift+=60001;
    await assert.rejects(store.settle(expiredId,{lease_token:expiredJob.lease_token,result:'sent',telegram_message_id:'5000'}),{statusCode:409});
    assert.deepEqual(await store.claim(),[]);shift+=64000;assert.deepEqual(await store.claim(),[]);
    assert.equal((await pool.execute('SELECT state FROM hd2_courier_outbox WHERE id=?',[expiredId]))[0][0].state,'DEAD');
    const uncertainId=await store.enqueue('uncertain-test-only',payloads[0]);const [uncertainJob]=await store.claim();
    await store.settle(uncertainId,{lease_token:uncertainJob.lease_token,result:'retry',error_code:'NETWORK'});shift+=64000;assert.deepEqual(await store.claim(),[]);
    assert.equal((await pool.execute('SELECT state FROM hd2_courier_outbox WHERE id=?',[uncertainId]))[0][0].state,'DEAD');
    const [plan]=await pool.execute("EXPLAIN SELECT id FROM hd2_courier_inbox WHERE bot_id=? AND state='PENDING' ORDER BY received_seq LIMIT 1",[botId]);
    return {ok:true,migrations:'004-010',approval:true,doublePick:true,auditCorrelation:true,feedback:true,durationStats:true,orders:8,webRoundtripOrders:5,outboxSent:payloads.length,pythonRestart:true,lostAckRecovered:true,databaseRecovery:true,sse:true,queueIndex:plan[0].key,telegram:'FAKE_ONLY'};
  } finally {
    if(oldFlag===undefined)delete process.env.HDWORK2_OPERATIONS_ENABLED;else process.env.HDWORK2_OPERATIONS_ENABLED=oldFlag;
    liveAbort?.abort();await liveRead?.catch(()=>{});await worker?.close();
    if(server)await new Promise(r=>server.close(r));if(webServer)await new Promise(r=>webServer.close(r));
    await pool.end();fs.rmSync(temp,{recursive:true,force:true});
  }
}
if(require.main===module){if(process.argv.length===2)console.log('Courier disposable rehearsal disabled.');else run().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Courier disposable rehearsal failed/rejected (details suppressed).');process.exitCode=1;});}
module.exports={run};
