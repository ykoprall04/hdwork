// Capability-based executor. Only an explicitly pinned owner host adapter may touch Windows.
// Default CLI is offline PLAN. No credentials, Telegram client or service controls are imported here.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {validateAllowlist,canonical,hash:logicalHash,barrierProof,closeAdministrative}=require('../../src/courier/administrative-closure');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fail=code=>Object.assign(Error(code),{code});
const FLAGS={fifo:false,fifoRelease:false,adaptiveScheduler:false,separateIo:false,send:false,poll:false,worker:false};
function regular(file){const abs=path.resolve(file),s=fs.lstatSync(abs);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||fs.realpathSync(abs).toLowerCase()!==abs.toLowerCase())throw fail('UNSAFE_ARTIFACT');return fs.readFileSync(abs);}
function fileSha(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||fs.realpathSync(file).toLowerCase()!==path.resolve(file).toLowerCase())throw fail('UNSAFE_BACKUP_FILE');const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(65536);try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))h.update(buffer.subarray(0,n));return h.digest('hex');}finally{buffer.fill(0);fs.closeSync(fd);}}
function within(root,file){const p=path.resolve(root,file);if(!p.toLowerCase().startsWith(path.resolve(root).toLowerCase()+path.sep)||file.split(/[\\/]/).includes('..'))throw fail('ARTIFACT_PATH_ESCAPE');return p;}
function assertFlagsOff(flags){if(canonical(flags)!==canonical(FLAGS))throw fail('FLAGS_NOT_OFF');}
function verifyApproval(a,p,planSha){
 if(!a||a.kind!=='HDWORK2_OPERATOR_CUTOVER_APPROVAL'||a.approved!==true||a.scope!=='CUTOVER_FLAGS_OFF_ONLY'||a.targetCommit!==p.targetCommit||a.decisionId!==p.decisionId||a.planSha256!==planSha||! /^[A-Za-z0-9_.@-]{1,64}$/.test(a.operator||'')||!Number.isFinite(Date.parse(a.expiresAtUtc))||Date.parse(a.expiresAtUtc)<=Date.now()||Date.parse(a.expiresAtUtc)>Date.now()+3600000||p.infrastructure?.native&&a.nativeConfigSha256!==p.infrastructure.native.sha256)throw fail('EXPLICIT_OPERATOR_APPROVAL_REQUIRED');
}
async function verifyPlan(file,expectedSha,expectedHead){
 const bytes=regular(file);if(sha(bytes)!==expectedSha)throw fail('PLAN_PIN_MISMATCH');const p=JSON.parse(bytes);
 if(p.version!==1||p.kind!=='HDWORK2_COURIER_CUTOVER'||! /^[a-f0-9]{40}$/.test(expectedHead||'')||p.targetCommit!==expectedHead||!path.isAbsolute(p.source)||!path.isAbsolute(p.releaseDirectory))throw fail('EXACT_TARGET_REQUIRED');
 const git=a=>cp.execFileSync('git',a,{cwd:p.source,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 if(git(['rev-parse','HEAD'])!==expectedHead||git(['status','--porcelain','--untracked-files=all']))throw fail('SOURCE_HEAD_OR_TREE_CHANGED');
 assertFlagsOff(p.initialFlags);
 const backendFile=within(p.releaseDirectory,p.backend.file),backendBytes=regular(backendFile);if(sha(backendBytes)!==p.backend.sha256)throw fail('BACKEND_MANIFEST_PIN_MISMATCH');const backend=JSON.parse(backendBytes);
 if(backend.targetCommit!==expectedHead||!Object.keys(backend.sourceHashes||{}).length)throw fail('BACKEND_TARGET_MISMATCH');
 for(const [name,digest] of Object.entries(backend.sourceHashes)){
  if(/(?:^|\/)(?:\.env|\.local|service\/secrets)/.test(name)||! /\.(?:js|cjs|py|json|ps1|sql)$/.test(name)||sha(regular(within(p.source,name)))!==digest)throw fail('BACKEND_SOURCE_PIN_MISMATCH');
 }
 await require('../frontend-only-release').verified(p.frontend.source,p.frontend.sha256);
 const allowBytes=regular(within(p.releaseDirectory,p.allowlist.file));if(sha(allowBytes)!==p.allowlist.fileSha256)throw fail('ALLOWLIST_FILE_PIN_MISMATCH');const allowlist=JSON.parse(allowBytes);
 if(validateAllowlist(allowlist)!==p.allowlist.logicalSha256||p.decisionId!==allowlist.decisionId)throw fail('ALLOWLIST_LOGICAL_PIN_MISMATCH');
 if(p.hostAdapter){if(!path.isAbsolute(p.hostAdapter.file)||sha(regular(p.hostAdapter.file))!==p.hostAdapter.sha256)throw fail('HOST_ADAPTER_PIN_MISMATCH');}
 for(const item of Object.values(p.infrastructure||{}))if(!path.isAbsolute(item.file||'')||sha(regular(item.file))!==item.sha256)throw fail('INFRASTRUCTURE_PIN_MISMATCH');
 return {plan:p,allowlist,planSha256:expectedSha};
}
function queueGate(inspect,a){
 const rows=inspect?.candidates||[],expect=new Map(a.entries.map(e=>[e.id,e]));
 if(inspect.schemaMetadataKnown!==true||inspect.oldAndNewClaimOnlyQueued!==true||inspect.duplicateInstances||inspect.ackPending!==0||inspect.otherQueued!==0||inspect.otherSending!==0||rows.length!==18)throw fail('PREFLIGHT_GATE_STOP');
 for(const r of rows)if(!expect.has(r.id)||r.state!==expect.get(r.id).state||logicalHash(require('../../src/courier/administrative-closure').snapshot(r))!==logicalHash(require('../../src/courier/administrative-closure').snapshot(expect.get(r.id)))||Number(r.leaseActive)!==0)throw fail('COHORT_CHANGED_OR_ACTIVE');
 if(new Set(rows.map(r=>r.id)).size!==18)throw fail('COHORT_DUPLICATE');
}
function pairedReceipt(r,barrier,a,seal,root){
 if(!r||r.kind!=='HDWORK2_PAIRED_BACKUP_RECEIPT'||r.barrierId!==barrier.barrierId||r.allowlistSha256!==seal||r.decisionId!==a.decisionId||r.sameQuiescentInterval!==true||r.restoreRehearsalVerified!==true)throw fail('PAIRED_BACKUP_NOT_PROVEN');
 for(const name of ['mysql','sqlite']){
  const x=r[name];if(!x||x.integrityVerified!==true||!x.rowCounts||!Object.keys(x.rowCounts).length||canonical(x.rowCounts)!==canonical(x.restoredRowCounts)||! /^[a-f0-9]{64}$/.test(x.sha256||'')||root&&within(root,path.relative(root,x.file))!==path.resolve(x.file)||fileSha(x.file)!==x.sha256)throw fail('BACKUP_INTEGRITY_OR_RESTORE_MISMATCH');
 }
}
async function executeCutover(verified,host,{execute=false,approval,save=()=>{}}={}){
 const {plan:p,allowlist:a,planSha256}=verified,seal=validateAllowlist(a),journal={status:'PLAN_ONLY',targetCommit:p.targetCommit,planSha256,decisionId:a.decisionId,stages:[],productionChanged:execute?null:false};
 if(!execute)return journal;
 if(!host)throw fail('PINNED_OWNER_HOST_ADAPTER_REQUIRED');
 const stage=(name,evidence)=>{journal.stages.push({name,at:new Date().toISOString(),evidence});save(journal);};
 let stopped=false,closureCommitted=false,barrier,backup;
 try{
  verifyApproval(approval,p,planSha256);
  queueGate(await host.inspect({allowlist:a}),a);stage('QUEUE_GATE_PASS');
  barrier=await host.stopClean({decisionId:a.decisionId,allowlistSha256:seal});
  if(!barrier||barrier.kind!=='HDWORK2_CUTOVER_BARRIER'||barrier.graceful!==true||barrier.forced||!barrier.courierStopped||!barrier.writersQuiesced||!barrier.allOwnedPidsGone||!barrier.fenceHeld)throw fail('CLEAN_STOP_NOT_PROVEN');
  stopped=true;stage('CLEAN_STOP_VERIFIED',{barrierId:barrier.barrierId});
  queueGate(await host.inspect({allowlist:a,quiescent:true}),a); // Catch enqueues racing with the initial stop/fence.
  backup=await host.backupPair({barrier,allowlist:a});pairedReceipt(backup,barrier,a,seal,p.releaseDirectory);stage('PAIRED_BACKUP_AND_RESTORE_VERIFIED');
  const schema=await host.schema({versions:[15,16,17],barrier,backup});if(schema.exact!==true||schema.versions?.join(',')!=='15,16,17')throw fail('SCHEMA_NOT_EXACT');stage('SCHEMA_015_016_017_VERIFIED');
  const grants=await host.grants({barrier});if(grants.exact!==true||grants.deleteAdded||grants.excessive)throw fail('GRANTS_NOT_MINIMUM');stage('GRANTS_VERIFIED');
  const fresh=await host.assertQuiescent({barrier});if(fresh.barrierId!==barrier.barrierId||!fresh.fenceHeld)throw fail('QUIESCENCE_LOST');
  const proof={...fresh,kind:'HDWORK2_CUTOVER_BARRIER',decisionId:a.decisionId,allowlistSha256:seal,backupPairVerified:true,backupReceiptSha256:logicalHash(backup)};barrierProof(proof,seal,a);
  const closed=await closeAdministrative(await host.databasePool(),{allowlist:a,expectedAllowlistSha256:seal,dryRun:false,barrier:proof});closureCommitted=true;stage('ADMINISTRATIVE_18_CLOSED_FIFO_UNCHANGED',closed);
  const installed=await host.installFlagsOff({plan:p,flags:{...FLAGS},barrier});
  assertFlagsOff(installed.flags);if(installed.targetCommit!==p.targetCommit||installed.frontendSha256!==p.frontend.sha256||installed.backendSha256!==p.backend.sha256)throw fail('INSTALLED_PIN_MISMATCH');stage('EXACT_SOURCE_INSTALLED_FLAGS_OFF');
  const health=await host.health({plan:p,barrier});
  if(health.externalDeliveryPossible)throw fail('EXTERNAL_DELIVERY_RISK_STOP');
  if(!health.healthy||!health.pinsMatch||!health.tlsPinned||!health.courierStopped)throw fail('HEALTH_FAILED');stage('FLAGS_OFF_HEALTH_PASS');
  journal.status='INSTALLED_FLAGS_OFF_AWAITING_SEPARATE_PHASE_APPROVAL';journal.administrativeClosuresPreserved=true;journal.flags={...FLAGS};journal.courierStopped=true;save(journal);return journal;
 }catch(e){
  journal.status='STOP';journal.code=/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'CUTOVER_FAILED';journal.administrativeClosureCommitted=closureCommitted;
  if(stopped&&journal.code!=='EXTERNAL_DELIVERY_RISK_STOP'){
   try{
    const restored=await host.rollbackRuntime({plan:p,barrier,backup,preserveAdministrativeClosures:true,restoreDatabase:false,keepCourierStopped:true});
    if(!restored.runtimeRestored||!restored.courierStopped||restored.databaseRestored||!restored.administrativeClosuresPreserved||!restored.flagsOff)throw fail('ROLLBACK_UNSAFE');
    journal.rollback='RUNTIME_RESTORED_SENDER_STOPPED_ADMIN_HISTORY_PRESERVED';
   }catch{journal.rollback='FAILED_STOP_FOR_OWNER_RECOVERY';}
  }else if(stopped)journal.rollback='SKIPPED_DATA_REWIND_EXTERNAL_EFFECT_RISK';
  save(journal);return journal;
 }
}
module.exports={FLAGS,sha,verifyPlan,verifyApproval,executeCutover,queueGate,pairedReceipt,regular,within};
