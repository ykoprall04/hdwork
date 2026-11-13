[CmdletBinding()]
param([ValidateSet('Inspect','StopFence','AssertFence')][string]$Mode='Inspect',[Parameter(Mandatory=$true)][string]$ControlConfig,[Parameter(Mandatory=$true)][string]$ConfigSha256,[string]$ApprovalFile,[string]$PlanSha256,[string]$BarrierId,[switch]$Execute)
$ErrorActionPreference='Stop'
function Reject($code){throw $code}
function HashFile($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Emit($o){$o|ConvertTo-Json -Depth 8 -Compress}
try{
 if($ConfigSha256 -notmatch '^[a-f0-9]{64}$' -or (HashFile $ControlConfig) -cne $ConfigSha256){Reject 'CONFIG_PIN_CHANGED'}
 $cfg=Get-Content -LiteralPath $ControlConfig -Raw|ConvertFrom-Json
 $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 if($cfg.kind -cne 'HDWORK2_NATIVE_SUPERVISOR' -or $cfg.ownerSid -cne $owner -or $cfg.taskName -notmatch '^(HDWork2-LiveChat-Courier|HDWork2-CourierFixture-[a-f0-9]{32})$'){Reject 'OWNER_SCOPE_REJECTED'}
 $root=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ControlConfig))
 foreach($rule in (Get-Acl -LiteralPath $root).Access){$identity=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($rule.AccessControlType -eq 'Allow' -and ([int]$rule.FileSystemRights -band [int][Security.AccessControl.FileSystemRights]::Write) -and $identity -notin @($owner,'S-1-5-18','S-1-5-32-544')){Reject 'UNSAFE_CONTROL_DIRECTORY_ACL'}}
 foreach($file in @($cfg.stateFile,$cfg.fenceFile)){if(-not ([IO.Path]::GetFullPath($file)).StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){Reject 'CONTROL_PATH_ESCAPE'}}
 if((HashFile $cfg.supervisorScript) -cne $cfg.supervisorSha256 -or (HashFile $cfg.childCodeFile) -cne $cfg.childCodeSha256){Reject 'NATIVE_SOURCE_CHANGED'}
 $launcher=$cfg.supervisorScript
 if($cfg.launcherScript){if((HashFile $cfg.launcherScript) -cne $cfg.launcherSha256){Reject 'NATIVE_LAUNCHER_CHANGED'};$launcher=$cfg.launcherScript}
 $task=Get-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName
 if(@($task.Actions).Count -ne 1 -or -not $task.Actions[0].Arguments.Contains('-ControlConfig') -or -not $task.Actions[0].Arguments.Contains($ControlConfig) -or -not $task.Actions[0].Arguments.Contains($ConfigSha256) -or -not $task.Actions[0].Arguments.Contains($launcher)){Reject 'LEGACY_OWNER_NO_COOPERATIVE_CONTROL'}
 $expectedExecutable=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 $expectedAction='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$launcher+'" -ControlConfig "'+$ControlConfig+'" -ConfigSha256 '+$ConfigSha256
 if($cfg.launcherScript){
  if($cfg.childArguments.Count -ne 5 -or $cfg.childArguments[0] -cne $cfg.childCodeFile -or $cfg.childArguments[1] -cne '--config' -or $cfg.childArguments[3] -cne '--config-sha256'){Reject 'NATIVE_RUNTIME_BINDING_MISMATCH'}
  $expectedAction='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$launcher+'" -Config "'+$cfg.childArguments[2]+'" -ConfigSha256 '+$cfg.childArguments[4]+' -ControlConfig "'+$ControlConfig+'" -ControlConfigSha256 '+$ConfigSha256
 }
 if($task.Actions[0].Execute -ine $expectedExecutable -or $task.Actions[0].Arguments -cne $expectedAction){Reject 'TASK_ACTION_MISMATCH'}
 $principal=[string]$task.Principal.UserId
 if($principal -notmatch '^S-1-'){$principal=(New-Object Security.Principal.NTAccount($principal)).Translate([Security.Principal.SecurityIdentifier]).Value}
 if($principal -cne $owner){Reject 'TASK_OWNER_MISMATCH'}
 $state=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json
 if($state.protocol -cne 'HDWORK2_COOPERATIVE_OWNER_V1' -or $state.configSha256 -cne $ConfigSha256 -or $state.ownerSid -cne $owner){Reject 'OWNER_PROTOCOL_MISMATCH'}
 function OriginalAlive($processId,$started){
  if(-not $processId){return $false}
  $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$processId)
  if(-not $p){return $false}
  if($started -and [Math]::Abs(($p.CreationDate.ToUniversalTime()-[DateTimeOffset]::Parse($started).UtcDateTime).TotalSeconds) -gt 1){return $false}
  if((Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid).Sid -cne $owner){Reject 'PROCESS_OWNER_MISMATCH'}
  return $true
 }
 $childAlive=OriginalAlive $state.childPid $state.childStartedAtUtc
 if($childAlive){$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$state.childPid);if($p.ParentProcessId -ne [int]$state.ownerPid -or $p.Name -cne 'node.exe'){Reject 'PROCESS_CHAIN_MISMATCH'}}
 $descendants=if([int]$state.childPid -gt 0){@(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+[int]$state.childPid)|Where-Object {$_.Name -in @('python.exe','pythonw.exe')})}else{@()}
 $snapshot=@{status='NATIVE_IDENTITY_VERIFIED';taskName=$cfg.taskName;taskEnabled=[bool]$task.Settings.Enabled;restartCount=$task.Settings.RestartCount;multipleInstances=[string]$task.Settings.MultipleInstances;ownerSid=$owner;ownerPid=[int]$state.ownerPid;childPid=[int]$state.childPid;childStartedAtUtc=$state.childStartedAtUtc;childAlive=[bool]$childAlive;pythonChildren=@($descendants|ForEach-Object {$_.ProcessId});configSha256=$ConfigSha256;targetCommit=$cfg.targetCommit;fenceHeld=(Test-Path -LiteralPath $cfg.fenceFile);observedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')}
 if($Mode -eq 'Inspect'){Emit $snapshot;exit 0}
 if($Mode -eq 'AssertFence'){
  $f=Get-Content -LiteralPath $cfg.fenceFile -Raw|ConvertFrom-Json
  if($task.Settings.Enabled -or $childAlive -or $descendants.Count -or $f.configSha256 -cne $ConfigSha256 -or $f.barrierId -cne $BarrierId){Reject 'FENCE_OR_QUIESCENCE_LOST'}
  if(-not (($state.status -ceq 'STOPPED' -and $null -ne $state.exitCode -and $state.exitCode -eq 0) -or ($state.status -ceq 'FENCED_START_REFUSED' -and $state.previousStopClean -eq $true))){Reject 'CLEAN_EXIT_EVIDENCE_REQUIRED'}
  Emit @{kind='HDWORK2_CUTOVER_BARRIER';barrierId=$BarrierId;courierStopped=$true;allOwnedPidsGone=$true;fenceHeld=$true;graceful=$true;forced=$false;observedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')};exit 0
 }
 if(-not $Execute){Emit @{status='PLAN_ONLY';taskName=$cfg.taskName;operation='DISABLE_EXACT_TASK_THEN_COOPERATIVE_STOP';changed=$false};exit 0}
 if(-not $ApprovalFile -or $PlanSha256 -notmatch '^[a-f0-9]{64}$' -or $BarrierId -notmatch '^[a-f0-9-]{36}$'){Reject 'EXPLICIT_APPROVAL_REQUIRED'}
 $approval=Get-Content -LiteralPath $ApprovalFile -Raw|ConvertFrom-Json
 if($approval.kind -cne 'HDWORK2_OPERATOR_CUTOVER_APPROVAL' -or $approval.approved -ne $true -or $approval.scope -cne 'CUTOVER_FLAGS_OFF_ONLY' -or $approval.targetCommit -cne $cfg.targetCommit -or $approval.planSha256 -cne $PlanSha256 -or $approval.nativeConfigSha256 -cne $ConfigSha256 -or -not $approval.operator -or [DateTimeOffset]::Parse($approval.expiresAtUtc) -le [DateTimeOffset]::UtcNow){Reject 'OPERATOR_APPROVAL_MISMATCH'}
 if(-not $childAlive -or $state.status -cne 'READY'){Reject 'LIVE_COOPERATIVE_OWNER_REQUIRED'}
 if(Test-Path -LiteralPath $cfg.fenceFile){Reject 'EXISTING_FENCE_REQUIRES_REVIEW'}
 $fence=@{barrierId=$BarrierId;configSha256=$ConfigSha256;taskName=$cfg.taskName;operator=$approval.operator;decisionId=$approval.decisionId;planSha256=$PlanSha256;originalChildPid=$state.childPid;originalChildStartedAtUtc=$state.childStartedAtUtc;at=[DateTimeOffset]::UtcNow.ToString('o')}
 $bytes=[Text.Encoding]::UTF8.GetBytes(($fence|ConvertTo-Json -Compress));$stream=[IO.File]::Open($cfg.fenceFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 # Exact validated task only. No stop/kill; task remains disabled after success or failure.
 Disable-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName|Out-Null
 if((Get-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName).Settings.Enabled){Reject 'TASK_RESTART_FENCE_FAILED'}
 $client=New-Object IO.Pipes.NamedPipeClientStream('.',$cfg.pipeName,[IO.Pipes.PipeDirection]::InOut,[IO.Pipes.PipeOptions]::Asynchronous)
 try{
  $client.Connect(5000);$writer=New-Object IO.StreamWriter($client);$writer.AutoFlush=$true;$reader=New-Object IO.StreamReader($client)
  $writer.WriteLine((@{action='STOP';configSha256=$ConfigSha256;childPid=$state.childPid;childStartedAtUtc=$state.childStartedAtUtc;barrierId=$BarrierId}|ConvertTo-Json -Compress))
  $line=$reader.ReadLineAsync();if(-not $line.Wait(([int]$cfg.graceSeconds+5)*1000)){Reject 'GRACEFUL_STOP_TIMEOUT'};$reply=$line.Result|ConvertFrom-Json
  if($reply.clean -ne $true -or $reply.forced -or $reply.barrierId -cne $BarrierId){Reject 'CLEAN_STOP_NOT_PROVEN'}
 }finally{$client.Dispose()}
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(10)
 do{$alive=OriginalAlive $state.childPid $state.childStartedAtUtc;if(-not $alive){break};Start-Sleep -Milliseconds 100}while([DateTimeOffset]::UtcNow -lt $deadline)
 foreach($id in @($descendants|ForEach-Object {$_.ProcessId})){if(Get-Process -Id $id -ErrorAction SilentlyContinue){Reject 'PYTHON_STILL_RUNNING'}}
 if($alive -or (Get-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName).Settings.Enabled){Reject 'STOP_NOT_FENCED'}
 Emit @{kind='HDWORK2_CUTOVER_BARRIER';barrierId=$BarrierId;courierStopped=$true;allOwnedPidsGone=$true;fenceHeld=$true;graceful=$true;forced=$false;taskName=$cfg.taskName;observedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')}
}catch{
 $code=if($_.Exception.Message -match '^[A-Z0-9_]+$'){$_.Exception.Message}else{'NATIVE_ADAPTER_REJECTED'}
 Emit @{status='STOP';code=$code;forced=$false};exit 1
}
