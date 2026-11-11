# Exact prepared web cutover only. Courier task, pins, credentials and DB stay unchanged.
[CmdletBinding()]
param(
 [ValidateSet('Verify','Apply','Status','Rollback')][string]$Mode='Verify',
 [Parameter(Mandatory=$true)][string]$StagedRuntime,
 [Parameter(Mandatory=$true)][string]$PlanSha256,
 [switch]$ApproveWebCutover
)
$ErrorActionPreference='Stop'
if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'WINDOWS_WEB_CUTOVER_REQUIRED' }
if ($Mode -in @('Apply','Rollback') -and -not $ApproveWebCutover) { throw 'EXPLICIT_WEB_CUTOVER_REQUIRED' }
$StagedRuntime=[IO.Path]::GetFullPath($StagedRuntime)
if ($StagedRuntime -notmatch '^C:\\ProgramData\\HDWork2WebB2C-[a-f0-9]{32}$' -or $PlanSha256 -notmatch '^[a-f0-9]{64}$') { throw 'EXACT_STAGE_AND_PLAN_REQUIRED' }
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'ADMINISTRATOR_REQUIRED' }
$checker=Join-Path $PSScriptRoot 'verify-b2c-isolated-web.js'
$node=(Get-Command node.exe).Source
$planFile=Join-Path $StagedRuntime '.b2c-release\plan.json'
if ((Get-FileHash -LiteralPath $planFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $PlanSha256) { throw 'B2C_PLAN_HASH_CHANGED' }
function ReadJson([string]$File) { return ([IO.File]::ReadAllText($File)|ConvertFrom-Json) }
$plan=ReadJson $planFile
if ($plan.applicationCommit -ne 'ccc646a649ed2bd6a9e138f27a43efe96a536edd' -or $plan.state -ne 'STAGED_NOT_STARTED' -or $plan.stagedRuntime -ne $StagedRuntime -or $plan.previousRuntime -notmatch '^C:\\ProgramData\\HDWork2Runtime-[a-f0-9]{32}$') { throw 'EXPECTED_B2C_PLAN_REQUIRED' }
$previous=[string]$plan.previousRuntime
$journalFile=Join-Path $StagedRuntime '.b2c-release\activation.json'
$taskBackup=Join-Path $StagedRuntime '.b2c-release\previous-web-task.xml'
if ((Get-FileHash -LiteralPath $taskBackup -Algorithm SHA256).Hash.ToLowerInvariant() -ne $plan.previousWebTaskSha256) { throw 'ROLLBACK_TASK_BACKUP_CHANGED' }
[xml]$taskXml=[IO.File]::ReadAllText($taskBackup)
$oldExec=$taskXml.Task.Actions.Exec
if (@($oldExec).Count -ne 1 -or [string]$oldExec.WorkingDirectory -ne $previous -or -not ([string]$oldExec.Arguments).Contains((Join-Path $previous 'scripts\run-protected-web.ps1'))) { throw 'ROLLBACK_TASK_ACTION_REJECTED' }
$oldAction=New-ScheduledTaskAction -Execute ([string]$oldExec.Command) -Argument ([string]$oldExec.Arguments) -WorkingDirectory $previous
$newAction=New-ScheduledTaskAction -Execute ([string]$oldExec.Command) -Argument ('-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $StagedRuntime 'scripts\run-protected-web.ps1')+'"') -WorkingDirectory $StagedRuntime
function Sid([string]$User) { if ($User -match '^S-1-') { return $User }; return (New-Object Security.Principal.NTAccount($User)).Translate([Security.Principal.SecurityIdentifier]).Value }
function Engine([string]$Action,[string]$NodeExecutable) {
 $argsList=@($checker,$Action,$StagedRuntime,$PlanSha256)
 if ($Action -eq 'verify') { $argsList+=$NodeExecutable }
 $text=& $node @argsList | Out-String
 if ($LASTEXITCODE -ne 0) { Write-Output $text; throw ('B2C_CHECK_FAILED_'+$Action) }
 $result=$text|ConvertFrom-Json
 if (($Action -eq 'verify' -and $result.status -ne 'B2C_STAGED_FILES_AND_OFFLINE_SMOKE_PASS') -or ($Action -eq 'health' -and $result.status -ne 'NEW_WEB_TLS_HEALTH_PASS') -or ($Action -eq 'health-previous' -and $result.status -ne 'PREVIOUS_WEB_TLS_HEALTH_PASS')) { throw 'UNEXPECTED_WEB_CHECK_RESULT' }
 Write-Host $text
}
function OwnedTask([string]$Runtime) {
 $task=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
 $expectedArguments=if ($Runtime -eq $previous) { [string]$oldExec.Arguments } else { [string]$newAction.Arguments }
 if (@($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -cne [string]$oldExec.Command -or $task.Actions[0].Arguments -cne $expectedArguments -or (Sid $task.Principal.UserId) -ne 'S-1-5-19' -or $task.Actions[0].WorkingDirectory -ne $Runtime -or -not $task.Actions[0].Arguments.Contains((Join-Path $Runtime 'scripts\run-protected-web.ps1'))) { throw 'WEB_TASK_IDENTITY_CHANGED' }
 return $task
}
function OwnedProcesses([string]$Runtime) {
 return @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='powershell.exe' OR Name='pwsh.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Runtime) -and ($_.CommandLine.Contains('protected-web-service.js') -or $_.CommandLine.Contains('run-protected-web.ps1')) })
}
function ReadyProcess([string]$Runtime,[DateTimeOffset]$After) {
 $task=OwnedTask $Runtime
 if ([string]$task.State -ne 'Running') { throw 'WEB_TASK_NOT_RUNNING' }
 $state=ReadJson (Join-Path $Runtime 'service\state\state.json')
 $process=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.pid)"
 if ($state.status -ne 'READY' -or $state.readOnly -or -not $state.pools.read -or -not $state.pools.write -or -not $process -or $process.Name -ne 'node.exe' -or -not $process.CommandLine -or -not $process.CommandLine.Contains((Join-Path $Runtime 'scripts\protected-web-service.js'))) { throw 'WEB_PROCESS_NOT_READY' }
 if ($After -ne [DateTimeOffset]::MinValue -and [DateTimeOffset]::Parse($state.updatedAt) -lt $After) { throw 'WEB_READY_STATE_NOT_FRESH' }
 $owner=Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid
 if ($owner.ReturnValue -ne 0 -or $owner.Sid -ne 'S-1-5-19') { throw 'WEB_PROCESS_OWNER_CHANGED' }
 return $process
}
function CourierIdentity {
 if ((Get-FileHash -LiteralPath $plan.courierConfig -Algorithm SHA256).Hash.ToLowerInvariant() -ne $plan.courierConfigSha256) { throw 'COURIER_CONFIGURATION_CHANGED' }
 $cfg=ReadJson $plan.courierConfig
 if ($cfg.snapshot -ne $previous -or $cfg.ownerSid -ne $identity.User.Value) { throw 'EXISTING_COURIER_OWNER_OR_SNAPSHOT_CHANGED' }
 $task=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'
 if (@($task.Actions).Count -ne 1 -or [string]$task.State -ne 'Running' -or (Sid $task.Principal.UserId) -ne $identity.User.Value -or -not $task.Actions[0].Arguments.Contains([string]$plan.courierConfig) -or -not $task.Actions[0].Arguments.Contains([string]$plan.courierConfigSha256)) { throw 'COURIER_TASK_CHANGED_OR_NOT_RUNNING' }
 $state=ReadJson (Join-Path (Split-Path -Parent $plan.courierConfig) 'state.json')
 if ($state.status -ne 'READY' -or [DateTimeOffset]::Parse($state.updatedAt) -lt [DateTimeOffset]::UtcNow.AddSeconds(-30)) { throw 'EXISTING_COURIER_NOT_READY' }
 $n=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.nodePid)"
 $p=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.pythonPid)"
 if (-not $n -or -not $p -or $p.ParentProcessId -ne $n.ProcessId -or -not $n.CommandLine -or -not $n.CommandLine.Contains([string]$plan.courierConfig) -or $n.ExecutablePath -ne $cfg.nodeExecutable -or $p.ExecutablePath -ne $cfg.pythonExecutable) { throw 'COURIER_PROCESS_IDENTITY_CHANGED' }
 return [pscustomobject]@{NodePid=[int]$n.ProcessId;PythonPid=[int]$p.ProcessId;NodeStarted=[string]$n.CreationDate;PythonStarted=[string]$p.CreationDate;Arguments=[string]$task.Actions[0].Arguments;Execute=[string]$task.Actions[0].Execute;WorkingDirectory=[string]$task.Actions[0].WorkingDirectory}
}
function AssertCourierUnchanged($Before) {
 $now=CourierIdentity
 if (($now|ConvertTo-Json -Compress) -cne ($Before|ConvertTo-Json -Compress)) { throw 'COURIER_IDENTITY_CHANGED_DURING_WEB_CUTOVER' }
}
function SaveJournal([string]$State,$Courier,[string]$Code) {
 $value=@{version=1;state=$State;planSha256=$PlanSha256;previousRuntime=$previous;stagedRuntime=$StagedRuntime;courier=$Courier;code=$Code;checkedAt=[DateTimeOffset]::UtcNow.ToString('o')}
 $temp=$journalFile+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
 [IO.File]::WriteAllText($temp,($value|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
 Move-Item -LiteralPath $temp -Destination $journalFile -Force
}
function StopWeb([string]$Runtime) {
 $null=OwnedTask $Runtime
 Stop-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
 $until=[DateTimeOffset]::UtcNow.AddSeconds(45)
 do { if (@(OwnedProcesses $Runtime).Count -eq 0) { return }; Start-Sleep -Milliseconds 500 } while ([DateTimeOffset]::UtcNow -lt $until)
 throw 'OWNED_WEB_SHUTDOWN_NOT_CONFIRMED'
}
function WaitReady([string]$Runtime,[DateTimeOffset]$After) {
 $until=[DateTimeOffset]::UtcNow.AddSeconds(55)
 do { try { $null=ReadyProcess $Runtime $After; return } catch {}; Start-Sleep -Milliseconds 500 } while ([DateTimeOffset]::UtcNow -lt $until)
 throw 'WEB_READY_TIMEOUT_PRESERVE_STATE_AND_SUPERVISOR_REPORT'
}
function RestoreWeb($Courier) {
 $task=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
 if ([string]$task.Actions[0].WorkingDirectory -eq $StagedRuntime) { StopWeb $StagedRuntime }
 elseif ([string]$task.Actions[0].WorkingDirectory -ne $previous) { throw 'ROLLBACK_TASK_WAS_CHANGED_BY_ANOTHER_OPERATOR' }
 Set-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web' -Action $oldAction | Out-Null
 $owned=@(OwnedProcesses $previous)
 if ($owned.Count -eq 0) { $after=[DateTimeOffset]::UtcNow; Start-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'; WaitReady $previous $after }
 else { $null=ReadyProcess $previous ([DateTimeOffset]::MinValue) }
 Engine 'health-previous' ''
 AssertCourierUnchanged $Courier
 SaveJournal 'ROLLED_BACK' $Courier 'PREVIOUS_WEB_RESTORED'
 Write-Output 'B2C_WEB_ROLLED_BACK_COURIER_PRESERVED'
}
if ($Mode -eq 'Verify') {
 $process=ReadyProcess $previous ([DateTimeOffset]::MinValue)
 $courier=CourierIdentity
 Engine 'verify' $process.ExecutablePath
 Engine 'health-previous' ''
 AssertCourierUnchanged $courier
 Write-Output 'B2C_CUTOVER_PREFLIGHT_PASS_NOT_ACTIVATED'
 return
}
if ($Mode -eq 'Status') {
 $task=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
 $active=[string]$task.Actions[0].WorkingDirectory
 if ($active -notin @($previous,$StagedRuntime)) { throw 'WEB_TASK_TARGET_UNEXPECTED' }
 $null=ReadyProcess $active ([DateTimeOffset]::MinValue)
 Engine $(if ($active -eq $StagedRuntime) {'health'} else {'health-previous'}) ''
 $null=CourierIdentity
 [pscustomobject]@{Status='B2C_WEB_STATUS_VERIFIED';Runtime=$active;NewReleaseActive=($active -eq $StagedRuntime)}|ConvertTo-Json
 return
}
$mutex=New-Object Threading.Mutex($false,'Global\HDWork2SharedGroupsDeployment')
$mutexOwned=$false;$fileLock=$null;$fileOwned=$false
$lockFile=Join-Path $previous 'frontend\.frontend-only-deployment.lock'
try {
 try { $mutexOwned=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $mutexOwned=$true }
 if (-not $mutexOwned) { throw 'ANOTHER_WEB_OR_SHARED_GROUP_DEPLOYMENT_IS_RUNNING' }
 # CreateNew rejects existing/stale locks; never delete another deployment lock.
 $fileLock=[IO.File]::Open($lockFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$fileOwned=$true
 if ($Mode -eq 'Rollback') {
  if (-not (Test-Path -LiteralPath $journalFile)) { throw 'ACTIVATION_JOURNAL_REQUIRED_FOR_ROLLBACK' }
  $journal=ReadJson $journalFile
  if ($journal.planSha256 -ne $PlanSha256 -or $journal.state -notin @('ACTIVATING','ACTIVE','ROLLBACK_FAILED')) { throw 'ROLLBACK_JOURNAL_REJECTED' }
  try { RestoreWeb $journal.courier } catch { SaveJournal 'ROLLBACK_FAILED' $journal.courier 'MANUAL_RECOVERY_REQUIRED'; throw }
  return
 }
 if (Test-Path -LiteralPath $journalFile) { throw 'ACTIVATION_ALREADY_ATTEMPTED_USE_STATUS_OR_ROLLBACK' }
 $process=ReadyProcess $previous ([DateTimeOffset]::MinValue)
 $courier=CourierIdentity
 Engine 'verify' $process.ExecutablePath
 Engine 'health-previous' ''
 $currentTask=OwnedTask $previous
 if ($currentTask.Actions[0].Execute -cne [string]$oldExec.Command -or $currentTask.Actions[0].Arguments -cne [string]$oldExec.Arguments) { throw 'WEB_ACTION_DIFFERS_FROM_ROLLBACK_BACKUP' }
 AssertCourierUnchanged $courier
 SaveJournal 'ACTIVATING' $courier 'WEB_CUTOVER_BEGIN'
 try {
  StopWeb $previous
  Set-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web' -Action $newAction | Out-Null
  $started=[DateTimeOffset]::UtcNow
  Start-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
  WaitReady $StagedRuntime $started
  Engine 'health' ''
  AssertCourierUnchanged $courier
  SaveJournal 'ACTIVE' $courier 'NEW_WEB_TLS_AND_COURIER_PRESERVATION_PASS'
  [pscustomobject]@{Status='B2C_WEB_ACTIVE';ApplicationCommit=$plan.applicationCommit;Runtime=$StagedRuntime;CourierUnchanged=$true;DatabaseMigrationPerformed=$false;RealOrderAndChatTest='PENDING_OPERATOR_CHECK'}|ConvertTo-Json
 } catch {
  $failure=$_;Write-Host ('ACTIVATION_ERROR='+$failure.Exception.Message)
  try { RestoreWeb $courier } catch { SaveJournal 'ROLLBACK_FAILED' $courier 'MANUAL_RECOVERY_REQUIRED'; Write-Host ('ROLLBACK_ERROR='+$_.Exception.Message); throw 'B2C_ROLLBACK_FAILED_PRESERVE_ALL_RUNTIME_AND_STATE' }
  throw 'B2C_ACTIVATION_FAILED_PREVIOUS_WEB_RESTORED'
 }
} finally {
 if ($fileLock) { $fileLock.Dispose() }
 if ($fileOwned) { [IO.File]::Delete($lockFile) }
 if ($mutexOwned) { $mutex.ReleaseMutex() }
 $mutex.Dispose()
}
