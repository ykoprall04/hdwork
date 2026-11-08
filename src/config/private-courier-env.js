const path=require('node:path');
const {validateGroups}=require('../courier/groups');
const reject=()=>Object.assign(Error('Private courier configuration rejected'),{code:'PRIVATE_COURIER_REJECTED'});
function validatePlan(plan,{now=Date.now()}={}){
 if(!plan||plan.enabled!==true||plan.receiveOnly!==true||plan.ingestionWritesApproved!==true||plan.networkActivationApproved!==true||plan.newBotIsolationConfirmed!==true||plan.sendEnabled!==false)throw reject();
 if(['token','password','serviceKey','identityKey'].some(k=>Object.hasOwn(plan,k))||Object.hasOwn(plan.database||{},'password'))throw reject();
 const until=Date.parse(plan.approvalUntil||'');if(!Number.isFinite(until)||until<=now||until-now>15*60000)throw reject();
 if(!/^[a-z][a-z0-9_-]{1,63}$/.test(plan.botId||'')||! /^[A-Za-z0-9_]{5,32}$/.test(plan.botUsername||''))throw reject();
 if(plan.database?.host!=='127.0.0.1'||plan.database?.port!==3306||plan.database?.name!=='hdwork2'||plan.database?.user!=='hdwork_courier')throw reject();
 if(!Number.isInteger(plan.port)||plan.port<1024||plan.port>65535||[3090,3306,8443,9222].includes(plan.port))throw reject();
 const files=[];for(const key of ['tokenDpapiFile','serviceKeyDpapiFile','identityKeyDpapiFile','dbPasswordDpapiFile']){
  if(typeof plan[key]!=='string'||!plan[key])throw reject();
  const file=path.resolve(__dirname,'../..',plan[key]),folder=path.resolve(__dirname,'../../.local/courier-secrets');
  if(!file.toLowerCase().startsWith(folder.toLowerCase()+path.sep)||!file.endsWith('.dpapi'))throw reject();files.push(file.toLowerCase());
 }if(new Set(files).size!==4)throw reject();
 const paths=[];for(const name of ['journalDirectory','lockDirectory']){
  const value=plan[name];if(typeof value!=='string'||!path.isAbsolute(value))throw reject();
  const resolved=path.resolve(value).toLowerCase(),root=path.resolve(__dirname,'../..').toLowerCase();if(resolved===root||resolved.startsWith(root+path.sep))throw reject();paths.push(resolved);
 }if(paths[0]===paths[1])throw reject();
 validateGroups(plan.groups);return until;
}
async function loadCourierSecrets(plan,{kind,readSecret=file=>require('./private-database-env').readPrivateDpapi(file),now=Date.now()}={}){
 validatePlan(plan,{now});if(!['backend','python'].includes(kind))throw reject();
 // Separate trust domains: the backend never receives a Telegram token;
 // Python never receives any database password or business dedupe key.
 const env={COURIER_ENABLED:'true',COURIER_INTEGRATION_ENABLED:'true',COURIER_BOT_ID:plan.botId,COURIER_BOT_USERNAME:plan.botUsername,COURIER_COMMAND_GROUPS_JSON:JSON.stringify(plan.groups)};
 try{
  env.COURIER_SERVICE_KEY=await readSecret(plan.serviceKeyDpapiFile);
  if(typeof env.COURIER_SERVICE_KEY!=='string'||Buffer.byteLength(env.COURIER_SERVICE_KEY)<32)throw reject();
  if(kind==='backend')Object.assign(env,{HDWORK2_LOCAL_READ_ONLY:'false',HDWORK2_OPERATIONS_ENABLED:'true',HDWORK2_AUTH_V2:'true',COURIER_STORE:'mysql',COURIER_SCHEMA_READY:'true',B2C_COMMAND_SCHEMA_READY:'true',COURIER_DB_HOST:'127.0.0.1',COURIER_DB_PORT:'3306',COURIER_DB_NAME:'hdwork2',COURIER_DB_USER:'hdwork_courier',COURIER_DB_PASSWORD:await readSecret(plan.dbPasswordDpapiFile),COURIER_IDENTITY_KEY:await readSecret(plan.identityKeyDpapiFile),COURIER_PORT:String(plan.port),COURIER_RECEIVE_ENABLED:'true',COURIER_WORKER_ENABLED:'true',COURIER_OUTBOX_ENABLED:'false'});
  else{
   env.COURIER_TELEGRAM_BOT_TOKEN=await readSecret(plan.tokenDpapiFile);
   if(typeof env.COURIER_TELEGRAM_BOT_TOKEN!=='string'||!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(env.COURIER_TELEGRAM_BOT_TOKEN))throw reject();
   Object.assign(env,{COURIER_ALLOW_NETWORK:'true',COURIER_SERVER_URL:'http://127.0.0.1:'+plan.port,COURIER_POLL_ENABLED:'true',COURIER_SEND_ENABLED:'false',COURIER_JOURNAL_DIR:plan.journalDirectory,COURIER_LOCK_DIR:plan.lockDirectory,COURIER_PRIVATE_CONTROL_STDIN:'true'});
  }
  if(kind==='backend')require('../courier/integration-config').configuration(env);
  return env;
 }catch{for(const k of Object.keys(env))delete env[k];throw reject();}
}
function clearSecrets(env){for(const key of ['COURIER_SERVICE_KEY','COURIER_DB_PASSWORD','COURIER_IDENTITY_KEY','COURIER_TELEGRAM_BOT_TOKEN'])delete env[key];}
module.exports={validatePlan,loadCourierSecrets,clearSecrets};
