const test=require('node:test'),assert=require('node:assert/strict');
const {filters,where,transition}=require('../src/operations/policy');
const {settlementState,feedbackState}=require('../src/courier/delivery-state');
const {combine}=require('../src/operations/statistics');
const {MemoryStore}=require('../src/courier/memory-store');
const {attachFeedback}=require('../src/operations/feedback');
const user={id:7,name:'Synthetic',role:'HD',is_active:1,modules:['TIAL','REQ']};
test('search combines scoped pagination, dates and handler; STO/phone are parameterized and wildcards escaped',()=>{
 const f=filters({area:'TIAL',tab:'process',mine:'false',hd:'8',from:'2026-11-01',to:'2026-11-09',q:"S_%'",page:'2'},user),w=where(f,user);
 assert.equal(f.page,2);assert.match(w.sql,/owner_user_id=\?/);assert.match(w.sql,/business_day BETWEEN/);assert.ok(w.sql.includes('$.STO'));assert.ok(w.sql.includes('NO INET/TELP'));assert.ok(w.sql.includes('NO VOICE'));assert.ok(!w.sql.includes("S_%'"));assert.equal(w.values.filter(v=>v==="%s=_=%'%").length,5);
});
test('duration aggregation is weighted by completed order count rather than averaging workspace averages',()=>{
 const result=combine({total:2,durationSeconds:120,durationCount:2,averageDurationSeconds:60},{total:1,durationSeconds:600,durationCount:1,averageDurationSeconds:600});assert.equal(result.total,3);assert.equal(result.averageDurationSeconds,240);assert.equal(combine({durationCount:0,durationSeconds:0},{durationCount:0,durationSeconds:0}).averageDurationSeconds,0);
});
test('uncertain Telegram outcomes never retry and success requires a real delivery message id',()=>{
 for(const code of ['NETWORK','UNKNOWN','ECONNRESET','ETIMEDOUT']){assert.equal(settlementState('retry',code,1,5),'DEAD');assert.equal(feedbackState({state:'DEAD',last_error_code:code}),'TIDAK_PASTI');}
 assert.equal(settlementState('retry','RATE_LIMIT',1,5),'QUEUED');assert.equal(settlementState('retry','RATE_LIMIT',5,5),'DEAD');assert.equal(feedbackState({state:'SENT'}),'TIDAK_PASTI');assert.equal(feedbackState({state:'SENT',telegram_message_id:'123'}),'TERKIRIM');assert.equal(feedbackState({state:'DEAD',last_error_code:'FORBIDDEN'}),'GAGAL');assert.equal(feedbackState({state:'QUEUED'}),'ANTRE');
});
test('transport reset and expired leases cannot resend even when attempt budget remains',()=>{
 let now=0;const store=new MemoryStore({botId:'synthetic',now:()=>now});const payload={method:'sendMessage',chat_id:'-100123',telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:'10',text:'Synthetic only'};
 const id=store.enqueue('one',payload),[lease]=store.claim();store.settle(id,{lease_token:lease.lease_token,result:'retry',error_code:'ECONNRESET'});now=1000000;assert.deepEqual(store.claim(),[]);assert.equal(store.outbox.get(id).status,'dead');
 const expired=store.enqueue('two',payload);store.claim();now+=60001;assert.deepEqual(store.claim(),[]);assert.equal(store.outbox.get(expired).last_error_code,'LEASE_EXPIRED');
});
test('feedback is read from an outbox joined to committed order requests, never fabricated when absent',async()=>{
 const orders=[{id:'order-a'},{id:'order-b'}];let queried=false;await attachFeedback({async execute(sql,args){queried=true;assert.deepEqual(args,['order-a','order-b']);assert.ok(sql.includes('r.order_id=o.id'));assert.ok(sql.includes('b2.bot_id=o.bot_id'));assert.ok(sql.includes('LIMIT 1'));return [[{order_id:'order-a',id:'delivery',state:'SENT',telegram_message_id:'9'}]];}},orders);assert.equal(queried,true);assert.equal(orders[0].feedback.status,'TERKIRIM');assert.equal(orders[1].feedback,null);
});
test('FAILED reason is trimmed, mandatory and included in persisted transition and feedback text',()=>{
 const order={command:'order',status:'IN_PROGRESS',owner_user_id:7};for(const note of ['', '  ',null,7])assert.throws(()=>transition(order,user,{action:'FAILED',confirm:true,note}));const change=transition(order,user,{action:'FAILED',confirm:true,note:'  Port bermasalah  '});assert.equal(change.next.completion_note,'Port bermasalah');assert.ok(change.text.includes('Port bermasalah'));assert.equal(change.next.finish,true);
});
