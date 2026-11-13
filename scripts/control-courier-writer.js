// PLAN by default. Operator supplies an authenticated, byte-pinned session module.
// No credential discovery, web/task controls, Telegram, DDL, GRANT or queue transitions.
const path=require('node:path');
const {regular,sha}=require('./lib/courier-cutover.cjs');
const {inspect,change}=require('../src/courier/writer-fence');
function options(argv){
 const o={action:'inspect',execute:false};
 const keys={'--action':'action','--bot':'botId','--epoch':'expectedEpoch','--operator':'operator','--reason':'reason','--account':'expectedAccount','--session':'session','--session-sha256':'sessionSha256','--approval':'approval','--runtime-config':'runtimeConfigFile','--runtime-sha256':'runtimeConfigSha256'};
 const seen=new Set();
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--execute'){if(o.execute)throw Error('DUPLICATE_ARGUMENT');o.execute=true;continue;}
  const key=keys[argv[i]];if(!key||seen.has(key)||!argv[i+1])throw Error('ARGUMENT_REJECTED');seen.add(key);o[key]=argv[++i];
 }
 if(!/^[a-z][a-z0-9_-]{1,63}$/.test(o.botId||'')||!['inspect','initialize','close','open'].includes(o.action))throw Error('EXACT_BOT_AND_ACTION_REQUIRED');
 return o;
}
function approve(o,a){
 const until=Date.parse(a?.expiresAtUtc);
 if(a?.kind!=='HDWORK2_WRITER_FENCE_APPROVAL'||a.approved!==true||a.botId!==o.botId||a.action!==o.action||a.expectedEpoch!==(o.expectedEpoch??null)||a.operator!==o.operator||a.reason!==o.reason||a.expectedAccount!==o.expectedAccount||a.sessionSha256!==o.sessionSha256||(a.runtimeConfigFile??null)!==(o.runtimeConfigFile??null)||(a.runtimeConfigSha256??null)!==(o.runtimeConfigSha256??null)||!Number.isFinite(until)||until<=Date.now()||until>Date.now()+3600000)throw Error('WRITER_FENCE_APPROVAL_REQUIRED');
}
async function main(argv){
 const o=options(argv);
 if(!o.execute&&o.action!=='inspect')return {status:'PLAN_ONLY',action:o.action,botId:o.botId,expectedEpoch:o.expectedEpoch??null,productionChanged:false};
 if(o.execute&&o.action==='inspect')throw Error('INSPECT_IS_READ_ONLY');
 if(!path.isAbsolute(o.session||'')||! /^[a-f0-9]{64}$/.test(o.sessionSha256||'')||sha(regular(o.session))!==o.sessionSha256||! /^[A-Za-z0-9_]+@localhost$/.test(o.expectedAccount||''))throw Error('PINNED_AUTHENTICATED_SESSION_REQUIRED');
 if(o.execute){if(!path.isAbsolute(o.approval||''))throw Error('WRITER_FENCE_APPROVAL_REQUIRED');approve(o,JSON.parse(regular(o.approval)));}
 const session=await require(o.session).create({runtimeConfigFile:o.runtimeConfigFile,runtimeConfigSha256:o.runtimeConfigSha256});
 try{
  if(session.botId&&session.botId!==o.botId)throw Error('WRITER_SESSION_BOT_SCOPE_REJECTED');
  const [[identity]]=await session.pool.query('SELECT CURRENT_USER() AS account,DATABASE() AS db');
  if(identity.db!=='hdwork2'||identity.account!==o.expectedAccount)throw Error('WRITER_FENCE_DATABASE_IDENTITY_REJECTED');
  return o.action==='inspect'?await inspect(session.pool,o):await change(session.pool,o);
 }finally{await session.close();}
}
if(require.main===module)main(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.log(JSON.stringify({status:'STOP',code:/^[A-Z0-9_]+$/.test(e.code||e.message||'')?(e.code||e.message):'WRITER_FENCE_CONTROL_REJECTED'}));process.exitCode=1;});
module.exports={main,options,approve};
