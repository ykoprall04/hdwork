# RAW LOG official single-attempt controller. No automatic rollback or retrying starts.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Directory,[Parameter(Mandatory=$true)][string]$CodeCommit,[string]$GitRepository='D:\HDWork2-New',[switch]$Activate,[switch]$RestoreFiles,[string]$PlanSha256)
$ErrorActionPreference='Stop'
if([Environment]::OSVersion.Platform -ne 'Win32NT'){throw 'WINDOWS_REQUIRED'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'EXISTING_ELEVATED_DPAPI_OWNER_REQUIRED'}
$Directory=[IO.Path]::GetFullPath($Directory)
if($Directory -notmatch '^C:\\ProgramData\\HDWork2RawLog-[a-f0-9]{32}$' -or $CodeCommit -notmatch '^[a-f0-9]{40}$'){throw 'PRIVATE_RELEASE_DIRECTORY_AND_COMMIT_REQUIRED'}
$node=(Get-Command node.exe).Source
$engine=Join-Path $PSScriptRoot 'raw-log-release.js'
function Engine([string]$Action,$Value){
 $text=$Value|ConvertTo-Json -Depth 24 -Compress|& $node $engine $Action|Out-String
 if($LASTEXITCODE -ne 0){Write-Host $text;throw ('RAW_LOG_ENGINE_FAILED_'+$Action)}
 Write-Host $text
 return ($text|ConvertFrom-Json)
}
function Sid([string]$Value){if($Value -match '^S-1-'){return $Value};return (New-Object Security.Principal.NTAccount($Value)).Translate([Security.Principal.SecurityIdentifier]).Value}
function Task([string]$Name){if($Name -notin @('HDWork2-Web','HDWork2-LiveChat-Courier')){throw 'TASK_NAME_REJECTED'};return Get-ScheduledTask -TaskPath '\' -TaskName $Name}
function Action($Task){if(@($Task.Actions).Count -ne 1){throw 'SINGLE_ACTION_REQUIRED'};return $Task.Actions[0]}
function AssertAction([string]$Name,$Expected,[string]$Owner){$t=Task $Name;$a=Action $t;if($a.Execute -cne $Expected.Execute -or $a.Arguments -cne $Expected.Arguments -or [string]$a.WorkingDirectory -ne [string]$Expected.WorkingDirectory -or (Sid ([string]$t.Principal.UserId)) -ne $Owner){throw ('TASK_ACTION_OR_OWNER_CHANGED_'+$Name)};return $t}
if($RestoreFiles){
 if($Activate -or $PlanSha256 -notmatch '^[a-f0-9]{64}$'){throw 'MANUAL_RECOVERY_PLAN_HASH_REQUIRED'}
 if((Get-FileHash -LiteralPath (Join-Path $Directory 'plan.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $PlanSha256){throw 'RECOVERY_PLAN_CHANGED'}
 $recovery=Get-Content -LiteralPath (Join-Path $Directory 'plan.json') -Raw|ConvertFrom-Json
 if($recovery.ownerSid -ne $identity.User.Value -or $recovery.codeCommit -ne $CodeCommit){throw 'ORIGINAL_RECOVERY_OWNER_AND_CODE_REQUIRED'}
 foreach($name in @('HDWork2-Web','HDWork2-LiveChat-Courier')){if([string](Task $name).State -eq 'Running'){throw 'MANUALLY_STOP_BOTH_OWNED_TASKS_BEFORE_RECOVERY'}}
 $recordedIds=@();foreach($stateFile in @((Join-Path $recovery.oldAuto 'state.json'),(Join-Path $Directory 'autostart/state.json'))){if(Test-Path -LiteralPath $stateFile){$recorded=Get-Content -LiteralPath $stateFile -Raw|ConvertFrom-Json;$recordedIds+=@([int]$recorded.nodePid,[int]$recorded.pythonPid)}}
 $alive=@(Get-CimInstance Win32_Process|Where-Object {$_.ProcessId -in $recordedIds -or ($_.CommandLine -and ($_.CommandLine.Contains([string]$recovery.oldConfig) -or $_.CommandLine.Contains([string]$recovery.newConfig) -or $_.CommandLine.Contains([string]$recovery.newOwner) -or ($_.CommandLine.Contains([string]$recovery.webRuntime) -and ($_.CommandLine.Contains('protected-web-service.js') -or $_.CommandLine.Contains('run-protected-web.ps1')))))})
 if($alive.Count){throw 'OWNED_PROCESSES_MUST_BE_GONE_BEFORE_MANUAL_RECOVERY'}
 $null=Engine 'restore-files' @{root=$Directory;planSha256=$PlanSha256;manual=$true;stopped=$true}
 Write-Output 'FILES_RESTORED_NO_SERVICE_START_RESTORE_ORIGINAL_TASK_ACTIONS_MANUALLY'
 return
}
$wt=Task 'HDWork2-Web';$ct=Task 'HDWork2-LiveChat-Courier';$wa=Action $wt;$ca=Action $ct
if([string]$wt.State -ne 'Running' -or [string]$ct.State -ne 'Running' -or -not $wt.Settings.Enabled -or -not $ct.Settings.Enabled -or (Sid ([string]$wt.Principal.UserId)) -ne 'S-1-5-19' -or (Sid ([string]$ct.Principal.UserId)) -ne $identity.User.Value){throw 'EXISTING_HEALTHY_OWNED_TASKS_REQUIRED'}
$web=[string]$wa.WorkingDirectory
if(-not $web -or -not $wa.Arguments.Contains((Join-Path $web 'scripts\run-protected-web.ps1'))){throw 'OWNED_WEB_RUNTIME_REQUIRED'}
$cm=[regex]::Match([string]$ca.Arguments,'(?i)(?:^|\s)-Config\s+"([^"]+)"(?=\s|$)')
$hm=[regex]::Match([string]$ca.Arguments,'(?i)(?:^|\s)-ConfigSha256\s+([a-f0-9]{64})(?=\s|$)')
if(-not $cm.Success -or -not $hm.Success){throw 'EXACT_PINNED_COURIER_ACTION_REQUIRED'}
$config=$cm.Groups[1].Value;$auto=Split-Path -Parent $config
$ws=Get-Content -LiteralPath (Join-Path $web 'service/state/state.json') -Raw|ConvertFrom-Json
$cs=Get-Content -LiteralPath (Join-Path $auto 'state.json') -Raw|ConvertFrom-Json
function VerifyWeb([DateTimeOffset]$After){
 $null=AssertAction 'HDWork2-Web' $wa 'S-1-5-19'
 $s=Get-Content -LiteralPath (Join-Path $web 'service/state/state.json') -Raw|ConvertFrom-Json
 $p=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$s.pid)"
 if([string](Task 'HDWork2-Web').State -ne 'Running' -or $s.status -ne 'READY' -or $s.readOnly -or -not $s.pools.read -or -not $s.pools.write -or -not $p -or $p.Name -ne 'node.exe' -or -not $p.CommandLine -or -not $p.CommandLine.Contains((Join-Path $web 'scripts/protected-web-service.js')) -or [DateTimeOffset]::Parse($s.updatedAt) -lt $After){throw 'WEB_NOT_FRESH_READY'}
 $o=Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid;if($o.ReturnValue -ne 0 -or $o.Sid -ne 'S-1-5-19'){throw 'WEB_PROCESS_OWNER_CHANGED'}
 return $s
}
function VerifyCourier($Expected,[string]$StateRoot,[DateTimeOffset]$After){
 $null=AssertAction 'HDWork2-LiveChat-Courier' $Expected $identity.User.Value
 $s=Get-Content -LiteralPath (Join-Path $StateRoot 'state.json') -Raw|ConvertFrom-Json
 $n=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$s.nodePid)";$p=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$s.pythonPid)"
 if([string](Task 'HDWork2-LiveChat-Courier').State -ne 'Running' -or $s.status -ne 'READY' -or [DateTimeOffset]::Parse($s.startedAt) -lt $After -or [DateTimeOffset]::Parse($s.updatedAt) -lt [DateTimeOffset]::UtcNow.AddSeconds(-30) -or -not $n -or -not $p -or $n.Name -ne 'node.exe' -or $p.Name -notmatch '^python(?:w)?\.exe$' -or $p.ParentProcessId -ne $n.ProcessId -or -not $n.CommandLine -or -not $n.CommandLine.Contains((Join-Path $StateRoot 'config.json'))){throw 'COURIER_NOT_FRESH_READY'}
 foreach($process in @($n,$p)){$o=Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid;if($o.ReturnValue -ne 0 -or $o.Sid -ne $identity.User.Value){throw 'COURIER_PROCESS_OWNER_CHANGED'}}
 $siblings=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"|Where-Object {$_.CommandLine -and ($_.CommandLine.Contains($config) -or $_.CommandLine.Contains((Join-Path $StateRoot 'config.json')))})
 if($siblings.Count -ne 1){throw 'SINGLE_OWNED_COURIER_NODE_REQUIRED'}
 return $s
}
$null=VerifyWeb ([DateTimeOffset]::MinValue);$null=VerifyCourier $ca $auto ([DateTimeOffset]::MinValue)
foreach($pair in @(@('HDWork2-Web','previous-web-task.xml'),@('HDWork2-LiveChat-Courier','previous-courier-task.xml'))){$xml=Export-ScheduledTask -TaskPath '\' -TaskName $pair[0];[IO.File]::WriteAllText((Join-Path $Directory $pair[1]),$xml,[Text.Encoding]::Unicode)}
$metadata=@{webRuntime=$web;courierConfig=$config;configSha256=$hm.Groups[1].Value.ToLowerInvariant();ownerSid=$identity.User.Value;processesVerified=$true}
$result=Engine 'stage' @{root=$Directory;repo=$GitRepository;codeCommit=$CodeCommit;metadata=$metadata}
$planSha=$result.planSha256;$base=@{root=$Directory;planSha256=$planSha}
Write-Output ('RELEASE_DIRECTORY='+$Directory);Write-Output ('RELEASE_PLAN_SHA256='+$planSha)
if(-not $Activate){Write-Output 'RAW_LOG_STAGED_NO_SERVICE_CHANGE';return}
$p=Get-Content -LiteralPath (Join-Path $Directory 'plan.json') -Raw|ConvertFrom-Json
# Preserve exact source ACLs; atomic replacements are permitted only for inherited ACLs.
foreach($e in $p.entries){if(Test-Path -LiteralPath $e.target){$a=Get-Acl -LiteralPath $e.target;if($a.AreAccessRulesProtected -or @($a.Access|Where-Object {-not $_.IsInherited}).Count){throw ('EXPLICIT_FILE_ACL_REQUIRES_REVIEW: '+$e.target)}}}
$a=Get-Acl -LiteralPath $p.envFile;if($a.AreAccessRulesProtected -or @($a.Access|Where-Object {-not $_.IsInherited}).Count){throw 'EXPLICIT_ENVIRONMENT_ACL_REQUIRES_REVIEW'}
$mutex=New-Object Threading.Mutex($false,'Global\HDWork2SharedGroupsDeployment');$mutexOwned=$false;$lock=$null;$lockOwned=$false
$lockPath=Join-Path $web 'frontend/.frontend-only-deployment.lock'
function ProcessesFor([string]$Kind){
 if($Kind -eq 'web'){return @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='powershell.exe' OR Name='pwsh.exe'"|Where-Object {$_.CommandLine -and $_.CommandLine.Contains($web) -and ($_.CommandLine.Contains('protected-web-service.js') -or $_.CommandLine.Contains('run-protected-web.ps1'))})}
 $ids=@([int]$cs.nodePid,[int]$cs.pythonPid)
 return @(Get-CimInstance Win32_Process|Where-Object {$_.ProcessId -in $ids -or ($_.CommandLine -and ($_.CommandLine.Contains($config) -or $_.CommandLine.Contains((Join-Path $auto 'run-owner.ps1'))))})
}
function StopOwned([string]$Name,$Expected,[string]$Owner,[string]$Kind){
 $null=AssertAction $Name $Expected $Owner
 Disable-ScheduledTask -TaskPath '\' -TaskName $Name|Out-Null
 Stop-ScheduledTask -TaskPath '\' -TaskName $Name
 $until=[DateTimeOffset]::UtcNow.AddSeconds(45)
 do{if(@(ProcessesFor $Kind).Count -eq 0){return};Start-Sleep -Milliseconds 500}while([DateTimeOffset]::UtcNow -lt $until)
 throw ($Kind.ToUpperInvariant()+'_STOP_NOT_CONFIRMED_NO_FORCE_KILL')
}
function WaitReady([string]$Kind,$Expected,[DateTimeOffset]$After){
 $until=[DateTimeOffset]::UtcNow.AddSeconds(70);$last=$null
 do{try{if($Kind -eq 'web'){return VerifyWeb $After}else{return VerifyCourier $Expected (Join-Path $Directory 'autostart') $After}}catch{$last=$_};Start-Sleep -Milliseconds 500}while([DateTimeOffset]::UtcNow -lt $until)
 Write-Error $last -ErrorAction Continue;throw ($Kind.ToUpperInvariant()+'_READY_TIMEOUT_NO_RESTART')
}
$phase='PRE_CUTOVER';$servicesTouched=$false
try{
 try{$mutexOwned=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$mutexOwned=$true}
 if(-not $mutexOwned){throw 'ANOTHER_DEPLOYMENT_RUNNING'}
 $lock=[IO.File]::Open($lockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$lockOwned=$true
 $null=Engine 'verify' $base
 # Back up only ACL metadata. No credential/journal/DB contents are copied or modified.
 $aclBackup=@();foreach($folder in @('C:\ProgramData\HDWork2','C:\ProgramData\HDWork2\Logs','C:\ProgramData\HDWork2\Tools')){if(Test-Path -LiteralPath $folder){if((Get-Item -LiteralPath $folder -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'LOG_DIRECTORY_REPARSE_REJECTED'};$aclBackup+=@{path=$folder;sddl=(Get-Acl -LiteralPath $folder).Sddl}}}
 [IO.File]::WriteAllText((Join-Path $Directory 'previous-log-acls.json'),(ConvertTo-Json $aclBackup -Depth 5),[Text.Encoding]::UTF8)
 $phase='STOP_COURIER';$servicesTouched=$true;Write-Host 'STOPPING_ONLY_HDWORK2_COURIER'
 StopOwned 'HDWork2-LiveChat-Courier' $ca $identity.User.Value 'courier'
 # Existing worker lease max 60 seconds; no DB write/read or reset. Do not overlap pollers.
 Write-Host 'WAITING_65_SECONDS_FOR_EXISTING_LEASE_EXPIRY'
 $until=[DateTimeOffset]::UtcNow.AddSeconds(65);while([DateTimeOffset]::UtcNow -lt $until){Start-Sleep -Milliseconds 500}
 if(@(ProcessesFor 'courier').Count){throw 'OLD_OWNED_COURIER_STILL_PRESENT'}
 $phase='STOP_WEB';StopOwned 'HDWork2-Web' $wa 'S-1-5-19' 'web'
 $phase='APPLY_FILES';$null=Engine 'apply' ($base+@{stopped=$true})
 # Provision logs/normal-shell viewer under the same owner. Preserve profile before append.
 $phase='INSTALL_VIEWER';$documents=[Environment]::GetFolderPath('MyDocuments')
 $profiles=@($PROFILE.CurrentUserAllHosts,(Join-Path $documents 'WindowsPowerShell\profile.ps1'),(Join-Path $documents 'PowerShell\profile.ps1'))|Select-Object -Unique
 $profileBackups=@();$index=0
 foreach($profileFile in $profiles){$backup='previous-profile-'+$index+'.ps1';$exists=Test-Path -LiteralPath $profileFile;if($exists){Copy-Item -LiteralPath $profileFile -Destination (Join-Path $Directory $backup)};$profileBackups+=@{path=$profileFile;existed=$exists;backup=$backup};$index++}
 [IO.File]::WriteAllText((Join-Path $Directory 'previous-profiles.json'),(ConvertTo-Json $profileBackups -Depth 4),[Text.Encoding]::UTF8)
 & (Join-Path $PSScriptRoot 'install-courier-log.ps1') -IncludeWebLocalService
 $phase='SWITCH_COURIER_ACTION'
 $courierArguments=[string]$ca.Arguments
 foreach($pair in @(@((Join-Path $auto 'run-owner.ps1'),[string]$p.newOwner),@($config,[string]$p.newConfig),@($hm.Groups[1].Value,[string]$p.configSha256))){if([regex]::Matches($courierArguments,[regex]::Escape($pair[0])).Count -ne 1){throw 'EXACT_COURIER_ACTION_REPLACEMENT_REQUIRED'};$courierArguments=$courierArguments.Replace($pair[0],$pair[1])}
 if($ca.WorkingDirectory){$newAction=New-ScheduledTaskAction -Execute $ca.Execute -Argument $courierArguments -WorkingDirectory $ca.WorkingDirectory}else{$newAction=New-ScheduledTaskAction -Execute $ca.Execute -Argument $courierArguments}
 Set-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier' -Action $newAction|Out-Null
 # Disable scheduled failure-restart during this single activation attempt; restore only on success.
 foreach($name in @('HDWork2-Web','HDWork2-LiveChat-Courier')){
  $settings=(Task $name).Settings;$settings.RestartCount=0
  Set-ScheduledTask -TaskPath '\' -TaskName $name -Settings $settings|Out-Null
 }
 $phase='START_WEB';$null=Engine 'mark' ($base+@{event='WEB_START_ATTEMPTED'})
 $after=[DateTimeOffset]::UtcNow;Enable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'|Out-Null;Start-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
 $webReady=WaitReady 'web' $null $after;$null=Engine 'health' $base
 $phase='START_COURIER';$null=Engine 'mark' ($base+@{event='COURIER_START_ATTEMPTED'})
 $after=[DateTimeOffset]::UtcNow;Enable-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'|Out-Null;Start-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'
 $courierReady=WaitReady 'courier' $newAction $after
 $phase='VERIFY_LOGS';$logRoot='C:\ProgramData\HDWork2\Logs'
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(15)
 do{
  $webLog=@(Get-ChildItem -LiteralPath $logRoot -Filter ('hdwork2-*-node-'+$webReady.pid+'.jsonl')|Where-Object Length -gt 0)
  $nodeLog=@(Get-ChildItem -LiteralPath $logRoot -Filter ('hdwork2-*-node-'+$courierReady.nodePid+'.jsonl')|Where-Object Length -gt 0)
  $pyLog=@(Get-ChildItem -LiteralPath $logRoot -Filter ('hdwork2-*-python-'+$courierReady.pythonPid+'.jsonl')|Where-Object Length -gt 0)
  $ownerLog=@(Get-ChildItem -LiteralPath $logRoot -Filter 'hdwork2-*-owner-*.jsonl'|Where-Object {$_.Length -gt 0 -and $_.LastWriteTimeUtc -ge $after.UtcDateTime})
  if($webLog.Count -and $nodeLog.Count -and $pyLog.Count -and $ownerLog.Count){break};Start-Sleep -Milliseconds 250
 }while([DateTimeOffset]::UtcNow -lt $deadline)
 if(-not ($webLog.Count -and $nodeLog.Count -and $pyLog.Count -and $ownerLog.Count)){throw 'WEB_COURIER_PYTHON_OWNER_LOG_COVERAGE_FAILED'}
 # Invoke actual reader once, no follow loop and no Courier import/start.
 & $node -e 'const m=require(process.argv[1]);m.initial(process.argv[2]).then(x=>{if(!x.lines.length)process.exitCode=1;else console.log("RAW_LOG_VIEWER_READ_PASS");}).catch(()=>process.exitCode=1);' (Join-Path $PSScriptRoot 'courier-log.js') $logRoot
 if($LASTEXITCODE -ne 0){throw 'VIEWER_READ_FAILED'}
 $null=Engine 'verify' ($base+@{applied=$true})
 # Leave automatic task retries disabled as requested; original settings remain in task XML backups.
 $null=Engine 'mark' ($base+@{event='ACTIVE'})
 . (Join-Path 'C:\ProgramData\HDWork2\Tools' 'courier-log.ps1')
 [pscustomobject]@{Status='RAW_LOG_ACTIVE';ApplicationCommit='1fc87f5';Directory=$Directory;Web='READY';Courier='READY';SingleOwnedCourier=$true;LogDirectory=$logRoot;ViewerRead='PASS';DailyRotation='00:00 WIB';RetentionDays=7;AutomaticRollback=$false;AutomaticTaskRetries='DISABLED'}|ConvertTo-Json
}catch{
 $original=$_
 try{[IO.File]::WriteAllText((Join-Path $Directory 'deployment-error.txt'),('Phase: '+$phase+[Environment]::NewLine+$original.ToString()+[Environment]::NewLine+$original.ScriptStackTrace),[Text.Encoding]::UTF8)}catch{}
 if($servicesTouched){try{$null=Engine 'mark' ($base+@{event='FAILED_MANUAL_RECOVERY_REQUIRED'})}catch{}}
 Write-Host ('RAW_LOG_DEPLOYMENT_STOPPED_PHASE='+$phase)
 foreach($name in @('HDWork2-Web','HDWork2-LiveChat-Courier')){try{$t=Task $name;Write-Host ($name+' State='+$t.State+' Enabled='+$t.Settings.Enabled)}catch{}}
 Write-Host ('MANUAL_RECOVERY_PACKET='+$Directory)
 Write-Host 'NO_AUTOMATIC_ROLLBACK_NO_START_RETRY_NO_DATA_RESET'
 Write-Error $original -ErrorAction Continue
 throw $original
}finally{
 if($lock){$lock.Dispose()};if($lockOwned -and (Test-Path -LiteralPath $lockPath)){Remove-Item -LiteralPath $lockPath}
 if($mutexOwned){$mutex.ReleaseMutex()};$mutex.Dispose()
}
