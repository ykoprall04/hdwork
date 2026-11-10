// Private task artifacts only. No task registration, DPAPI decryption or network access.
const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./courier-task-runner');
function read(file){const p=path.resolve(file),s=fs.lstatSync(p),real=fs.realpathSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>16*1024*1024||(process.platform==='win32'?real.toLowerCase()!==p.toLowerCase():real!==p))throw Error('AUTOSTART_INPUT_REJECTED');return fs.readFileSync(p);}
function prepare({releasePrepared,fixPrepared,productionPlan,productionPlanSha256,ownerSid,nodeExecutable,pythonExecutable,output,repo=path.resolve(__dirname,'..')}={}){
 const release=JSON.parse(read(path.join(releasePrepared,'production-plan.review.json'))),fix=JSON.parse(read(path.join(fixPrepared,'production-plan.review.json')));
 if(release.commit!=='4ef886e9bb2176b15f86cb3c2462a601fb8d14d6'||fix.commit!=='f6ec0be361e7847138a29f9af88b7803516e40d9'||!release.backupComplete||fix.kind!=='HDWORK2_INCOMING_CHAT_FIX'||fix.baseCommit!==release.commit||fix.snapshot!==release.snapshot||!fix.backupComplete||!/^S-1-[0-9-]+$/.test(ownerSid)||['S-1-5-18','S-1-5-19','S-1-5-20'].includes(ownerSid))throw Error('APPROVED_BASE_FIX_AND_OWNER_REQUIRED');
 const planBytes=read(productionPlan);if(hash(planBytes)!==productionPlanSha256)throw Error('PRODUCTION_PLAN_CHANGED');
 const plan=JSON.parse(planBytes);
 if(plan.botId!=='hdworkopsbot-testing'||plan.telegramBotId!=='9133904377'||plan.botUsername!=='HDWorkOpsBot'||plan.activationNotBefore!=='2026-11-10T13:20:35.278Z')throw Error('VERIFIED_PRODUCTION_IDENTITY_AND_BOUNDARY_REQUIRED');
 if(!path.isAbsolute(nodeExecutable)||!path.isAbsolute(pythonExecutable)||!fs.statSync(nodeExecutable).isFile()||!fs.statSync(pythonExecutable).isFile())throw Error('VERIFIED_EXECUTABLES_REQUIRED');
 const sourceHashes={};
 for(const entry of release.entries){
  if(entry.file.split('/').includes('..')||path.isAbsolute(entry.file))throw Error('SOURCE_PATH_REJECTED');
  const replacement=fix.entries.find(e=>e.file===entry.file);
  const expected=replacement?replacement.after:entry.classification==='MATCH'?entry.before:entry.after;
  if(hash(read(path.join(release.snapshot,entry.file)))!==expected)throw Error('APPROVED_RUNTIME_SOURCE_DRIFT');sourceHashes[entry.file]=expected;
 }
 for(const entry of fix.entries)if(!Object.hasOwn(sourceHashes,entry.file))throw Error('FIX_NOT_IN_RUNTIME_MANIFEST');
 if(hash(read(path.join(release.snapshot,'service/environment.json')))!==fix.environmentSha256||hash(read(path.join(release.snapshot,'service/secrets.dpapi')))!==fix.encryptedBundleSha256)throw Error('PROTECTED_CONFIGURATION_CHANGED');
 require(path.join(release.snapshot,'src/config/production-courier')).validate(plan);
 output=path.resolve(output);if(fs.readdirSync(output).length)throw Error('NEW_PRIVATE_DIRECTORY_REQUIRED');
 const runner=read(path.join(repo,'scripts/courier-task-runner.js')),wrapper=read(path.join(repo,'scripts/run-courier-scheduled-owner.ps1'));
 const config={version:1,kind:'HDWORK2_COURIER_AUTOSTART',ownerSid,nodeExecutable,pythonExecutable,snapshot:release.snapshot,productionPlan:path.resolve(productionPlan),productionPlanSha256,botId:plan.botId,telegramBotId:plan.telegramBotId,port:plan.port,baseCommit:release.commit,patchCommit:fix.commit,sourceHashes,environmentSha256:fix.environmentSha256,encryptedBundleSha256:fix.encryptedBundleSha256,runnerSha256:hash(runner)};
 const bytes=Buffer.from(JSON.stringify(config,null,2)+'\n');
 for(const [file,data]of [['courier-task-runner.js',runner],['run-owner.ps1',wrapper],['config.json',bytes]])fs.writeFileSync(path.join(output,file),data,{flag:'wx',mode:0o600});
 const review={version:1,taskName:'HDWork2-LiveChat-Courier',ownerSid,configSha256:hash(bytes),wrapperSha256:hash(wrapper),runnerSha256:hash(runner),startsAt:'OWNER_LOGON',restartCount:3,multipleInstances:'IgnoreNew',passwordStored:false,taskRegistered:false};
 fs.writeFileSync(path.join(output,'autostart.review.json'),JSON.stringify(review,null,2)+'\n',{flag:'wx',mode:0o600});
 return {status:'AUTOSTART_PREPARED_NOT_REGISTERED',directory:output,taskName:review.taskName,ownerSid,configSha256:review.configSha256,startsAt:review.startsAt,productionSourceChanged:false,credentialsChanged:false};
}
if(require.main===module){try{const a={};for(let i=2;i<process.argv.length;i+=2){const k=process.argv[i];if(!['--release-prepared','--fix-prepared','--plan','--plan-sha256','--owner-sid','--node-exe','--python-exe','--output'].includes(k)||a[k]||!process.argv[i+1])throw Error();a[k]=process.argv[i+1];}if(Object.keys(a).length!==8)throw Error();console.log(JSON.stringify(prepare({releasePrepared:a['--release-prepared'],fixPrepared:a['--fix-prepared'],productionPlan:a['--plan'],productionPlanSha256:a['--plan-sha256'],ownerSid:a['--owner-sid'],nodeExecutable:a['--node-exe'],pythonExecutable:a['--python-exe'],output:a['--output']}),null,2));}catch{console.error('COURIER_AUTOSTART_PREPARATION_FAILED');process.exitCode=1;}}
module.exports={prepare};
