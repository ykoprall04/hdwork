const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {captureIncoming}=require('../src/chat/service');
function fixture(){
 const order={id:randomUUID(),bot_id:'synthetic',chat_id:'-100123',thread_id:null,message_id:'10',command:'req',module:'TIAL'};
 const calls=[],seen=new Set();
 const c={async execute(sql,p){
  calls.push({sql,p});
  if(sql.startsWith('SELECT')){
   const same=p[0]===order.bot_id&&p[1]===order.chat_id&&p[2]===order.thread_id;
   const match=sql.includes('FROM hd2_courier_outbox b JOIN')?p[3]==='11':sql.includes('FROM hd2_chat_messages m JOIN')?['12','13'].includes(p[3]):p[3]==='10';
   return [[...(same&&match?[order]:[])]];
  }
  if(sql.startsWith('INSERT IGNORE INTO hd2_chat_messages')){const duplicate=seen.has(p[5]);seen.add(p[5]);return [{affectedRows:duplicate?0:1}];}
  if(sql.startsWith('INSERT INTO hd2_audit')||sql.startsWith('INSERT INTO hd2_live_events'))return [{}];
  throw Error('Unexpected mutation');
 }};
 const event={chat_id:order.chat_id,telegram_thread_id:null,message_id:'21',reply_to_message_id:'13',sender_id:'9',text:'synthetic reply',attachments:[],timestamp:1700000000};
 return {order,calls,c,event};
}
test('incoming replies to original and delivered chat anchors are persisted once with a module event, never an outgoing message',async()=>{
 for(const anchor of ['10','12','13']){
  const f=fixture(),event={...f.event,reply_to_message_id:anchor};
  assert.equal(await captureIncoming({c:f.c,event,botId:f.order.bot_id}),true);
  assert.equal(await captureIncoming({c:f.c,event,botId:f.order.bot_id}),true);
  const insert=f.calls.find(v=>v.sql.startsWith('INSERT IGNORE INTO hd2_chat_messages'));
  assert.equal(insert.p[1],f.order.id);assert.equal(insert.p[5],'21');assert.equal(insert.p[6],anchor);
  assert.equal(f.calls.filter(v=>v.sql.startsWith('INSERT INTO hd2_live_events')).length,1);
  assert.equal(f.calls.filter(v=>v.sql.startsWith('INSERT INTO hd2_audit')).length,1);
  assert.ok(f.calls.every(v=>!/^(UPDATE|DELETE|INSERT INTO hd2_courier_outbox)/.test(v.sql)));
 }
});
test('operational bot ACK replies resolve only delivered sendMessage in the exact bot/chat/topic and original-order anchor',async()=>{
 const f=fixture();assert.equal(await captureIncoming({c:f.c,event:{...f.event,reply_to_message_id:'11'},botId:f.order.bot_id}),true);
 const sql=f.calls.find(v=>v.sql.includes('FROM hd2_courier_outbox b JOIN')).sql;
 for(const condition of ["b.state='SENT'","'$.reply_to_message_id'","'$.telegram_thread_id'","'$.thread_mode'","'$.method'","o.bot_id=b.bot_id","o.thread_id<=>?"])assert.ok(sql.includes(condition));
});
test('unknown anchors and foreign routes do not insert incoming chat or change any order',async()=>{
 for(const change of [{reply_to_message_id:'999'},{chat_id:'-999'},{telegram_thread_id:'7'}]){
  const f=fixture();assert.equal(await captureIncoming({c:f.c,event:{...f.event,...change},botId:f.order.bot_id}),false);
  assert.ok(f.calls.every(v=>v.sql.startsWith('SELECT')));
 }
 const f=fixture();assert.equal(await captureIncoming({c:f.c,event:f.event,botId:'foreign'}),false);assert.ok(f.calls.every(v=>v.sql.startsWith('SELECT')));
});
