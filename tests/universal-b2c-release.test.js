const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const release=require('../scripts/universal-b2c-release');
const {FILES,TARGET}=require('../scripts/inspect-universal-b2c-release');
const {hash}=require('../scripts/courier-task-runner');
const front=require('../scripts/frontend-only-release');
const bytes=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
function put(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes(value));}
async function fixture(t){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'universal-release-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const web=path.join(base,'web'),courier=path.join(base,'courier'),auto=path.join(base,'autostart'),root=path.join(base,'packet');fs.mkdirSync(root);
 const owner='S-1-5-21-123',cfgFile=path.join(auto,'config.json'),prod=path.join(base,'production.json');
 put(prod,{routingMode:'database',activationNotBefore:'2026-11-10T13:20:35.278Z'});
 const desired=new Map(),source=[];
 for(const [i,file]of FILES.entries()){
  const wb='web-before-'+i,cb='courier-before-'+i,next=bytes('candidate-'+i);put(path.join(web,file),wb);put(path.join(courier,file),cb);desired.set(file,next);source.push([hash(bytes(wb)),hash(bytes(cb)),hash(next)]);
 }
 for(const file of release.COMPAT){desired.set(file,bytes('unchanged-'+file));for(const scope of(file.startsWith('courier_bot/')?[courier]:[web,courier]))put(path.join(scope,file),'unchanged-'+file);}
 for(const scope of [web,courier]){put(path.join(scope,'service/environment.json'),{HDWORK2_SHARED_GROUPS_ENABLED:'true'});put(path.join(scope,'service/secrets.dpapi'),'synthetic-cipher-not-decrypted');}
 const activeDist=path.join(web,'frontend/dist');put(path.join(activeDist,'index.html'),'<script src="/assets/app.js"></script>');put(path.join(activeDist,'assets/app.js'),'synthetic existing frontend');
 put(path.join(auto,'run-owner.ps1'),'synthetic-wrapper');put(path.join(auto,'courier-task-runner.js'),'synthetic-runner');
 const cfg={version:1,kind:'HDWORK2_COURIER_AUTOSTART',snapshot:courier,ownerSid:owner,productionPlan:prod,productionPlanSha256:hash(fs.readFileSync(prod)),nodeExecutable:path.join(base,'node.exe'),pythonExecutable:path.join(base,'python.exe'),environmentSha256:hash(fs.readFileSync(path.join(courier,'service/environment.json'))),encryptedBundleSha256:hash(fs.readFileSync(path.join(courier,'service/secrets.dpapi'))),sourceHashes:Object.fromEntries([...FILES,...release.COMPAT].map(file=>[file,hash(fs.readFileSync(path.join(courier,file)))]))};
 put(cfgFile,cfg);const cfgHash=hash(fs.readFileSync(cfgFile));
 put(path.join(auto,'autostart.review.json'),{ownerSid:owner,taskName:'HDWork2-LiveChat-Courier',configSha256:cfgHash,wrapperSha256:hash(bytes('synthetic-wrapper')),runnerSha256:hash(bytes('synthetic-runner'))});
 put(path.join(root,'previous-web-task.xml'),'<Task>synthetic-web</Task>');put(path.join(root,'previous-courier-task.xml'),'<Task>synthetic-courier</Task>');
 const expected={webRuntime:web,courierSnapshot:courier,courierConfigSha256:cfgHash,productionPlanSha256:cfg.productionPlanSha256,mappingSha256:'a'.repeat(64),indexSha256:hash(fs.readFileSync(path.join(activeDist,'index.html'))),activationNotBefore:'2026-11-10T13:20:35.278Z',source};
 const report={applicationCommit:TARGET,webRuntime:web,courierSnapshot:courier,courierConfig:cfgFile,courierConfigSha256:cfgHash,productionPlanSha256:cfg.productionPlanSha256,sharedGroupsWeb:true,courierRoutingMode:'database',activationNotBefore:expected.activationNotBefore,activeDist,frontend:{indexSha256:expected.indexSha256},courierProcess:{ready:true},database:{schemaCompatible:true,existingTableGrantsVerified:true,mappingSha256:expected.mappingSha256,effectiveB2CCoverage:true,sqlWrites:false,courierLeaseActive:true}};
 const git=(_exe,args)=>args[0]==='show'?desired.get(args[1].split(':').slice(1).join(':')):Buffer.alloc(0);
 const originalFrontend=await front.inventory(activeDist);
 const staged=await release.stage({root,repo:path.join(base,'checkout'),report,ownerSid:owner,expected,git});
 const args={root,planSha256:staged.planSha256};
 const proof={...report,checkedAt:new Date().toISOString(),courierProcess:{stopped:true,ready:false},database:{...report.database,courierLeaseActive:false}};
 return{base,web,courier,root,cfgFile,cfg,args,proof,report,originalFrontend,staged};
}
test('stage binds exact source, plan, native schema proof, task backups and retained frontend without runtime writes',async t=>{
 const f=await fixture(t);assert.equal(f.staged.status,'UNIVERSAL_B2C_STAGED_NOT_STARTED');assert.equal(release.state(f.root).state,'STAGED_NOT_STARTED');
 assert.equal((await release.verify(f.args)).status,'UNIVERSAL_B2C_PACKET_PREFLIGHT_PASS');assert.deepEqual(JSON.parse(fs.readFileSync(f.cfgFile)),f.cfg);
 for(const[i,file]of FILES.entries()){assert.equal(fs.readFileSync(path.join(f.web,file),'utf8'),'web-before-'+i);assert.equal(fs.readFileSync(path.join(f.courier,file),'utf8'),'courier-before-'+i);}
 assert.deepEqual(await front.inventory(f.report.activeDist),f.originalFrontend);
});
test('apply is stopped-only and requires fresh stopped Courier/expired lease proof; retains all configuration except three source pins',async t=>{
 const f=await fixture(t);
 await assert.rejects(release.apply({...f.args,proof:f.proof}),/BOTH_SERVICES_STOPPED/);
 await assert.rejects(release.apply({...f.args,stopped:true,proof:{...f.proof,checkedAt:'2020-01-01'}}),/FRESH_STOPPED/);
 await assert.rejects(release.apply({...f.args,stopped:true,proof:{...f.proof,database:{...f.proof.database,courierLeaseActive:true}}}),/FRESH_STOPPED/);
 await assert.rejects(release.apply({...f.args,stopped:true,proof:{...f.proof,database:{...f.proof.database,mappingSha256:'b'.repeat(64)}}}),/VERIFIED_SCHEMA/);
 const result=await release.apply({...f.args,stopped:true,proof:f.proof});assert.equal(result.status,'UNIVERSAL_B2C_FILES_APPLIED_NOT_STARTED');
 const after=JSON.parse(fs.readFileSync(f.cfgFile)),before={...f.cfg,sourceHashes:{...f.cfg.sourceHashes}};for(const file of FILES)before.sourceHashes[file]=hash(fs.readFileSync(path.join(f.courier,file)));
 assert.deepEqual(after,before);assert.deepEqual(await front.inventory(f.report.activeDist),f.originalFrontend);assert.equal((await release.verify({...f.args,applied:true})).status,'UNIVERSAL_B2C_RUNTIME_PINS_PASS');
});
test('payload/backup/configuration drift blocks release before runtime mutation',async t=>{
 const f=await fixture(t);put(path.join(f.root,'payload',FILES[0]),'tampered');
 await assert.rejects(release.apply({...f.args,stopped:true,proof:f.proof}),/PACKET_OR_BACKUP_CHANGED/);assert.equal(fs.readFileSync(path.join(f.web,FILES[0]),'utf8'),'web-before-0');
});
test('changed dependencies, environment or retained frontend fail closed before applying',async t=>{
 for(const target of ['dependency','environment','frontend']){
  const f=await fixture(t);
  const file=target==='dependency'?path.join(f.courier,release.COMPAT[0]):target==='environment'?path.join(f.web,'service/environment.json'):path.join(f.report.activeDist,'index.html');
  put(file,'drift');await assert.rejects(release.apply({...f.args,stopped:true,proof:f.proof}),/DRIFT|CHANGED/);assert.equal(release.state(f.root).state,'STAGED_NOT_STARTED');
 }
});
test('partial atomic replacement failure restores both source baselines and original Courier pins before start',async t=>{
 const f=await fixture(t);let writes=0;
 await assert.rejects(release.apply({...f.args,stopped:true,proof:f.proof,replace:(file,data)=>{if(++writes===3)throw Error('SYNTHETIC_WRITE_FAILURE');fs.writeFileSync(file,data);}}),/SYNTHETIC_WRITE_FAILURE/);
 assert.equal(release.state(f.root).state,'APPLY_FAILED_PRESTART');
 assert.equal((await release.recover({...f.args,stopped:true})).status,'UNIVERSAL_B2C_PRESTART_FILES_RESTORED');
 assert.deepEqual(JSON.parse(fs.readFileSync(f.cfgFile)),f.cfg);assert.equal((await release.verify(f.args)).status,'UNIVERSAL_B2C_PACKET_PREFLIGHT_PASS');
});
test('failed web boot permits prestart rollback, while any Courier start attempt permanently prohibits downgrade',async t=>{
 let f=await fixture(t);await release.apply({...f.args,stopped:true,proof:f.proof});release.mark({...f.args,event:'web-start'});
 await release.recover({...f.args,stopped:true});release.mark({...f.args,event:'rolled-back'});assert.equal(release.state(f.root).state,'ROLLED_BACK');
 f=await fixture(t);await release.apply({...f.args,stopped:true,proof:f.proof});release.mark({...f.args,event:'web-start'});release.mark({...f.args,event:'courier-start'});
 await assert.rejects(release.recover({...f.args,stopped:true}),/DOWNGRADE_PROHIBITED/);
 release.mark({...f.args,event:'recovery-required'});await assert.rejects(release.recover({...f.args,stopped:true}),/DOWNGRADE_PROHIBITED/);
 assert.equal(release.state(f.root).state,'RECOVERY_REQUIRED_NO_DOWNGRADE');
});
test('activation state cannot skip web/Courier startup or apply twice; healthy final state is explicit',async t=>{
 const f=await fixture(t);assert.throws(()=>release.mark({...f.args,event:'active'}),/INVALID_UNIVERSAL/);
 await release.apply({...f.args,stopped:true,proof:f.proof});await assert.rejects(release.apply({...f.args,stopped:true,proof:f.proof}),/BOTH_SERVICES_STOPPED/);
 release.mark({...f.args,event:'web-start'});release.mark({...f.args,event:'courier-start'});release.mark({...f.args,event:'active'});assert.equal(release.state(f.root).state,'ACTIVE');
});
test('staging copies have private bytes, no DPAPI/SQL/network engine; controller has ordered restart, lease gate and old/new recovery boundary',()=>{
 const engine=fs.readFileSync(path.join(__dirname,'../scripts/universal-b2c-release.js'),'utf8');assert.doesNotMatch(engine,/mysql2|ProtectedData|sendMessage|createConnection|https\.request/);
 const ps=fs.readFileSync(path.join(__dirname,'../scripts/deploy-universal-b2c.ps1'),'utf8');
 assert.match(ps,/CreateNew/);assert.match(ps,/HDWork2SharedGroupsDeployment/);assert.match(ps,/ExpectCourierStopped/);assert.match(ps,/courierLeaseExpiresMs/);assert.doesNotMatch(ps,/Register-ScheduledTask|Stop-Process|Remove-Item/);
 assert.ok(ps.indexOf('STOPPING_EXISTING_COURIER_FIRST')<ps.indexOf('STOPPING_EXISTING_WEB'));
 assert.match(ps,/POSTSTART_RECOVERY_REQUIRED_NO_BACKEND_DOWNGRADE/);assert.match(ps,/recoveryState -notin/);
});
