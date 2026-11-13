[CmdletBinding()]
param([switch]$TemporaryOnly)
$ErrorActionPreference='Stop'
if(-not $TemporaryOnly){throw 'TEMPORARY_ONLY_REQUIRED'}
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
[IO.File]::WriteAllText($config,($cfg|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)))
$hash=(Get-FileHash -LiteralPath $config -Algorithm SHA256).Hash.ToLowerInvariant()
$exe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action=New-ScheduledTaskAction -Execute $exe -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$supervisor+'" -ControlConfig "'+$config+'" -ConfigSha256 '+$hash) -WorkingDirectory $root
$settings=New-ScheduledTaskSettingsSet -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $sid
$registered=$false;$stopped=$false
try{
 Register-ScheduledTask -TaskPath '\' -TaskName $name -Action $action -Settings $settings -Principal $principal -Trigger $trigger -Description 'HD Work native adapter TEMPORARY dummy; no Telegram'|Out-Null;$registered=$true
 Start-ScheduledTask -TaskPath '\' -TaskName $name
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(30)
 do{Start-Sleep -Milliseconds 200;try{$s=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json;if($s.status -eq 'READY'){break}}catch{}}while([DateTimeOffset]::UtcNow -lt $deadline)
 if($s.status -ne 'READY'){throw 'DUMMY_NOT_READY'}
 $before=(& $exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $control -Mode Inspect -ControlConfig $config -ConfigSha256 $hash)|ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or -not $before.childAlive -or $before.restartCount -ne 2){throw 'DUMMY_IDENTITY_NOT_PROVEN'}
 $plan=(& $exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $control -Mode StopFence -ControlConfig $config -ConfigSha256 $hash)|ConvertFrom-Json
 if($plan.status -ne 'PLAN_ONLY' -or -not (Get-ScheduledTask -TaskName $name).Settings.Enabled){throw 'DEFAULT_PLAN_MUTATED_TASK'}
 $approval=Join-Path $root 'approval.json';$planHash='a'*64;$barrier=[Guid]::NewGuid().ToString()
 [IO.File]::WriteAllText($approval,(@{kind='HDWORK2_OPERATOR_CUTOVER_APPROVAL';approved=$true;scope='CUTOVER_FLAGS_OFF_ONLY';operator='Yayan';decisionId='FIXTURE_ONLY';targetCommit=$cfg.targetCommit;planSha256=$planHash;nativeConfigSha256=$hash;expiresAtUtc=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o')}|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
 $receipt=(& $exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $control -Mode StopFence -ControlConfig $config -ConfigSha256 $hash -ApprovalFile $approval -PlanSha256 $planHash -BarrierId $barrier -Execute)|ConvertFrom-Json
 [IO.File]::WriteAllText((Join-Path $root 'stop-receipt.json'),($receipt|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)))
 if($LASTEXITCODE -ne 0 -or -not $receipt.graceful -or $receipt.forced -or -not $receipt.courierStopped){throw 'DUMMY_STOP_NOT_CLEAN'};$stopped=$true
 $assert=(& $exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $control -Mode AssertFence -ControlConfig $config -ConfigSha256 $hash -BarrierId $barrier)|ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or -not $assert.fenceHeld -or (Get-ScheduledTask -TaskName $name).Settings.Enabled){throw 'DUMMY_RESTART_NOT_FENCED'}
 # Prove persistent startup refusal even after an owner manually re-enables THIS DUMMY task.
 Enable-ScheduledTask -TaskName $name|Out-Null;Start-ScheduledTask -TaskName $name
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(20)
 do{Start-Sleep -Milliseconds 200;$s=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json}while($s.status -ne 'FENCED_START_REFUSED' -and [DateTimeOffset]::UtcNow -lt $deadline)
 Disable-ScheduledTask -TaskName $name|Out-Null
 if($s.status -ne 'FENCED_START_REFUSED' -or $s.childPid -ne 0){throw 'PERSISTENT_FENCE_FAILED'}
 $result=@{status='WINDOWS_NATIVE_DUMMY_PASS';defaultPlan=$true;identity=$true;ownerOnlyPipe=$true;gracefulStop=$true;forcedKill=$false;taskDisabled=$true;persistentStartupRefused=$true;restartPolicyFenced=$true;productionTasksTouched=$false;taskName=$name}
 [IO.File]::WriteAllText((Join-Path $root 'result.json'),($result|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)));$result|ConvertTo-Json
}finally{
 if($registered -and $stopped){
  $t=Get-ScheduledTask -TaskPath '\' -TaskName $name
  if($name -notmatch '^HDWork2-CourierFixture-[a-f0-9]{32}$' -or -not $t.Actions[0].Arguments.Contains($config)){throw 'DUMMY_CLEANUP_SCOPE_REJECTED'}
  Unregister-ScheduledTask -TaskPath '\' -TaskName $name -Confirm:$false
 }
 # Preserve the dummy fixture files. On failure do NOT kill an unknown/live process.
}
