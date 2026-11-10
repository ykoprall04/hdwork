# Run elevated as the existing CurrentUser DPAPI owner. No password is stored.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidateSet('Prepare','Install','Start','Status','Rollback')][string]$Mode,
 [string]$Directory,[string]$ReleasePrepared,[string]$FixPrepared,
 [string]$ProductionPlan,[string]$ProductionPlanSha256
)
$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ELEVATED_DPAPI_OWNER_REQUIRED'}
$taskName='HDWork2-LiveChat-Courier'
function Digest([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function OldTasksDisabled {
 foreach($name in @('HDWork2-Telegram-Service','HDWork2-Telegram-Testing')){
  $old=Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction SilentlyContinue
  if($old -and [string]$old.State -ne 'Disabled'){throw 'OLD_CONTROLLER_TASK_MUST_REMAIN_DISABLED'}
 }
}
if($Mode -eq 'Prepare'){
 if(-not $ReleasePrepared -or -not $FixPrepared -or -not $ProductionPlan -or $ProductionPlanSha256 -notmatch '^[a-f0-9]{64}$'){throw 'EXPLICIT_RELEASE_FIX_PLAN_AND_HASH_REQUIRED'}
 $node=(Get-Command node.exe -ErrorAction Stop).Source
 $python=(& python -B -c 'import sys;print(sys.executable)')
 if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $python -PathType Leaf)){throw 'PYTHON_EXECUTABLE_REQUIRED'}
 $Directory=Join-Path $env:ProgramData ('HDWork2CourierAutostart-'+[Guid]::NewGuid().ToString('N'))
 [void](New-Item -ItemType Directory -Path $Directory)
 $acl=New-Object Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @('S-1-5-18','S-1-5-32-544')){
  $rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
 }
 Set-Acl -LiteralPath $Directory -AclObject $acl
 & $node (Join-Path $PSScriptRoot 'prepare-courier-autostart.js') --release-prepared $ReleasePrepared --fix-prepared $FixPrepared --plan $ProductionPlan --plan-sha256 $ProductionPlanSha256 --owner-sid $identity.User.Value --node-exe $node --python-exe $python --output $Directory
 if($LASTEXITCODE -ne 0){throw 'AUTOSTART_PREPARATION_FAILED_RUNTIME_UNCHANGED'}
 return
}
if(-not $Directory){throw 'PREPARED_DIRECTORY_REQUIRED'}
$Directory=(Resolve-Path -LiteralPath $Directory).Path
$review=Get-Content -LiteralPath (Join-Path $Directory 'autostart.review.json') -Raw|ConvertFrom-Json
$config=Join-Path $Directory 'config.json';$wrapper=Join-Path $Directory 'run-owner.ps1'
if($review.taskName -ne $taskName -or $review.ownerSid -ne $identity.User.Value -or (Digest $config) -ne $review.configSha256 -or (Digest $wrapper) -ne $review.wrapperSha256 -or (Digest (Join-Path $Directory 'courier-task-runner.js')) -ne $review.runnerSha256){throw 'AUTOSTART_ARTIFACT_OR_OWNER_CHANGED'}
$cfg=Get-Content -LiteralPath $config -Raw|ConvertFrom-Json
if($config.Contains('"') -or $wrapper.Contains('"')){throw 'PATH_REJECTED'}
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$wrapper+'" -Config "'+$config+'" -ConfigSha256 '+$review.configSha256
$powershell=Join-Path $PSHOME 'powershell.exe'
$task=Get-ScheduledTask -TaskPath '\' -TaskName $taskName -ErrorAction SilentlyContinue
function ResolveTaskOwnerSid([string]$UserId) {
 if([string]::IsNullOrWhiteSpace($UserId)){throw 'TASK_OWNER_UNRESOLVED'}
 try {
  if($UserId -match '^S-1-'){
   return (New-Object Security.Principal.SecurityIdentifier($UserId)).Value
  }
  $account=New-Object Security.Principal.NTAccount($UserId)
  return $account.Translate([Security.Principal.SecurityIdentifier]).Value
 }catch{throw 'TASK_OWNER_UNRESOLVED'}
}
function AssertOwnedTask {
 if(-not $task -or @($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -ne $powershell -or $task.Actions[0].Arguments -cne $arguments -or (ResolveTaskOwnerSid $task.Principal.UserId) -ne $identity.User.Value -or [string]$task.Principal.LogonType -ne 'Interactive' -or [string]$task.Principal.RunLevel -ne 'Highest'){throw 'TASK_IDENTITY_MISMATCH'}
}
function CurrentStatus {
 $stateFile=Join-Path $Directory 'state.json';$state=$null
 if(Test-Path -LiteralPath $stateFile){$state=Get-Content -LiteralPath $stateFile -Raw|ConvertFrom-Json}
 $healthy=$false
 if($state -and $state.status -eq 'READY' -and $state.configSha256 -eq $review.configSha256 -and ([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($state.updatedAt)).TotalSeconds -lt 15){
  $node=Get-CimInstance Win32_Process -Filter "ProcessId=$($state.nodePid)"
  $python=Get-CimInstance Win32_Process -Filter "ProcessId=$($state.pythonPid)"
  $listeners=@(Get-NetTCPConnection -LocalPort $cfg.port -State Listen -ErrorAction SilentlyContinue)
  $healthy=([bool]$node -and [bool]$python -and $python.ParentProcessId -eq $node.ProcessId -and $node.ExecutablePath -eq $cfg.nodeExecutable -and $python.ExecutablePath -eq $cfg.pythonExecutable -and [bool]$node.CommandLine -and $node.CommandLine.Contains($config) -and $listeners.Count -eq 1 -and $listeners[0].OwningProcess -eq $node.ProcessId)
 }
 [pscustomobject]@{Status=$(if($healthy){'COURIER_AUTOSTART_READY'}else{'UNKNOWN_OR_NOT_READY'});Healthy=$healthy;TaskState=[string](Get-ScheduledTask -TaskPath '\' -TaskName $taskName).State;StartsAt='OWNER_LOGON';Code=$state.code;LiveChatEndToEndVerified=$false}
}
if($Mode -eq 'Install'){
 OldTasksDisabled
 if($task){AssertOwnedTask;throw 'TASK_ALREADY_REGISTERED_USE_STATUS'}
 $action=New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $Directory
 $trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity.User.Value
 $principal=New-ScheduledTaskPrincipal -UserId $identity.User.Value -LogonType Interactive -RunLevel Highest
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
 Register-ScheduledTask -TaskPath '\' -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings|Out-Null
 [pscustomobject]@{Status='AUTOSTART_REGISTERED_NOT_STARTED';StartsAt='OWNER_LOGON';PasswordStored=$false}|ConvertTo-Json
 return
}
AssertOwnedTask
if($Mode -eq 'Status'){CurrentStatus|ConvertTo-Json;return}
if($Mode -eq 'Rollback'){
 Stop-ScheduledTask -TaskPath '\' -TaskName $taskName
 $deadline=[DateTime]::UtcNow.AddSeconds(30)
 do {
  $live=CurrentStatus
  $listeners=@(Get-NetTCPConnection -LocalPort $cfg.port -State Listen -ErrorAction SilentlyContinue)
  if(-not $listeners.Count -and [string](Get-ScheduledTask -TaskPath '\' -TaskName $taskName).State -ne 'Running'){break}
  Start-Sleep -Seconds 1
 }while([DateTime]::UtcNow -lt $deadline)
 if($listeners.Count -or [string](Get-ScheduledTask -TaskPath '\' -TaskName $taskName).State -eq 'Running'){throw 'STOP_NOT_CONFIRMED_TASK_RETAINED'}
 Unregister-ScheduledTask -TaskPath '\' -TaskName $taskName -Confirm:$false
 [pscustomobject]@{Status='AUTOSTART_REMOVED';ProductionFilesChanged=$false;PrivateArtifactsRetained=$true;OldTasksEnabled=$false}|ConvertTo-Json
 return
}
OldTasksDisabled
if([string]$task.State -eq 'Running'){CurrentStatus|ConvertTo-Json;return}
if(@(Get-NetTCPConnection -LocalPort $cfg.port -State Listen -ErrorAction SilentlyContinue).Count){throw 'COURIER_ALREADY_LISTENING_STOP_FOREGROUND_WITH_CTRL_C_FIRST'}
Start-ScheduledTask -TaskPath '\' -TaskName $taskName
$deadline=[DateTime]::UtcNow.AddSeconds(50)
do{$result=CurrentStatus;if($result.Healthy){$result|ConvertTo-Json;return};Start-Sleep -Seconds 2}while([DateTime]::UtcNow -lt $deadline)
$result|ConvertTo-Json
throw 'AUTOSTART_NOT_READY_DO_NOT_START_ANOTHER_CONTROLLER'
