// Telegram-shaped fixture through the real policy, inbox and command processor.
// No TelegramClient, token, driver or direct business-order INSERT.
const assert=require('node:assert/strict');
const {MysqlStore}=require('../../src/courier/mysql-store');
const {createGroupPolicy}=require('../../src/courier/groups');
const {createB2CProcessor}=require('../../src/b2c-workflow/workflow');
async function seedTelegram(pool,{sequence=1000,prefix='API'}={}){
 const botId='synthetic-e2e',botUsername='SyntheticE2EBot';
 const groups=['TIAL1','ASSUREN','B2B','REPLACEMENT'].map((profile,i)=>({chatId:String(-1008001-i),threadId:null,threadMode:'non_topic',profile,commands:[i===0?'order':profile.toLowerCase()]}));
 const policy=createGroupPolicy({botId,botUsername,groups});
 const store=new MysqlStore({pool,botId,orderedInbox:true});
 const processor=createB2CProcessor({store,config:{enabled:true,webOnly:true,botId,botUsername,identityKey:'synthetic-fixture-identity-key-000000',dedupeBy:'sc_in',actors:[],groups:groups.map((g,i)=>({module:i===0?'TIAL':g.profile,chatId:g.chatId,threadId:null,threadMode:g.threadMode,commandProfile:g.profile,allowedCommands:g.commands}))}});
 const orders=[];
 for(const [i,g] of groups.entries()){
  const module=i===0?'TIAL':g.profile,n=sequence+i;
  const reference=i===0?`E2E-${prefix}-AOi${n}`:`E2E-${prefix}-${module}-${n}`;
  const text=i===0?`/order@${botUsername}\nSC/IN:${reference}\nNO INET:00012345\nSN ONT:SYNTHETIC\nSTO:ABC\nKETERANGAN:fixture\nNIK:SYNTHETIC`:`/${module.toLowerCase()}@${botUsername}\nSC/IN:${reference}\nNO INET/TELP:00012345\nSTO:ABC\nTRANSAKSI:PERBAIKAN\nKETERANGAN:fixture`;
  const event=policy.ingress({version:1,bot_id:botId,update_id:String(n),event:{kind:'message',chat_id:g.chatId,message_id:String(n),telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:Math.floor(Date.now()/1000),text,attachments:[]}});
  const receipt=await store.accept(event);assert.equal((await store.accept(event)).receipt_id,receipt.receipt_id);
  assert.equal(await processor.processNext(),true);
  const [[order]]=await pool.execute('SELECT id,status FROM hd2_orders WHERE bot_id=? AND message_id=?',[botId,String(n)]);
  assert.equal(order.status,'WAITING');orders.push({id:order.id,module,reference,chatId:g.chatId,messageId:String(n)});
 }
 return orders;
}
module.exports={seedTelegram};
