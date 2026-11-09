// Combined boundary regression for new web workspaces. All transports are fake.
const test=require('node:test'),assert=require('node:assert/strict'),{createHash,createHmac,randomBytes}=require('node:crypto');
const {createServiceAuth}=require('../src/courier/auth'),{createGroupPolicy}=require('../src/courier/groups'),{MemoryStore}=require('../src/courier/memory-store');
const botId='synthetic-boundary',key='synthetic-boundary-service-key-00000000';
const groups=[{chatId:'-1009001',threadId:null,threadMode:'non_topic',profile:'TIAL1',commands:['order','req']},{chatId:'-1009002',threadId:null,threadMode:'non_topic',profile:'SOLVER1',commands:['config_psb','mo']}];
const policy=()=>createGroupPolicy({botId,botUsername:'SyntheticOpsBot',groups});
function signed(payload,now,nonce=randomBytes(16).toString('hex')){
 const body=Buffer.from(JSON.stringify(payload)),time=String(Math.floor(now/1000)),url='/internal/courier/v1/events';
 const signature=createHmac('sha256',key).update([botId,time,nonce,'POST',url,createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex');
 return {body,method:'POST',originalUrl:url,socket:{remoteAddress:'127.0.0.1'},headers:{'x-courier-id':botId,'x-courier-time':time,'x-courier-nonce':nonce,'x-courier-signature':signature}};
}
test('signed courier ingress composes parser and update idempotency without accepting new web-only commands',()=>{
 const now=1700000000000,verify=createServiceAuth({botId,key,now:()=>now}),p=policy(),store=new MemoryStore({botId});
 const inputs=[['/order\nSC/IN:X-AOi123\nNO INET:000123\nSN ONT:SN1\nSTO:ABC\nKETERANGAN:test\nNIK:SYNTHETIC','-1009001'],['/req Synthetic work','-1009001'],['/config_psb\nOrder ID:X-AOi1\nSTO:ABC','-1009002'],['/MO\nSC/IN:X-MOk1\nSTO:ABC','-1009002']];
 for(const [i,[text,chat]] of inputs.entries()){
  const event={version:1,bot_id:botId,update_id:String(i+1),event:{kind:'message',chat_id:chat,message_id:String(i+10),telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1700000000,text,attachments:[]}};
  const request=signed(event,now);verify(request);assert.equal(store.accept(p.ingress(JSON.parse(request.body))).duplicate,false);
  assert.throws(()=>verify(request),{statusCode:401});
  const retry=signed(event,now);verify(retry);assert.equal(store.accept(p.ingress(JSON.parse(retry.body))).duplicate,true);
  for(const command of ['ASSUREN','B2B','REPLACEMENT'])assert.throws(()=>p.ingress({...event,event:{...event.event,text:'/'+command+' Synthetic'}}),{statusCode:400});
  const altered=signed(event,now);altered.body=Buffer.from('{}');assert.throws(()=>verify(altered),{statusCode:401});
 }
 assert.equal(store.inbox.size,4);assert.equal(store.outbox.size,0);
});
test('manual orders cannot authorize courier replies; allowed replies retry only through fake transport',async()=>{
 let now=1000;const store=new MemoryStore({botId,now:()=>now}),p=policy();
 const payload={method:'sendMessage',chat_id:'-1009001',telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:'10',text:'Synthetic reply only'};
 const mockConnection=command=>({async execute(sql,values){assert.match(sql,/FROM hd2_orders/);assert.equal(values[0],botId);return [[{command}]];}});
 assert.equal(await p.outgoing(payload,mockConnection(null)),false);
 assert.equal(await p.outgoing({...payload,chat_id:'-1009999'},mockConnection('req')),false);
 assert.equal(await p.outgoing(payload,mockConnection('req')),true);
 const id=store.enqueue('synthetic-request',payload);assert.ok(store.enqueue('synthetic-request',payload)===id);
 let sends=0;const fakeTransport=async()=>++sends===1?{result:'retry',error_code:'RATE_LIMIT'}:{result:'sent',telegram_message_id:'77'};
 let [delivery]=store.claim(1);store.settle(delivery.delivery_id,{lease_token:delivery.lease_token,...await fakeTransport(delivery.payload)});assert.equal(store.claim(1).length,0);
 now+=2000;[delivery]=store.claim(1);assert.equal(delivery.attempt,2);
 const ack={lease_token:delivery.lease_token,...await fakeTransport(delivery.payload)};store.settle(id,ack);assert.equal(store.settle(id,ack).duplicate,true);assert.equal(store.claim(1).length,0);assert.equal(sends,2);
});
