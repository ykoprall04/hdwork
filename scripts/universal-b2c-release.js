// Three-file coordinated release using the existing stopped-service/pinned-runner contract.
// No SQL, DPAPI unwrap, Telegram client or task control in this engine.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { hash, configuration } = require('./courier-task-runner');
const { read } = require('./prepare-shared-groups-release');
const frontend = require('./frontend-only-release');
const { TARGET, FILES } = require('./inspect-universal-b2c-release');
const HOST = {
 webRuntime: 'C:\\ProgramData\\HDWork2WebB2C-9fb8b720f98548fb98d71e34dfe9e06d',
 courierSnapshot: 'C:\\ProgramData\\HDWork2Runtime-2e42d6e5ebcd44dbbf1af199244425cc',
 courierConfigSha256: 'ea23ec1df25c7bad68b07d8233dba0171db1b4369016466061feaf56401c07e5',
 productionPlanSha256: 'ceb7d579676bbf574ae692832b9181075f13800670884d4ab8ef5bca8d7dc233',
 mappingSha256: '3d32b9572036fc038797491f87397aea5aa73dacc66eaf633d7e0d9298201a18',
 indexSha256: '5ac10ffbfaed13317cf2cc3796431f2e1d5d679f09da33b50a445daa84648e3e',
 activationNotBefore: '2026-11-10T13:20:35.278Z',
 source: [
 ['75816d50b26237e9eca88ab5f9ab39905f1b0e992e0dcd0c8d1cd2bece780f38','75816d50b26237e9eca88ab5f9ab39905f1b0e992e0dcd0c8d1cd2bece780f38','3ad770faf941f50a387406b21798d065f4602a2803e008a71da0a8ec5b6c5683'],
 ['01bbb137f9abb9d13bdace64d97d0ce28b762eb15d7575b6e8731257fab5d6d4','01bbb137f9abb9d13bdace64d97d0ce28b762eb15d7575b6e8731257fab5d6d4','798a93960b4c9144ba345efabcb951082de3dbd72f16fe0e923d79fb8d9ba4d1'],
 ['844fc6014979a3dd0629827537e754b86f89b8808488e0ee4664e5bf7028c584','07e5c846a7c4b924a2193343cd2ec28ce4b0f07db0ede67482c50d553fb6d259','e8049b32a8efe3fd2f42665f44da50c62df80a799b0a0f762b9c054e6bcee1c4']]
};
const COMPAT = ['src/courier/groups.js','src/b2c-workflow/commands.js','src/b2c-workflow/workflow.js','src/b2c-workflow/command-storage.js','src/system/routing.js','contracts/b2c-commands.json','package-lock.json','courier_bot/courier/groups.py','courier_bot/courier/commands.py','courier_bot/courier/durable_runner.py'];
function atomic(file, bytes) {
 const folder = path.resolve(path.dirname(file));
 if (fs.realpathSync(folder).toLowerCase() !== folder.toLowerCase()) throw Error('RUNTIME_PARENT_LINK_REJECTED');
 const temp = file + '.universal-' + randomUUID() + '.tmp';
 try { fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, file); }
 finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function write(root, name, bytes) { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 }); const actual=hash(read(file));if(actual!==hash(Buffer.from(bytes)))throw Error('PACKET_WRITE_VERIFICATION_FAILED');return actual; }
