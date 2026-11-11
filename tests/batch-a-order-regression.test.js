const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {reader}=require('../src/operations/read');
const {act}=require('../src/operations/mutate');
test('internal UUID detail reads real owner and history even with malformed legacy JSON',async()=>{
 const id='01234567-89ab-1def-8123-456789abcdef',calls=[];
 const c={async query(){},async beginTransaction(){},async commit(){},async rollback(){},release(){},async execute(sql,params){calls.push({sql,params});if(sql.includes('FROM hd2_audit'))return [[{id:'event',action:'DONE',to_status:'DONE',name:'Actual HD',detail:'legacy plain text',at:'2026-11-09T01:00:00Z'}]];return [[{id,command:'order',module:'TIAL',status:'DONE',sc_in:'SC123',telegram_timestamp:1794186000,owner_name:'Actual HD',command_fields:'{old invalid JSON',version:2}]];}};
 const detail=await reader({async getConnection(){return c;}}).detail(id,{id:1,modules:['TIAL']});
 assert.equal(detail.data.id,id);assert.equal(detail.data.scIn,'SC123');assert.equal(detail.data.ownerName,'Actual HD');assert.equal(detail.history[0].actor,'Actual HD');assert.ok(calls.every(c=>c.params.includes(id)));assert.deepEqual(detail.fields['SC/IN'],null);
});
test('duplicate decisions and completion update only the selected row, keep audit and Telegram outbox',async()=>{
 for(const action of ['CONTINUE_DUPLICATE','REJECT_DUPLICATE','DONE','FAILED']){
  const id=randomUUID(),canonical=randomUUID(),calls=[];let payloadHash;
  const order={id,bot_id:'testbot',chat_id:'-100123456789',message_id:'10',thread_id:null,command:'order',telegram_timestamp:1794186000,status:['DONE','FAILED'].includes(action)?'IN_PROGRESS':'DUPLICATE',owner_user_id:1,duplicate_of:canonical,version:0};
  const c={async beginTransaction(){},async commit(){},async rollback(){},release(){},async execute(sql,p){calls.push({sql,p});if(sql.includes('FROM users WHERE id=? FOR SHARE'))return [[{id:1,name:'Test HD',role:'HD',is_active:1}]];if(sql.includes('FROM hd2_user_modules'))return [[{module:'TIAL'}]];if(sql.includes('FROM hd2_sessions'))return [[{token_hash:'session'}]];if(sql.includes('SELECT * FROM hd2_orders'))return [[order]];if(sql.startsWith('INSERT INTO hd2_web_requests'))payloadHash=p[3];if(sql.includes('SELECT payload_hash,result'))return [[{payload_hash:payloadHash}]];if(sql.includes('SELECT name FROM users'))return [[{name:'Test HD'}]];if(sql.includes('SELECT id,payload_hash FROM hd2_courier_outbox'))return [[{id:'outbox',payload_hash:calls.find(x=>x.sql.startsWith('INSERT INTO hd2_courier_outbox')).p[3]}]];return [{}];}};
  const result=await act({async getConnection(){return c;}},'session',1,id,{requestId:randomUUID(),version:0,action,confirm:['DONE','FAILED'].includes(action),note:'Checked'});
  assert.equal(result.id,id);const updates=calls.filter(x=>x.sql.startsWith('UPDATE hd2_orders'));assert.equal(updates.length,1);assert.equal(updates[0].p.at(-1),id);assert.equal(order.duplicate_of,canonical);assert.ok(calls.some(x=>x.sql.startsWith('INSERT INTO hd2_audit')));assert.ok(calls.some(x=>x.sql.startsWith('INSERT INTO hd2_courier_outbox')));
 }
});
