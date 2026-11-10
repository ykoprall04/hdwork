// Pure production-routing review. No default destination, credential, network or write.
const {validateGroups}=require('../courier/groups');
const {categories,bot,destination}=require('../system/policy');
function routing(plan,{now=Date.now(),trialScope=null}={}){
 const reject=()=>{throw Error('VERIFIED_PRODUCTION_ROUTING_REQUIRED');};
 if(!plan||Object.keys(plan).some(k=>!['version','environment','newBotIsolationConfirmed','targets'].includes(k))||plan.version!==1||plan.environment!=='production'||plan.newBotIsolationConfirmed!==true||!Array.isArray(plan.targets)||!plan.targets.length)reject();
 if(/\d{6,12}:[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|https?:\/\/[^\s/]+:[^\s@]+@/.test(JSON.stringify(plan)))throw Error('ROUTING_INPUT_MUST_NOT_CONTAIN_CREDENTIALS');
 const keys=new Set(),bots=new Map();
 const targets=plan.targets.map(input=>{
  if(!input||Object.keys(input).some(k=>!['botId','botUsername','category','profile','chatId','threadId','verified','verifiedBy','verifiedAt','evidence'].includes(k)))reject();
  const fields=['botUsername','verifiedBy','verifiedAt','evidence'];if(fields.some(k=>typeof input[k]!=='string'||!input[k].trim())||input.verified!==true||! /^[A-Za-z0-9_]{5,32}$/.test(input.botUsername))reject();
  if(!Object.hasOwn(categories,input.category)||!categories[input.category].profiles.includes(input.profile)||!Object.hasOwn(input,'threadId')||typeof input.chatId!=='string'||input.threadId!==null&&typeof input.threadId!=='string')reject();
  const at=Date.parse(input.verifiedAt);if(!Number.isFinite(at)||at>now)reject();
  try{bot(input.botId);}catch{throw Error('ROUTING_BOT_NAMESPACE_INVALID');}
  let route;try{route=destination(input);}catch{throw Error('ROUTING_GROUP_OR_TOPIC_INVALID');}const key=[input.botId,route.chatId,route.threadId??'non_topic'].join(':');if(keys.has(key))reject();keys.add(key);
  if(trialScope?.botId===input.botId)throw Error('ACTIVE_TRIAL_BOT_COLLISION_REQUIRES_REVIEW');
  if(bots.has(input.botId)&&bots.get(input.botId)!==input.botUsername)reject();bots.set(input.botId,input.botUsername);
  return {...input,...route,commands:categories[input.category].commands};
 });
 for(const category of ['TIAL','LOGIC'])if(!targets.some(t=>t.category===category))reject();
 for(const botId of bots.keys()){try{validateGroups(targets.filter(t=>t.botId===botId).map(t=>({chatId:t.chatId,threadId:t.threadId,threadMode:t.threadId===null?'non_topic':'thread',profile:t.profile,commands:t.commands})));}catch{throw Error('ROUTING_COMMAND_PROFILE_CONFLICT');}}
 return {status:'OPERATOR_ATTESTED_HOST_VERIFICATION_PENDING',targets,botIdentities:[...bots].map(([botId,botUsername])=>({botId,botUsername})),databaseChanged:false,telegramVerified:false,sendEnabled:false};
}
function courierPlan(review){
 if(!review)return {status:'BLOCKED_VERIFIED_ROUTING_REQUIRED',sendEnabled:false};
 return {status:'BLOCKED_EXISTING_COURIER_IDENTITY_AND_HOST_CHECK_REQUIRED',bots:review.botIdentities.map(b=>({...b,groups:review.targets.filter(t=>t.botId===b.botId).map(t=>({chatId:t.chatId,threadId:t.threadId,threadMode:t.threadId===null?'non_topic':'thread',profile:t.profile,commands:t.commands})),existingTaskVerified:false,serverUrl:null})),backendRequired:{COURIER_DATABASE_ROUTING_ENABLED:'true',COURIER_CHAT_ENABLED:'true',COURIER_RECEIVE_ENABLED:'true',COURIER_WORKER_ENABLED:'true',COURIER_OUTBOX_ENABLED:'true'},pythonRequired:{COURIER_DATABASE_ROUTING_ENABLED:'true',COURIER_CHAT_ENABLED:'true',COURIER_POLL_ENABLED:'true',COURIER_SEND_ENABLED:'true'},requiredChecks:['exact new-bot task/snapshot and account ownership','existing protected credential references; never create or print tokens','read-only getMe identity and getChat access using the new bot only','topic evidence from operator or existing journal; getChat alone cannot verify a topic','current mapping IDs/versions and destination collision review','exact Courier grant profile; no automatic grants or migrations','one poller and one leased worker per bot; no manual lease insertion/deletion','fixed activation boundary isolates legacy rows without review, replay, reset or deletion'],sendEnabled:false};
}
module.exports={routing,courierPlan};
