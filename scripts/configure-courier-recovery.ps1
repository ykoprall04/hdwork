# Offline plan by default. Apply only during a later approved, stopped handoff.
[CmdletBinding()]
param([ValidateSet('Plan','Apply')][string]$Mode='Plan',[Parameter(Mandatory=$true)][string]$ControlConfig,[Parameter(Mandatory=$true)][string]$ConfigSha256)
$ErrorActionPreference='Stop'
if($ConfigSha256 -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $ControlConfig -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ConfigSha256){throw 'RECOVERY_CONFIG_PIN_REJECTED'}
$cfg=Get-Content -LiteralPath $ControlConfig -Raw|ConvertFrom-Json
if($cfg.kind -cne 'HDWORK2_NATIVE_SUPERVISOR' -or $cfg.taskName -notmatch '^(HDWork2-LiveChat-Courier|HDWork2-CourierFixture-[a-f0-9]{32})$' -or $cfg.recovery.enabled -ne $true -or -not $cfg.launcherScript){throw 'RECOVERY_SCOPE_REJECTED'}
$policy=Get-Content (Join-Path $PSScriptRoot '../contracts/courier-startup-recovery.json') -Raw|ConvertFrom-Json
if($Mode -eq 'Plan'){@{status='PLAN_ONLY';restartCount=$policy.taskRestartCount;intervalSeconds=$policy.taskRestartIntervalSeconds;multipleInstances='IgnoreNew';bootDelaySeconds=120;periodicMinutes=5;requiresNonInteractiveValidation=$true;productionChanged=$false}|ConvertTo-Json -Compress;return}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if($identity.User.Value -cne $cfg.ownerSid -or -not(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'RECOVERY_OPERATOR_REJECTED'}
$task=Get-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName
if($task.Settings.Enabled -or [string]$task.State -ne 'Disabled'){throw 'RECOVERY_STOPPED_DISABLED_TASK_REQUIRED'}
if([string]$task.Principal.LogonType -notin @('Password','ServiceAccount')){throw 'RECOVERY_NONINTERACTIVE_ACCOUNT_VALIDATION_REQUIRED'}
$a=$cfg.childArguments
if($a.Count -ne 5 -or $a[0] -cne $cfg.childCodeFile -or $a[1] -cne '--config' -or $a[3] -cne '--config-sha256' -or $a[4] -notmatch '^[a-f0-9]{64}$'){throw 'RECOVERY_RUNTIME_BINDING_REJECTED'}
$expected='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$cfg.launcherScript+'" -Config "'+$a[2]+'" -ConfigSha256 '+$a[4]+' -ControlConfig "'+$ControlConfig+'" -ControlConfigSha256 '+$ConfigSha256+' -Recovery'
$exe=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
if(@($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -ine $exe -or $task.Actions[0].Arguments -cne $expected){throw 'RECOVERY_TASK_ACTION_REJECTED'}
$taskOwner=[string]$task.Principal.UserId
if($taskOwner -notmatch '^S-1-'){$taskOwner=(New-Object Security.Principal.NTAccount($taskOwner)).Translate([Security.Principal.SecurityIdentifier]).Value}
if($taskOwner -cne $cfg.ownerSid -or (Get-FileHash -LiteralPath $cfg.launcherScript -Algorithm SHA256).Hash.ToLowerInvariant() -cne $cfg.launcherSha256){throw 'RECOVERY_TASK_OWNER_OR_LAUNCHER_REJECTED'}
if(Test-Path -LiteralPath $cfg.stateFile){
 $s=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json
 foreach($id in @($s.ownerPid,$s.childPid)){if($id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)){throw 'RECOVERY_PROCESS_STILL_ALIVE'}}
 if($s.childPid -and @(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+[int]$s.childPid)).Count){throw 'RECOVERY_DESCENDANT_STILL_ALIVE'}
}
$settings=$task.Settings
$settings.MultipleInstances=2 # TASK_INSTANCES_IGNORE_NEW
$settings.RestartCount=[int]$policy.taskRestartCount
$settings.RestartInterval='PT'+[int]$policy.taskRestartIntervalSeconds+'S'
$settings.StartWhenAvailable=$true
$settings.ExecutionTimeLimit='PT0S'
$settings.StopIfGoingOnBatteries=$false
$settings.DisallowStartIfOnBatteries=$false
$boot=New-ScheduledTaskTrigger -AtStartup
$boot.Delay='PT2M'
$periodic=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)
Set-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName -Settings $settings -Trigger @($boot,$periodic)|Out-Null
$actual=Get-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName
if($actual.Settings.RestartCount -ne $policy.taskRestartCount -or [System.Xml.XmlConvert]::ToTimeSpan($actual.Settings.RestartInterval).TotalSeconds -ne $policy.taskRestartIntervalSeconds -or [string]$actual.Settings.MultipleInstances -notin @('2','IgnoreNew')){throw 'RECOVERY_TASK_READBACK_FAILED'}
$xml=[xml](Export-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName)
$bootNode=$xml.SelectSingleNode("//*[local-name()='BootTrigger']/*[local-name()='Delay']")
$interval=$xml.SelectSingleNode("//*[local-name()='TimeTrigger']/*[local-name()='Repetition']/*[local-name()='Interval']")
if(-not $bootNode -or $bootNode.InnerText -ne 'PT2M' -or -not $interval -or $interval.InnerText -ne 'PT5M'){throw 'RECOVERY_TRIGGER_READBACK_FAILED'}
@{status='POLICY_INSTALLED_NOT_STARTED' ;restartCount=$policy.taskRestartCount;multipleInstances='IgnoreNew'}|ConvertTo-Json -Compress
