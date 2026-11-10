// Approved application release is immutable. Preparation never changes runtime/services/SQL.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process');
const {hash,configuration}=require('./courier-task-runner');
const {dependencyGraph}=require('./prepare-live-chat-production');
const frontend=require('./frontend-only-release');
const release='827bb86c83ae5b6edd8f0e8f601df2e4cd00207a';
function read(file){const full=path.resolve(file),stat=fs.lstatSync(full),real=fs.realpathSync(full);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>32*1024*1024||(process.platform==='win32'?real.toLowerCase()!==full.toLowerCase():real!==full))throw Error('UNSAFE_RELEASE_INPUT');return fs.readFileSync(full);}
function write(root,name,bytes){const dest=path.join(root,name);fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});fs.writeFileSync(dest,bytes,{flag:'wx',mode:0o600});if(hash(read(dest))!==hash(Buffer.from(bytes)))throw Error('BACKUP_WRITE_VERIFICATION_FAILED');}
const normalize=bytes=>bytes.toString('utf8').replace(/\r\n/g,'\n');
const git=(repo,args)=>cp.execFileSync('git',args,{cwd:repo,stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024});
async function prepare({autostart,configSha256,output,buildDirectory,manifestSha256,ownerSid,repo=path.resolve(__dirname,'..')}={}){
 autostart=path.resolve(autostart);output=path.resolve(output);const configFile=path.join(autostart,'config.json'),old=configuration(configFile,configSha256),review=JSON.parse(read(path.join(autostart,'autostart.review.json')));
 if(old.ownerSid!==ownerSid||review.ownerSid!==ownerSid||review.configSha256!==configSha256||review.taskName!=='HDWork2-LiveChat-Courier')throw Error('EXISTING_AUTOSTART_OWNER_OR_HASH_MISMATCH');
 for(const [file,digest]of [['run-owner.ps1',review.wrapperSha256],['courier-task-runner.js',review.runnerSha256]])if(hash(read(path.join(autostart,file)))!==digest)throw Error('EXISTING_AUTOSTART_SOURCE_CHANGED');
 const actualOutput=fs.realpathSync(output);if((process.platform==='win32'?actualOutput.toLowerCase()!==output.toLowerCase():actualOutput!==output)||fs.lstatSync(output).isSymbolicLink())throw Error('PRIVATE_DIRECTORY_LINK_REJECTED');
 if(fs.readdirSync(output).some(name=>name!=='previous-courier-task.xml'))throw Error('EMPTY_PRIVATE_RELEASE_DIRECTORY_REQUIRED');
 for(const other of [old.snapshot,repo,autostart,buildDirectory]){const a=path.resolve(other).toLowerCase(),b=output.toLowerCase();if(a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep))throw Error('OVERLAPPING_RELEASE_DIRECTORIES');}
 const originalPlan=read(old.productionPlan),plan=JSON.parse(originalPlan),envBytes=read(path.join(old.snapshot,'service/environment.json')),env=JSON.parse(envBytes);
 if(plan.botId!=='hdworkopsbot-testing'||plan.telegramBotId!=='9133904377'||plan.botUsername!=='HDWorkOpsBot'||plan.activationNotBefore!=='2026-11-10T13:20:35.278Z'||plan.routingMode)throw Error('EXPECTED_RUNNING_BASELINE_REQUIRED');
 if(env.HDWORK2_LIVE_CHAT_ENABLED!=='true'||env.HDWORK2_SYSTEM_MONITORING_ENABLED!=='true'||env.HDWORK2_TESTING_SOLVER_ENABLED!=='false'||env.HDWORK2_SHARED_GROUPS_ENABLED==='true')throw Error('EXPECTED_ACTIVE_CHAT_BASELINE_REQUIRED');
 if(Object.keys(env).some(key=>/(PASSWORD|TOKEN|SECRET|SERVICE_KEY|IDENTITY_KEY)$/.test(key)&&!key.endsWith('_DPAPI_FILE')))throw Error('PLAINTEXT_ENVIRONMENT_FIELD_REJECTED');
 const origin=new URL(env.HDWORK2_PUBLIC_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.HDWORK2_PUBLIC_ORIGIN)throw Error('VERIFIED_RUNTIME_ORIGIN_REQUIRED');
 const build=await frontend.verified(buildDirectory,manifestSha256);if(build.manifest.apiOrigin!==origin.origin||JSON.stringify(build.manifest.flags)!==JSON.stringify({authCookie:true,operations:true,liveChat:true}))throw Error('BUILD_DOES_NOT_MATCH_ACTIVE_ORIGIN_AND_FLAGS');
 // Frontend build provenance is pinned independently of management-side commits.
 git(repo,['diff','--quiet',release,'--','frontend','scripts/build-operational-frontend.js','scripts/frontend-only-release.js']);
 const desiredLock=git(repo,['show',release+':package-lock.json']);if(normalize(read(path.join(old.snapshot,'package-lock.json')))!==normalize(desiredLock))throw Error('RUNTIME_DEPENDENCY_LOCK_DIFFERS');
 const graph=await dependencyGraph(repo,release,{production:true}),entries=[];
 for(const [file,after]of graph){let before=null;try{before=read(path.join(old.snapshot,file));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(before&&!Object.hasOwn(old.sourceHashes,file)){
   const ancestors=git(repo,['log',release,'--format=%H','--',file]).toString().trim().split('\n');let known=false;for(const ancestor of ancestors){try{if(normalize(git(repo,['show',ancestor+':'+file]))===normalize(before)){known=true;break;}}catch{}}
   if(!known)throw Object.assign(Error('UNREVIEWED_RUNTIME_FILE'),{file});
  }
  entries.push({file,before:before?hash(before):null,after:hash(after)});write(output,'payload/'+file,after);if(before)write(output,'backup/'+file,before);
 }
 for(const [file,digest]of Object.entries(old.sourceHashes))if(hash(read(path.join(old.snapshot,file)))!==digest)throw Error('RUNTIME_CHANGED_DURING_BACKUP');
 for(const name of ['environment.json','secrets.dpapi'])write(output,'backup/service/'+name,read(path.join(old.snapshot,'service',name)));
 write(output,'backup/production-plan.json',originalPlan);
 for(const file of ['config.json','autostart.review.json','courier-task-runner.js','run-owner.ps1'])write(output,'backup/autostart/'+file,read(path.join(autostart,file)));
 const activeDist=path.join(old.snapshot,'frontend/dist'),baseline=await frontend.inventory(activeDist);
 for(const name of Object.keys(baseline))write(output,'backup/frontend/'+name,read(path.join(activeDist,name)));
 if(JSON.stringify(await frontend.inventory(path.join(output,'backup/frontend')))!==JSON.stringify(baseline))throw Error('FRONTEND_BACKUP_MISMATCH');
 for(const name of Object.keys(build.files))write(output,'frontend/'+name,read(path.join(build.source,name)));
 write(output,'frontend/release-manifest.json',read(path.join(build.source,'release-manifest.json')));await frontend.verified(path.join(output,'frontend'),manifestSha256);
 require('../src/config/production-courier').validate({...plan,routingMode:'database'});
 const nextPlan=Buffer.from(JSON.stringify({...plan,routingMode:'database'},null,2)+'\n'),nextEnv=Buffer.from(JSON.stringify({...env,HDWORK2_SHARED_GROUPS_ENABLED:'true'},null,2)+'\n');
 write(output,'candidate/production-plan.json',nextPlan);write(output,'candidate/environment.json',nextEnv);
 write(output,'migration-014.review.sql',git(repo,['show',release+':database/manual/014_hdwork2_shared_groups.review.sql']));
 configuration(configFile,configSha256);
 if(hash(read(path.join(output,'backup/service/environment.json')))!==old.environmentSha256||hash(read(path.join(output,'backup/service/secrets.dpapi')))!==old.encryptedBundleSha256)throw Error('PROTECTED_BACKUP_CHANGED');
 if(JSON.stringify(await frontend.inventory(activeDist))!==JSON.stringify(baseline))throw Error('ACTIVE_FRONTEND_CHANGED_DURING_PREPARATION');
 const result={version:1,kind:'HDWORK2_SHARED_GROUPS_RELEASE',status:'BACKUP_VERIFIED_NOT_APPLIED',release,ownerSid,autostart,snapshot:old.snapshot,configSha256,oldProductionPlan:old.productionPlan,oldProductionPlanSha256:old.productionPlanSha256,candidateProductionPlanSha256:hash(nextPlan),environmentSha256:hash(envBytes),candidateEnvironmentSha256:hash(nextEnv),encryptedBundleSha256:old.encryptedBundleSha256,manifestSha256,baseline,entries,backupComplete:true,databaseBackup:'PENDING',migration:'PENDING',runtimeChanged:false,servicesRestarted:false,telegramAccessed:false,fullBackendRollbackAfterActivation:'PROHIBITED_WITHOUT_HELD_QUEUE_FENCING'};
 write(output,'release.review.json',Buffer.from(JSON.stringify(result,null,2)+'\n'));
 return {status:result.status,directory:output,release,releasePlanSha256:hash(read(path.join(output,'release.review.json'))),sourceFiles:entries.length,frontendBackupFiles:Object.keys(baseline).length,databaseBackup:'PENDING',migration:'PENDING',runtimeChanged:false,autostartChanged:false,telegramAccessed:false};
}
if(require.main===module){const a={};try{for(let i=2;i<process.argv.length;i+=2){if(!['--autostart','--config-sha256','--output','--build','--manifest-sha256','--owner-sid'].includes(process.argv[i])||a[process.argv[i]]||!process.argv[i+1])throw Error('INVALID_PREPARATION_ARGUMENTS');a[process.argv[i]]=process.argv[i+1];}if(Object.keys(a).length!==6)throw Error('PREPARATION_ARGUMENTS_REQUIRED');prepare({autostart:a['--autostart'],configSha256:a['--config-sha256'],output:a['--output'],buildDirectory:a['--build'],manifestSha256:a['--manifest-sha256'],ownerSid:a['--owner-sid']}).then(r=>console.log(JSON.stringify(r,null,2))).catch(error=>{console.error(JSON.stringify({status:'SHARED_RELEASE_PREPARATION_FAILED',code:error.code||error.message,file:error.file||null,runtimeChanged:false}));process.exitCode=1;});}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={prepare,release,read};
