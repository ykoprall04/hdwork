const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'..'),supervisor=path.join(repo,'ops/windows/web-native-supervisor.ps1'),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const marker='SYNTHETIC_PASSWORD_TOKEN_DPAPI_DO_NOT_RECORD',powershell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const sid=process.platform==='win32'?cp.execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8'}).match(/S-1-\d+(?:-\d+)+/)[0]:null;
async function fixture(code,expected){
 const root=fs.mkdtempSync(path.join(repo,'.local/stderr-offline-')),state=path.join(root,'state');fs.mkdirSync(state);
 const dummy=path.join(root,'dummy.cjs');fs.writeFileSync(dummy,code);
 const cfg={version:1,kind:'HDWORK2_WEB_SUPERVISOR',taskName:'HDWork2-WebFixture-'+crypto.randomUUID().replaceAll('-',''),ownerSid:sid,targetCommit:'4b276ada630286a148431a983738cc9c11cc5b65',pipeName:'hdwork2-web-'+crypto.randomUUID().replaceAll('-',''),stateFile:path.join(state,'state.json'),fenceFile:path.join(state,'startup.fence.json'),childExecutable:process.execPath,childCodeFile:dummy,childCodeSha256:sha(dummy),childArguments:[dummy],childWorkingDirectory:root,supervisorScript:supervisor,supervisorSha256:sha(supervisor),graceSeconds:3};
 const config=path.join(root,'config.json');fs.writeFileSync(config,JSON.stringify(cfg));
 const child=cp.spawn(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',supervisor,'-ControlConfig',config,'-ConfigSha256',sha(config)],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
 const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',n=>resolve(n));});
 let timer;try{
  const exit=await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('OFFLINE_FIXTURE_DEADLINE')),60000);})]);
  assert.equal(exit,0,'Synthetic supervisor must complete normally');
  const owner=JSON.parse(fs.readFileSync(cfg.stateFile));assert.equal(owner.status,'CHILD_EXITED');assert.equal(owner.forced,false);
  const file=path.join(state,'child-startup-error.json');
  if(expected){const report=JSON.parse(fs.readFileSync(file));assert.deepEqual(report,{status:'FAILED',code:expected});assert.deepEqual(Object.keys(report).sort(),['code','status']);}
  else assert.equal(fs.existsSync(file),false);
  const metadata=[output,errors,...[file,cfg.stateFile,path.join(root,'startup.metadata.json'),path.join(root,'failure.metadata.json')].filter(f=>fs.existsSync(f)).map(f=>fs.readFileSync(f,'utf8'))].join('\n');assert.equal(metadata.includes(marker),false);assert.equal(fs.readdirSync(state).some(n=>n.endsWith('.tmp')),false);
  return {root,cfg,owner,expected};
 }finally{clearTimeout(timer);}
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
test('PowerShell source parses and stderr is drained before bootstrap input',{skip:process.platform!=='win32'},()=>{
 const source=fs.readFileSync(supervisor,'utf8');assert.ok(source.indexOf('$child.add_ErrorDataReceived($stderrHandler)')<source.indexOf('[void]$child.Start()'));assert.ok(source.indexOf('$child.BeginErrorReadLine()')<source.indexOf('$child.StandardInput.WriteLine([Text.Encoding]::UTF8.GetString($plain))'));
 const script=path.join(fs.mkdtempSync(path.join(repo,'.local/stderr-parse-')),'parse.ps1');fs.writeFileSync(script,"$tokens=$null;$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile($args[0],[ref]$tokens,[ref]$errors);if($errors.Count){exit 1}\n");
 cp.execFileSync(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,supervisor],{windowsHide:true,stdio:'pipe'});
});
