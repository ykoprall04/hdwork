// Production preparation only: archive known code/configuration and encrypted bundle;
// never overwrite runtime files, decrypt credentials, connect to a service or send.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const roots=['src/chat/service.js','src/config/operational-pools.js','src/config/live-chat-activation.js','src/system/routes.js','src/system/store.js'];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const normalized=bytes=>bytes.toString('utf8').replace(/\r\n/g,'\n');
const pathKey=value=>process.platform==='win32'?value.toLowerCase():value;
const {operatorJson}=require('../src/config/operator-json');
const cleanEnv=()=>Object.fromEntries(['SystemRoot','WINDIR','PATH','Path','PATHEXT','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
function git(repo,args){return cp.execFileSync('git',args,{cwd:repo,encoding:null,stdio:['ignore','pipe','pipe'],env:cleanEnv(),maxBuffer:8*1024*1024});}
async function regular(file,max=2*1024*1024){if(pathKey(await fs.realpath(file))!==pathKey(path.resolve(file)))throw Error('PREPARATION_LINK_REJECTED');const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||stat.size>max)throw Error('UNSAFE_PREPARATION_INPUT');return fs.readFile(file);}
async function directory(value){const resolved=path.resolve(value);if(pathKey(await fs.realpath(resolved))!==pathKey(resolved))throw Error('PREPARATION_LINK_REJECTED');return resolved;}
const overlaps=(a,b)=>{a=pathKey(a);b=pathKey(b);return a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep);};
async function dependencyGraph(repo,commit){
 const files=new Map(),pending=[...roots];
 while(pending.length){const file=pending.pop();if(files.has(file))continue;if(!/^(src|contracts)\/[A-Za-z0-9_./-]+\.(js|json)$/.test(file)||file.split('/').includes('..'))throw Error('DEPENDENCY_REQUIRES_MANUAL_REVIEW');
  const bytes=git(repo,['show',commit+':'+file]);files.set(file,bytes);if(!file.endsWith('.js'))continue;
  for(const m of normalized(bytes).matchAll(/require\(\s*(['"])(\.[^'"]+)\1\s*\)/g)){
   const base=path.posix.normalize(path.posix.join(path.posix.dirname(file),m[2]));let found;
   for(const candidate of [base,base+'.js',base+'.json',base+'/index.js']){try{git(repo,['cat-file','-e',commit+':'+candidate]);if(/\.(js|json)$/.test(candidate)){found=candidate;break;}}catch{}}
   if(!found)throw Error('LOCAL_DEPENDENCY_NOT_RESOLVED');pending.push(found);
  }
 }
 return files;
}
async function historical(repo,commit,file,bytes){
 const value=sha(normalized(bytes));
 for(const ancestor of git(repo,['log',commit,'--format=%H','--',file]).toString('utf8').trim().split('\n').filter(Boolean)){
  try{if(sha(normalized(git(repo,['show',ancestor+':'+file])))===value)return ancestor;}catch{}
 }
 return null;
}
async function prepare({repo=path.resolve(__dirname,'..'),snapshot,reviewFile,output,routingFile}={}){
 repo=await directory(repo);snapshot=await directory(snapshot);output=path.resolve(output);await directory(path.dirname(output));
 if(process.platform==='win32'&&path.resolve(process.env.HDWORK2_PRIVATE_PREPARATION_PARENT||'.').toLowerCase()!==path.dirname(output).toLowerCase())throw Error('USE_PRIVATE_ACL_POWERSHELL_PREPARATION_WRAPPER');
 if(overlaps(output,snapshot)||overlaps(output,repo)||overlaps(output,path.resolve(reviewFile)))throw Error('PREPARATION_OUTPUT_MUST_BE_OUTSIDE_RUNTIME_AND_REPOSITORY');
 const commit=git(repo,['rev-parse','HEAD']).toString('utf8').trim(),rawEnv=await regular(path.join(snapshot,'service/environment.json'));
 const review=JSON.parse((await regular(path.resolve(reviewFile))).toString('utf8'));
 if(review.status!=='REVIEW_ONLY_NOT_ACTIVATED'||review.environmentSha256!==sha(rawEnv))throw Error('ENVIRONMENT_CHANGED_PREPARE_AGAIN');
 const env=JSON.parse(rawEnv.toString('utf8'));if(Object.keys(env).some(k=>/(PASSWORD|TOKEN|SECRET|SERVICE_KEY|IDENTITY_KEY)$/.test(k)&&!k.endsWith('_DPAPI_FILE')))throw Error('PLAINTEXT_SECRET_FIELDS_REJECTED');
 const activationPolicy=require('../src/config/live-chat-activation'),activation=activationPolicy.prepare(env);
 const rollbackGrantAlignmentRequired=JSON.stringify(activationPolicy.profiles(env))!==JSON.stringify(activationPolicy.profiles(activation.candidate));if(JSON.stringify(activation.patch)!==JSON.stringify(review.patch))throw Error('REVIEWED_ACTIVATION_PATCH_MISMATCH');
 const trialScope=require('../src/operations/testing-solver-scope').configuration(env);
 const routeReview=routingFile?require('../src/config/live-chat-production').routing(operatorJson(await regular(path.resolve(routingFile))),{trialScope}):null;
 const files=await dependencyGraph(repo,commit),entries=[],active=new Map(),blockers=[];
 const desiredLock=git(repo,['show',commit+':package-lock.json']);let currentLock;
 try{currentLock=await regular(path.join(snapshot,'package-lock.json'),8*1024*1024);if(sha(normalized(currentLock))!==sha(normalized(desiredLock)))blockers.push({code:'BACKEND_DEPENDENCY_LOCK_DIFFERS'});}catch{blockers.push({code:'BACKEND_DEPENDENCY_LOCK_UNAVAILABLE'});}
 for(const [file,desired]of files){
  let working;try{working=await regular(path.join(repo,file));}catch{blockers.push({file,code:'SOURCE_WORKTREE_UNAVAILABLE'});continue;}
  if(sha(normalized(working))!==sha(normalized(desired))){blockers.push({file,code:'SOURCE_WORKTREE_MODIFIED'});continue;}
  let bytes;try{bytes=await regular(path.join(snapshot,file));active.set(file,bytes);}catch(e){if(e.code!=='ENOENT'){blockers.push({file,code:'RUNTIME_FILE_UNREADABLE_OR_UNSAFE'});continue;}}
  const same=bytes&&sha(normalized(bytes))===sha(normalized(desired));
  const ancestor=bytes&&!same?await historical(repo,commit,file,bytes):null;
  const classification=same?'MATCH':!bytes?'NEW_FILE':ancestor?'KNOWN_ANCESTOR':'UNRECOGNIZED_RUNTIME_CHANGE';
  entries.push({file,root:roots.includes(file),classification,before:bytes?sha(bytes):null,after:sha(desired),ancestor});
  if(classification==='UNRECOGNIZED_RUNTIME_CHANGE')blockers.push({file,code:'RUNTIME_LOCAL_CHANGE_REQUIRES_REVIEW'});
 }
 await fs.mkdir(output,{mode:0o700});
 const plan={version:1,preparedAt:new Date().toISOString(),status:blockers.length?'BLOCKED_UNREVIEWED_SOURCE_OR_DEPENDENCY':'STAGED_NOT_ACTIVATED',commit,snapshot,environmentSha256:sha(rawEnv),entries,blockers,patch:activation.patch,frontend:{apiOrigin:env.HDWORK2_PUBLIC_ORIGIN,buildCommand:'npm run build:operational',requiredFlags:{VITE_HDWORK2_AUTH_COOKIE:'true',VITE_HDWORK2_OPERATIONS:'true',VITE_HDWORK2_LIVE_CHAT:'true'},verifiedBuildRequired:true},routing:routeReview||{status:'BLOCKED_VERIFIED_TARGETS_REQUIRED',sendEnabled:false},courier:require('../src/config/live-chat-production').courierPlan(routeReview),backupScope:'BACKEND_OVERLAY_ENVIRONMENT_ENCRYPTED_BUNDLE_ONLY',frontendBackupStatus:'PENDING_VERIFIED_FRONTEND_STAGE',backupComplete:false,requiredBeforeApply:['fresh schema/grant readiness and unchanged environment/source hashes','review all changed dependency files, not just the five roots','verified new-bot identity, target topics, task ownership and backlog','verified production frontend manifest and frontend backup','verified restartable rollback code/config/grant profile; never blindly revoke grants','explicit controlled activation/recovery window'],activationReady:false,databaseChanged:false,runtimeChanged:false,servicesRestarted:false,telegramAccessed:false};
 if(!blockers.length){
  const write=async(relative,bytes)=>{const file=path.join(output,relative);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file,bytes,{flag:'wx',mode:0o600});};
  for(const entry of entries.filter(e=>e.classification!=='MATCH')){
   if(active.has(entry.file))await write('backup/'+entry.file,active.get(entry.file));
   await write('payload/'+entry.file,files.get(entry.file));
   const staged=path.join(output,'payload',entry.file);if(entry.file.endsWith('.js')){try{cp.execFileSync(process.execPath,['--check',staged],{env:cleanEnv(),stdio:['ignore','pipe','pipe']});}catch{throw Error('STAGED_JAVASCRIPT_SYNTAX_CHECK_FAILED');}}else JSON.parse(files.get(entry.file));
  }
  await write('backup/service/environment.json',rawEnv);
  const encrypted=await regular(path.join(snapshot,'service/secrets.dpapi'),8*1024*1024);await write('backup/service/secrets.dpapi',encrypted);plan.encryptedBundleSha256=sha(encrypted);
  await write('payload/environment.patch.json',JSON.stringify(activation.patch,null,2)+'\n');
  for(const entry of entries){let current;try{current=await regular(path.join(snapshot,entry.file));}catch(e){if(e.code!=='ENOENT')throw e;}if((current?sha(current):null)!==entry.before)throw Error('RUNTIME_CHANGED_DURING_PREPARATION');}
  if(sha(await regular(path.join(snapshot,'service/environment.json')))!==sha(rawEnv)||sha(await regular(path.join(snapshot,'service/secrets.dpapi'),8*1024*1024))!==sha(encrypted))throw Error('RUNTIME_CHANGED_DURING_PREPARATION');
  if(sha(normalized(await regular(path.join(snapshot,'package-lock.json'),8*1024*1024)))!==sha(normalized(currentLock)))throw Error('DEPENDENCY_LOCK_CHANGED_DURING_PREPARATION');
  for(const entry of entries.filter(e=>e.classification!=='MATCH')){
   if(sha(await regular(path.join(output,'payload',entry.file)))!==entry.after)throw Error('STAGED_PAYLOAD_HASH_MISMATCH');
   if(entry.before&&sha(await regular(path.join(output,'backup',entry.file)))!==entry.before)throw Error('BACKUP_HASH_MISMATCH');
  }
  if(sha(await regular(path.join(output,'backup/service/environment.json')))!==plan.environmentSha256||sha(await regular(path.join(output,'backup/service/secrets.dpapi'),8*1024*1024))!==plan.encryptedBundleSha256)throw Error('BACKUP_HASH_MISMATCH');
  plan.backupComplete=true;
  plan.rollback={status:'PREPARED_NOT_EXECUTED',grantProfileAlignmentRequired:rollbackGrantAlignmentRequired,priorExpectedProfiles:activationPolicy.profiles(env),targetExpectedProfiles:activationPolicy.profiles(activation.candidate),restoreExisting:entries.filter(e=>e.classification!=='MATCH'&&e.before).map(e=>e.file),removeOnlyIfUnchanged:entries.filter(e=>e.classification==='NEW_FILE').map(e=>({file:e.file,expectedHash:e.after})),environmentBackup:'backup/service/environment.json',encryptedBundleBackup:'backup/service/secrets.dpapi',conditions:['pause only the verified HDWork2-Web process before changing loaded source','verify every active hash against the approved preimage or applied payload','restore previous source and exact environment; never modify credentials','do not restore or remove files changed independently after this plan','restart only the verified owned web task and validate authenticated health','current chat grants may not match restored old feature-off configuration; verify a compatible rollback boot path first','no GRANT/REVOKE is performed or authorized automatically by file rollback','Courier recovery is separate; never insert/delete/forge worker leases']};
 }
 await fs.writeFile(path.join(output,'production-plan.review.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
 return {status:plan.status,output,commit,rootChanges:entries.filter(e=>e.root&&e.classification!=='MATCH').map(e=>e.file),dependencyChanges:entries.filter(e=>!e.root&&e.classification!=='MATCH').map(e=>e.file),blockers,rollbackGrantAlignmentRequired,backupComplete:plan.backupComplete,backupScope:plan.backupScope,frontendBackupStatus:plan.frontendBackupStatus,routingStatus:plan.routing.status,courierStatus:plan.courier.status,activationReady:false,runtimeChanged:false,servicesRestarted:false,telegramAccessed:false};
}
async function main(argv=process.argv.slice(2)){
 if(argv[0]!=='--prepare')throw Error('PREPARE_ONLY_NO_ACTIVATION_SUPPORTED');const args={};for(let i=1;i<argv.length;i+=2){if(!['--snapshot','--review','--output','--routing'].includes(argv[i])||Object.hasOwn(args,argv[i])||!argv[i+1])throw Error('INVALID_PREPARATION_ARGUMENTS');args[argv[i]]=argv[i+1];}
 for(const key of ['--snapshot','--review','--output'])if(!args[key])throw Error('SNAPSHOT_REVIEW_OUTPUT_REQUIRED');
 console.log(JSON.stringify(await prepare({snapshot:args['--snapshot'],reviewFile:args['--review'],output:args['--output'],routingFile:args['--routing']}),null,2));
}
if(require.main===module)main().catch(e=>{const codes={EACCES:'PREPARATION_ACCESS_DENIED',EPERM:'PREPARATION_ACCESS_DENIED',ENOENT:'PREPARATION_INPUT_OR_PARENT_NOT_FOUND',EEXIST:'PREPARATION_OUTPUT_EXISTS_RETAINED'};console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:codes[e.code]||'PRODUCTION_PREPARATION_FAILED');process.exitCode=1;});
module.exports={prepare,dependencyGraph,roots,sha};
