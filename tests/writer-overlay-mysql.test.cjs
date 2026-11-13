const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{randomUUID}=require('crypto');
test('actual production-baseline overlay and compatible rollback enqueue safely on isolated MySQL',async()=>{
 const parent=fs.readFileSync('.local/remediation-parent.txt','utf8').trim(),overlay=fs.existsSync('.local/overlay-current.txt')?fs.readFileSync('.local/overlay-current.txt','utf8').trim():path.join(parent,'web-overlay-rehearsal'),preparation=JSON.parse(fs.readFileSync(path.join(overlay,'preparation.json')));
 const f=await require('./helpers/temporary-courier-mysql.cjs').start(parent),schema=require('./helpers/writer-schema.cjs');const old=process.env.HDWORK2_COURIER_WRITER_V2_BOTS_JSON;
 try{
  await schema.install(f.c);await f.c.query("INSERT INTO users(id,name,username,password_hash,role,is_active) VALUES (1,'Fixture','fixture','x','HD',TRUE)");await f.c.query("INSERT INTO hd2_user_modules VALUES (1,'TIAL')");
  const token='fixture-token';await f.c.execute('INSERT INTO hd2_sessions(token_hash,user_id,expires_at) VALUES (?,1,TIMESTAMPADD(HOUR,1,UTC_TIMESTAMP(3)))',[require('../src/access/service').digest(token)]);
  const order=randomUUID();await f.c.execute("INSERT INTO hd2_orders(id,bot_id,module,business_day,chat_id,message_id,status,command,owner_user_id,version,telegram_timestamp) VALUES (?,'fixture-bot','TIAL',UTC_DATE(),'-1001','101','IN_PROGRESS','order',1,1,UNIX_TIMESTAMP())",[order]);await f.c.execute("INSERT INTO hd2_system_mappings(id,bot_id,category,profile,chat_id,route_key,enabled,verified) VALUES (?,'fixture-bot','TIAL','TIAL1','-1001','fixture',TRUE,TRUE)",[randomUUID()]);
  const fence=require('../src/courier/writer-fence');await fence.change(f.pool,{botId:'fixture-bot',action:'initialize',operator:'Fixture',reason:'overlay rehearsal'});await fence.change(f.pool,{botId:'fixture-bot',action:'open',expectedEpoch:'2',operator:'Fixture',reason:'overlay rehearsal'});
  process.env.HDWORK2_COURIER_WRITER_V2_BOTS_JSON='["fixture-bot"]';const records=[];
  for(const item of Object.values(preparation.packets)){
   assert.equal(item.startupFenced,true);const control=JSON.parse(fs.readFileSync(item.controlFile));assert.equal(control.ownerSid,'S-1-5-19');assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(item.controlFile),'task-settings.json'))).priority,4);
   const manifest=JSON.parse(fs.readFileSync(path.join(item.directory,'overlay-manifest.json')));
   for(const [file,digest] of Object.entries(manifest.files))assert.equal(require('crypto').createHash('sha256').update(fs.readFileSync(path.join(item.directory,file))).digest('hex'),digest);
   const chat=require(path.join(item.directory,'src/chat/service.js')).createChat({readPool:f.pool,writePool:f.pool});
   const result=await chat.send(order,token,1,{requestId:randomUUID(),version:1,text:'synthetic overlay reply'});records.push(result.outboxId);
  }
  const [rows]=await f.c.query('SELECT conversation_seq FROM hd2_courier_outbox ORDER BY conversation_seq');assert.deepEqual(rows.map(r=>String(r.conversation_seq)),['1','2']);
  await fence.change(f.pool,{botId:'fixture-bot',action:'close',expectedEpoch:'3',operator:'Fixture',reason:'rollback gate'});
  const currentEnv=JSON.parse(fs.readFileSync(path.join(preparation.packets.candidate.directory,'service/environment.json'))),candidateEnv=JSON.parse(fs.readFileSync(path.join(preparation.packets.rollback.directory,'service/environment.json')));
  const checked=await require('../scripts/lib/courier-writer-rollback.cjs').verify({currentSource:preparation.packets.candidate.directory,candidateSource:preparation.packets.rollback.directory,currentEnv,candidateEnv,botId:'fixture-bot',pool:f.pool,expectedEpoch:'4'});assert.equal(checked.status,'COMPATIBLE_WRITER_ROLLBACK_VERIFIED');
  const rollbackChat=require(path.join(preparation.packets.rollback.directory,'src/chat/service.js')).createChat({readPool:f.pool,writePool:f.pool});await assert.rejects(rollbackChat.send(order,token,1,{requestId:randomUUID(),version:1,text:'blocked'}),{code:'WRITER_FENCE_CLOSED'});
  fs.writeFileSync(path.join(parent,'overlay-rehearsal-result.json'),JSON.stringify({status:'OVERLAY_AND_ROLLBACK_MYSQL_PASS',productionBaselineSourceUsed:true,productionConnections:false,telegramCalls:0,records:records.length}));
 }finally{if(old===undefined)delete process.env.HDWORK2_COURIER_WRITER_V2_BOTS_JSON;else process.env.HDWORK2_COURIER_WRITER_V2_BOTS_JSON=old;await f.stop();}
});
