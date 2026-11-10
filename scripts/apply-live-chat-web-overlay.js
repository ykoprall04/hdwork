// File-only executor. Caller must pause the verified web task; no service, SQL or Telegram control.
const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function read(file){const p=path.resolve(file),s=fs.lstatSync(p),actual=fs.realpathSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>8*1024*1024||(process.platform==='win32'?actual.toLowerCase()!==p.toLowerCase():actual!==p))throw Error('UNSAFE_OVERLAY_FILE');return fs.readFileSync(p);}
function allowed(file){return typeof file==='string'&&!file.split('/').some(p=>['..','.',''].includes(p))&&(/^(src|contracts)\/[A-Za-z0-9_./-]+\.(js|json)$/.test(file)||/^courier_bot\/courier\/[A-Za-z0-9_/-]+\.py$/.test(file)||['courier-b2c-server.js','local-web-server.js','api-only-server.js','scripts/run-production-live-chat-courier.js','scripts/protected-web-service.js','scripts/office-web-service.js','scripts/read-dpapi-password.ps1'].includes(file));}
function current(file){try{return read(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function write(file,bytes){const parent=path.dirname(file);fs.mkdirSync(parent,{recursive:true});if(fs.realpathSync(parent)!==path.resolve(parent))throw Error('OVERLAY_PARENT_LINK_REJECTED');const temp=path.join(parent,'.hdwork2-'+randomUUID()+'.tmp');try{fs.writeFileSync(temp,bytes,{flag:'wx',mode:0o600});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function execute({prepared,planSha256,mode,approved=false,webStopped=false,courierStopped=false}={}){
 if(!approved||(!webStopped&&!courierStopped)||!['apply','rollback'].includes(mode))throw Error('APPROVED_DEPLOYMENT_AND_STOPPED_WEB_REQUIRED');
 prepared=path.resolve(prepared);const raw=read(path.join(prepared,'production-plan.review.json'));
 if(!/^[a-f0-9]{64}$/.test(planSha256||'')||hash(raw)!==planSha256)throw Error('APPROVED_PLAN_HASH_MISMATCH');
 const plan=JSON.parse(raw),snapshot=path.resolve(plan.snapshot);
 if(plan.version!==1||plan.status!=='STAGED_NOT_ACTIVATED'||plan.backupComplete!==true||!Array.isArray(plan.entries)||new Set(plan.entries.map(e=>e.file)).size!==plan.entries.length||plan.entries.some(e=>!allowed(e.file)||!['MATCH','NEW_FILE','KNOWN_ANCESTOR'].includes(e.classification)||!/^[a-f0-9]{64}$/.test(e.after)||!(e.before===null||/^[a-f0-9]{64}$/.test(e.before))))throw Error('REVIEWED_STAGED_OVERLAY_REQUIRED');
 const beforeEnv=read(path.join(prepared,'backup/service/environment.json'));
 const backupBundle=read(path.join(prepared,'backup/service/secrets.dpapi'));
 if(hash(beforeEnv)!==plan.environmentSha256||hash(backupBundle)!==plan.encryptedBundleSha256||hash(read(path.join(snapshot,'service/secrets.dpapi')))!==plan.encryptedBundleSha256)throw Error('OVERLAY_BACKUP_OR_BUNDLE_CHANGED');
 const patch=plan.patch;
 if(!patch||patch.HDWORK2_LIVE_CHAT_ENABLED!=='true'||patch.HDWORK2_SYSTEM_MONITORING_ENABLED!=='true'||Object.keys(patch).some(k=>!['HDWORK2_LIVE_CHAT_ENABLED','HDWORK2_SYSTEM_MONITORING_ENABLED','HDWORK2_TESTING_SOLVER_ENABLED'].includes(k))||(Object.hasOwn(patch,'HDWORK2_TESTING_SOLVER_ENABLED')&&patch.HDWORK2_TESTING_SOLVER_ENABLED!=='false'))throw Error('OVERLAY_FEATURE_PATCH_REJECTED');
 const afterEnv=Buffer.from(JSON.stringify({...JSON.parse(beforeEnv),...patch},null,2)+'\n');
 const incomingOnly=plan.kind==='HDWORK2_INCOMING_CHAT_FIX'&&plan.entries.length===2&&['src/chat/service.js','courier_bot/courier/groups.py'].every(file=>plan.entries.some(e=>e.file===file))&&hash(afterEnv)===hash(beforeEnv);
 if(plan.kind==='HDWORK2_INCOMING_CHAT_FIX'&&(!incomingOnly||!courierStopped))throw Error('COURIER_ONLY_SCOPE_REQUIRED');
 if(!webStopped&&!(courierStopped&&incomingOnly))throw Error('COURIER_ONLY_SCOPE_REQUIRED');
 const envFile=path.join(snapshot,'service/environment.json'),envHash=hash(read(envFile));
 if(mode==='apply'?envHash!==hash(beforeEnv):![hash(beforeEnv),hash(afterEnv)].includes(envHash))throw Error('OVERLAY_ENVIRONMENT_DRIFT');
 const changes=[];
 for(const entry of plan.entries){
  const target=path.join(snapshot,entry.file),bytes=current(target),digest=bytes?hash(bytes):null;
  if(mode==='apply'?digest!==entry.before:![entry.before,entry.after].includes(digest))throw Error('OVERLAY_RUNTIME_SOURCE_DRIFT');
  if(entry.classification==='MATCH')continue;
  const payload=read(path.join(prepared,'payload',entry.file));if(hash(payload)!==entry.after)throw Error('OVERLAY_PAYLOAD_CHANGED');
  const backup=entry.before===null?null:read(path.join(prepared,'backup',entry.file));if(backup&&hash(backup)!==entry.before)throw Error('OVERLAY_SOURCE_BACKUP_CHANGED');
  changes.push({entry,target,payload,backup});
 }
 // All preimages/backups checked before the first write. Recheck each immediately before replacement.
 for(const {entry,target,payload,backup}of changes){
  const bytes=current(target),digest=bytes?hash(bytes):null;
  if(mode==='apply'?digest!==entry.before:![entry.before,entry.after].includes(digest))throw Error('OVERLAY_CONCURRENT_SOURCE_CHANGE');
  if(mode==='apply')write(target,payload);else if(digest===entry.after){if(backup)write(target,backup);else fs.unlinkSync(target);}
 }
 if(hash(read(envFile))!==envHash)throw Error('OVERLAY_CONCURRENT_ENVIRONMENT_CHANGE');
 const desiredEnv=mode==='apply'?afterEnv:beforeEnv;
 if(hash(desiredEnv)!==envHash)write(envFile,desiredEnv);
 return {status:incomingOnly?(mode==='apply'?'INCOMING_FIX_APPLIED_COURIER_RESTART_REQUIRED':'INCOMING_FIX_RESTORED_COURIER_RESTART_REQUIRED'):(mode==='apply'?'FILES_APPLIED_WEB_RESTART_REQUIRED':'FILES_RESTORED_WEB_REMAINS_STOPPED'),restartScope:incomingOnly?'COURIER_ONLY':'WEB',configurationChanged:hash(desiredEnv)!==envHash,changedFiles:changes.length,servicesRestarted:false,databaseAccessed:false,telegramAccessed:false,rollbackBootCompatibilityVerified:false};
}
function main(argv=process.argv.slice(2)){
 const args={};for(let i=0;i<argv.length;i+=2){if(!['--mode','--prepared','--plan-sha256','--approved-deployment','--confirmed-web-stopped','--confirmed-courier-stopped'].includes(argv[i])||args[argv[i]]||!argv[i+1])throw Error('INVALID_OVERLAY_ARGUMENTS');args[argv[i]]=argv[i+1];}
 console.log(JSON.stringify(execute({mode:args['--mode'],prepared:args['--prepared'],planSha256:args['--plan-sha256'],approved:args['--approved-deployment']==='yes',webStopped:args['--confirmed-web-stopped']==='yes',courierStopped:args['--confirmed-courier-stopped']==='yes'})));
}
if(require.main===module){try{main();}catch{console.error(JSON.stringify({status:'OVERLAY_STOPPED_REVIEW_REQUIRED',partialFileChangesPossible:true,servicesRestarted:false}));process.exitCode=1;}}
module.exports={execute,hash};