function state(root) { return JSON.parse(read(path.join(root, 'activation.json'))); }
function journal(root, value) { atomic(path.join(root, 'activation.json'), Buffer.from(JSON.stringify({ ...value, checkedAt: new Date().toISOString() }, null, 2) + '\n')); }
function metadata(report, expected) {
 if (!report || report.applicationCommit !== TARGET || !report.sharedGroupsWeb || report.courierRoutingMode !== 'database' || report.activationNotBefore !== expected.activationNotBefore || report.courierConfigSha256 !== expected.courierConfigSha256 || report.productionPlanSha256 !== expected.productionPlanSha256 || report.webRuntime.toLowerCase() !== expected.webRuntime.toLowerCase() || report.courierSnapshot.toLowerCase() !== expected.courierSnapshot.toLowerCase() || report.frontend?.indexSha256 !== expected.indexSha256) throw Error('VERIFIED_HOST_BASELINE_CHANGED');
 if (!report.database?.schemaCompatible || !report.database.existingTableGrantsVerified || report.database.mappingSha256 !== expected.mappingSha256 || !report.database.effectiveB2CCoverage || report.database.sqlWrites !== false) throw Error('VERIFIED_SCHEMA_OR_MAPPING_CHANGED');
}
async function stage({ root, repo, report, ownerSid, expected = HOST, git = cp.execFileSync }) {
 root = path.resolve(root);
 if (fs.realpathSync(root).toLowerCase() !== root.toLowerCase() || fs.readdirSync(root).some(n => !['previous-web-task.xml','previous-courier-task.xml'].includes(n))) throw Error('EMPTY_PRIVATE_PACKET_REQUIRED');
 metadata(report, expected);
 for(const other of [repo,report.webRuntime,report.courierSnapshot,path.dirname(report.courierConfig)]){const a=root.toLowerCase(),b=path.resolve(other).toLowerCase();if(a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep))throw Error('PACKET_RUNTIME_PATHS_OVERLAP');}
 if (!report.database.courierLeaseActive || !report.courierProcess?.ready) throw Error('HEALTHY_EXISTING_COURIER_REQUIRED');
 const cfg = configuration(report.courierConfig, report.courierConfigSha256);
 if (cfg.snapshot.toLowerCase() !== report.courierSnapshot.toLowerCase()) throw Error('COURIER_SNAPSHOT_CHANGED');
 if (cfg.ownerSid !== ownerSid) throw Error('EXISTING_OWNER_REQUIRED');
 const auto = path.dirname(report.courierConfig), reviewFile = path.join(auto, 'autostart.review.json'), reviewBytes = read(reviewFile), review = JSON.parse(reviewBytes);
 if (review.configSha256 !== report.courierConfigSha256 || review.ownerSid !== ownerSid || review.taskName !== 'HDWork2-LiveChat-Courier') throw Error('LAUNCHER_REVIEW_CHANGED');
 git('git', ['diff','--exit-code',TARGET,'--','src','contracts','courier_bot/courier','courier-b2c-server.js','package.json','package-lock.json'], { cwd: repo, stdio: ['ignore','pipe','pipe'] });
 const launchers = Object.fromEntries(['run-owner.ps1','courier-task-runner.js'].map(file => [path.join(auto,file), hash(read(path.join(auto,file)))]));
 if (launchers[path.join(auto,'run-owner.ps1')] !== review.wrapperSha256 || launchers[path.join(auto,'courier-task-runner.js')] !== review.runnerSha256) throw Error('LAUNCHER_SOURCE_CHANGED');
 const retainedFrontend = await frontend.inventory(report.activeDist);
 if (retainedFrontend['index.html'] !== expected.indexSha256) throw Error('BASELINE_INDEX_CHANGED');
 const compatibility = {};
 for (const file of COMPAT) {
  const desired=git('git',['show',TARGET+':'+file],{cwd:repo,stdio:['ignore','pipe','pipe']});
  for (const snapshot of (file.startsWith('courier_bot/')?[cfg.snapshot]:[report.webRuntime,cfg.snapshot])) {
   const full=path.join(snapshot,file),bytes=read(full);
   if(bytes.toString('utf8').replace(/\r\n/g,'\n')!==desired.toString('utf8').replace(/\r\n/g,'\n'))throw Object.assign(Error('UNCHANGED_DEPENDENCY_INCOMPATIBLE'),{file,snapshot});
   compatibility[full]=hash(bytes);
  }
 }
 const entries = [], packetFiles = {};
 for (const [i, file] of FILES.entries()) {
  const web = read(path.join(report.webRuntime, file)), courier = read(path.join(cfg.snapshot, file));
  const candidate = git('git', ['show',TARGET + ':' + file], { cwd: repo, stdio: ['ignore','pipe','pipe'] });
  if (hash(web) !== expected.source[i][0] || hash(courier) !== expected.source[i][1] || hash(candidate) !== expected.source[i][2] || cfg.sourceHashes[file] !== hash(courier)) throw Object.assign(Error('EXACT_THREE_FILE_BASELINE_REQUIRED'),{file});
  packetFiles['backup/web/' + file] = write(root, 'backup/web/' + file, web);
  packetFiles['backup/courier/' + file] = write(root, 'backup/courier/' + file, courier);
  packetFiles['payload/' + file] = write(root, 'payload/' + file, candidate);
  entries.push({ file, beforeWeb: hash(web), beforeCourier: hash(courier), after: hash(candidate) });
 }
 const cfgBytes = read(report.courierConfig);
 const next = { ...cfg, sourceHashes: { ...cfg.sourceHashes } };
 for (const entry of entries) next.sourceHashes[entry.file] = entry.after;
 const nextBytes = Buffer.from(JSON.stringify(next, null, 2) + '\n'), nextHash = hash(nextBytes);
 const nextReview = Buffer.from(JSON.stringify({ ...review, configSha256: nextHash }, null, 2) + '\n');
 for (const [name, bytes] of [['backup/config.json',cfgBytes],['backup/review.json',reviewBytes],['candidate/config.json',nextBytes],['candidate/review.json',nextReview],['inspection.json',Buffer.from(JSON.stringify(report,null,2)+'\n')]]) packetFiles[name] = write(root, name, bytes);
 for (const file of ['previous-web-task.xml','previous-courier-task.xml']) packetFiles[file] = hash(read(path.join(root,file)));
 const environments = {};
 for (const [label, snapshot] of [['web',report.webRuntime],['courier',cfg.snapshot]]) environments[label] = { environment: hash(read(path.join(snapshot,'service/environment.json'))), cipher: hash(read(path.join(snapshot,'service/secrets.dpapi'))) };
 const plan = { version: 1, kind: 'HDWORK2_UNIVERSAL_B2C_COORDINATED', applicationCommit: TARGET, ownerSid, webRuntime: report.webRuntime, courierSnapshot: cfg.snapshot, activeDist: report.activeDist, courierConfig: report.courierConfig, reviewFile, productionPlan: cfg.productionPlan, productionPlanSha256: cfg.productionPlanSha256, beforeConfig: hash(cfgBytes), afterConfig: nextHash, beforeReview: hash(reviewBytes), afterReview: hash(nextReview), expected, entries, environments, launchers, compatibility, frontend: retainedFrontend, packetFiles };
 const planBytes = Buffer.from(JSON.stringify(plan,null,2)+'\n'); write(root, 'plan.json', planBytes); journal(root, { state: 'STAGED_NOT_STARTED' });
 await verify({ root, planSha256: hash(planBytes) });
 return { status: 'UNIVERSAL_B2C_STAGED_NOT_STARTED', directory: root, planSha256: hash(planBytes), applicationCommit: TARGET, runtimeChanged: false, taskChanged: false, sqlWrites: false };
}
function packet(root, planSha256) {
 root = path.resolve(root); const bytes = read(path.join(root,'plan.json'));
 if (hash(bytes) !== planSha256) throw Error('IMMUTABLE_UNIVERSAL_PLAN_CHANGED');
 const p = JSON.parse(bytes);
 if (p.version !== 1 || p.kind !== 'HDWORK2_UNIVERSAL_B2C_COORDINATED' || p.applicationCommit !== TARGET || JSON.stringify(p.entries.map(e => e.file)) !== JSON.stringify(FILES)) throw Error('EXACT_UNIVERSAL_PACKET_REQUIRED');
 const allowed = new Set(['backup/config.json','backup/review.json','candidate/config.json','candidate/review.json','inspection.json','previous-web-task.xml','previous-courier-task.xml',...FILES.flatMap(f=>['backup/web/'+f,'backup/courier/'+f,'payload/'+f])]);
 if (JSON.stringify(Object.keys(p.packetFiles).sort()) !== JSON.stringify([...allowed].sort())) throw Error('PACKET_FILES_REJECTED');
 for (const [file,digest] of Object.entries(p.packetFiles)) if (hash(read(path.join(root,file))) !== digest) throw Error('PACKET_OR_BACKUP_CHANGED');
 for(const e of p.entries)if(p.packetFiles['payload/'+e.file]!==e.after||p.packetFiles['backup/web/'+e.file]!==e.beforeWeb||p.packetFiles['backup/courier/'+e.file]!==e.beforeCourier)throw Error('SOURCE_PAYLOAD_OR_BACKUP_BINDING_MISMATCH');
 if(p.packetFiles['backup/config.json']!==p.beforeConfig||p.packetFiles['candidate/config.json']!==p.afterConfig||p.packetFiles['backup/review.json']!==p.beforeReview||p.packetFiles['candidate/review.json']!==p.afterReview)throw Error('CONFIGURATION_PAYLOAD_BINDING_MISMATCH');
 const before = JSON.parse(read(path.join(root,'backup/config.json'))), after = JSON.parse(read(path.join(root,'candidate/config.json')));
 const desired = { ...before, sourceHashes: { ...before.sourceHashes } }; for (const entry of p.entries) desired.sourceHashes[entry.file] = entry.after;
 if (JSON.stringify(after) !== JSON.stringify(desired)) throw Error('UNAPPROVED_COURIER_CONFIGURATION_DELTA');
 const review = JSON.parse(read(path.join(root,'backup/review.json'))), nextReview = JSON.parse(read(path.join(root,'candidate/review.json')));
 if (JSON.stringify(nextReview) !== JSON.stringify({ ...review, configSha256: p.afterConfig })) throw Error('UNAPPROVED_LAUNCHER_REVIEW_DELTA');
 return { root, p };
}
async function unchanged(p) {
 for(const [file,digest]of Object.entries(p.compatibility))if(hash(read(file))!==digest)throw Error('UNCHANGED_DEPENDENCY_DRIFT');
 for (const [file,digest] of Object.entries(p.launchers)) if (hash(read(file)) !== digest) throw Error('LAUNCHER_SOURCE_CHANGED');
 for (const [label,snapshot] of [['web',p.webRuntime],['courier',p.courierSnapshot]]) if (hash(read(path.join(snapshot,'service/environment.json'))) !== p.environments[label].environment || hash(read(path.join(snapshot,'service/secrets.dpapi'))) !== p.environments[label].cipher) throw Error('PROTECTED_RUNTIME_CONFIGURATION_CHANGED');
 if (hash(read(p.productionPlan)) !== p.productionPlanSha256) throw Error('PRODUCTION_PLAN_CHANGED');
 if (JSON.stringify(await frontend.inventory(p.activeDist)) !== JSON.stringify(p.frontend)) throw Error('RETAINED_FRONTEND_CHANGED');
}
async function verify({ root, planSha256, applied = false }) {
 const loaded = packet(root,planSha256), { p } = loaded;
 await unchanged(p);
 if (hash(read(p.courierConfig)) !== (applied ? p.afterConfig : p.beforeConfig) || hash(read(p.reviewFile)) !== (applied ? p.afterReview : p.beforeReview)) throw Error('COURIER_CONFIGURATION_OR_REVIEW_CHANGED');
 configuration(p.courierConfig, applied ? p.afterConfig : p.beforeConfig);
 for (const entry of p.entries) for (const [label,snapshot] of [['web',p.webRuntime],['courier',p.courierSnapshot]]) if (hash(read(path.join(snapshot,entry.file))) !== (applied ? entry.after : label === 'web' ? entry.beforeWeb : entry.beforeCourier)) throw Error('RUNTIME_SOURCE_CHANGED');
 return { status: applied ? 'UNIVERSAL_B2C_RUNTIME_PINS_PASS' : 'UNIVERSAL_B2C_PACKET_PREFLIGHT_PASS', state: state(loaded.root).state, applicationCommit: TARGET };
}
async function apply({ root, planSha256, stopped = false, proof, now = Date.now, replace = atomic }) {
 const { p } = packet(root,planSha256);
 if (!stopped || state(root).state !== 'STAGED_NOT_STARTED') throw Error('BOTH_SERVICES_STOPPED_AND_FRESH_STAGE_REQUIRED');
 metadata(proof,p.expected);
 const age = now() - Date.parse(proof.checkedAt);
 if (!proof.courierProcess?.stopped || proof.database.courierLeaseActive || !Number.isFinite(age) || age < 0 || age > 300000) throw Error('FRESH_STOPPED_COURIER_AND_EXPIRED_LEASE_PROOF_REQUIRED');
 await verify({ root,planSha256 }); journal(root,{state:'APPLYING'});
 try {
  for (const entry of p.entries) for (const snapshot of [p.webRuntime,p.courierSnapshot]) replace(path.join(snapshot,entry.file),read(path.join(root,'payload',entry.file)));
  replace(p.courierConfig,read(path.join(root,'candidate/config.json'))); replace(p.reviewFile,read(path.join(root,'candidate/review.json')));
  await verify({ root,planSha256,applied:true }); journal(root,{state:'APPLIED_NOT_STARTED'});
  return { status:'UNIVERSAL_B2C_FILES_APPLIED_NOT_STARTED', configSha256:p.afterConfig, sqlWrites:false, productionPlanChanged:false, frontendChanged:false };
 } catch (error) { journal(root,{state:'APPLY_FAILED_PRESTART'}); throw error; }
}
async function recover({ root,planSha256,stopped=false }) {
 const {p}=packet(root,planSha256);
 if (!stopped || !['STAGED_NOT_STARTED','APPLYING','APPLY_FAILED_PRESTART','APPLIED_NOT_STARTED','WEB_START_ATTEMPTED'].includes(state(root).state)) throw Error('BACKEND_DOWNGRADE_PROHIBITED_AFTER_COURIER_START_ATTEMPT');
 await unchanged(p);
 for (const entry of p.entries) for (const [label,snapshot] of [['web',p.webRuntime],['courier',p.courierSnapshot]]) if (![entry.after,label==='web'?entry.beforeWeb:entry.beforeCourier].includes(hash(read(path.join(snapshot,entry.file))))) throw Error('RECOVERY_SOURCE_DRIFT');
 if (![p.beforeConfig,p.afterConfig].includes(hash(read(p.courierConfig))) || ![p.beforeReview,p.afterReview].includes(hash(read(p.reviewFile)))) throw Error('RECOVERY_CONFIGURATION_DRIFT');
 for (const entry of p.entries) for (const [label,snapshot] of [['web',p.webRuntime],['courier',p.courierSnapshot]]) atomic(path.join(snapshot,entry.file),read(path.join(root,'backup',label,entry.file)));
 atomic(p.courierConfig,read(path.join(root,'backup/config.json'))); atomic(p.reviewFile,read(path.join(root,'backup/review.json')));
 await verify({root,planSha256}); journal(root,{state:'RESTORED_PRESTART'});
 return {status:'UNIVERSAL_B2C_PRESTART_FILES_RESTORED',sqlWrites:false};
}
function mark({ root,planSha256,event }) {
 packet(root,planSha256); const current=state(root).state;
 const transitions={ 'web-start':['APPLIED_NOT_STARTED','WEB_START_ATTEMPTED'], 'courier-start':['WEB_START_ATTEMPTED','COURIER_START_ATTEMPTED'], active:['COURIER_START_ATTEMPTED','ACTIVE'], 'rolled-back':['RESTORED_PRESTART','ROLLED_BACK'] };
 if (event==='recovery-required') { journal(root,{state:'RECOVERY_REQUIRED_NO_DOWNGRADE',previousState:current}); return {state:'RECOVERY_REQUIRED_NO_DOWNGRADE'}; }
 const transition=transitions[event]; if (!transition || transition[0]!==current) throw Error('INVALID_UNIVERSAL_RELEASE_TRANSITION');
 journal(root,{state:transition[1]}); return {state:transition[1]};
}
async function health({root,planSha256}) {
 const {p}=packet(root,planSha256); await unchanged(p);
 const result=await require('./inspect-b2c-windows-release').probe(p.webRuntime,JSON.parse(read(path.join(p.webRuntime,'service/environment.json'))),p.activeDist);
 if(result.indexSha256!==p.frontend['index.html'])throw Error('RETAINED_FRONTEND_NOT_SERVED');
 return {...result,status:'UNIVERSAL_B2C_RETAINED_FRONTEND_TLS_PASS'};
}
async function main() {
 const mode=process.argv[2]; if(process.argv.length!==3)throw Error('STDIN_RELEASE_ARGUMENTS_REQUIRED');
 const args=await require('./office-web-service').bootstrap(process.stdin,{validate:v=>v});
 const allowed={stage:['root','repo','report','ownerSid'],verify:['root','planSha256','applied'],apply:['root','planSha256','stopped','proof'],recover:['root','planSha256','stopped'],mark:['root','planSha256','event'],health:['root','planSha256']};
 if(!allowed[mode]||Object.keys(args).some(k=>!allowed[mode].includes(k)))throw Error('UNIVERSAL_RELEASE_ARGUMENTS_REJECTED');
 const functions={stage,verify,apply,recover,mark,health};if(!functions[mode])throw Error('UNIVERSAL_RELEASE_MODE_REJECTED');
 console.log(JSON.stringify(await functions[mode](args),null,2));
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'UNIVERSAL_B2C_RELEASE_FAILED',code:/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:e.code||'UNIVERSAL_RELEASE_FAILED_REVIEW_PACKET',file:e.file||null,snapshot:e.snapshot||null,sqlWrites:false}));process.exitCode=1;});
module.exports={HOST,COMPAT,stage,packet,state,verify,apply,recover,mark,health};
