const {createGroupPolicy}=require('../courier/groups');
function databasePolicy({system,botId,botUsername,alertsApproved=false,chatEnabled=false}){
 const base=async c=>{const groups=await system.routing(botId,c);if(!groups.length)throw Object.assign(Error('No verified routes'),{statusCode:503});return createGroupPolicy({botId,botUsername,groups,allowReplies:chatEnabled});};
 return {
  async ingress(body){return (await base()).ingress(body);},
  async outgoing(payload,c){
   if(alertsApproved&&/^HD Work 2\.0 system alert: [A-Z][A-Z0-9_]{1,63}$/.test(payload.text||'')){if((await system.targets(botId,c)).some(t=>t.chatId===payload.chat_id&&t.threadId===payload.telegram_thread_id&&t.anchorId===payload.reply_to_message_id&&payload.method==='sendMessage'&&payload.thread_mode===(t.threadId===null?'non_topic':'thread')))return true;}
   return (await base(c)).outgoing(payload,c);
  },
  async configuration(){return {groups:await system.routing(botId),alertTargets:alertsApproved?await system.targets(botId):[]};},
  async workflow(config){const groups=await system.routing(botId);if(!groups.length)throw Error('No verified routes');require('../operations/b2c-readiness').routes(groups);return {...config,groups:groups.map(g=>({module:g.profile==='SOLVER1'?'LOGIC_PSB':'TIAL',chatId:g.chatId,threadId:g.threadId,threadMode:g.threadMode,commandProfile:g.profile,allowedCommands:g.commands}))};}
 };
}
module.exports={databasePolicy};
