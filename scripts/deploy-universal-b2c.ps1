# Coordinated three-file release. Reuses existing tasks, owner, pins, locks and native-reader checks.
[CmdletBinding()]
param(
 [ValidateSet('Stage','Verify','Apply','Status','RecoverPreStart')][string]$Mode='Stage',
 [string]$Directory,
 [string]$PlanSha256,
 [switch]$ApproveCoordinatedCutover
)
$ErrorActionPreference='Stop'
if([Environment]::OSVersion.Platform -ne 'Win32NT'){throw 'WINDOWS_COORDINATED_RELEASE_REQUIRED'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ADMINISTRATOR_EXISTING_OWNER_REQUIRED'}
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node=(Get-Command node.exe).Source
$engine=Join-Path $PSScriptRoot 'universal-b2c-release.js'
$inspector=Join-Path $PSScriptRoot 'inspect-universal-b2c-release.ps1'
function Engine([string]$Action,$InputValue){
 $text=$InputValue|ConvertTo-Json -Depth 24 -Compress|& $node $engine $Action|Out-String
 if($LASTEXITCODE -ne 0){Write-Host $text;throw ('UNIVERSAL_ENGINE_FAILED_'+$Action)}
 $result=$text|ConvertFrom-Json;Write-Host $text;return $result
}
function Sid([string]$Value){if($Value -match '^S-1-'){return $Value};return (New-Object Security.Principal.NTAccount($Value)).Translate([Security.Principal.SecurityIdentifier]).Value}
function Task([string]$Name){if($Name -notin @('HDWork2-Web','HDWork2-LiveChat-Courier')){throw 'TASK_NAME_REJECTED'};return Get-ScheduledTask -TaskPath '\' -TaskName $Name}
function AssertInheritedRuntimeFiles($Value){
 $files=@('src/courier/shared-group.js','src/system/store.js','src/operations/b2c-readiness.js')
 $targets=@();foreach($snapshot in @($Value.webRuntime,$Value.courierSnapshot)){foreach($file in $files){$targets+=Join-Path $snapshot $file}}
 $targets+=[string]$Value.courierConfig;$targets+=Join-Path (Split-Path -Parent $Value.courierConfig) 'autostart.review.json'
 foreach($file in $targets){$acl=Get-Acl -LiteralPath $file;if($acl.AreAccessRulesProtected -or @($acl.Access|Where-Object {-not $_.IsInherited}).Count){throw ('EXPLICIT_RUNTIME_FILE_ACL_REQUIRES_REVIEW: '+$file)}}
}
if($Mode -eq 'Stage'){
 if(-not $Directory){$Directory='C:\ProgramData\HDWork2UniversalB2C-'+[Guid]::NewGuid().ToString('N')}
 $Directory=[IO.Path]::GetFullPath($Directory)
 if($Directory -notmatch '^C:\\ProgramData\\HDWork2UniversalB2C-[a-f0-9]{32}$' -or (Test-Path -LiteralPath $Directory)){throw 'NEW_PRIVATE_PACKET_DIRECTORY_REQUIRED'}
 New-Item -ItemType Directory -Path $Directory|Out-Null
 $acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @($identity.User.Value,'S-1-5-32-544','S-1-5-18')){
  $rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)
 }
 Set-Acl -LiteralPath $Directory -AclObject $acl
 Write-Output ('RELEASE_DIRECTORY='+$Directory)
 $report=& $inspector -ReadDatabaseMetadata -ReturnReport
 foreach($name in @('HDWork2-Web','HDWork2-LiveChat-Courier')){if(-not (Task $name).Settings.Enabled){throw 'BASELINE_TASKS_MUST_BE_ENABLED'}}
 AssertInheritedRuntimeFiles $report
 foreach($pair in @(@('HDWork2-Web','previous-web-task.xml'),@('HDWork2-LiveChat-Courier','previous-courier-task.xml'))){
  $xml=Export-ScheduledTask -TaskPath '\' -TaskName $pair[0]
  [IO.File]::WriteAllText((Join-Path $Directory $pair[1]),$xml,[Text.Encoding]::Unicode)
 }
 $result=Engine 'stage' @{root=$Directory;repo=$repo;report=$report;ownerSid=$identity.User.Value}
 Write-Output ('RELEASE_PLAN_SHA256='+$result.planSha256)
 return
}
if(-not $Directory -or $PlanSha256 -notmatch '^[a-f0-9]{64}$'){throw 'EXACT_PACKET_AND_PLAN_HASH_REQUIRED'}
$Directory=[IO.Path]::GetFullPath($Directory)
if($Directory -notmatch '^C:\\ProgramData\\HDWork2UniversalB2C-[a-f0-9]{32}$'){throw 'PRIVATE_PACKET_PATH_REJECTED'}
$planFile=Join-Path $Directory 'plan.json'
if((Get-FileHash -LiteralPath $planFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $PlanSha256){throw 'IMMUTABLE_RELEASE_PLAN_CHANGED'}
$p=Get-Content -LiteralPath $planFile -Raw|ConvertFrom-Json
if($p.ownerSid -ne $identity.User.Value -or $p.applicationCommit -ne '126b2defd524335d05ea8b364a90b2da09202459'){throw 'VERIFIED_OWNER_APPLICATION_REQUIRED'}
$base=@{root=$Directory;planSha256=$PlanSha256}
function BackupAction([string]$File){
 [xml]$xml=[IO.File]::ReadAllText((Join-Path $Directory $File))
 $exec=$xml.Task.Actions.Exec
 if(@($exec).Count -ne 1){throw 'SINGLE_BACKUP_TASK_ACTION_REQUIRED'}
 if([string]$exec.WorkingDirectory){return New-ScheduledTaskAction -Execute ([string]$exec.Command) -Argument ([string]$exec.Arguments) -WorkingDirectory ([string]$exec.WorkingDirectory)}
 return New-ScheduledTaskAction -Execute ([string]$exec.Command) -Argument ([string]$exec.Arguments)
}
$oldWeb=BackupAction 'previous-web-task.xml';$oldCourier=BackupAction 'previous-courier-task.xml'
$pattern='(?i)(-ConfigSha256\s+)'+[regex]::Escape([string]$p.beforeConfig)+'(?=\s|$)'
if([regex]::Matches($oldCourier.Arguments,$pattern).Count -ne 1 -or -not $oldCourier.Arguments.Contains([string]$p.courierConfig)){throw 'EXACT_ORIGINAL_COURIER_ACTION_REQUIRED'}
$newArguments=[regex]::Replace($oldCourier.Arguments,$pattern,('${1}'+[string]$p.afterConfig))
if($oldCourier.WorkingDirectory){$newCourier=New-ScheduledTaskAction -Execute $oldCourier.Execute -Argument $newArguments -WorkingDirectory $oldCourier.WorkingDirectory}else{$newCourier=New-ScheduledTaskAction -Execute $oldCourier.Execute -Argument $newArguments}
function OwnedTask([string]$Name,$Action,[string]$Owner){
 $task=Task $Name
 if(@($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -cne $Action.Execute -or $task.Actions[0].Arguments -cne $Action.Arguments -or [string]$task.Actions[0].WorkingDirectory -ne [string]$Action.WorkingDirectory -or (Sid $task.Principal.UserId) -ne $Owner){throw ('TASK_ACTION_OR_OWNER_CHANGED_'+$Name)}
 return $task
}
function CurrentCourierAction {
 $task=Task 'HDWork2-LiveChat-Courier'
 if($task.Actions[0].Arguments -ceq $oldCourier.Arguments){return $oldCourier}
 if($task.Actions[0].Arguments -ceq $newCourier.Arguments){return $newCourier}
 throw 'COURIER_ACTION_CHANGED_BY_ANOTHER_OPERATOR'
}
function WebProcesses {
 return @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='powershell.exe' OR Name='pwsh.exe'"|Where-Object {$_.CommandLine -and $_.CommandLine.Contains([string]$p.webRuntime) -and ($_.CommandLine.Contains('protected-web-service.js') -or $_.CommandLine.Contains('run-protected-web.ps1'))})
}
function ReadyWeb([DateTimeOffset]$After){
 $task=OwnedTask 'HDWork2-Web' $oldWeb 'S-1-5-19'
 $s=Get-Content -LiteralPath (Join-Path $p.webRuntime 'service/state/state.json') -Raw|ConvertFrom-Json
 $process=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$s.pid)"
 if([string]$task.State -ne 'Running' -or $s.status -ne 'READY' -or $s.readOnly -or -not $s.pools.read -or -not $s.pools.write -or -not $process -or $process.Name -ne 'node.exe' -or -not $process.CommandLine -or -not $process.CommandLine.Contains((Join-Path $p.webRuntime 'scripts/protected-web-service.js')) -or [DateTimeOffset]::Parse($s.updatedAt) -lt $After){throw 'WEB_NOT_FRESH_READY'}
 $owner=Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid
 if($owner.ReturnValue -ne 0 -or $owner.Sid -ne 'S-1-5-19'){throw 'WEB_PROCESS_OWNER_CHANGED'}
}
function ReadyCourier($Action,[DateTimeOffset]$After){
 $task=OwnedTask 'HDWork2-LiveChat-Courier' $Action $identity.User.Value
 $s=Get-Content -LiteralPath (Join-Path (Split-Path -Parent $p.courierConfig) 'state.json') -Raw|ConvertFrom-Json
 $n=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$s.nodePid)";$py=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$s.pythonPid)"
 if([string]$task.State -ne 'Running' -or $s.status -ne 'READY' -or [DateTimeOffset]::Parse($s.startedAt) -lt $After -or [DateTimeOffset]::Parse($s.updatedAt) -lt [DateTimeOffset]::UtcNow.AddSeconds(-30) -or -not $n -or -not $py -or $py.ParentProcessId -ne $n.ProcessId -or -not $n.CommandLine -or -not $n.CommandLine.Contains([string]$p.courierConfig)){throw 'COURIER_NOT_FRESH_READY'}
 $owner=Invoke-CimMethod -InputObject $n -MethodName GetOwnerSid
 if($owner.ReturnValue -ne 0 -or $owner.Sid -ne $identity.User.Value){throw 'COURIER_PROCESS_OWNER_CHANGED'}
}
function WaitReady([string]$Kind,$Action,[DateTimeOffset]$After){
 $until=[DateTimeOffset]::UtcNow.AddSeconds(70)
 do{try{if($Kind -eq 'web'){ReadyWeb $After}else{ReadyCourier $Action $After};return}catch{};Start-Sleep -Milliseconds 500}while([DateTimeOffset]::UtcNow -lt $until)
 throw ($Kind.ToUpperInvariant()+'_READY_TIMEOUT')
}
function StopWeb {
 $task=OwnedTask 'HDWork2-Web' $oldWeb 'S-1-5-19'
 $wasRunning=([string]$task.State -eq 'Running')
 Disable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'|Out-Null
 if($wasRunning){Stop-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'}
 $until=[DateTimeOffset]::UtcNow.AddSeconds(45)
 do{if(@(WebProcesses).Count -eq 0){return};Start-Sleep -Milliseconds 500}while([DateTimeOffset]::UtcNow -lt $until)
 throw 'WEB_SHUTDOWN_NOT_CONFIRMED'
}
function StopCourier($Action){
 $task=OwnedTask 'HDWork2-LiveChat-Courier' $Action $identity.User.Value
 $s=Get-Content -LiteralPath (Join-Path (Split-Path -Parent $p.courierConfig) 'state.json') -Raw|ConvertFrom-Json
 $ids=@([int]$s.nodePid,[int]$s.pythonPid)|Where-Object {$_ -gt 0}
 $wasRunning=([string]$task.State -eq 'Running')
 Disable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'|Out-Null
 if($wasRunning){Stop-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'}
 $until=[DateTimeOffset]::UtcNow.AddSeconds(45)
 do{
  $alive=@($ids|Where-Object {Get-CimInstance Win32_Process -Filter "ProcessId=$_"})
  $extra=@(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='powershell.exe' OR Name='pwsh.exe'"|Where-Object {$_.CommandLine -and ($_.CommandLine.Contains([string]$p.courierConfig) -or ($_.CommandLine.Contains((Split-Path -Parent $p.courierConfig)) -and $_.CommandLine.Contains('run-owner.ps1')))})
  if(-not $alive.Count -and -not $extra.Count){return};Start-Sleep -Milliseconds 500
 }while([DateTimeOffset]::UtcNow -lt $until)
 throw 'COURIER_SHUTDOWN_NOT_CONFIRMED'
}
function RestorePreStart {
 $recoveryState=(Get-Content -LiteralPath (Join-Path $Directory 'activation.json') -Raw|ConvertFrom-Json).state
 if($recoveryState -notin @('STAGED_NOT_STARTED','APPLYING','APPLY_FAILED_PRESTART','APPLIED_NOT_STARTED','WEB_START_ATTEMPTED','RESTORED_PRESTART')){throw 'BACKEND_DOWNGRADE_PROHIBITED_AFTER_COURIER_START_ATTEMPT'}
 StopCourier (CurrentCourierAction);StopWeb
 if($recoveryState -ne 'RESTORED_PRESTART'){$null=Engine 'recover' ($base+@{stopped=$true})}else{$null=Engine 'verify' $base}
 Set-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier' -Action $oldCourier|Out-Null
 Enable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'|Out-Null
 $after=[DateTimeOffset]::UtcNow;Start-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web';WaitReady 'web' $null $after
 $null=Engine 'health' $base
 Enable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'|Out-Null
 $after=[DateTimeOffset]::UtcNow;Start-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier';WaitReady 'courier' $oldCourier $after
 $report=& $inspector -ReadDatabaseMetadata -ReturnReport
 if($report.courierConfigSha256 -ne $p.beforeConfig -or -not $report.database.courierLeaseActive){throw 'OLD_BASELINE_RECOVERY_HEALTH_FAILED'}
 $null=Engine 'mark' ($base+@{event='rolled-back'})
 Write-Output 'UNIVERSAL_B2C_ROLLED_BACK_BEFORE_NEW_COURIER_START'
}
if($Mode -eq 'Verify'){
 $null=Engine 'verify' $base
 $null=OwnedTask 'HDWork2-Web' $oldWeb 'S-1-5-19';$null=OwnedTask 'HDWork2-LiveChat-Courier' $oldCourier $identity.User.Value
 foreach($name in @('HDWork2-Web','HDWork2-LiveChat-Courier')){if(-not (Task $name).Settings.Enabled){throw 'BASELINE_TASKS_MUST_BE_ENABLED'}}
 $report=& $inspector -ReadDatabaseMetadata -ReturnReport
 if($report.database.mappingSha256 -ne $p.expected.mappingSha256 -or -not $report.database.schemaCompatible){throw 'FRESH_SCHEMA_OR_MAPPING_CHANGED'}
 Write-Output 'UNIVERSAL_B2C_PREFLIGHT_PASS_NOT_ACTIVATED';return
}
if($Mode -eq 'Status'){
 $applied=((Get-FileHash -LiteralPath $p.courierConfig -Algorithm SHA256).Hash.ToLowerInvariant() -eq $p.afterConfig)
 $null=Engine 'verify' ($base+@{applied=$applied})
 $null=Engine 'health' $base
 [pscustomobject]@{Status='UNIVERSAL_B2C_PACKET_STATUS';State=(Get-Content (Join-Path $Directory 'activation.json') -Raw|ConvertFrom-Json).state;WebTask=[string](Task 'HDWork2-Web').State;CourierTask=[string](Task 'HDWork2-LiveChat-Courier').State}|ConvertTo-Json
 return
}
if(-not $ApproveCoordinatedCutover){throw 'EXPLICIT_COORDINATED_CUTOVER_SWITCH_REQUIRED'}
$mutex=New-Object Threading.Mutex($false,'Global\HDWork2SharedGroupsDeployment');$mutexOwned=$false;$fileLock=$null;$fileOwned=$false
$lockFile=Join-Path $p.webRuntime 'frontend/.frontend-only-deployment.lock'
$courierBoundary=$false;$servicesTouched=$false
try{
 try{$mutexOwned=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$mutexOwned=$true}
 if(-not $mutexOwned){throw 'ANOTHER_DEPLOYMENT_IS_RUNNING'}
 $fileLock=[IO.File]::Open($lockFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$fileOwned=$true
 if($Mode -eq 'RecoverPreStart'){RestorePreStart;return}
 AssertInheritedRuntimeFiles $p
 foreach($name in @('HDWork2-Telegram-Service','HDWork2-Telegram-Testing')){$legacy=Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction SilentlyContinue;if($legacy -and [string]$legacy.State -ne 'Disabled'){throw 'EXISTING_OLD_TELEGRAM_TASK_MUST_REMAIN_DISABLED'}}
 $null=Engine 'verify' $base
 $state=Get-Content -LiteralPath (Join-Path $Directory 'activation.json') -Raw|ConvertFrom-Json
 if($state.state -ne 'STAGED_NOT_STARTED'){throw 'ACTIVATION_ALREADY_ATTEMPTED_USE_STATUS_OR_RECOVERY'}
 $null=OwnedTask 'HDWork2-Web' $oldWeb 'S-1-5-19';$null=OwnedTask 'HDWork2-LiveChat-Courier' $oldCourier $identity.User.Value
 foreach($name in @('HDWork2-Web','HDWork2-LiveChat-Courier')){if(-not (Task $name).Settings.Enabled){throw 'BASELINE_TASKS_MUST_BE_ENABLED'}}
 $report=& $inspector -ReadDatabaseMetadata -ReturnReport
 if($report.database.mappingSha256 -ne $p.expected.mappingSha256 -or -not $report.database.schemaCompatible -or -not $report.database.courierLeaseActive){throw 'FRESH_HOST_COMPATIBILITY_CHANGED'}
 $servicesTouched=$true
 Write-Host 'STOPPING_EXISTING_COURIER_FIRST'
 StopCourier $oldCourier
 $proof=& $inspector -ReadDatabaseMetadata -ReturnReport -ExpectCourierStopped
 $remaining=[double]$proof.database.courierLeaseExpiresMs-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
 if($remaining -gt 65000){throw 'UNEXPECTED_OLD_COURIER_LEASE_EXPIRY'}
 if($remaining -ge 0){Write-Host 'WAITING_FOR_EXISTING_LEASE_NO_SECOND_POLLER';while([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -le [double]$proof.database.courierLeaseExpiresMs){Start-Sleep -Milliseconds 500}}
 $proof=& $inspector -ReadDatabaseMetadata -ReturnReport -ExpectCourierStopped
 if($proof.database.courierLeaseActive){throw 'OLD_COURIER_LEASE_STILL_ACTIVE'}
 Write-Host 'STOPPING_EXISTING_WEB'
 StopWeb
 $null=Engine 'apply' ($base+@{stopped=$true;proof=$proof})
 Set-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier' -Action $newCourier|Out-Null
 $null=Engine 'mark' ($base+@{event='web-start'})
 Enable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'|Out-Null
 $after=[DateTimeOffset]::UtcNow;Start-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web';WaitReady 'web' $null $after
 $null=Engine 'health' $base
 $courierBoundary=$true
 $null=Engine 'mark' ($base+@{event='courier-start'})
 Enable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'|Out-Null
 $after=[DateTimeOffset]::UtcNow;Start-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier';WaitReady 'courier' $newCourier $after
 $report=& $inspector -ReadDatabaseMetadata -ReturnReport
 if($report.courierConfigSha256 -ne $p.afterConfig -or -not $report.database.courierLeaseActive -or -not $report.database.schemaCompatible -or $report.database.mappingSha256 -ne $p.expected.mappingSha256 -or @($report.files|Where-Object {-not $_.webTargetMatch -or -not $_.courierTargetMatch}).Count){throw 'NEW_RUNTIME_OR_SCHEMA_HEALTH_FAILED'}
 $null=Engine 'verify' ($base+@{applied=$true})
 $null=Engine 'mark' ($base+@{event='active'})
 [pscustomobject]@{Status='UNIVERSAL_B2C_ACTIVE';ApplicationCommit=$p.applicationCommit;Directory=$Directory;FrontendChanged=$false;ManagementSqlWrites=$false;MigrationPerformed=$false;ProductionPlanChanged=$false;RealTelegramCommandTest='PENDING_OPERATOR_CHECK'}|ConvertTo-Json
}catch{
 $failure=$_;Write-Host ('ACTIVATION_ERROR='+$failure.Exception.Message)
 if($servicesTouched){
  if($courierBoundary){
   try{StopCourier (CurrentCourierAction)}catch{Write-Host ('COURIER_STOP_ERROR='+$_.Exception.Message)}
   $null=Engine 'mark' ($base+@{event='recovery-required'})
   throw 'UNIVERSAL_B2C_POSTSTART_RECOVERY_REQUIRED_NO_BACKEND_DOWNGRADE'
  }
  try{RestorePreStart}catch{Write-Host ('PRESTART_RECOVERY_ERROR='+$_.Exception.Message);throw 'UNIVERSAL_B2C_PRESTART_RECOVERY_FAILED_KEEP_PACKET_AND_BACKUPS'}
  throw 'UNIVERSAL_B2C_ACTIVATION_FAILED_PREVIOUS_RUNTIME_RESTORED'
 }
 throw $failure
}finally{
 if($fileLock){$fileLock.Dispose()};if($fileOwned){[IO.File]::Delete($lockFile)}
 if($mutexOwned){$mutex.ReleaseMutex()};$mutex.Dispose()
}
