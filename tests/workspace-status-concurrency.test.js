const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {act}=require('../src/operations/mutate');
function fixture(){
 const id=randomUUID();let state={order:{id,bot_id:'synthetic-four',chat_id:'-1007002',message_id:'102',thread_id:'11',command:'b2b',module:'B2B',status:'WAITING',version:0,telegram_timestamp:1700000000,owner_user_id:null,final_user_id:null,duplicate_of:null,duplicate_decision:null},requests:[],outbox:[],audit:[]},tail=Promise.resolve();
 const pool={get state(){return state;},async getConnection(){const previous=tail;let unlock;tail=new Promise(r=>unlock=r);await previous;let saved;return {
  async beginTransaction(){saved=structuredClone(state);},async commit(){},async rollback(){state=saved;},release(){unlock();},
  async execute(sql,p=[]){
   if(sql.includes('FROM users'))return [[{id:1,name:'Synthetic',role:'HD',is_active:1}]];
   if(sql.includes('FROM hd2_user_modules'))return [[{module:'B2B'}]];
   if(sql.includes('FROM hd2_sessions'))return [[{token_hash:'synthetic'}]];
   if(sql.startsWith('SELECT * FROM hd2_orders'))return [[state.order]];
   if(sql.startsWith('INSERT INTO hd2_web_requests')){if(!state.requests.some(r=>r.user_id===p[0]&&r.request_id===p[1]))state.requests.push({user_id:p[0],request_id:p[1],payload_hash:p[3],result:null});return [{}];}
   if(sql.includes('FROM hd2_web_requests'))return [state.requests.filter(r=>r.user_id===p[0]&&r.request_id===p[1])];
   if(sql.startsWith('UPDATE hd2_web_requests')){state.requests.find(r=>r.user_id===p[1]&&r.request_id===p[2]).result=p[0];return [{}];}
   if(sql.startsWith('INSERT INTO hd2_courier_outbox')){state.outbox.push({id:p[0],bot_id:p[1],idem_key:p[2],payload_hash:p[3],payload:p[4]});return [{}];}
   if(sql.includes('FROM hd2_courier_outbox'))return [state.outbox.filter(r=>r.bot_id===p[0]&&r.idem_key===p[1])];
   if(sql.startsWith('UPDATE hd2_orders')){Object.assign(state.order,{status:p[0],owner_user_id:p[1],final_user_id:p[2],duplicate_decision:p[3],completion_note:p[4],version:state.order.version+1});return [{}];}
   if(sql.startsWith('INSERT INTO hd2_audit')){state.audit.push(p);return [{}];}
   if(sql.startsWith('INSERT INTO hd2_live_events'))return [{}];
   throw Error('Unexpected isolated SQL contract');
  }
 };}};return {pool,id};
}
test('concurrent status PICK uses version lock; retry is idempotent and reply preserves topic',async()=>{
 const {pool,id}=fixture(),first={requestId:randomUUID(),version:0,action:'PICK'},second={...first,requestId:randomUUID()};
 const result=await Promise.allSettled([act(pool,'synthetic',1,id,first),act(pool,'synthetic',1,id,second)]);
 assert.equal(result[0].status,'fulfilled');assert.equal(result[1].reason.statusCode,409);assert.equal(pool.state.order.version,1);
 await act(pool,'synthetic',1,id,first);assert.equal(pool.state.outbox.length,1);assert.equal(pool.state.audit.length,1);
 const reply=JSON.parse(pool.state.outbox[0].payload);assert.equal(reply.thread_mode,'thread');assert.equal(reply.telegram_thread_id,'11');assert.equal(reply.reply_to_message_id,'102');
 await act(pool,'synthetic',1,id,{requestId:randomUUID(),version:1,action:'DONE'});assert.equal(pool.state.order.status,'DONE');assert.equal(pool.state.order.version,2);
});
test('duplicate rejection only changes the duplicate record and replies to its own anchor',async()=>{
 const {pool,id}=fixture();pool.state.order.status='DUPLICATE';pool.state.order.duplicate_of=randomUUID();const canonical=pool.state.order.duplicate_of;
 await act(pool,'synthetic',1,id,{requestId:randomUUID(),version:0,action:'REJECT_DUPLICATE'});
 assert.equal(pool.state.order.duplicate_of,canonical);assert.equal(pool.state.order.duplicate_decision,'REJECT_DUPLICATE');assert.equal(JSON.parse(pool.state.outbox[0].payload).reply_to_message_id,'102');
 assert.notEqual(pool.state.order.id,canonical);assert.ok(pool.state.audit.every(p=>p[1]===id));
});
