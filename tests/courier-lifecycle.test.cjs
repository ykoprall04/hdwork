const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const ps=command=>cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:30000});
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hdwork-lifecycle-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('PowerShell lifecycle sources parse without loading secrets or executing tasks',()=>{
 for(const file of ['scripts/run-courier-scheduled-owner.ps1','ops/windows/courier-native-supervisor.ps1','scripts/configure-courier-recovery.ps1']){
  const r=ps(`$tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile('${path.join(repo,file)}',[ref]$tokens,[ref]$errors);if($errors.Count){$errors|ForEach-Object {$_.Message};exit 1}`);assert.equal(r.status,0,r.stdout+r.stderr);
 }
});
test('size rotation is bounded and following original JSON does not replay rotated history',async t=>{
 const directory=temp(t),{createLogger}=require('../src/observability/raw-log'),{initial,readNew}=require('../scripts/courier-log');
 const log=createLogger({directory,maxBytes:200});log.emit('BEFORE_ROTATION');await log.flush();
 const state=await initial(directory);assert.equal(state.lines.length,1);
 for(let i=0;i<6;i++){log.emit('NEW_RECORD',{count:i});await log.flush();const rows=(await readNew(directory,state.offsets)).map(JSON.parse);assert.equal(rows.length,1);assert.equal(rows[0].count,i);}
 assert.equal(fs.readdirSync(directory).length,2);await log.close();
});
test('permanent failure marker prevents any later native invocation, including corrupt marker',t=>{
 const root=temp(t),scripts=path.join(root,'scripts'),ops=path.join(root,'ops/windows');fs.mkdirSync(scripts,{recursive:true});fs.mkdirSync(ops,{recursive:true});
 const wrapper=path.join(scripts,'run-courier-scheduled-owner.ps1'),runner=path.join(scripts,'courier-task-runner.js'),supervisor=path.join(ops,'courier-native-supervisor.ps1');
 fs.copyFileSync(path.join(repo,'scripts/run-courier-scheduled-owner.ps1'),wrapper);fs.writeFileSync(runner,'// fixture');
 const mark=path.join(root,'invoked');fs.writeFileSync(supervisor,`[IO.File]::WriteAllText('${mark}','yes');exit 1`);
 const runtime=path.join(root,'runtime.json');fs.writeFileSync(runtime,'{}');const sid=ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value').stdout.trim();
 const cfg={kind:'HDWORK2_NATIVE_SUPERVISOR',ownerSid:sid,launcherScript:wrapper,launcherSha256:hash(fs.readFileSync(wrapper)),childCodeFile:runner,childArguments:[runner,'--config',runtime,'--config-sha256',hash(fs.readFileSync(runtime))],supervisorScript:supervisor,supervisorSha256:hash(fs.readFileSync(supervisor)),recovery:{enabled:true}};
 const file=path.join(root,'native.json');fs.writeFileSync(file,JSON.stringify(cfg));
 const run=()=>ps(`$env:HDWORK2_RAW_LOG_ENABLED='true';$env:HDWORK2_LOG_DIRECTORY='${path.join(root,'logs')}'; & '${wrapper}' -Config '${runtime}' -ConfigSha256 '${hash(fs.readFileSync(runtime))}' -ControlConfig '${file}' -ControlConfigSha256 '${hash(fs.readFileSync(file))}' -Recovery`);
 assert.equal(run().status,0);assert.ok(fs.existsSync(mark));const logs=fs.readdirSync(path.join(root,'logs')).map(f=>fs.readFileSync(path.join(root,'logs',f),'utf8')).join('');assert.match(logs,/OWNER_START/);assert.match(logs,/OWNER_STOP/);assert.match(logs,/PERMANENT_FAILURE/);fs.unlinkSync(mark);
 assert.equal(run().status,0);assert.ok(!fs.existsSync(mark));fs.writeFileSync(path.join(root,'permanent.failure.json'),'corrupt');assert.equal(run().status,0);assert.ok(!fs.existsSync(mark));
});
test('native heartbeat advances; killed fixture supervisor recovers only after its child drains',async t=>{
 const root=temp(t),sid=ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value').stdout.trim(),child=path.join(root,'scripts/courier-task-runner.js'),marker=path.join(root,'pid');
 fs.mkdirSync(path.dirname(child),{recursive:true});fs.mkdirSync(path.join(root,'ops/windows'),{recursive:true});
 fs.writeFileSync(child,`require('fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));if(process.env.HDWORK2_RAW_LOG_ENABLED==='true')require('fs').writeFileSync(${JSON.stringify(path.join(root,'logging-inherited'))},'yes');process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>process.exit(0),1000));`);
 const supervisor=path.join(root,'ops/windows/courier-native-supervisor.ps1'),wrapper=path.join(root,'scripts/run-courier-scheduled-owner.ps1'),runtime=path.join(root,'runtime.json'),state=path.join(root,'state.json'),config=path.join(root,'config.json');
 fs.copyFileSync(path.join(repo,'ops/windows/courier-native-supervisor.ps1'),supervisor);fs.copyFileSync(path.join(repo,'scripts/run-courier-scheduled-owner.ps1'),wrapper);fs.writeFileSync(runtime,'{}');
 const cfg={version:1,kind:'HDWORK2_NATIVE_SUPERVISOR',taskName:'HDWork2-CourierFixture-'+crypto.randomBytes(16).toString('hex'),ownerSid:sid,pipeName:'hdwork2-courier-'+crypto.randomBytes(16).toString('hex'),stateFile:state,fenceFile:path.join(root,'maintenance.fence'),childExecutable:process.execPath,childCodeFile:child,childCodeSha256:hash(fs.readFileSync(child)),launcherScript:wrapper,launcherSha256:hash(fs.readFileSync(wrapper)),recovery:{enabled:true},childArguments:[child,'--config',runtime,'--config-sha256',hash(fs.readFileSync(runtime))],childWorkingDirectory:root,supervisorScript:supervisor,supervisorSha256:hash(fs.readFileSync(supervisor)),graceSeconds:2};
 fs.writeFileSync(config,JSON.stringify(cfg));const args=['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-File',wrapper,'-Config',runtime,'-ConfigSha256',hash(fs.readFileSync(runtime)),'-ControlConfig',config,'-ControlConfigSha256',hash(fs.readFileSync(config)),'-Recovery'];
 let owner,done;const launch=()=>{owner=cp.spawn('powershell.exe',args,{windowsHide:true,stdio:'ignore',env:{...process.env,HDWORK2_RAW_LOG_ENABLED:'true',HDWORK2_LOG_DIRECTORY:path.join(root,'logs')}});done=new Promise(r=>owner.once('exit',r));};
 const wait=async check=>{for(let i=0;i<500;i++){if(check())return;await new Promise(r=>setTimeout(r,50));}throw Error('FIXTURE_TIMEOUT');};
 t.after(()=>{if(owner?.exitCode===null)owner.kill();});launch();await wait(()=>fs.existsSync(state)&&JSON.parse(fs.readFileSync(state)).status==='READY');assert.ok(fs.existsSync(path.join(root,'logging-inherited')));
 const before=JSON.parse(fs.readFileSync(state));await wait(()=>JSON.parse(fs.readFileSync(state)).updatedAtUtc!==before.updatedAtUtc);assert.equal(JSON.parse(fs.readFileSync(state)).status,'READY');
 const old=Number(fs.readFileSync(marker));owner.kill();await done;await wait(()=>{try{process.kill(old,0);return false;}catch{return true;}});
 launch();await wait(()=>Number(fs.readFileSync(marker))!==old);assert.equal(owner.exitCode,null);const logged=fs.readdirSync(path.join(root,'logs')).map(f=>fs.readFileSync(path.join(root,'logs',f),'utf8')).join('');assert.match(logged,/SUPERVISOR_STATE/);assert.match(logged,/PREVIOUS_SHUTDOWN_UNKNOWN/);assert.match(logged,/INCIDENT_SNAPSHOT/);
 owner.kill();await done;const next=Number(fs.readFileSync(marker));await wait(()=>{try{process.kill(next,0);return false;}catch{return true;}});
});
test('task preparation uses only existing task, refuses Interactive, and stages boot/periodic triggers while task stays disabled',t=>{
 const root=temp(t),script=path.join(repo,'scripts/configure-courier-recovery.ps1'),sid=ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value').stdout.trim();
 const launcher=path.join(root,'launcher.ps1');fs.writeFileSync(launcher,'# fixture');
 const runtime=path.join(root,'runtime.json'),runner=path.join(root,'runner.js');fs.writeFileSync(runtime,'{}');fs.writeFileSync(runner,'// fixture');
 const cfg={kind:'HDWORK2_NATIVE_SUPERVISOR',taskName:'HDWork2-CourierFixture-'+crypto.randomBytes(16).toString('hex'),ownerSid:sid,recovery:{enabled:true},launcherScript:launcher,launcherSha256:hash(fs.readFileSync(launcher)),childCodeFile:runner,childArguments:[runner,'--config',runtime,'--config-sha256',hash(fs.readFileSync(runtime))],stateFile:path.join(root,'absent.json')};
 const file=path.join(root,'native.json');fs.writeFileSync(file,JSON.stringify(cfg));const sha=hash(fs.readFileSync(file));
 const expected=`-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${launcher}" -Config "${runtime}" -ConfigSha256 ${hash(fs.readFileSync(runtime))} -ControlConfig "${file}" -ControlConfigSha256 ${sha} -Recovery`;
 const common=`$settings=[pscustomobject]@{Enabled=$false;MultipleInstances=2;RestartCount=0;RestartInterval='PT1M';StartWhenAvailable=$false;ExecutionTimeLimit='PT0S';StopIfGoingOnBatteries=$false;DisallowStartIfOnBatteries=$false};$task=[pscustomobject]@{State='Disabled';Settings=$settings;Principal=[pscustomobject]@{UserId='${sid}';LogonType='Password'};Actions=@([pscustomobject]@{Execute=(Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe');Arguments='${expected}'})};function Get-ScheduledTask {$task};function New-ScheduledTaskTrigger {param([switch]$AtStartup,[switch]$Once,$At,$RepetitionInterval);[pscustomobject]@{Delay='';Enabled=$true;Boot=[bool]$AtStartup;Interval=$RepetitionInterval}};function Set-ScheduledTask {param($TaskPath,$TaskName,$Settings,$Trigger);if($Settings.Enabled -ne $false -or $Trigger.Count -ne 2 -or $Trigger[0].Delay -ne 'PT2M' -or $Trigger[1].Interval.TotalMinutes -ne 5){throw 'MOCK_TRIGGER_FAILED'};$script:installed=$true};function Export-ScheduledTask {'<Task><Triggers><BootTrigger><Delay>PT2M</Delay></BootTrigger><TimeTrigger><Repetition><Interval>PT5M</Interval></Repetition></TimeTrigger></Triggers></Task>'};`;
 const run=tail=>ps(common+tail+`; & '${script}' -Mode Apply -ControlConfig '${file}' -ConfigSha256 '${sha}'`);
 const rejected=run("$task.Principal.LogonType='Interactive'");assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/RECOVERY_NONINTERACTIVE_ACCOUNT_VALIDATION_REQUIRED/);
 const applied=run('');assert.equal(applied.status,0,applied.stdout+applied.stderr);assert.match(applied.stdout,/POLICY_INSTALLED_NOT_STARTED/);
});
