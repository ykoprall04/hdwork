// Separate production contract: never enable or rewrite the historical receive-only plan.
const path=require('node:path');
const {validateGroups}=require('../courier/groups');
const {boundary}=require('../courier/activation-boundary');
const {clearSecrets}=require('./private-courier-env');
function validate(plan,{repo}={}){
 const keys=['version','environment','telegramBotId','botId','botUsername','port','groups','secretRoot','tokenDpapiFile','serviceKeyDpapiFile','identityKeyDpapiFile','dbPasswordDpapiFile','journalDirectory','sourceJournalDirectory','lockDirectory','activationNotBefore'];
 if(plan&&Object.hasOwn(plan,'routingMode')){if(plan.routingMode!=='database')throw Error('PRODUCTION_ROUTING_MODE_REJECTED');keys.push('routingMode');}
 if(!plan||Object.keys(plan).sort().join(',')!==keys.sort().join(',')||plan.version!==1||plan.environment!=='production'||
   !/^[1-9]\d{5,11}$/.test(plan.telegramBotId||'')||typeof plan.telegramBotId!=='string'||
   !/^[a-z][a-z0-9_-]{1,63}$/.test(plan.botId||'')||! /^[A-Za-z0-9_]{5,32}$/.test(plan.botUsername||'')||
   !Number.isInteger(plan.port)||plan.port<1024||plan.port>65535||[3090,3306,8443,9222].includes(plan.port))throw Error('PRODUCTION_COURIER_PLAN_REJECTED');
 if(typeof plan.secretRoot!=='string'||!path.isAbsolute(plan.secretRoot)||(repo&&path.resolve(repo)!==path.resolve(plan.secretRoot)))throw Error('REVIEWED_EXISTING_SECRET_ROOT_REQUIRED');
 repo=path.resolve(plan.secretRoot);
 if(!boundary(plan.activationNotBefore))throw Error('PRODUCTION_BOUNDARY_REQUIRED');
 const groups=validateGroups(plan.groups);
 if(plan.routingMode!=='database'&&(groups.length!==3||new Set(groups.map(g=>g.profile)).size!==3||!['TIAL1','TIAL2','SOLVER1'].every(p=>groups.some(g=>g.profile===p))||groups.some(g=>g.threadId!==null)))throw Error('THREE_NON_TOPIC_PRODUCTION_ROUTES_REQUIRED');
 if(plan.routingMode!=='database'&&groups.some(g=>[...g.commands].sort().join(',')!==(g.profile==='SOLVER1'?'config_psb,mo':'order,req')))throw Error('PRODUCTION_COMMAND_CONTRACT_MISMATCH');
 const refs=[];
 for(const key of ['tokenDpapiFile','serviceKeyDpapiFile','identityKeyDpapiFile','dbPasswordDpapiFile']){
  if(typeof plan[key]!=='string'||!plan[key].endsWith('.dpapi'))throw Error('EXISTING_PROTECTED_SECRET_REFERENCE_REQUIRED');
  const file=path.resolve(repo,plan[key]),folder=path.resolve(repo,'.local/courier-secrets');
  if(!file.startsWith(folder+path.sep))throw Error('EXISTING_PROTECTED_SECRET_REFERENCE_REQUIRED');refs.push(file);
 }
 if(new Set(refs).size!==4)throw Error('SEPARATE_PRODUCTION_SECRET_REFERENCES_REQUIRED');
 for(const key of ['journalDirectory','sourceJournalDirectory','lockDirectory']){
  if(typeof plan[key]!=='string'||!path.isAbsolute(plan[key])||path.resolve(plan[key])===path.resolve(repo)||path.resolve(plan[key]).startsWith(path.resolve(repo)+path.sep))throw Error('EXISTING_PRIVATE_COURIER_DIRECTORIES_REQUIRED');
 }
 if(new Set([plan.journalDirectory,plan.sourceJournalDirectory,plan.lockDirectory].map(p=>path.resolve(p))).size!==3)throw Error('SEPARATE_COURIER_DIRECTORIES_REQUIRED');
 return {...plan,groups};
}
async function load(plan,{kind,repo,readSecret}={}){
 const p=validate(plan,{repo});repo=path.resolve(p.secretRoot);if(!['backend','python'].includes(kind))throw Error('PRODUCTION_TRUST_DOMAIN_REQUIRED');
 readSecret||=(file=>require('./private-database-env').readPrivateDpapi(file,{allowedRoot:repo}));
 const env={...(p.routingMode==='database'?{HDWORK2_SHARED_GROUPS_ENABLED:'true'}:{}),COURIER_ENABLED:'true',COURIER_INTEGRATION_ENABLED:'true',COURIER_PRODUCTION_MODE:'true',COURIER_BOT_ID:p.botId,COURIER_BOT_USERNAME:p.botUsername,COURIER_COMMAND_GROUPS_JSON:JSON.stringify(p.groups),COURIER_DATABASE_ROUTING_ENABLED:'true',COURIER_CHAT_ENABLED:'true',COURIER_ACTIVATION_NOT_BEFORE:p.activationNotBefore};
 try{
  env.COURIER_SERVICE_KEY=await readSecret(path.resolve(repo,p.serviceKeyDpapiFile));
  if(typeof env.COURIER_SERVICE_KEY!=='string'||Buffer.byteLength(env.COURIER_SERVICE_KEY)<32)throw Error('PROTECTED_SERVICE_KEY_REJECTED');
  if(kind==='backend'){
   Object.assign(env,{HDWORK2_LOCAL_READ_ONLY:'false',HDWORK2_OPERATIONS_ENABLED:'true',HDWORK2_AUTH_V2:'true',COURIER_STORE:'mysql',COURIER_SCHEMA_READY:'true',B2C_COMMAND_SCHEMA_READY:'true',COURIER_DB_HOST:'127.0.0.1',COURIER_DB_PORT:'3306',COURIER_DB_NAME:'hdwork2',COURIER_DB_USER:'hdwork_courier',COURIER_DB_PASSWORD:await readSecret(path.resolve(repo,p.dbPasswordDpapiFile)),COURIER_IDENTITY_KEY:await readSecret(path.resolve(repo,p.identityKeyDpapiFile)),COURIER_PORT:String(p.port),COURIER_RECEIVE_ENABLED:'true',COURIER_WORKER_ENABLED:'true',COURIER_OUTBOX_ENABLED:'true'});
   require('../courier/integration-config').configuration(env);
  }else{
   env.COURIER_TELEGRAM_BOT_TOKEN=await readSecret(path.resolve(repo,p.tokenDpapiFile));
   if(typeof env.COURIER_TELEGRAM_BOT_TOKEN!=='string'||!new RegExp('^'+p.telegramBotId+':[A-Za-z0-9_-]{30,}$').test(env.COURIER_TELEGRAM_BOT_TOKEN))throw Error('PRODUCTION_TOKEN_BOT_ID_MISMATCH');
   Object.assign(env,{COURIER_EXPECTED_TELEGRAM_BOT_ID:p.telegramBotId,COURIER_ALLOW_NETWORK:'true',COURIER_SERVER_URL:'http://127.0.0.1:'+p.port,COURIER_POLL_ENABLED:'true',COURIER_SEND_ENABLED:'true',COURIER_JOURNAL_DIR:p.journalDirectory,COURIER_SOURCE_JOURNAL_FILE:path.join(p.sourceJournalDirectory,'courier.sqlite3'),COURIER_LOCK_DIR:p.lockDirectory,COURIER_PRIVATE_CONTROL_STDIN:'true'});
  }
  return env;
 }catch(error){clearSecrets(env);throw error;}
}
module.exports={validate,load};
