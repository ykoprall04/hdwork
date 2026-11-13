# Read-only. This script cannot stop an owner or certify transaction drain.
[CmdletBinding()]
param([string]$TaskName='HDWork2-Web')
$ErrorActionPreference='Stop'
if($TaskName -notin @('HDWork2-Web','HDWork2-Web-Standby','HDWork2-Web-Rollback')){throw 'WEB_TASK_SCOPE_REJECTED'}
$task=Get-ScheduledTask -TaskName $TaskName -TaskPath '\'
if(@($task.Actions).Count -ne 1){throw 'WEB_TASK_ACTION_REJECTED'}
$arguments=[string]$task.Actions[0].Arguments
$native=$arguments -match '-ControlConfig\s+"([^"]+)"\s+-ConfigSha256\s+([a-f0-9]{64})'
$configFile=if($native){$Matches[1]}else{$null};$pin=if($native){$Matches[2]}else{$null}
$report=@{kind='HDWORK2_WEB_RETIREMENT_INSPECTION';checkedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');taskName=$TaskName;state=[string]$task.State;priority=$task.Settings.Priority;cooperativeBindingPresent=[bool]$native;drainVerified=$false;productionChanged=$false;gate='BLOCKED_LEGACY_OWNER_NO_EXTERNAL_STOP'}
if($native){
 if((Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin){throw 'WEB_CONFIG_PIN_CHANGED'}
 $report.controlConfig=$configFile;$report.configSha256=$pin;$report.gate='REQUIRES_NATIVE_INSPECT_AND_FRESH_DRAIN_RECEIPT'
}
$report|ConvertTo-Json -Depth 4
if(-not $native){exit 2}
