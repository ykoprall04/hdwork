# Approved deployment for app 827bb86. No migrations, credentials changes or Telegram test sends.
[CmdletBinding()]
param(
 [ValidateSet('Apply','Status','Resume')][string]$Mode='Status',
 [string]$Directory='C:\ProgramData\HDWork2SharedGroups-d9252dccb37d4cc383a644c3b1ba44f0',
 [string]$ReleasePlanSha256='17c858079bb10c54bff4474a3bf5bc437f5e013fb06b7b5357b512eadd729674'
)
$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ELEVATED_EXISTING_DPAPI_OWNER_REQUIRED'}
$node=(Get-Command node.exe).Source;$engine=Join-Path $PSScriptRoot 'apply-shared-groups-release.js';$installer=Join-Path $PSScriptRoot 'install-live-chat-autostart.ps1'
$manifest=Join-Path $Directory 'release.review.json'
if((Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ReleasePlanSha256){throw 'APPROVED_RELEASE_PACKET_CHANGED'}
$p=Get-Content -LiteralPath $manifest -Raw|ConvertFrom-Json
if($p.ownerSid -ne $identity.User.Value -or $p.release -ne '827bb86c83ae5b6edd8f0e8f601df2e4cd00207a'){throw 'APPROVED_OWNER_RELEASE_REQUIRED'}
$webRestartAfter=$null
$auto=Join-Path $Directory 'autostart';$webState=Join-Path $p.snapshot 'service/state/state.json'
function Engine([string]$Action,[switch]$Stopped){
 $arguments=@($engine,$Action,'--directory',$Directory,'--plan-sha256',$ReleasePlanSha256)
 if($Stopped){$arguments+=@('--confirmed-services-stopped','yes')}
 $text=& $node @arguments
 if($LASTEXITCODE -ne 0){Write-Output $text;throw ('RELEASE_ENGINE_FAILED_'+$Action)}
 Write-Output $text
}
function Sid([string]$User){if($User -match '^S-1-'){return $User};return (New-Object Security.Principal.NTAccount($User)).Translate([Security.Principal.SecurityIdentifier]).Value}
function OwnedWeb {
 $task=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
 if(@($task.Actions).Count -ne 1 -or -not $task.Actions[0].Arguments.Contains($p.snapshot) -or (Sid $task.Principal.UserId) -ne 'S-1-5-19'){throw 'WEB_TASK_IDENTITY_CHANGED'}
 return $task
}
function WebReady {
 try{
  $s=Get-Content -LiteralPath $webState -Raw|ConvertFrom-Json
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($s.pid)"
  $fresh=($null -eq $webRestartAfter -or [DateTimeOffset]::Parse($s.updatedAt) -ge $webRestartAfter)
  return ($fresh -and $s.status -eq 'READY' -and $s.pools.read -and $s.pools.write -and -not $s.readOnly -and $process -and $process.Name -eq 'node.exe' -and [bool]$process.CommandLine -and $process.CommandLine.Contains($p.snapshot) -and $process.CommandLine.Contains('protected-web-service.js'))
 }catch{return $false}
}
function StopOwned([string]$TaskName,[int[]]$ProcessIds){
 Disable-ScheduledTask -TaskPath '\' -TaskName $TaskName|Out-Null
 Stop-ScheduledTask -TaskPath '\' -TaskName $TaskName
 $until=[DateTime]::UtcNow.AddSeconds(45)
 do{
  $alive=@($ProcessIds|Where-Object {Get-Process -Id $_ -ErrorAction SilentlyContinue})
  if(-not $alive.Count){return}
  Start-Sleep -Milliseconds 500
 }while([DateTime]::UtcNow -lt $until)
 throw ('OWNED_SHUTDOWN_NOT_CONFIRMED_'+$TaskName)
}
function WaitWeb {
 $until=[DateTime]::UtcNow.AddSeconds(50)
 do{if(WebReady){return};Start-Sleep -Seconds 1}while([DateTime]::UtcNow -lt $until)
 if(Test-Path -LiteralPath (Join-Path $p.snapshot 'service/state/supervisor.json')){Get-Content -LiteralPath (Join-Path $p.snapshot 'service/state/supervisor.json') -Raw|Write-Output}
 throw 'WEB_NATIVE_POOLS_OR_BOOT_NOT_READY'
}
if($Mode -eq 'Status'){
 $null=OwnedWeb
 & $installer -Mode Status -Directory $auto
 [pscustomobject]@{WebReady=(WebReady);Migration='NATIVE_READ_VERIFIED_AT_DEPLOYMENT';RealTwoWayTest='PENDING_OPERATOR_CONFIRMATION'}|ConvertTo-Json
 return
}
$deploymentMutex=New-Object Threading.Mutex($false,'Global\HDWork2SharedGroupsDeployment')
$mutexOwned=$false
try{
 try{$mutexOwned=$deploymentMutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$mutexOwned=$true}
 if(-not $mutexOwned){throw 'ANOTHER_SHARED_GROUP_DEPLOYMENT_IS_RUNNING'}
if($Mode -eq 'Resume'){
 Engine 'verify-runtime'
 $null=OwnedWeb
 if(-not (WebReady)){throw 'FENCING_WEB_NOT_READY_NO_RESUME_CHANGES'}
 $state=Get-Content -LiteralPath (Join-Path $Directory 'apply-state.json') -Raw|ConvertFrom-Json
 if($state.state -notin @('START_ATTEMPTED','ACTIVE_HOST_CHECKS_PENDING_REAL_CHAT')){throw 'EXPECTED_POSTSTART_RECOVERY_STATE_REQUIRED'}
 $courier=& $installer -Mode Status -Directory $auto|ConvertFrom-Json
 $cfg=Get-Content -LiteralPath (Join-Path $auto 'config.json') -Raw|ConvertFrom-Json
 foreach($name in @('HDWork2-Telegram-Service','HDWork2-Telegram-Testing')){$legacy=Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction SilentlyContinue;if($legacy -and [string]$legacy.State -ne 'Disabled'){throw 'OLD_TELEGRAM_TASK_MUST_REMAIN_DISABLED'}}
 if(-not $courier.Healthy -and ([string]$courier.TaskState -eq 'Running' -or @(Get-NetTCPConnection -LocalPort $cfg.port -State Listen -ErrorAction SilentlyContinue).Count)){throw 'UNVERIFIED_RUNNING_COURIER_RESUME_STOPPED'}
 # First prove trust and current served files without changing the frontend/task.
 Engine 'health-current'
 & (Join-Path $PSScriptRoot 'resume-shared-group-backup.ps1') -Directory $Directory -ReleasePlanSha256 $ReleasePlanSha256 -VerifyMigrationOnly
 $frontTouched=$false;$courierStartIssued=$false
 try{
  $frontTouched=$true;Engine 'resume-frontend';Engine 'health'
  if(-not $courier.Healthy){
   $proof=Get-Content -LiteralPath (Join-Path $Directory 'migration014.verify.json') -Raw|ConvertFrom-Json
   $remaining=[double]$proof.workerLeaseExpiresMs-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
   if($remaining -gt 65000){throw 'UNEXPECTED_COURIER_LEASE_EXPIRY'}
   if($remaining -gt 0){Write-Output 'WAITING_FOR_EXISTING_LEASE_NO_SECOND_POLLER';while([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -le [double]$proof.workerLeaseExpiresMs){Start-Sleep -Seconds 1}}
   Enable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'|Out-Null
   $courierStartIssued=$true;& $installer -Mode Start -Directory $auto
  }
  $courier=& $installer -Mode Status -Directory $auto|ConvertFrom-Json
  if(-not $courier.Healthy){throw 'COURIER_NOT_READY_AFTER_RESUME'}
  if(-not (WebReady)){throw 'WEB_NOT_READY_AFTER_COURIER_RESUME'}
  if($state.state -eq 'START_ATTEMPTED'){Engine 'mark-active'}
  [pscustomobject]@{Status='SHARED_GROUPS_RUNTIME_READY';Release=$p.release;WebReady=(WebReady);Courier=$courier.Status;TLS='VERIFIED_WITH_EXISTING_CA_AND_LEAF_PIN';Autostart='EXISTING_TASK_REUSED';WebRestarted=$false;ManagementSqlWrites=$false;RealTwoWayTest='PENDING_OPERATOR_CONFIRMATION'}|ConvertTo-Json
 }catch{
  $failure=$_;Write-Output ('RESUME_ERROR: '+$failure.Exception.Message)
  if($courierStartIssued){Disable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'|Out-Null;Stop-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'}
  if($frontTouched){Engine 'restore-frontend'}
  Write-Output 'FENCING_BACKEND_RETAINED_NO_DOWNGRADE_NO_QUEUE_REPLAY'
  throw $failure
 }
 return
}
if(Test-Path -LiteralPath (Join-Path $Directory 'apply-state.json')){throw 'DEPLOYMENT_ALREADY_ATTEMPTED_USE_STATUS_OR_RECOVERY'}
foreach($name in @('HDWork2-Telegram-Service','HDWork2-Telegram-Testing')){$old=Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction SilentlyContinue;if($old -and [string]$old.State -ne 'Disabled'){throw 'OLD_TELEGRAM_TASK_MUST_STAY_DISABLED'}}
$oldCourier=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'
$oldWeb=OwnedWeb
$current=& $installer -Mode Status -Directory $p.autostart|ConvertFrom-Json
if(-not $current.Healthy -or -not (WebReady)){throw 'INITIAL_WEB_OR_COURIER_NOT_HEALTHY_NO_CHANGES'}
$cs=Get-Content -LiteralPath (Join-Path $p.autostart 'state.json') -Raw|ConvertFrom-Json
$ws=Get-Content -LiteralPath $webState -Raw|ConvertFrom-Json
$oldConfig=Get-Content -LiteralPath (Join-Path $p.autostart 'config.json') -Raw|ConvertFrom-Json
& (Join-Path $PSScriptRoot 'resume-shared-group-backup.ps1') -Directory $Directory -ReleasePlanSha256 $ReleasePlanSha256 -VerifyMigrationOnly
Engine 'verify'
$filesTouched=$false;$startAttempted=$false;$courierPaused=$false;$webPaused=$false
try{
 Write-Output 'STOPPING_ONLY_VERIFIED_COURIER_OWNER_STDIN_WILL_CLOSE'
 $courierPaused=$true;StopOwned 'HDWork2-LiveChat-Courier' @([int]$cs.nodePid,[int]$cs.pythonPid)
 if(@(Get-NetTCPConnection -LocalPort $oldConfig.port -State Listen -ErrorAction SilentlyContinue).Count){throw 'COURIER_LISTENER_REMAINS_NO_APPLY'}
 # A task stop may close the old process before its database lease can release.
 # Wait only for that existing lease; never delete or steal it.
 & (Join-Path $PSScriptRoot 'resume-shared-group-backup.ps1') -Directory $Directory -ReleasePlanSha256 $ReleasePlanSha256 -VerifyMigrationOnly
 $proof=Get-Content -LiteralPath (Join-Path $Directory 'migration014.verify.json') -Raw|ConvertFrom-Json
 $remaining=[double]$proof.workerLeaseExpiresMs-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
 if($remaining -gt 65000){throw 'UNEXPECTED_COURIER_LEASE_EXPIRY'}
 if($remaining -gt 0){Write-Output 'WAITING_FOR_EXISTING_COURIER_LEASE_EXPIRY_NO_SECOND_POLLER';while([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -le [double]$proof.workerLeaseExpiresMs){Start-Sleep -Seconds 1}}
 Write-Output 'STOPPING_ONLY_VERIFIED_WEB_SUPERVISOR'
 $webPaused=$true;StopOwned 'HDWork2-Web' @([int]$ws.pid)
 $filesTouched=$true;Engine 'apply' -Stopped
 $review=Get-Content -LiteralPath (Join-Path $auto 'autostart.review.json') -Raw|ConvertFrom-Json
 $wrapper=Join-Path $auto 'run-owner.ps1';$config=Join-Path $auto 'config.json'
 if($wrapper.Contains('"') -or $config.Contains('"')){throw 'PATH_REJECTED'}
 $courierArguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$wrapper+'" -Config "'+$config+'" -ConfigSha256 '+$review.configSha256
 $action=New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument $courierArguments -WorkingDirectory $auto
 Set-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier' -Action $action|Out-Null
 Engine 'mark-start';$startAttempted=$true;$webRestartAfter=[DateTimeOffset]::UtcNow
 Enable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'|Out-Null
 Start-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web';WaitWeb
 Engine 'health'
 Enable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'|Out-Null
 & $installer -Mode Start -Directory $auto
 $courier=& $installer -Mode Status -Directory $auto|ConvertFrom-Json
 if(-not $courier.Healthy){throw 'NEW_COURIER_NOT_READY_DO_NOT_START_ANOTHER'}
 Engine 'mark-active'
 [pscustomobject]@{Status='SHARED_GROUPS_RUNTIME_READY';Release=$p.release;WebReady=$true;NativeWebPools='READ_WRITE_READY';Courier=$courier.Status;Autostart='EXISTING_TASK_REPINNED';RoutingMode='DATABASE';GlobalCutoffPreserved=$true;RealTwoWayTest='PENDING_OPERATOR_CONFIRMATION';TestMessagesSent=0}|ConvertTo-Json
}catch{
 $failure=$_
 $durableStateFile=Join-Path $Directory 'apply-state.json'
 if(Test-Path -LiteralPath $durableStateFile){$durable=Get-Content -LiteralPath $durableStateFile -Raw|ConvertFrom-Json;if($durable.state -in @('START_ATTEMPTED','ACTIVE_HOST_CHECKS_PENDING_REAL_CHAT')){$startAttempted=$true}}
 Write-Output ('DEPLOYMENT_ERROR: '+$failure.Exception.Message)
 if(-not $startAttempted){
  $stopped=($webPaused -and -not(Get-Process -Id $ws.pid -ErrorAction SilentlyContinue) -and -not(Get-Process -Id $cs.nodePid -ErrorAction SilentlyContinue) -and -not(Get-Process -Id $cs.pythonPid -ErrorAction SilentlyContinue))
  if($filesTouched -and (Test-Path -LiteralPath (Join-Path $Directory 'apply-state.json'))){if(-not $stopped){throw 'RECOVERY_BLOCKED_OWNED_PROCESSES_NOT_STOPPED'};Engine 'recover' -Stopped}
  Set-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier' -Action $oldCourier.Actions|Out-Null
  if($webPaused){Enable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'|Out-Null;Start-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web';WaitWeb}
  if($courierPaused){Enable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'|Out-Null;& $installer -Mode Start -Directory $p.autostart}
  Write-Output 'PRESTART_ROLLBACK_COMPLETED_MIGRATION_RETAINED'
 }else{
  # Source/flag downgrade could replay held rows once web may have been exposed.
  Disable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'|Out-Null
  Stop-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'
  Engine 'restore-frontend'
  Write-Output 'POSTSTART_FAILURE_COURIER_STOP_REQUESTED_FENCING_BACKEND_RETAINED_NO_DOWNGRADE'
 }
 throw $failure
}

}finally{if($mutexOwned){$deploymentMutex.ReleaseMutex()};$deploymentMutex.Dispose()}
