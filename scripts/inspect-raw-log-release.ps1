# Read-only Windows host preflight; no DPAPI unwrap, DB, task control or logging installation.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
if([Environment]::OSVersion.Platform -ne 'Win32NT'){throw 'WINDOWS_REQUIRED'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'EXISTING_ELEVATED_DPAPI_OWNER_REQUIRED'}
$web=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
$courier=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'
if(@($web.Actions).Count -ne 1 -or @($courier.Actions).Count -ne 1 -or [string]$web.State -ne 'Running' -or [string]$courier.State -ne 'Running'){throw 'EXISTING_RUNNING_SINGLE_TASKS_REQUIRED'}
$root=[string]$web.Actions[0].WorkingDirectory
if(-not $root -or -not $web.Actions[0].Arguments.Contains((Join-Path $root 'scripts\run-protected-web.ps1'))){throw 'WEB_TASK_RUNTIME_NOT_VERIFIED'}
$configMatch=[regex]::Match([string]$courier.Actions[0].Arguments,'(?i)(?:^|\s)-Config\s+"([^"]+)"(?=\s|$)')
$hashMatch=[regex]::Match([string]$courier.Actions[0].Arguments,'(?i)(?:^|\s)-ConfigSha256\s+([a-f0-9]{64})(?=\s|$)')
if(-not $configMatch.Success -or -not $hashMatch.Success){throw 'PINNED_COURIER_ACTION_REQUIRED'}
function ResolveSid([string]$Value){if($Value -match '^S-1-'){return $Value};return (New-Object Security.Principal.NTAccount($Value)).Translate([Security.Principal.SecurityIdentifier]).Value}
if((ResolveSid ([string]$courier.Principal.UserId)) -ne $identity.User.Value -or (ResolveSid ([string]$web.Principal.UserId)) -ne 'S-1-5-19'){throw 'EXISTING_TASK_IDENTITIES_REQUIRED'}
$config=$configMatch.Groups[1].Value
$state=Get-Content -LiteralPath (Join-Path $root 'service/state/state.json') -Raw|ConvertFrom-Json
$cs=Get-Content -LiteralPath (Join-Path (Split-Path -Parent $config) 'state.json') -Raw|ConvertFrom-Json
if($state.status -ne 'READY' -or $state.readOnly -or -not $state.pools.read -or -not $state.pools.write -or $cs.status -ne 'READY' -or [DateTimeOffset]::Parse($cs.updatedAt) -lt [DateTimeOffset]::UtcNow.AddSeconds(-30)){throw 'FRESH_HEALTHY_BASELINE_REQUIRED'}
$w=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.pid)"
$n=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$cs.nodePid)"
$py=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$cs.pythonPid)"
if(-not $w -or -not $n -or -not $py -or $w.Name -ne 'node.exe' -or $n.Name -ne 'node.exe' -or $py.Name -notmatch '^python(?:w)?\.exe$' -or $py.ParentProcessId -ne $n.ProcessId -or -not $w.CommandLine.Contains((Join-Path $root 'scripts/protected-web-service.js')) -or -not $n.CommandLine.Contains($config)){throw 'OWNED_WEB_AND_SINGLE_COURIER_PROCESSES_REQUIRED'}
foreach($pair in @(@($w,'S-1-5-19'),@($n,$identity.User.Value),@($py,$identity.User.Value))){$owner=Invoke-CimMethod -InputObject $pair[0] -MethodName GetOwnerSid;if($owner.ReturnValue -ne 0 -or $owner.Sid -ne $pair[1]){throw 'PROCESS_OWNER_CHANGED'}}
$log='C:\ProgramData\HDWork2\Logs'
$aclInfo=@{checked=$true;exists=(Test-Path -LiteralPath $log);reparsePoint=$false;ownerCanWrite=$false;localServiceCanWrite=$false;broadWritePresent=$false}
if($aclInfo.exists){
 $aclInfo.reparsePoint=[bool]((Get-Item -LiteralPath $log -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)
 $acl=Get-Acl -LiteralPath $log
 foreach($rule in $acl.Access){
  $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
  $writes=([int]$rule.FileSystemRights -band [int][Security.AccessControl.FileSystemRights]::Write) -ne 0
  if($writes -and $rule.AccessControlType -eq 'Allow'){
   if($sid -eq $identity.User.Value){$aclInfo.ownerCanWrite=$true}
   if($sid -eq 'S-1-5-19'){$aclInfo.localServiceCanWrite=$true}
   if($sid -in @('S-1-1-0','S-1-5-11','S-1-5-32-545')){$aclInfo.broadWritePresent=$true}
  }
 }
}
# Advisory ACL summary, not a full Windows effective-access calculation (deny/group rules need review).
$inputValue=@{repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));webRuntime=$root;courierConfig=$config;configSha256=$hashMatch.Groups[1].Value.ToLowerInvariant();ownerSid=$identity.User.Value;processesVerified=$true;logAcl=$aclInfo}
$inputValue|ConvertTo-Json -Depth 8 -Compress|& (Get-Command node.exe).Source (Join-Path $PSScriptRoot 'inspect-raw-log-release.js')
if($LASTEXITCODE -ne 0){throw 'RAW_LOG_READ_ONLY_PREFLIGHT_FAILED_NO_CHANGES'}
