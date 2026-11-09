const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {act}=require('../src/operations/mutate');
const {fixture}=require('./helpers/operations-fixture.cjs');
test('concurrent status PICK uses version lock; retry is idempotent and reply preserves topic',async()=>{
 const {pool,id}=fixture(),first={requestId:randomUUID(),version:0,action:'PICK'},second={...first,requestId:randomUUID()};
 const result=await Promise.allSettled([act(pool,'synthetic',1,id,first),act(pool,'synthetic',2,id,second)]);
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
