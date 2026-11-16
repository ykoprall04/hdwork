const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const policy=require('../contracts/courier-startup-recovery.json'),repo=path.resolve(__dirname,'..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const ps=(args,options={})=>cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive',...args],{encoding:'utf8',windowsHide:true,timeout:20000,...options});
const write=(root,relative,b)=>{const p=path.join(root,relative);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);return p;};
const clean=root=>{const r=path.resolve(root);assert.equal(path.dirname(r),path.resolve(os.tmpdir()));assert.ok(path.basename(r).startsWith('hdwork-recovery-'));fs.rmSync(r,{recursive:true,force:true});};
test('retry diagnostic is accepted only for transient identity failure; handshake has retry budget',()=>{
 for(const [fn,component] of [[require('../scripts/run-production-live-chat-courier').safeStartupDiagnostic,false],[require('../scripts/courier-task-runner').safeStartupDiagnostic,true]]){
  const value={event:'STARTUP_FAILURE',component:'PYTHON',phase:'TELEGRAM_IDENTITY',exceptionType:'TransportError',retryable:true};
  assert.equal(fn(value).retryable,true);
  for(const patch of [{phase:'JOURNAL_OPEN'},{httpStatus:401},{httpStatus:409},{exceptionType:'ValueError'}])assert.notEqual(fn({...value,...patch}).retryable,true);
 }
 const worst=policy.identityAttempts*2*policy.requestTimeoutSeconds+policy.backoffSeconds.reduce((a,b)=>a+b,0)+(policy.identityAttempts-1)*policy.jitterSeconds;
 assert.ok(policy.readyTimeoutMs>1000*(worst+10));
 const {startupMayRetry}=require('../scripts/run-production-live-chat-courier');
 const diagnostic={phase:'TELEGRAM_IDENTITY',exceptionType:'TransportError',retryable:true};
 assert.equal(startupMayRetry(diagnostic,75),true);
 for(const exit of [0,1,null,undefined])assert.equal(startupMayRetry(diagnostic,exit),false,'a cleanup failure or unproven exit must not authorize retry');
 assert.equal(startupMayRetry({...diagnostic,httpStatus:401},75),false);
});
test('real task runner emits transient 75 versus permanent 1, without DB/Telegram',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hdwork-recovery-runner-'));
 try{
  const env=write(root,'service/environment.json','{}'),bundle=write(root,'service/secrets.dpapi','SYNTHETIC_NOT_A_SECRET'),plan=write(root,'plan.json','{}');
  const backend=write(root,'scripts/run-production-live-chat-courier.js','');
  for(const retryable of [true,false]){
   fs.writeFileSync(backend,`exports.run=async()=>{throw Object.assign(Error('SYNTHETIC_PRIVATE_ERROR'),{retryable:${retryable}})};`);
   const cfg={version:1,kind:'HDWORK2_COURIER_AUTOSTART',snapshot:root,productionPlan:plan,productionPlanSha256:hash(fs.readFileSync(plan)),nodeExecutable:process.execPath,pythonExecutable:process.execPath,ownerSid:'S-1-5-21-1',sourceHashes:{'scripts/run-production-live-chat-courier.js':hash(fs.readFileSync(backend))},environmentSha256:hash(fs.readFileSync(env)),encryptedBundleSha256:hash(fs.readFileSync(bundle))};
   const f=write(root,'runtime.json',JSON.stringify(cfg));
   const r=cp.spawnSync(process.execPath,[path.join(repo,'scripts/courier-task-runner.js'),'--config',f,'--config-sha256',hash(fs.readFileSync(f))],{encoding:'utf8',timeout:10000,windowsHide:true,env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH}});
   assert.equal(r.status,retryable?75:1,r.stderr);assert.doesNotMatch(r.stdout+r.stderr,/SYNTHETIC_PRIVATE_ERROR/);
   assert.equal(JSON.parse(fs.readFileSync(path.join(root,'state.json'))).status,'FAILED');
  }
 }finally{clean(root);}
});
test('scheduled wrapper: bounded transient restarts; permanent failures never retried',{skip:process.platform!=='win32'},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hdwork-recovery-wrapper-'));
 try{
  const wrapper=write(root,'scripts/run-courier-scheduled-owner.ps1',fs.readFileSync('scripts/run-courier-scheduled-owner.ps1')),runner=write(root,'scripts/courier-task-runner.js','// fixture only');
  const sid=ps(['-Command','[Security.Principal.WindowsIdentity]::GetCurrent().User.Value']).stdout.trim();
  const supervisor=write(root,'ops/windows/courier-native-supervisor.ps1','exit 75'),runtime=write(root,'runtime.json','{}');
  const config=path.join(root,'native.json');
  function run(code){fs.writeFileSync(supervisor,'exit '+code);const cfg={kind:'HDWORK2_NATIVE_SUPERVISOR',ownerSid:sid,launcherScript:wrapper,launcherSha256:hash(fs.readFileSync(wrapper)),childCodeFile:runner,childArguments:[runner,'--config',runtime,'--config-sha256',hash(fs.readFileSync(runtime))],supervisorScript:supervisor,supervisorSha256:hash(fs.readFileSync(supervisor)),recovery:{enabled:true}};fs.writeFileSync(config,JSON.stringify(cfg));return ps(['-File',wrapper,'-Config',runtime,'-ConfigSha256',hash(fs.readFileSync(runtime)),'-ControlConfig',config,'-ControlConfigSha256',hash(fs.readFileSync(config)),'-Recovery']);}
  let attempts=0,last;
  do{last=run(75);attempts++;}while(last.status!==0&&attempts<=policy.taskRestartCount);
  assert.equal(attempts,4);assert.equal(last.status,75);assert.match(last.stdout,/TRANSIENT_FAILURE_RESTART_ELIGIBLE/);
  const permanent=run(1);assert.equal(permanent.status,0,permanent.stderr);assert.match(permanent.stdout,/PERMANENT_FAILURE_NO_RESTART/);
  const cleanStop=run(0);assert.equal(cleanStop.status,0);assert.doesNotMatch(cleanStop.stdout,/RESTART_ELIGIBLE/);
 }finally{clean(root);}
});
test('real isolated supervisor holds mutex through orphan Python drain, rejects duplicate, then returns nonzero',{skip:process.platform!=='win32'},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hdwork-recovery-process-'));let owner,duplicate;
 try{
  const sid=ps(['-Command','[Security.Principal.WindowsIdentity]::GetCurrent().User.Value']).stdout.trim();
  const python=cp.execFileSync('python',['-B','-c','import sys;print(sys.executable)'],{encoding:'utf8',windowsHide:true}).trim();
  const marker=path.join(root,'children.json'),runtime=write(root,'runtime.json','{}'),runtimeHash=hash(fs.readFileSync(runtime));
  const child=write(root,'child.js',`const fs=require('fs'),{spawn}=require('child_process');const p=spawn(${JSON.stringify(python)},['-B','-c','import sys,time;sys.stdin.buffer.read();time.sleep(2)'],{windowsHide:true,stdio:['pipe','ignore','ignore']});fs.writeFileSync(${JSON.stringify(path.join(root,'state.json'))},JSON.stringify({status:'READY',nodePid:process.pid,startedAt:new Date().toISOString(),configSha256:${JSON.stringify(runtimeHash)}}));fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({node:process.pid,python:p.pid}));setTimeout(()=>process.exit(1),1500);`);
  const supervisor=path.join(repo,'ops/windows/courier-native-supervisor.ps1'),state=path.join(root,'native-state.json'),config=path.join(root,'config.json');
  const cfg={version:1,kind:'HDWORK2_NATIVE_SUPERVISOR',taskName:'HDWork2-CourierFixture-'+crypto.randomBytes(16).toString('hex'),ownerSid:sid,pipeName:'hdwork2-courier-'+crypto.randomBytes(16).toString('hex'),stateFile:state,fenceFile:path.join(root,'not-present.fence'),childExecutable:process.execPath,childCodeFile:child,childCodeSha256:hash(fs.readFileSync(child)),childArguments:[child,'--config',runtime,'--config-sha256',runtimeHash],childWorkingDirectory:root,supervisorScript:supervisor,supervisorSha256:hash(fs.readFileSync(supervisor)),graceSeconds:2};
  fs.writeFileSync(config,JSON.stringify(cfg));const args=['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',supervisor,'-ControlConfig',config,'-ConfigSha256',hash(fs.readFileSync(config))];
  owner=cp.spawn('powershell.exe',args,{windowsHide:true,stdio:'ignore'});const ownerDone=new Promise(resolve=>owner.once('exit',resolve));
  for(let i=0;i<100&&!fs.existsSync(marker);i++)await new Promise(r=>setTimeout(r,50));assert.ok(fs.existsSync(marker),'fixture Node actually spawned its Python');
  duplicate=cp.spawn('powershell.exe',args,{windowsHide:true,stdio:'ignore'});const duplicateExit=await new Promise(resolve=>duplicate.once('exit',resolve));assert.notEqual(duplicateExit,0,'second owner is rejected');
  const exit=await Promise.race([ownerDone,new Promise((_,reject)=>setTimeout(()=>reject(Error('OWNED_FIXTURE_EXIT_TIMEOUT')),15000).unref())]);assert.equal(exit,75);
  const children=JSON.parse(fs.readFileSync(marker)),live=ps(['-Command',`@(Get-Process -Id ${children.node},${children.python} -ErrorAction SilentlyContinue).Count`]);assert.equal(live.stdout.trim(),'0','old Node and Python gone before restart eligibility');
  const saved=JSON.parse(fs.readFileSync(state));assert.equal(saved.status,'CHILD_EXITED');assert.equal(saved.exitCode,1);
  owner=cp.spawn('powershell.exe',args,{windowsHide:true,stdio:'ignore'});
  assert.equal(await new Promise(resolve=>owner.once('exit',resolve)),75,'a later restart acquires the released mutex only after the old chain ended');
  const next=JSON.parse(fs.readFileSync(marker));assert.notEqual(next.node,children.node);assert.notEqual(next.python,children.python);
  // No real Scheduled Task, secret, DB or Telegram client was used.
 }finally{if(duplicate?.exitCode===null)duplicate.kill();if(owner?.exitCode===null)owner.kill();clean(root);}
});
test('task restart policy defaults to plan-only; applying to a running task is refused using mocks',{skip:process.platform!=='win32'},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hdwork-recovery-policy-'));
 try{
  const sid=ps(['-Command','[Security.Principal.WindowsIdentity]::GetCurrent().User.Value']).stdout.trim();const config=write(root,'config.json',JSON.stringify({kind:'HDWORK2_NATIVE_SUPERVISOR',taskName:'HDWork2-CourierFixture-'+crypto.randomBytes(16).toString('hex'),recovery:{enabled:true},launcherScript:'fixture.ps1',ownerSid:sid})),sha=hash(fs.readFileSync(config)),script=path.join(repo,'scripts/configure-courier-recovery.ps1');
  const plan=ps(['-File',script,'-ControlConfig',config,'-ConfigSha256',sha]);assert.equal(plan.status,0,plan.stderr);const json=JSON.parse(plan.stdout);assert.equal(json.productionChanged,false);assert.equal(json.restartCount,3);assert.equal(json.intervalSeconds,60);
  const command=`function Get-ScheduledTask { [pscustomobject]@{State='Running';Settings=[pscustomobject]@{Enabled=$true}} }; function Set-ScheduledTask { throw 'MUST_NOT_MUTATE' }; & '${script}' -Mode Apply -ControlConfig '${config}' -ConfigSha256 '${sha}'`;
  const rejected=ps(['-Command',command]);assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/RECOVERY_STOPPED_DISABLED_TASK_REQUIRED/);assert.doesNotMatch(rejected.stderr,/MUST_NOT_MUTATE/);
 }finally{clean(root);}
});
