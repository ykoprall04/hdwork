// Official file transaction for RAW LOG. Reuses existing pin/read/TLS contracts.
// No DB driver, DPAPI unwrap, Telegram client, process control or automatic recovery.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),{randomUUID}=require('node:crypto');
const {read}=require('./prepare-shared-groups-release'),{hash,configuration}=require('./courier-task-runner');
const {COMMON,COURIER,TARGET,BASE}=require('./inspect-raw-log-release');
const frontend=require('./frontend-only-release');
const LOG='C:\\ProgramData\\HDWork2\\Logs';
const git=(repo,args)=>cp.execFileSync('git',args,{cwd:repo,stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024});
const norm=b=>b.toString('utf8').replace(/\r\n/g,'\n');
function current(file){try{return hash(read(file));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function atomic(file,bytes){fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.realpathSync(path.dirname(file)).toLowerCase()!==path.resolve(path.dirname(file)).toLowerCase())throw Error('RELEASE_PARENT_LINK_REJECTED');const tmp=file+'.raw-log-'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,bytes,{flag:'wx',mode:0o600});fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
function put(root,file,bytes){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});return hash(read(target));}
function state(root,value){atomic(path.join(root,'activation.json'),Buffer.from(JSON.stringify({...value,at:new Date().toISOString()},null,2)+'\n'));}
function json(b){return Buffer.from(JSON.stringify(b,null,2)+'\n');}
async function stage({root,repo,codeCommit,metadata},{gitCommand=git,probe=require('./inspect-b2c-windows-release').probe}={}){
 root=path.resolve(root);if(fs.realpathSync(root).toLowerCase()!==root.toLowerCase()||fs.existsSync(path.join(root,'plan.json')))throw Error('NEW_PRIVATE_PACKET_REQUIRED');
 if(!/^[a-f0-9]{40}$/.test(codeCommit||'')||metadata?.processesVerified!==true||!/^S-1-[0-9-]+$/.test(metadata.ownerSid||''))throw Error('VERIFIED_RELEASE_AND_WINDOWS_OWNER_REQUIRED');
 for(const key of ['webRuntime','courierConfig'])if(!path.isAbsolute(metadata[key]||''))throw Error('ABSOLUTE_VERIFIED_RUNTIME_REQUIRED');
 gitCommand(repo,['merge-base','--is-ancestor',TARGET,codeCommit]);gitCommand(repo,['diff','--exit-code',TARGET,codeCommit,'--','src','courier_bot/courier','package.json','package-lock.json']);
 const cfg=configuration(metadata.courierConfig,metadata.configSha256),auto=path.dirname(metadata.courierConfig),reviewFile=path.join(auto,'autostart.review.json'),review=JSON.parse(read(reviewFile));
 if(cfg.ownerSid!==metadata.ownerSid||review.ownerSid!==metadata.ownerSid||review.configSha256!==metadata.configSha256||review.taskName!=='HDWork2-LiveChat-Courier'||hash(read(path.join(auto,'run-owner.ps1')))!==review.wrapperSha256||hash(read(path.join(auto,'courier-task-runner.js')))!==review.runnerSha256)throw Error('EXISTING_OWNER_LAUNCHER_PINS_REQUIRED');
 for(const other of [repo,metadata.webRuntime,cfg.snapshot,auto]){const a=root.toLowerCase(),b=path.resolve(other).toLowerCase();if(a===b||b.startsWith(a+path.sep)||a.startsWith(b+path.sep))throw Error('PACKET_RUNTIME_OVERLAP');}
 if(path.resolve(cfg.snapshot).toLowerCase()===path.resolve(metadata.webRuntime).toLowerCase())throw Error('SEPARATE_VERIFIED_WEB_COURIER_SNAPSHOTS_REQUIRED');
 const envFile=path.join(metadata.webRuntime,'service/environment.json'),env=JSON.parse(read(envFile));
 if(env.HDWORK2_PUBLIC_ORIGIN!=='https://hdwork2.yoloo.space'||env.HDWORK2_SHARED_GROUPS_ENABLED!=='true'||JSON.parse(read(cfg.productionPlan)).routingMode!=='database')throw Error('ACTIVE_UNIVERSAL_BASELINE_REQUIRED');
 for(const file of ['src/courier/shared-group.js','src/system/store.js','src/operations/b2c-readiness.js']){const desired=gitCommand(repo,['show',TARGET+':'+file]);for(const snapshot of [metadata.webRuntime,cfg.snapshot])if(norm(read(path.join(snapshot,file)))!==norm(desired))throw Object.assign(Error('UNIVERSAL_COMPATIBILITY_REQUIRES_REVIEW'),{file});}
 const activeDist=require('../src/config/web-build').webBuild(metadata.webRuntime,env),health=await probe(metadata.webRuntime,env,activeDist),inventory=await frontend.inventory(activeDist);
 const entries=[],files={},next={...cfg,sourceHashes:{...cfg.sourceHashes},rawLog:{enabled:true,directory:LOG}};
 for(const [scope,snapshot,names]of [['web',metadata.webRuntime,[...COMMON,'scripts/protected-web-service.js','scripts/run-protected-web.ps1']],['courier',cfg.snapshot,[...COMMON,...COURIER]]]){
  for(const file of names){
   const target=path.join(snapshot,file);let before=null;try{before=read(target);}catch(e){if(e.code!=='ENOENT')throw e;}
   const after=gitCommand(repo,['show',codeCommit+':'+file]);let base=null;try{base=gitCommand(repo,['show',BASE+':'+file]);}catch{}
   const app=gitCommand(repo,['show',TARGET+':'+file]);
   if(before&&!([base,app,after].filter(Boolean).some(b=>norm(b)===norm(before)))||!before&&base)throw Object.assign(Error('RUNTIME_SOURCE_REQUIRES_REVIEW'),{file:scope+'/'+file});
   const payload='payload/'+scope+'/'+file,backup='backup/'+scope+'/'+file;
   files[payload]=put(root,payload,after);if(before)files[backup]=put(root,backup,before);
   entries.push({scope,file,target,before:before?hash(before):null,after:hash(after),payload,backup:before?backup:null});if(scope==='courier')next.sourceHashes[file]=hash(after);
  }
 }
 const nextEnv={...env,HDWORK2_RAW_LOG_ENABLED:'true',HDWORK2_LOG_DIRECTORY:LOG};
 files['backup/web-environment.json']=put(root,'backup/web-environment.json',read(envFile));files['candidate/web-environment.json']=put(root,'candidate/web-environment.json',json(nextEnv));
 for(const name of ['config.json','autostart.review.json','run-owner.ps1','courier-task-runner.js'])files['backup/autostart/'+name]=put(root,'backup/autostart/'+name,read(path.join(auto,name)));
 const owner=gitCommand(repo,['show',codeCommit+':scripts/run-courier-scheduled-owner.ps1']),runner=gitCommand(repo,['show',codeCommit+':scripts/courier-task-runner.js']);
 files['autostart/run-owner.ps1']=put(root,'autostart/run-owner.ps1',owner);files['autostart/courier-task-runner.js']=put(root,'autostart/courier-task-runner.js',runner);
 const configBytes=json({...next,runnerSha256:hash(runner)}),configSha256=hash(configBytes);
 files['autostart/config.json']=put(root,'autostart/config.json',configBytes);files['autostart/autostart.review.json']=put(root,'autostart/autostart.review.json',json({...review,configSha256,runnerSha256:hash(runner),wrapperSha256:hash(owner)}));
 const protectedFiles={[envFile]:hash(read(envFile)),[cfg.productionPlan]:cfg.productionPlanSha256,[path.join(cfg.snapshot,'service/environment.json')]:cfg.environmentSha256,[path.join(cfg.snapshot,'service/secrets.dpapi')]:cfg.encryptedBundleSha256,[path.join(metadata.webRuntime,'service/secrets.dpapi')]:hash(read(path.join(metadata.webRuntime,'service/secrets.dpapi'))),[metadata.courierConfig]:metadata.configSha256,[reviewFile]:hash(read(reviewFile)),[path.join(auto,'run-owner.ps1')]:review.wrapperSha256,[path.join(auto,'courier-task-runner.js')]:review.runnerSha256};
 // Both task actions are immutable recovery evidence; no credentials are exported.
 for(const name of ['previous-web-task.xml','previous-courier-task.xml'])files[name]=hash(read(path.join(root,name)));
 const plan={version:1,kind:'HDWORK2_RAW_LOG_RELEASE',applicationCommit:TARGET,codeCommit,ownerSid:metadata.ownerSid,webRuntime:metadata.webRuntime,courierSnapshot:cfg.snapshot,oldConfig:metadata.courierConfig,oldAuto:auto,newConfig:path.join(root,'autostart/config.json'),newOwner:path.join(root,'autostart/run-owner.ps1'),configSha256,oldConfigSha256:metadata.configSha256,envFile,envBefore:hash(read(envFile)),envAfter:hash(json(nextEnv)),activeDist,frontend:inventory,health,entries,files,protectedFiles};
 const bytes=json(plan);put(root,'plan.json',bytes);state(root,{state:'STAGED_NOT_STARTED'});await verify({root,planSha256:hash(bytes)});
 return {status:'RAW_LOG_STAGED_NOT_STARTED',directory:root,planSha256:hash(bytes),configSha256,runtimeChanged:false};
}
function packet(root,planSha256){root=path.resolve(root);const bytes=read(path.join(root,'plan.json'));if(hash(bytes)!==planSha256)throw Error('IMMUTABLE_RAW_LOG_PLAN_CHANGED');const p=JSON.parse(bytes);
 if(p.version!==1||p.kind!=='HDWORK2_RAW_LOG_RELEASE'||p.applicationCommit!==TARGET||!Array.isArray(p.entries))throw Error('RAW_LOG_PACKET_REJECTED');
 for(const [name,digest]of Object.entries(p.files)){if(name.split('/').includes('..')||path.isAbsolute(name)||hash(read(path.join(root,name)))!==digest)throw Error('PAYLOAD_OR_BACKUP_CHANGED');}
 const before=JSON.parse(read(path.join(root,'backup/autostart/config.json'))),after=JSON.parse(read(path.join(root,'autostart/config.json'))),expected={...before,sourceHashes:{...before.sourceHashes},rawLog:{enabled:true,directory:LOG},runnerSha256:p.files['autostart/courier-task-runner.js']};
 for(const entry of p.entries){const base=entry.scope==='web'?p.webRuntime:entry.scope==='courier'?p.courierSnapshot:null;if(!base||entry.target!==path.join(base,entry.file)||entry.file.split('/').includes('..')||path.isAbsolute(entry.file)||p.files[entry.payload]!==entry.after||entry.backup&&p.files[entry.backup]!==entry.before)throw Error('SOURCE_BINDING_REJECTED');if(entry.scope==='courier')expected.sourceHashes[entry.file]=entry.after;}
 if(JSON.stringify(after)!==JSON.stringify(expected)||hash(read(path.join(root,'autostart/config.json')))!==p.configSha256)throw Error('UNAPPROVED_COURIER_CONFIG_DELTA');
 const oldEnv=JSON.parse(read(path.join(root,'backup/web-environment.json'))),newEnv=JSON.parse(read(path.join(root,'candidate/web-environment.json')));if(JSON.stringify(newEnv)!==JSON.stringify({...oldEnv,HDWORK2_RAW_LOG_ENABLED:'true',HDWORK2_LOG_DIRECTORY:LOG}))throw Error('UNAPPROVED_WEB_ENVIRONMENT_DELTA');
 return {root,p};
}
async function verify({root,planSha256,applied=false}){const loaded=packet(root,planSha256);root=loaded.root;const {p}=loaded;
 for(const [file,digest]of Object.entries(p.protectedFiles))if(current(file)!==(applied&&file===p.envFile?p.envAfter:digest))throw Object.assign(Error('PROTECTED_FILE_DRIFT'),{file});
 for(const e of p.entries)if(current(e.target)!==(applied?e.after:e.before))throw Object.assign(Error('RUNTIME_SOURCE_DRIFT'),{file:e.scope+'/'+e.file});
 if(JSON.stringify(await frontend.inventory(p.activeDist))!==JSON.stringify(p.frontend))throw Error('RETAINED_FRONTEND_CHANGED');
 configuration(applied?p.newConfig:p.oldConfig,applied?p.configSha256:p.oldConfigSha256);return {status:applied?'RAW_LOG_PINS_VERIFIED':'RAW_LOG_PREFLIGHT_PASS'};
}
async function apply({root,planSha256,stopped=false},{replace=atomic}={}){const {p}=packet(root,planSha256);if(!stopped||JSON.parse(read(path.join(root,'activation.json'))).state!=='STAGED_NOT_STARTED')throw Error('BOTH_SERVICES_STOPPED_FRESH_PACKET_REQUIRED');await verify({root,planSha256});state(root,{state:'APPLYING'});
 try{for(const e of p.entries)if(e.before!==e.after)replace(e.target,read(path.join(root,e.payload)));replace(p.envFile,read(path.join(root,'candidate/web-environment.json')));await verify({root,planSha256,applied:true});state(root,{state:'APPLIED_NOT_STARTED'});return {status:'RAW_LOG_FILES_APPLIED_NOT_STARTED',configSha256:p.configSha256};}
 catch(e){state(root,{state:'FAILED_MANUAL_RECOVERY_REQUIRED',phase:'APPLY_FILES',code:e.code||e.message,file:e.file||null});throw e;}
}
async function restoreFiles({root,planSha256,stopped=false,manual=false}){
 const {p}=packet(root,planSha256);if(!stopped||!manual)throw Error('EXPLICIT_MANUAL_STOPPED_RECOVERY_REQUIRED');
 for(const [file,digest]of Object.entries(p.protectedFiles))if(file!==p.envFile&&current(file)!==digest)throw Object.assign(Error('PROTECTED_RECOVERY_FILE_DRIFT'),{file});
 if(![p.envBefore,p.envAfter].includes(current(p.envFile)))throw Error('RECOVERY_ENVIRONMENT_DRIFT');
 for(const e of p.entries)if(![e.before,e.after].includes(current(e.target)))throw Object.assign(Error('RECOVERY_SOURCE_DRIFT'),{file:e.scope+'/'+e.file});
 for(const e of p.entries)if(e.backup)atomic(e.target,read(path.join(root,e.backup)));
 // Newly added modules stay unused; never delete files or data as part of recovery.
 atomic(p.envFile,read(path.join(root,'backup/web-environment.json')));configuration(p.oldConfig,p.oldConfigSha256);
 state(root,{state:'MANUAL_FILES_RESTORED_TASK_RESTORE_REQUIRED'});return {status:'MANUAL_RAW_LOG_FILES_RESTORED',servicesStarted:false,tasksChanged:false,dataDeleted:false};
}
async function health({root,planSha256}){const {p}=packet(root,planSha256);return require('./inspect-b2c-windows-release').probe(p.webRuntime,JSON.parse(read(p.envFile)),p.activeDist);}
function mark({root,planSha256,event}){packet(root,planSha256);const allowed=['WEB_START_ATTEMPTED','COURIER_START_ATTEMPTED','ACTIVE','FAILED_MANUAL_RECOVERY_REQUIRED'];if(!allowed.includes(event))throw Error('RELEASE_STATE_REJECTED');state(root,{state:event});return {state:event};}
async function main(){const mode=process.argv[2];if(process.argv.length!==3||!['stage','verify','apply','health','mark','restore-files'].includes(mode))throw Error('RAW_LOG_RELEASE_MODE_REJECTED');let raw='';for await(const part of process.stdin){raw+=part;if(raw.length>262144)throw Error('METADATA_TOO_LARGE');}const input=JSON.parse(raw);console.log(JSON.stringify(await ({stage,verify,apply,health,mark,'restore-files':restoreFiles}[mode])(input),null,2));}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'RAW_LOG_RELEASE_FAILED',code:e.code||e.message,file:e.file||null,stack:e.stack,automaticRollback:false}));process.exitCode=1;});
module.exports={stage,packet,verify,apply,health,mark,restoreFiles,atomic,LOG};
