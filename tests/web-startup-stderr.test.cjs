const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'..'),supervisor=path.join(repo,'ops/windows/web-native-supervisor.ps1'),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const marker='SYNTHETIC_PASSWORD_TOKEN_DPAPI_DO_NOT_RECORD',powershell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const sid=process.platform==='win32'?cp.execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8'}).match(/S-1-\d+(?:-\d+)+/)[0]:null;
async function fixture(code,expected,supervisorFailure=false){
 const root=fs.mkdtempSync(path.join(repo,'.local/stderr-offline-')),state=path.join(root,'state');fs.mkdirSync(state);
 const dummy=path.join(root,'dummy.cjs');fs.writeFileSync(dummy,code);
 const cfg={version:1,kind:'HDWORK2_WEB_SUPERVISOR',taskName:'HDWork2-WebFixture-'+crypto.randomUUID().replaceAll('-',''),ownerSid:sid,targetCommit:'4b276ada630286a148431a983738cc9c11cc5b65',attemptId:crypto.randomUUID().replaceAll('-',''),attemptRole:'fixture',pipeName:'hdwork2-web-'+crypto.randomUUID().replaceAll('-',''),stateFile:path.join(state,'state.json'),fenceFile:path.join(state,'startup.fence.json'),childExecutable:process.execPath,childCodeFile:dummy,childCodeSha256:sha(dummy),childArguments:[dummy],childWorkingDirectory:root,supervisorScript:supervisor,supervisorSha256:sha(supervisor),graceSeconds:3};
 if(supervisorFailure)cfg.childArguments[0]='wrong-child-argument';
 const config=path.join(root,'config.json');fs.writeFileSync(config,JSON.stringify(cfg));
 const child=cp.spawn(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',supervisor,'-ControlConfig',config,'-ConfigSha256',sha(config)],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
 const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',n=>resolve(n));});
 let timer;try{
  const exit=await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('OFFLINE_FIXTURE_DEADLINE')),60000);})]);
  assert.equal(exit,supervisorFailure?1:0,'Synthetic supervisor result');
  if(supervisorFailure){assert.equal(fs.existsSync(cfg.stateFile),false);const failed=JSON.parse(fs.readFileSync(path.join(root,'startup-attempt-'+cfg.attemptId+'.json')));assert.equal(failed.attemptId,cfg.attemptId);assert.match(failed.phase,/FAILED_SOURCE_VALIDATION/);assert.ok(failed.exceptionType);return {root,cfg,expected};}
  const owner=JSON.parse(fs.readFileSync(cfg.stateFile));assert.equal(owner.status,'CHILD_EXITED');assert.equal(owner.forced,false);
  assert.equal(owner.attemptId,cfg.attemptId);
  const file=path.join(state,'child-startup-error-'+cfg.attemptId+'.json');
  if(expected){const report=JSON.parse(fs.readFileSync(file));assert.deepEqual(report,{status:'FAILED',code:expected,attemptId:cfg.attemptId,configSha256:sha(config),ownerPid:owner.ownerPid});assert.deepEqual(Object.keys(report).sort(),['attemptId','code','configSha256','ownerPid','status']);}
  else assert.equal(fs.existsSync(file),false);
  const streamFile=path.join(state,'startup-streams-'+cfg.attemptId+'.json'),streams=JSON.parse(fs.readFileSync(streamFile,'utf8'));assert.equal(streams.attemptId,cfg.attemptId);assert.equal(streams.rawContentStored,false);
  const attemptFile=path.join(root,'startup-attempt-'+cfg.attemptId+'.json'),attempt=JSON.parse(fs.readFileSync(attemptFile,'utf8'));assert.equal(attempt.attemptId,cfg.attemptId);assert.equal(attempt.expectedConfigSha256,sha(config));if(expected||code.includes('process.exitCode=1'))assert.equal(attempt.childExitCode,1,'child exit code must be recorded even before READY');
  const metadata=[output,errors,...[file,streamFile,attemptFile,cfg.stateFile,path.join(root,'startup.metadata.json'),path.join(root,'failure-attempt-'+cfg.attemptId+'.json')].filter(f=>fs.existsSync(f)).map(f=>fs.readFileSync(f,'utf8'))].join('\n');assert.equal(metadata.includes(marker),false);assert.equal(fs.readdirSync(state).some(n=>n.endsWith('.tmp')),false);
  return {root,cfg,owner,expected};
 }finally{clearTimeout(timer);}
}
async function readyFixture(){
 const root=fs.mkdtempSync(path.join(repo,'.local/attempt-ready-')),state=path.join(root,'state');fs.mkdirSync(state);const dummy=path.join(root,'ready.cjs');fs.writeFileSync(dummy,'setTimeout(()=>process.exit(0),2500);');
 const cfg={version:1,kind:'HDWORK2_WEB_SUPERVISOR',taskName:'HDWork2-WebFixture-'+crypto.randomUUID().replaceAll('-',''),ownerSid:sid,targetCommit:'4b276ada630286a148431a983738cc9c11cc5b65',attemptId:crypto.randomUUID().replaceAll('-',''),attemptRole:'candidate',pipeName:'hdwork2-web-'+crypto.randomUUID().replaceAll('-',''),stateFile:path.join(state,'state.json'),fenceFile:path.join(state,'startup.fence.json'),childExecutable:process.execPath,childCodeFile:dummy,childCodeSha256:sha(dummy),childArguments:[dummy],childWorkingDirectory:root,supervisorScript:supervisor,supervisorSha256:sha(supervisor),graceSeconds:3};
 const config=path.join(root,'config.json');fs.writeFileSync(config,JSON.stringify(cfg));const child=cp.spawn(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',supervisor,'-ControlConfig',config,'-ConfigSha256',sha(config)],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});let ready=null;const deadline=Date.now()+10000;while(Date.now()<deadline){try{const stateRow=JSON.parse(fs.readFileSync(cfg.stateFile,'utf8'));if(stateRow.status==='READY'){ready=stateRow;break}}catch{};await new Promise(r=>setTimeout(r,50))}assert.ok(ready,'fixture supervisor never reached READY');assert.equal(ready.attemptId,cfg.attemptId);await exited;const diag=JSON.parse(fs.readFileSync(path.join(root,'startup-attempt-'+cfg.attemptId+'.json'),'utf8'));assert.equal(diag.phase,'CHILD_EXITED');assert.equal(diag.childExitCode,0);return {root,cfg,ready,diag};
}
const cases=[
 ['captures only a recognized FAILED code and discards arbitrary extra fields',`process.stderr.write(JSON.stringify({status:'FAILED',code:'EACCES',message:'${marker}',password:'${marker}',token:'${marker}',dpapi:'${marker}'})+'\\n');process.exitCode=1;`,'EACCES'],
 ['unknown uppercase code cannot smuggle a secret into metadata',`process.stderr.write(JSON.stringify({status:'FAILED',code:'${marker}',message:'${marker}'})+'\\n');process.exitCode=1;`,'WEB_STARTUP_FAILED'],
 ['ignores malformed, plaintext and non-FAILED stderr',`process.stderr.write('${marker}\\nnot-json\\n'+JSON.stringify({status:'READY',code:'EACCES',message:'${marker}'})+'\\n');process.exitCode=1;`,null],
 ['does not treat stdout as a startup error',`process.stdout.write(JSON.stringify({status:'FAILED',code:'EACCES',message:'${marker}'})+'\\n');process.exitCode=1;`,null],
 ['flushes an immediate split frame without a trailing newline',`process.stderr.write('{"status":"FAILED",');setTimeout(()=>{process.stderr.write('"code":"ERR_DLOPEN_FAILED"}');process.exitCode=1;},10);`,'ERR_DLOPEN_FAILED'],
 ['keeps the first failure rather than a later cleanup error',`process.stderr.write(JSON.stringify({status:'FAILED',code:'EADDRINUSE'})+'\\n'+JSON.stringify({status:'FAILED',code:'EACCES',message:'${marker}'})+'\\n');process.exitCode=1;`,'EADDRINUSE'],
 ['rejects oversized frames and safely handles a missing code',`process.stderr.write(JSON.stringify({status:'FAILED',code:'EACCES',message:'${marker}'.repeat(400)})+'\\n'+JSON.stringify({status:'FAILED',message:'${marker}'})+'\\n');process.exitCode=1;`,'WEB_STARTUP_FAILED'],
 ['successful child leaves no failure record',`process.exitCode=0;`,null]
];
for(const stage of ['CONFIG','BOOTSTRAP','API_CONFIG','OPERATIONAL_POOLS','TESTING_RUNTIME','LOCAL_WEB','READY_STATE']){
 const helper=path.join(__dirname,'helpers/protected-startup-mock.cjs');
 cases.push(['receives actual mocked startup code for '+stage,`require(${JSON.stringify(helper)}).simulate(${JSON.stringify(stage)}).then(r=>{for(const frame of r.frames)console.error(JSON.stringify(frame));process.exitCode=r.exitCode;});`,'WEB_STAGE_'+stage+'_FAILED']);
}
for(const [code,expected] of [['ER_SYNTHETIC_SECRET_DO_NOT_RECORD','WEB_STAGE_LOCAL_WEB_FAILED'],['ER_ACCESS_DENIED_ERROR','ER_ACCESS_DENIED_ERROR']]){
 cases.push(['receives sanitized mocked database error '+code,`require(${JSON.stringify(path.join(__dirname,'helpers/protected-startup-mock.cjs'))}).simulate('LOCAL_WEB',${JSON.stringify(code)},true).then(r=>{for(const frame of r.frames)console.error(JSON.stringify(frame));process.exitCode=r.exitCode;});`,expected]);
}
for(const [name,code,expected] of cases)test(name,{skip:process.platform!=='win32'},async()=>{const r=await fixture(code,expected);assert.equal(r.owner.exitCode,expected||name!=='successful child leaves no failure record'?1:0);});
test('records a PowerShell pre-state exception with attempt identity',{skip:process.platform!=='win32'},async()=>{await fixture('process.exitCode=0;',null,true);});
test('records candidate READY under its unique attempt ID',{skip:process.platform!=='win32'},async()=>{const r=await readyFixture();assert.equal(r.ready.status,'READY');assert.equal(r.diag.role,'candidate');});
test('PowerShell source parses and stderr is drained before bootstrap input',{skip:process.platform!=='win32'},()=>{
 const source=fs.readFileSync(supervisor,'utf8');assert.ok(source.indexOf('$child.add_ErrorDataReceived($stderrHandler)')<source.indexOf('[void]$child.Start()'));assert.ok(source.indexOf('$child.BeginErrorReadLine()')<source.indexOf('$child.StandardInput.WriteLine([Text.Encoding]::UTF8.GetString($plain))'));assert.ok(source.includes("SaveState 'STOPPED' $child.ExitCode;SaveAttempt 'STOPPED'"));assert.ok(source.includes("SaveAttempt 'READY'"));
 const script=path.join(fs.mkdtempSync(path.join(repo,'.local/stderr-parse-')),'parse.ps1');fs.writeFileSync(script,"$tokens=$null;$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile($args[0],[ref]$tokens,[ref]$errors);if($errors.Count){exit 1}\n");
 cp.execFileSync(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,supervisor],{windowsHide:true,stdio:'pipe'});
});
