const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createNotes,input}=require('../src/operations/order-notes');
const {createChat}=require('../src/chat/service');
const user={id:2,role:'HD',username:'synthetic',modules:['TIAL']};
test('incoming summary is one scoped query for own active orders, only incoming replies, with exact BIGINT sequences',async()=>{
 const calls=[],chat=createChat({readPool:{async execute(sql,values){calls.push({sql,values});return [[{id:randomUUID(),sequence:'18446744073709551615'}]];}},writePool:null});
 const result=await chat.incomingSummary({area:'TIAL'},user);assert.equal(result.data[0].sequence,'18446744073709551615');assert.equal(calls.length,1);
 const {sql,values}=calls[0];for(const part of ["m.direction='IN'",'m.reply_to_id IS NOT NULL',"o.status='IN_PROGRESS'",'o.owner_user_id=?','o.access_module IN (?)'])assert.ok(sql.includes(part),part);assert.deepEqual(values,['TIAL',2]);
 await assert.rejects(chat.incomingSummary({area:'LOGIC',ids:'arbitrary'},user),{statusCode:400});
 await assert.rejects(chat.incomingSummary({}, {...user,username:'trial_yanto'}),{statusCode:403});
});
test('note validation accepts clearing and rejects unknown fields, invalid text and overlong content',()=>{
 assert.equal(input({text:' \n '}),'');assert.equal(input({text:' internal \n note '}),'internal \n note');
 for(const body of [null,[],{text:2},{text:'x',status:'DONE'},{text:'a'.repeat(2001)},{text:'x\0'}])assert.throws(()=>input(body),{statusCode:400});
});
test('batch notes filter module scope, validate IDs, and reject non-HD/trial before SQL',async()=>{
 const calls=[],notes=createNotes({readPool:{async execute(sql,p){calls.push({sql,p});return [[{id:'visible',text:'internal'}]];}}});
 const id=randomUUID();await notes.list(id,user);assert.ok(calls[0].sql.includes('o.access_module IN (?)'));assert.deepEqual(calls[0].p,[id,'TIAL']);
 for(const actor of [{...user,role:'SHOW_ONLY'},{...user,role:'ADMIN'},{...user,username:'trial_yanto'}])await assert.rejects(notes.list(id,actor),{statusCode:403});
 await assert.rejects(notes.list('invalid',user),{statusCode:400});assert.equal(calls.length,1);
});
function writer({module='TIAL',status='IN_PROGRESS',owner=2,active=1,session=true,failInsert=false,failRestore=false}={}){
 const calls=[];let text='';
 const sessionCalls=[];
 const c={async query(sql,p){sessionCalls.push([sql,p]);if(p&&failRestore)throw Error('synthetic restore failure');if(sql.startsWith('SELECT @@SESSION'))return [[{metadataTimeout:31536000,rowTimeout:50}]];return [{}];},destroy(){calls.push('destroy');},async beginTransaction(){calls.push('begin');},async commit(){calls.push('commit');},async rollback(){calls.push('rollback');},release(){calls.push('release');},async execute(sql,p){
  calls.push(sql);
  if(sql.startsWith('SELECT id,role'))return [[{id:2,role:'HD',is_active:active}]];
  if(sql.includes('FROM hd2_sessions'))return [session?[{token_hash:'synthetic'}]:[]];
  if(sql.includes('FROM hd2_user_modules'))return [[{module:'TIAL'}]];
  if(sql.includes('SELECT access_module'))return [[{access_module:module,status,owner_user_id:owner}]];
  if(sql.startsWith('INSERT INTO hd2_order_notes')){if(failInsert)throw Error('synthetic database failure');text=p[1];return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO hd2_live_events'))return [{affectedRows:1}];
  throw Error('Unexpected query '+sql);
 }};
 return {calls,sessionCalls,get text(){return text;},pool:{async getConnection(){return c;}}};
}
test('notes save in a transaction for the active owner without changing order version, chat or Telegram outbox',async()=>{
 const w=writer(),notes=createNotes({writePool:w.pool});const id=randomUUID();
 assert.equal((await notes.save(id,'synthetic',user,{text:' note '})).text,'note');assert.equal(w.text,'note');
 assert.ok(w.calls.some(sql=>sql.includes('owner_user_id FROM hd2_orders WHERE id=? FOR SHARE')));
 assert.ok(w.calls.some(sql=>sql.includes('ON DUPLICATE KEY UPDATE body=?')));assert.deepEqual(w.calls.slice(-2),['commit','release']);
 assert.equal(w.sessionCalls[1][0],'SET SESSION lock_wait_timeout=5, innodb_lock_wait_timeout=5');assert.deepEqual(w.sessionCalls.at(-1)[1],[31536000,50]);
 assert.equal(w.calls.some(sql=>/UPDATE hd2_orders|hd2_courier_outbox|hd2_chat_messages|hd2_audit/.test(sql)),false);
 await notes.save(id,'synthetic',user,{text:''});assert.equal(w.text,'');
});
test('notes recheck active actor, session, module, status and owner in transaction; failures roll back without committing',async()=>{
 for(const [options,status] of [[{active:0},403],[{session:false},401],[{module:'REQ'},404],[{owner:3},403],[{status:'DONE'},403],[{failInsert:true},undefined]]){
  const w=writer(options),notes=createNotes({writePool:w.pool});
  await assert.rejects(notes.save(randomUUID(),'synthetic',user,{text:'private'}),status?{statusCode:status}:/synthetic database failure/);
  assert.deepEqual(w.calls.slice(-2),['rollback','release']);assert.equal(w.calls.includes('commit'),false);
  assert.deepEqual(w.sessionCalls.at(-1)[1],[31536000,50]);
 }
});
test('failed session restoration discards the connection rather than leaking changed timeouts into the pool',async()=>{
 const w=writer({failRestore:true}),notes=createNotes({writePool:w.pool});
 assert.equal((await notes.save(randomUUID(),'synthetic',user,{text:'saved'})).text,'saved');
 assert.deepEqual(w.calls.slice(-2),['commit','destroy']);assert.equal(w.calls.includes('release'),false);
});
test('optional note grants accept only backend SELECT/INSERT/UPDATE and never grant Courier notes access',()=>{
 const {policies,reviewOperationalGrants}=require('../src/config/operational-grants');
 for(const role of ['read','write','chatRead','chatWriteFifo','courier','courierSendChatFifo']){
  const grants=Object.entries(policies[role]).map(([table,ps])=>({'Grant':`GRANT ${ps.join(', ')} ON hdwork2.${table} TO synthetic`}));
  assert.equal(reviewOperationalGrants(grants,role).ok,true);
  const extra=ps=>[...grants,{Grant:`GRANT ${ps} ON hdwork2.hd2_order_notes TO synthetic`}];
  assert.equal(reviewOperationalGrants(extra('SELECT'),role).ok,!role.startsWith('courier'));
  if(!role.startsWith('courier'))assert.equal(reviewOperationalGrants(extra('SELECT, INSERT, UPDATE'),role).ok,role.toLowerCase().includes('write'));
  assert.equal(reviewOperationalGrants(extra('DELETE'),role).ok,false);
 }
});
test('process list projects full INET, SN ONT and config_psb purpose only in Proses Cek',async()=>{
 const {reader}=require('../src/operations/read');
 const sample={id:randomUUID(),command:'config_psb',inet:'12345678',telegram_timestamp:1700000000,psb_purpose:'Pasang baru',sn_ont_baru:'SN-NEW',sn_ont:'SN-OTHER'};
 const mock={async execute(sql){
  if(sql.includes('hd2_web_requests'))return [[]];
  assert.equal(sql.includes('AS psb_purpose'),sql.includes("o.status='IN_PROGRESS'"));
  assert.equal(sql.includes('AS mo_original'),sql.includes("o.status='IN_PROGRESS'"));
  return [[sample,{...sample,id:randomUUID(),command:'mo',sn_ont_baru:'-',sn_ont:null,mo_original:'/MO\nSN ONT: SN-LEGACY\nSN ONT LAMA: SN-OLD'}]];
 }};
 const read=reader(mock),actor={...user,modules:['LOGIC_PSB','LOGIC_MO']};
 const process=await read.list({area:'LOGIC',tab:'process'},actor);
 assert.equal(process.data[0].purpose,'Pasang baru');
 assert.equal(process.data[0].inetMasked,'••••5678');
 assert.equal(process.data[0].inet,'12345678');
 assert.equal(process.data[1].purpose,undefined);
 assert.equal(process.data[0].snOnt,'SN-NEW');
 assert.equal(process.data[1].snOnt,'SN-LEGACY');
 assert.equal(Object.hasOwn(process.data[1],'mo_original'),false);
 const finished=await read.list({area:'LOGIC',tab:'finished'},actor);
 assert.ok(finished.data.every(order=>!Object.hasOwn(order,'purpose')&&!Object.hasOwn(order,'inet')&&!Object.hasOwn(order,'snOnt')));
 assert.ok(!JSON.stringify(finished).includes('12345678'));
});

test('incoming TIAL and LOGIC list sorts oldest first before applying page offsets',async()=>{
 const {reader}=require('../src/operations/read');
 const calls=[],read=reader({async execute(sql,values){calls.push({sql,values});return [[]];}});
 const actor={...user,modules:['TIAL','LOGIC_PSB']};
 for(const area of ['TIAL','LOGIC']){
  await read.list({area,tab:'incoming',page:'2',q:'fixture'},actor);
  const {sql,values}=calls.at(-1);
  assert.match(sql,/ORDER BY o.telegram_timestamp ASC,o.id ASC LIMIT 26 OFFSET \?$/);
  assert.equal(values.at(-1),25);
 }
 await read.list({area:'LOGIC',tab:'finished'},actor);
 assert.match(calls.at(-1).sql,/ORDER BY o.telegram_timestamp DESC,o.id DESC/);
});

test('process queue uses the first transition and projects audited escalation',async()=>{
 const {reader}=require('../src/operations/read');
 const read=reader({async execute(sql){
  if(sql.includes('hd2_web_requests'))return [[]];
  assert.match(sql,/MIN\(a.created_at\)/);
  assert.match(sql,/a.from_status<>'IN_PROGRESS'/);
  assert.match(sql,/a.action='ESCALATE'/);
  assert.match(sql,/ORDER BY first_process_at DESC,o.id DESC LIMIT/);
  return [[{id:randomUUID(),telegram_timestamp:1700000000,escalated:1}]];
 }});
 const result=await read.list({area:'TIAL',tab:'process'},user);
 assert.equal(result.data[0].escalated,true);
});
