// Operator read-only preflight. No DB, DPAPI decrypt, Telegram, task control or runtime writes.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {read}=require('./prepare-shared-groups-release');
const {configuration,hash}=require('./courier-task-runner');
const TARGET='1fc87f5df8aea39df6e813625248de6adf8a0a0a',BASE='5e0c4ecdc58e2ea8cdedbc8984fc318436cac8a8';
const COMMON=['src/observability/raw-log.js','src/chat/routes.js','src/chat/service.js','src/courier/mysql-store.js','src/courier/inbox-worker.js','src/courier/integration-app.js'];
const COURIER=['courier_bot/courier/raw_log.py','courier_bot/courier/__main__.py','courier_bot/courier/durable_runner.py','courier_bot/courier/http.py','scripts/run-production-live-chat-courier.js'];
const git=(root,args)=>cp.execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024});
const normalized=b=>b.toString('utf8').replace(/\r\n/g,'\n');
function optional(file){try{return read(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function inspect(input,{gitCommand=git,probe=require('./inspect-b2c-windows-release').probe}={}){
 if(!input||Object.keys(input).some(k=>!['repo','webRuntime','courierConfig','configSha256','ownerSid','processesVerified','logAcl'].includes(k)))throw Error('RAW_LOG_INPUT_REJECTED');
 if(input.processesVerified!==true||!/^S-1-[0-9-]+$/.test(input.ownerSid||'')||!/^[a-f0-9]{64}$/.test(input.configSha256||'')||!['repo','webRuntime','courierConfig'].every(k=>typeof input[k]==='string'&&path.isAbsolute(input[k])))throw Error('VERIFIED_WINDOWS_METADATA_REQUIRED');
 if(String(gitCommand(input.repo,['status','--porcelain','--untracked-files=normal'])).trim())throw Error('CANDIDATE_WORKTREE_NOT_CLEAN');
 gitCommand(input.repo,['merge-base','--is-ancestor',TARGET,'HEAD']);
 gitCommand(input.repo,['diff','--exit-code',TARGET,'--','src','courier_bot/courier','scripts/courier-task-runner.js','scripts/run-production-live-chat-courier.js','scripts/run-courier-scheduled-owner.ps1','package.json','package-lock.json']);
 const cfg=configuration(input.courierConfig,input.configSha256);
 if(cfg.ownerSid!==input.ownerSid)throw Error('EXISTING_DPAPI_OWNER_REQUIRED');
 const auto=path.dirname(input.courierConfig),review=JSON.parse(read(path.join(auto,'autostart.review.json')));
 if(review.taskName!=='HDWork2-LiveChat-Courier'||review.ownerSid!==input.ownerSid||review.configSha256!==input.configSha256||hash(read(path.join(auto,'run-owner.ps1')))!==review.wrapperSha256||hash(read(path.join(auto,'courier-task-runner.js')))!==review.runnerSha256)throw Error('CURRENT_LAUNCHER_PINS_INVALID');
 const envBytes=read(path.join(input.webRuntime,'service/environment.json')),env=JSON.parse(envBytes);
 if(env.HDWORK2_PUBLIC_ORIGIN!=='https://hdwork2.yoloo.space'||env.HDWORK2_SHARED_GROUPS_ENABLED!=='true')throw Error('VERIFIED_SHARED_WEB_REQUIRED');
 if(Object.keys(env).some(k=>/(PASSWORD|TOKEN|SECRET|SERVICE_KEY|IDENTITY_KEY)$/.test(k)&&!k.endsWith('_DPAPI_FILE')))throw Error('PLAINTEXT_ENVIRONMENT_REJECTED');
 const productionPlan=JSON.parse(read(cfg.productionPlan));
 if(productionPlan.routingMode!=='database')throw Error('UNIVERSAL_DATABASE_ROUTING_REQUIRED');
 const rows=[],blockers=[];
 for(const [label,root,files]of [['web',input.webRuntime,COMMON],['courier',cfg.snapshot,[...COMMON,...COURIER]],['autostart',auto,['courier-task-runner.js','run-owner.ps1']]]){
  for(const file of files){
   const source=label==='autostart'?'scripts/'+(file==='run-owner.ps1'?'run-courier-scheduled-owner.ps1':file):file;
   const candidate=gitCommand(input.repo,['show',TARGET+':'+source]);let baseline=null;
   try{baseline=gitCommand(input.repo,['show',BASE+':'+source]);}catch{}
   const before=optional(path.join(root,file));
   const state=before&&normalized(before)===normalized(candidate)?'TARGET_MATCH':!before&&!baseline?'NEW_FILE':before&&baseline&&normalized(before)===normalized(baseline)?'BASE_MATCH':'REVIEW_RUNTIME_DIFFERENCE';
   if(state==='REVIEW_RUNTIME_DIFFERENCE')blockers.push('REVIEW_RUNTIME_DIFFERENCE:'+label+':'+file);
   rows.push({scope:label,file,source,state,beforeSha256:before?hash(before):null,targetSha256:hash(candidate),courierPinned:label==='courier'&&Object.hasOwn(cfg.sourceHashes,file)});
  }
 }
 // Existing universal acceptance must already be deployed. No mapping or queue data is read.
 for(const file of ['src/courier/shared-group.js','src/system/store.js','src/operations/b2c-readiness.js']){
  const desired=gitCommand(input.repo,['show',TARGET+':'+file]);for(const [label,root]of [['web',input.webRuntime],['courier',cfg.snapshot]])if(normalized(read(path.join(root,file)))!==normalized(desired))blockers.push('UNIVERSAL_BASELINE_NOT_TARGET:'+label+':'+file);
 }
 const activeDist=require('../src/config/web-build').webBuild(input.webRuntime,env),frontend=await probe(input.webRuntime,env,activeDist);
 const activationRequirements=['NEW_REVIEWED_RELEASE_AND_COURIER_PINS','BACKUP_SOURCE_LAUNCHERS_ENVIRONMENT_TASK_XML','WEB_PROTECTED_ENVIRONMENT_LOG_FLAGS','COURIER_OWNER_PERSISTENT_LOG_FLAGS','OWNER_SYSTEM_AND_LOCALSERVICE_LOG_ACLS','WINDOWS_OFFLINE_TESTS','COORDINATED_SINGLE_COURIER_CUTOVER'];
 return {status:'RAW_LOG_READ_ONLY_INSPECTION_PASS',checkedAt:new Date().toISOString(),applicationCommit:TARGET,checkoutCommit:String(gitCommand(input.repo,['rev-parse','HEAD'])).trim(),ownerSid:input.ownerSid,webRuntime:input.webRuntime,courierSnapshot:cfg.snapshot,courierConfig:input.courierConfig,courierConfigSha256:input.configSha256,productionPlanSha256:cfg.productionPlanSha256,webEnvironmentSha256:hash(envBytes),courierEnvironmentSha256:cfg.environmentSha256,launchers:{wrapperSha256:review.wrapperSha256,runnerSha256:review.runnerSha256},sourcePinCount:Object.keys(cfg.sourceHashes).length,frontend,files:rows,webLauncherSha256:hash(read(path.join(input.webRuntime,'scripts/protected-web-service.js'))),webLoggingEnabled:env.HDWORK2_RAW_LOG_ENABLED==='true',webLogDirectory:env.HDWORK2_LOG_DIRECTORY==='C:\\ProgramData\\HDWork2\\Logs'?'EXPECTED_DEFAULT':env.HDWORK2_LOG_DIRECTORY?'CUSTOM_REQUIRES_REVIEW':'NOT_CONFIGURED',logAcl:safeAcl(input.logAcl),blockers,activationRequirements,deploymentReady:false,runtimeChanged:false,tasksChanged:false,credentialsDecrypted:false,databaseAccessed:false,telegramAccessed:false};
}
function safeAcl(value){if(!value||typeof value!=='object')return {checked:false};return {checked:value.checked===true,exists:value.exists===true,reparsePoint:value.reparsePoint===true,ownerCanWrite:value.ownerCanWrite===true,localServiceCanWrite:value.localServiceCanWrite===true,broadWritePresent:value.broadWritePresent===true};}
async function main(){if(process.argv.length!==2)throw Error('STDIN_METADATA_ONLY');let text='';for await(const part of process.stdin){text+=part;if(text.length>32768)throw Error('INPUT_TOO_LARGE');}console.log(JSON.stringify(await inspect(JSON.parse(text)),null,2));}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'RAW_LOG_PREFLIGHT_FAILED',code:/^[A-Z_]{3,80}$/.test(e.message)?e.message:e.code==='ENOENT'?'REQUIRED_FILE_MISSING':'INSPECTION_REJECTED',runtimeChanged:false}));process.exitCode=1;});
module.exports={TARGET,BASE,COMMON,COURIER,inspect,safeAcl};
