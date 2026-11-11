const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { TARGET } = require('../scripts/inspect-b2c-windows-release');
const { inventory, verify, smoke } = require('../scripts/verify-b2c-isolated-web');
const frontend = require('../scripts/frontend-only-release');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
async function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'b2c-cutover-verify-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const old=path.join(root,'old'),stage=path.join(root,'stage');
 const put=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
 for(const dir of [old,stage]){
  put(path.join(dir,'service/environment.json'),JSON.stringify({HDWORK2_PUBLIC_ORIGIN:'https://hdwork2.yoloo.space'}));
  put(path.join(dir,'service/secrets.dpapi'),'synthetic encrypted bytes');
  put(path.join(dir,'frontend/dist/assets/old.js'),'old asset');
  put(path.join(dir,'frontend/dist/index.html'),'<script src="/assets/old.js"></script>');
  put(path.join(dir,'src/operations/policy.js'),dir===old?'old source':'candidate source');
 }
 put(path.join(stage,'frontend/dist/assets/new.js'),'new asset');put(path.join(stage,'frontend/dist/index.html'),'<script src="/assets/new.js"></script>');
 fs.mkdirSync(path.join(stage,'service/state'));
 const candidateManifest='synthetic verified manifest',task='synthetic XML backup';
 put(path.join(stage,'.b2c-release/candidate-manifest.json'),candidateManifest);put(path.join(stage,'.b2c-release/previous-web-task.xml'),task);
 const productionPlan=path.join(root,'courier-plan.json');put(productionPlan,'{"fixture":true}');
 const cfg={version:1,kind:'HDWORK2_COURIER_AUTOSTART',snapshot:old,productionPlan,productionPlanSha256:hash(fs.readFileSync(productionPlan)),pythonExecutable:process.execPath,nodeExecutable:process.execPath,ownerSid:'S-1-5-21-123',sourceHashes:{'src/operations/policy.js':hash(fs.readFileSync(path.join(old,'src/operations/policy.js')))},environmentSha256:hash(fs.readFileSync(path.join(old,'service/environment.json'))),encryptedBundleSha256:hash(fs.readFileSync(path.join(old,'service/secrets.dpapi')))};
 const cfgFile=path.join(root,'courier/config.json');put(cfgFile,JSON.stringify(cfg));
 const plan={version:1,kind:'HDWORK2_ISOLATED_B2C_WEB',applicationCommit:TARGET,state:'STAGED_NOT_STARTED',stagedRuntime:stage,previousRuntime:old,stagedFiles:inventory(stage),previousWebTaskSha256:hash(Buffer.from(task)),manifestSha256:hash(Buffer.from(candidateManifest)),environmentSha256:cfg.environmentSha256,encryptedBundleSha256:cfg.encryptedBundleSha256,courierConfig:cfgFile,courierConfigSha256:hash(fs.readFileSync(cfgFile)),baselineSources:cfg.sourceHashes,baselineFrontend:await frontend.inventory(path.join(old,'frontend/dist')),stagedFrontend:await frontend.inventory(path.join(stage,'frontend/dist'))};
 put(path.join(stage,'.b2c-release/plan.json'),JSON.stringify(plan));
 const expected=hash(fs.readFileSync(path.join(stage,'.b2c-release/plan.json')));
 return {root,old,stage,cfgFile,expected,put};
}
test('preflight validates immutable staged payload, rollback backup and original Courier pins without starting a process',async t=>{
 const f=await fixture(t);let checked=false;
 const result=await verify(f.stage,f.expected,process.execPath,{runSmoke(root,exe){checked=true;assert.equal(root,f.stage);assert.equal(exe,process.execPath);}});
 assert.equal(checked,true);assert.equal(result.status,'B2C_STAGED_FILES_AND_OFFLINE_SMOKE_PASS');assert.equal(result.activated,false);assert.equal(result.courierPinsVerified,true);
 assert.equal(fs.existsSync(path.join(f.stage,'.b2c-release/activation.json')),false);
});
test('changed plan, extra injected file and corrupt rollback XML block preflight',async t=>{
 const f=await fixture(t),opts={runSmoke(){assert.fail('Smoke must not run');}};
 await assert.rejects(verify(f.stage,'0'.repeat(64),process.execPath,opts),/B2C_PLAN_HASH_CHANGED/);
 f.put(path.join(f.stage,'.env'),'synthetic unwanted file');await assert.rejects(verify(f.stage,f.expected,process.execPath,opts),/STAGED_FILES_CHANGED/);fs.unlinkSync(path.join(f.stage,'.env'));
 f.put(path.join(f.stage,'.b2c-release/previous-web-task.xml'),'changed');await assert.rejects(verify(f.stage,f.expected,process.execPath,opts),/ROLLBACK_TASK_BACKUP_CHANGED/);
});
test('changed previous source or rollback frontend assets block activation readiness',async t=>{
 const f=await fixture(t),opts={runSmoke(){assert.fail('Smoke must not run');}};
 f.put(path.join(f.old,'frontend/dist/assets/old.js'),'changed');await assert.rejects(verify(f.stage,f.expected,process.execPath,opts),/PREVIOUS_FRONTEND_CHANGED/);
 f.put(path.join(f.old,'frontend/dist/assets/old.js'),'old asset');f.put(path.join(f.old,'src/operations/policy.js'),'changed');await assert.rejects(verify(f.stage,f.expected,process.execPath,opts),/TASK_VERSION_DRIFT/);
});
test('actual offline smoke loads existing native dependencies and exercises confirmation/escalation policy without SQL or Telegram',()=>{
 assert.doesNotThrow(()=>smoke(path.resolve(__dirname,'..'),process.execPath));
});
test('Windows controller defaults to Verify, mutates only the web task and provides guarded rollback/locks',()=>{
 const script=fs.readFileSync('scripts/activate-b2c-isolated-web.ps1','utf8');
 assert.match(script,/\$Mode='Verify'/);assert.match(script,/B2C_STAGED_FILES_AND_OFFLINE_SMOKE_PASS/);assert.match(script,/CreateNew/);assert.match(script,/Global\\HDWork2SharedGroupsDeployment/);assert.match(script,/ROLLBACK_FAILED/);assert.match(script,/AssertCourierUnchanged/);assert.match(script,/function RestoreWeb/);
 for(const line of script.split(/\r?\n/).filter(line=>/\b(?:Start|Stop|Set)-ScheduledTask\b/.test(line)))assert.match(line,/-TaskName 'HDWork2-Web'/);
 assert.doesNotMatch(script,/ProtectedData|Unprotect|Disable-ScheduledTask|Enable-ScheduledTask|Register-ScheduledTask|Stop-Process|Kill\(/);
});
