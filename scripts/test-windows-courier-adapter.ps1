[CmdletBinding()]
param([switch]$TemporaryOnly,[switch]$RunnerChain,[switch]$StopTimeout)
$ErrorActionPreference='Stop'
if(-not $TemporaryOnly){throw 'TEMPORARY_ONLY_REQUIRED'}
if($StopTimeout -and -not $RunnerChain){throw 'TIMEOUT_REQUIRES_RUNNER_CHAIN'}
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$root=Join-Path $repo ('.local\native-courier-fixture-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root|Out-Null
$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false)
foreach($identity in @($sid,'S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($identity)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))}
Set-Acl -LiteralPath $root -AclObject $acl
$name='HDWork2-CourierFixture-'+[Guid]::NewGuid().ToString('N')
$supervisor=Join-Path $repo 'ops\windows\courier-native-supervisor.ps1'
$control=Join-Path $repo 'ops\windows\courier-native-control.ps1'
$dummy=Join-Path $root 'dummy.js'
[IO.File]::WriteAllText($dummy,"process.stdin.setEncoding('utf8');process.stdin.on('data',d=>{if(d.trim()==='STOP')process.exit(0)});process.stdin.on('end',()=>process.exit(0));setInterval(()=>{},1000);",(New-Object Text.UTF8Encoding($false)))
$config=Join-Path $root 'control.json'
$cfg=@{version=1;kind='HDWORK2_NATIVE_SUPERVISOR';taskName=$name;ownerSid=$sid;targetCommit='7f2b010c3472106df2539acf3d9f096afff4603e';pipeName=('hdwork2-courier-'+[Guid]::NewGuid().ToString('N'));stateFile=(Join-Path $root 'state.json');fenceFile=(Join-Path $root 'cutover.fence.json');childExecutable=(Get-Command node.exe).Source;childCodeFile=$dummy;childCodeSha256=(Get-FileHash -LiteralPath $dummy -Algorithm SHA256).Hash.ToLowerInvariant();childArguments=@($dummy);childWorkingDirectory=$root;supervisorScript=$supervisor;supervisorSha256=(Get-FileHash -LiteralPath $supervisor -Algorithm SHA256).Hash.ToLowerInvariant();graceSeconds=10}
if($RunnerChain){
 # Actual task runner and actual Python subprocess. Only its backend module is a
 # local synthetic server: no DB, DPAPI decode, HTTP client or Telegram imports.
 $cfg.targetCommit=(& git -c ('safe.directory='+$repo.Replace('\','/')) -C $repo rev-parse HEAD).Trim()
 $cfg.stateFile=Join-Path $root 'native-state.json'
 New-Item -ItemType Directory -Path (Join-Path $root 'scripts'),(Join-Path $root 'service'),(Join-Path $root 'courier')|Out-Null
 $utf8=New-Object Text.UTF8Encoding($false)
 $fixtureModule=Join-Path $root 'scripts\run-production-live-chat-courier.js'
 $fixtureCode=@'
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
exports.run=async()=>{
 const root=path.resolve(__dirname,'..'),server=net.createServer(s=>s.end());
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let stopObserved=false;process.once('SIGTERM',()=>{stopObserved=true;});
 const child=spawn('python',['-B','-m','courier','--run'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stderr.resume();child.stdout.once('data',()=>console.log(JSON.stringify({status:'COURIER_STARTED_IDENTITY_AND_LEASE_VERIFIED',botId:'fixture',telegramBotId:'fixture'})));
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 await new Promise(resolve=>server.close(resolve));
 fs.writeFileSync(path.join(root,'drain-receipt.json'),JSON.stringify({pythonExit:code,backendClosed:!server.listening,stopObserved,telegramCalls:0}));
};
'@
 [IO.File]::WriteAllText($fixtureModule,$fixtureCode,$utf8)
 [IO.File]::WriteAllText((Join-Path $root 'courier\__main__.py'),"import sys,json,pathlib,time`nprint('READY',flush=True)`nassert sys.stdin.readline().strip() == 'STOP'`nwhile pathlib.Path('wait-for-release').exists() and not pathlib.Path('release-stop').exists(): time.sleep(0.05)`npathlib.Path('python-stop.json').write_text(json.dumps({'stdinStop':True,'forced':False}))`n",$utf8)
 if($StopTimeout){[IO.File]::WriteAllText((Join-Path $root 'wait-for-release'),'FIXTURE',$utf8);$cfg.graceSeconds=1}
 [IO.File]::WriteAllText((Join-Path $root 'production-plan.fixture.json'),'{}',$utf8)
 [IO.File]::WriteAllText((Join-Path $root 'service\environment.json'),'{}',$utf8)
 [IO.File]::WriteAllText((Join-Path $root 'service\secrets.dpapi'),'SYNTHETIC_NOT_A_SECRET_NEVER_DECRYPTED',$utf8)
 $runner=Join-Path $repo 'scripts\courier-task-runner.js';$taskConfig=Join-Path $root 'task.json'
 $runtime=@{version=1;kind='HDWORK2_COURIER_AUTOSTART';snapshot=$root;productionPlan=(Join-Path $root 'production-plan.fixture.json');productionPlanSha256=(Get-FileHash (Join-Path $root 'production-plan.fixture.json')).Hash.ToLowerInvariant();pythonExecutable='C:\Users\yayan\AppData\Local\Programs\Python\Python314\python.exe';nodeExecutable=(Get-Command node.exe).Source;ownerSid=$sid;sourceHashes=@{'scripts/run-production-live-chat-courier.js'=(Get-FileHash $fixtureModule).Hash.ToLowerInvariant()};environmentSha256=(Get-FileHash (Join-Path $root 'service\environment.json')).Hash.ToLowerInvariant();encryptedBundleSha256=(Get-FileHash (Join-Path $root 'service\secrets.dpapi')).Hash.ToLowerInvariant();botId='fixture';telegramBotId='fixture';baseCommit=$cfg.targetCommit;patchCommit=$cfg.targetCommit}
 [IO.File]::WriteAllText($taskConfig,($runtime|ConvertTo-Json -Depth 6),$utf8)
 $cfg.childCodeFile=$runner;$cfg.childCodeSha256=(Get-FileHash $runner).Hash.ToLowerInvariant();$cfg.childArguments=@($runner,'--config',$taskConfig,'--config-sha256',(Get-FileHash $taskConfig).Hash.ToLowerInvariant())
 $cfg.launcherScript=Join-Path $repo 'scripts\run-courier-scheduled-owner.ps1';$cfg.launcherSha256=(Get-FileHash $cfg.launcherScript).Hash.ToLowerInvariant()
}
[IO.File]::WriteAllText($config,($cfg|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)))
$hash=(Get-FileHash -LiteralPath $config -Algorithm SHA256).Hash.ToLowerInvariant()
$exe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action=New-ScheduledTaskAction -Execute $exe -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$supervisor+'" -ControlConfig "'+$config+'" -ConfigSha256 '+$hash) -WorkingDirectory $root
if($RunnerChain){$action=New-ScheduledTaskAction -Execute $exe -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$cfg.launcherScript+'" -Config "'+$taskConfig+'" -ConfigSha256 '+(Get-FileHash $taskConfig).Hash.ToLowerInvariant()+' -ControlConfig "'+$config+'" -ControlConfigSha256 '+$hash) -WorkingDirectory $root}
$settings=New-ScheduledTaskSettingsSet -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $sid
$registered=$false;$stopped=$false;$sentinel=$null
try{
 if($RunnerChain){
  $sentinelInfo=New-Object Diagnostics.ProcessStartInfo;$sentinelInfo.FileName=(Get-Command node.exe).Source;$sentinelInfo.Arguments='"'+$dummy+'"';$sentinelInfo.UseShellExecute=$false;$sentinelInfo.CreateNoWindow=$true;$sentinelInfo.RedirectStandardInput=$true
  $sentinel=New-Object Diagnostics.Process;$sentinel.StartInfo=$sentinelInfo;[void]$sentinel.Start()
 }
 Register-ScheduledTask -TaskPath '\' -TaskName $name -Action $action -Settings $settings -Principal $principal -Trigger $trigger -Description 'HD Work native adapter TEMPORARY dummy; no Telegram'|Out-Null;$registered=$true
 Start-ScheduledTask -TaskPath '\' -TaskName $name
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(60)
 do{Start-Sleep -Milliseconds 200;try{$s=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json;if($s.status -eq 'READY'){break}}catch{}}while([DateTimeOffset]::UtcNow -lt $deadline)
 if($s.status -ne 'READY'){throw 'DUMMY_NOT_READY'}
 $duplicateInfo=New-Object Diagnostics.ProcessStartInfo
 $duplicateInfo.FileName=$exe;$duplicateInfo.Arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$supervisor+'" -ControlConfig "'+$config+'" -ConfigSha256 '+$hash
 $duplicateInfo.UseShellExecute=$false;$duplicateInfo.CreateNoWindow=$true;$duplicateInfo.RedirectStandardOutput=$true;$duplicateInfo.RedirectStandardError=$true
 $duplicate=[Diagnostics.Process]::Start($duplicateInfo)
 if(-not $duplicate.WaitForExit(10000) -or $duplicate.ExitCode -eq 0){throw 'DUPLICATE_OWNER_NOT_REJECTED'}
 $duplicate.Dispose()
 $afterDuplicate=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json
 if($afterDuplicate.childPid -ne $s.childPid -or $afterDuplicate.status -ne 'READY'){throw 'DUPLICATE_OWNER_CHANGED_STATE'}

 if($RunnerChain){
  $deadline=[DateTimeOffset]::UtcNow.AddSeconds(60)
  do{Start-Sleep -Milliseconds 100;try{$runnerState=Get-Content (Join-Path $root 'state.json') -Raw|ConvertFrom-Json}catch{}}while($runnerState.status -ne 'READY' -and [DateTimeOffset]::UtcNow -lt $deadline)
  if($runnerState.status -ne 'READY' -or -not $runnerState.pythonPid){throw 'RUNNER_CHAIN_NOT_READY'}
 }
 $before=(& $exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $control -Mode Inspect -ControlConfig $config -ConfigSha256 $hash)|ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or -not $before.childAlive -or $before.restartCount -ne 2){throw 'DUMMY_IDENTITY_NOT_PROVEN'}
 $plan=(& $exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $control -Mode StopFence -ControlConfig $config -ConfigSha256 $hash)|ConvertFrom-Json
 if($plan.status -ne 'PLAN_ONLY' -or -not (Get-ScheduledTask -TaskName $name).Settings.Enabled){throw 'DEFAULT_PLAN_MUTATED_TASK'}
 $approval=Join-Path $root 'approval.json';$planHash='a'*64;$barrier=[Guid]::NewGuid().ToString()
 [IO.File]::WriteAllText($approval,(@{kind='HDWORK2_OPERATOR_CUTOVER_APPROVAL';approved=$true;scope='CUTOVER_FLAGS_OFF_ONLY';operator='Yayan';decisionId='DEC-20261112-01';targetCommit=$cfg.targetCommit;planSha256=$planHash;nativeConfigSha256=$hash;expiresAtUtc=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o')}|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
 if($RunnerChain){
  $cli=Join-Path $repo 'scripts\control-courier-stop.js'
  $argsCommon=@($cli,'--mode','stop','--config',$config,'--config-sha256',$hash,'--expected-head',$cfg.targetCommit,'--plan-sha256',$planHash,'--decision','DEC-20261112-01','--approval',$approval,'--barrier',$barrier)
  $default=(& node @argsCommon)|ConvertFrom-Json
  if($LASTEXITCODE -ne 0 -or $default.status -ne 'PLAN_ONLY' -or -not (Get-ScheduledTask -TaskName $name).Settings.Enabled){throw 'EXECUTOR_LIFECYCLE_DEFAULT_NOT_PLAN'}
  $originalApproval=[IO.File]::ReadAllText($approval);$expired=$originalApproval|ConvertFrom-Json;$expired.expiresAtUtc='2000-01-01T00:00:00Z';[IO.File]::WriteAllText($approval,($expired|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
  $rejected=(& node @argsCommon --execute)|ConvertFrom-Json
  if($rejected.code -ne 'EXPLICIT_OPERATOR_APPROVAL_REQUIRED' -or -not (Get-ScheduledTask -TaskName $name).Settings.Enabled -or (Test-Path $cfg.fenceFile)){throw 'EXPIRED_APPROVAL_MUTATED_LIFECYCLE'}
  [IO.File]::WriteAllText($approval,$originalApproval,(New-Object Text.UTF8Encoding($false)))
  $receipt=(& node @argsCommon --execute)|ConvertFrom-Json
 }else{$receipt=(& $exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $control -Mode StopFence -ControlConfig $config -ConfigSha256 $hash -ApprovalFile $approval -PlanSha256 $planHash -BarrierId $barrier -Execute)|ConvertFrom-Json}
 [IO.File]::WriteAllText((Join-Path $root 'stop-receipt.json'),($receipt|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)))
 if($StopTimeout){
  if($receipt.status -ne 'STOP' -or $receipt.code -notin @('CLEAN_STOP_NOT_PROVEN','GRACEFUL_STOP_TIMEOUT') -or (Get-ScheduledTask -TaskName $name).Settings.Enabled -or -not (Get-Process -Id $runnerState.pythonPid -ErrorAction SilentlyContinue)){throw 'TIMEOUT_DID_NOT_FAIL_CLOSED'}
  [IO.File]::WriteAllText((Join-Path $root 'release-stop'),'FIXTURE_RELEASE',(New-Object Text.UTF8Encoding($false)))
  $deadline=[DateTimeOffset]::UtcNow.AddSeconds(15)
  do{Start-Sleep -Milliseconds 100;$s=Get-Content $cfg.stateFile -Raw|ConvertFrom-Json}while($s.status -ne 'STOPPED' -and [DateTimeOffset]::UtcNow -lt $deadline)
  $receipt=(& $exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $control -Mode AssertFence -ControlConfig $config -ConfigSha256 $hash -BarrierId $barrier)|ConvertFrom-Json
 }
 if($LASTEXITCODE -ne 0 -or -not $receipt.graceful -or $receipt.forced -or -not $receipt.courierStopped){throw 'DUMMY_STOP_NOT_CLEAN'};$stopped=$true
 if($RunnerChain){
  $drain=Get-Content (Join-Path $root 'drain-receipt.json') -Raw|ConvertFrom-Json
  $pythonStop=Get-Content (Join-Path $root 'python-stop.json') -Raw|ConvertFrom-Json
  if($drain.pythonExit -ne 0 -or -not $drain.backendClosed -or -not $drain.stopObserved -or -not $pythonStop.stdinStop -or $pythonStop.forced -or (Get-Process -Id $runnerState.pythonPid -ErrorAction SilentlyContinue)){throw 'RUNNER_CHAIN_NOT_DRAINED'}
  if($sentinel.HasExited){throw 'UNRELATED_SENTINEL_WAS_STOPPED'}
 }
 $assert=(& $exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $control -Mode AssertFence -ControlConfig $config -ConfigSha256 $hash -BarrierId $barrier)|ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or -not $assert.fenceHeld -or (Get-ScheduledTask -TaskName $name).Settings.Enabled){throw 'DUMMY_RESTART_NOT_FENCED'}
 # Prove persistent startup refusal even after an owner manually re-enables THIS DUMMY task.
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(30)
 do{Start-Sleep -Milliseconds 100;$taskState=(Get-ScheduledTask -TaskName $name).State}while($taskState -eq 'Running' -and [DateTimeOffset]::UtcNow -lt $deadline)
 if($taskState -eq 'Running'){throw 'STOPPED_TASK_STILL_RUNNING'}
 Enable-ScheduledTask -TaskName $name|Out-Null;Start-ScheduledTask -TaskName $name
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(60)
 do{Start-Sleep -Milliseconds 200;$s=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json}while($s.status -ne 'FENCED_START_REFUSED' -and [DateTimeOffset]::UtcNow -lt $deadline)
 Disable-ScheduledTask -TaskName $name|Out-Null
 if($s.status -ne 'FENCED_START_REFUSED' -or $s.childPid -ne 0){throw 'PERSISTENT_FENCE_FAILED'}
 if($RunnerChain){
  $afterRestart=(& $exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $control -Mode AssertFence -ControlConfig $config -ConfigSha256 $hash -BarrierId $barrier)|ConvertFrom-Json
  if($LASTEXITCODE -ne 0 -or -not $afterRestart.fenceHeld -or $sentinel.HasExited){throw 'RESTART_FENCE_OR_SCOPE_FAILED'}
 }
 $result=@{status='WINDOWS_NATIVE_DUMMY_PASS';duplicateOwnerRejected=$true;defaultPlan=$true;identity=$true;ownerOnlyPipe=$true;gracefulStop=$true;forcedKill=$false;taskDisabled=$true;persistentStartupRefused=$true;restartPolicyFenced=$true;productionTasksTouched=$false;taskName=$name}
 if($RunnerChain){$result.status='WINDOWS_COURIER_STOP_CHAIN_PASS';$result.actualTaskRunner=$true;$result.actualPython=$true;$result.localBackendDrained=$true;$result.executorLifecycle=$true;$result.legacyLauncherOptIn=$true;$result.expiredApprovalNoMutation=$true;$result.unrelatedProcessPreserved=$true;$result.stopTimeoutFailsClosed=[bool]$StopTimeout;$result.databaseAccessed=$false;$result.telegramCalls=0}
 [IO.File]::WriteAllText((Join-Path $root 'result.json'),($result|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)));$result|ConvertTo-Json
}finally{
 if($StopTimeout -and (Test-Path (Join-Path $root 'wait-for-release'))){[IO.File]::WriteAllText((Join-Path $root 'release-stop'),'FIXTURE_RELEASE',(New-Object Text.UTF8Encoding($false)))}
 if($sentinel -and -not $sentinel.HasExited){$sentinel.StandardInput.WriteLine('STOP');$sentinel.StandardInput.Close();if(-not $sentinel.WaitForExit(5000)){throw 'FIXTURE_SENTINEL_DID_NOT_EXIT'}}
 if($registered -and $stopped){
  $t=Get-ScheduledTask -TaskPath '\' -TaskName $name
  if($name -notmatch '^HDWork2-CourierFixture-[a-f0-9]{32}$' -or -not $t.Actions[0].Arguments.Contains($config)){throw 'DUMMY_CLEANUP_SCOPE_REJECTED'}
  Unregister-ScheduledTask -TaskPath '\' -TaskName $name -Confirm:$false
 }
 # Preserve the dummy fixture files. On failure do NOT kill an unknown/live process.
}
