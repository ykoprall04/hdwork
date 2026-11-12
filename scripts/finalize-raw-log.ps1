# Finish an already-running RAW LOG release. Never starts/stops/restarts any process/task.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Directory,[Parameter(Mandatory=$true)][string]$PlanSha256)
$ErrorActionPreference='Stop'
if([Environment]::OSVersion.Platform -ne 'Win32NT'){throw 'WINDOWS_REQUIRED'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'EXISTING_ELEVATED_OWNER_REQUIRED'}
$Directory=[IO.Path]::GetFullPath($Directory)
if($Directory -notmatch '^C:\\ProgramData\\HDWork2RawLog-[a-f0-9]{32}$' -or $PlanSha256 -notmatch '^[a-f0-9]{64}$'){throw 'EXACT_ORIGINAL_PACKET_REQUIRED'}
if((Get-FileHash -LiteralPath (Join-Path $Directory 'plan.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $PlanSha256){throw 'ORIGINAL_PLAN_HASH_CHANGED'}
$p=Get-Content -LiteralPath (Join-Path $Directory 'plan.json') -Raw|ConvertFrom-Json
if($p.ownerSid -ne $identity.User.Value -or $p.applicationCommit -ne '1fc87f5df8aea39df6e813625248de6adf8a0a0a'){throw 'ORIGINAL_RELEASE_OWNER_REQUIRED'}
$node=(Get-Command node.exe).Source
$base=@{root=$Directory;planSha256=$PlanSha256}
function Engine([string]$Mode,$Value){$text=$Value|ConvertTo-Json -Depth 16 -Compress|& $node (Join-Path $PSScriptRoot 'raw-log-release.js') $Mode|Out-String;if($LASTEXITCODE -ne 0){Write-Host $text;throw ('FINALIZE_ENGINE_FAILED_'+$Mode)};Write-Host $text;return ($text|ConvertFrom-Json)}
function Sid([string]$Value){if($Value -match '^S-1-'){return $Value};return (New-Object Security.Principal.NTAccount($Value)).Translate([Security.Principal.SecurityIdentifier]).Value}
function CheckRunning {
 $webTask=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web' -ErrorAction Stop
 $courierTask=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier' -ErrorAction Stop
 if([string]$webTask.State -ne 'Running' -or [string]$courierTask.State -ne 'Running' -or -not $webTask.Settings.Enabled -or -not $courierTask.Settings.Enabled -or @($webTask.Actions).Count -ne 1 -or @($courierTask.Actions).Count -ne 1 -or (Sid ([string]$webTask.Principal.UserId)) -ne 'S-1-5-19' -or (Sid ([string]$courierTask.Principal.UserId)) -ne $identity.User.Value){throw 'OWNED_RUNNING_TASKS_REQUIRED_NO_RESTART'}
 [xml]$oldWeb=Get-Content -LiteralPath (Join-Path $Directory 'previous-web-task.xml') -Raw
 [xml]$oldCourier=Get-Content -LiteralPath (Join-Path $Directory 'previous-courier-task.xml') -Raw
 $expected=[string]$oldCourier.Task.Actions.Exec.Arguments
 foreach($pair in @(@((Join-Path $p.oldAuto 'run-owner.ps1'),[string]$p.newOwner),@([string]$p.oldConfig,[string]$p.newConfig),@([string]$p.oldConfigSha256,[string]$p.configSha256))){if([regex]::Matches($expected,[regex]::Escape($pair[0])).Count -ne 1){throw 'ORIGINAL_ACTION_BINDING_FAILED'};$expected=$expected.Replace($pair[0],$pair[1])}
 if($webTask.Actions[0].Execute -cne [string]$oldWeb.Task.Actions.Exec.Command -or $webTask.Actions[0].Arguments -cne [string]$oldWeb.Task.Actions.Exec.Arguments -or [string]$webTask.Actions[0].WorkingDirectory -cne [string]$oldWeb.Task.Actions.Exec.WorkingDirectory -or $courierTask.Actions[0].Execute -cne [string]$oldCourier.Task.Actions.Exec.Command -or $courierTask.Actions[0].Arguments -cne $expected -or [string]$courierTask.Actions[0].WorkingDirectory -cne [string]$oldCourier.Task.Actions.Exec.WorkingDirectory){throw 'LIVE_TASK_ACTION_DRIFT'}
 $ws=Get-Content -LiteralPath (Join-Path $p.webRuntime 'service/state/state.json') -Raw|ConvertFrom-Json
 $cs=Get-Content -LiteralPath (Join-Path (Split-Path -Parent $p.newConfig) 'state.json') -Raw|ConvertFrom-Json
 $web=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$ws.pid)"
 $courier=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$cs.nodePid)"
 $python=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$cs.pythonPid)"
 if($ws.status -ne 'READY' -or $ws.readOnly -or -not $ws.pools.read -or -not $ws.pools.write -or $cs.status -ne 'READY' -or $cs.configSha256 -ne $p.configSha256 -or [DateTimeOffset]::Parse($cs.updatedAt) -lt [DateTimeOffset]::UtcNow.AddSeconds(-30) -or -not $web -or -not $courier -or -not $python -or $web.Name -ne 'node.exe' -or $courier.Name -ne 'node.exe' -or $python.ParentProcessId -ne $courier.ProcessId -or $python.Name -notmatch '^python(?:w)?\.exe$' -or -not $web.CommandLine.Contains((Join-Path $p.webRuntime 'scripts/protected-web-service.js')) -or -not $courier.CommandLine.Contains([string]$p.newConfig)){throw 'LIVE_READY_OR_PROCESS_CHECK_FAILED_NO_RESTART'}
 foreach($pair in @(@($web,'S-1-5-19'),@($courier,$identity.User.Value),@($python,$identity.User.Value))){$owner=Invoke-CimMethod -InputObject $pair[0] -MethodName GetOwnerSid;if($owner.ReturnValue -ne 0 -or $owner.Sid -ne $pair[1]){throw 'LIVE_PROCESS_OWNER_CHANGED'}}
 $nodes=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"|Where-Object {$_.CommandLine -and ($_.CommandLine.Contains([string]$p.oldConfig) -or $_.CommandLine.Contains([string]$p.newConfig))})
 if($nodes.Count -ne 1){throw 'SINGLE_OWNED_COURIER_REQUIRED'}
 return @{webPid=[int]$web.ProcessId;nodePid=[int]$courier.ProcessId;pythonPid=[int]$python.ProcessId;ownerPid=[int]$courier.ParentProcessId}
}
$mutex=New-Object Threading.Mutex($false,'Global\HDWork2SharedGroupsDeployment');$owned=$false
try{
 try{$owned=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$owned=$true}
 if(-not $owned){throw 'ANOTHER_DEPLOYMENT_RUNNING'}
 if(Test-Path -LiteralPath (Join-Path $p.webRuntime 'frontend/.frontend-only-deployment.lock')){throw 'EXISTING_DEPLOYMENT_LOCK_REQUIRES_REVIEW'}
 $null=Engine 'verify' ($base+@{applied=$true});$before=CheckRunning
 $null=Engine 'health' $base
 $log='C:\ProgramData\HDWork2\Logs'
 foreach($pair in @(@('node',$before.webPid),@('node',$before.nodePid),@('python',$before.pythonPid),@('owner',$before.ownerPid))){$files=@(Get-ChildItem -LiteralPath $log -Filter ('hdwork2-*-'+$pair[0]+'-'+$pair[1]+'.jsonl') -ErrorAction Stop|Where-Object Length -gt 0);if(-not $files.Count){throw ('LOG_SOURCE_MISSING_'+$pair[0])};if($pair[0] -eq 'python' -and -not @($files|Where-Object {$_.LastWriteTimeUtc -ge [DateTime]::UtcNow.AddMinutes(-2)}).Count){throw 'PYTHON_LOG_NOT_RECENT'}}
 $installed='C:\ProgramData\HDWork2\Tools\courier-log.js'
 if((Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'courier-log.js') -Algorithm SHA256).Hash){throw 'INSTALLED_VIEWER_SOURCE_DRIFT'}
 & $node (Join-Path $PSScriptRoot 'check-courier-log.js') $log $installed
 if($LASTEXITCODE -ne 0){throw 'ACTUAL_VIEWER_READ_FAILED_NO_RESTART'}
 . (Join-Path $PSScriptRoot 'raw-log-task-policy.ps1')
 foreach($name in @('HDWork2-Web','HDWork2-LiveChat-Courier')){SetRawLogNoFailureRestart -TaskName $name}
 $after=CheckRunning
 foreach($key in @('webPid','nodePid','pythonPid','ownerPid')){if($before[$key] -ne $after[$key]){throw 'PID_CHANGED_DURING_FINALIZATION'}}
 $null=Engine 'verify' ($base+@{applied=$true})
 $null=Engine 'mark' ($base+@{event='ACTIVE'})
 [pscustomobject]@{Status='RAW_LOG_ACTIVE';Web='READY';Courier='READY';SingleOwnedCourier=$true;ViewerRead='PASS';ServicesRestarted=$false;RuntimePinsChanged=$false;AutomaticTaskRetries='DISABLED';LogDirectory=$log;WebPid=$after.webPid;CourierNodePid=$after.nodePid;PythonPid=$after.pythonPid}|ConvertTo-Json
}catch{Write-Host 'FINALIZATION_STOPPED_NO_RESTART_NO_ROLLBACK';throw}finally{if($owned){$mutex.ReleaseMutex()};$mutex.Dispose()}
