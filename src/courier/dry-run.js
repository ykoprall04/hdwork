// No network/DB driver, no runtime env, no injectable transport. Parser/inbox only.
const {createGroupPolicy}=require('./groups');
const {MemoryStore}=require('./memory-store');
const {parseCommand}=require('../b2c-workflow/commands');
function dryRun(fixture){
 if(!fixture||!Array.isArray(fixture.events)||fixture.events.length>10000)throw Error('Invalid dry-run fixture');
 const policy=createGroupPolicy(fixture),store=new MemoryStore({botId:fixture.botId});
 const result={mode:'DRY_RUN',databaseUsed:false,networkUsed:false,sentMessages:0,accepted:0,replayedUpdates:0,rejected:0,commands:{},fieldCoverage:{scIn:0,inet:0,sto:0,transaction:0}};
 for(const body of fixture.events){
  try{
   const event=policy.ingress(body),receipt=store.accept(event);
   if(receipt.duplicate){result.replayedUpdates++;continue;}
   const group=policy.groups.find(g=>g.chatId===event.event.chat_id&&g.threadId===event.event.telegram_thread_id),parsed=parseCommand(event.event.text,group.profile,fixture.botUsername);
   result.accepted++;result.commands[parsed.command]=(result.commands[parsed.command]||0)+1;
   if(parsed.sc_in)result.fieldCoverage.scIn++;if(parsed.fields['NO INET']||parsed.fields['NO INTERNET']||parsed.fields['NO INET/TELP'])result.fieldCoverage.inet++;
   if(parsed.fields.STO)result.fieldCoverage.sto++;if(parsed.fields.TRANSAKSI)result.fieldCoverage.transaction++;
  }catch(error){if(![400,403,409].includes(error.statusCode))throw error;result.rejected++;}
 }
 return result;
}
module.exports={dryRun};
