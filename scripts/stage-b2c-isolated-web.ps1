# Preparation only. Creates a private web snapshot; never starts or repoints a task.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ManifestSha256,
 [Parameter(Mandatory=$true)][string]$ExpectedBaselineIndexSha256,
 [Parameter(Mandatory=$true)][string]$ExpectedCourierConfigSha256
)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'WINDOWS_STAGE_REQUIRED' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node = (Get-Command node.exe -ErrorAction Stop).Source
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'ADMINISTRATOR_STAGE_REQUIRED' }
foreach ($digest in @($ManifestSha256,$ExpectedBaselineIndexSha256,$ExpectedCourierConfigSha256)) {
 if ($digest -notmatch '^[a-f0-9]{64}$') { throw 'EXPECTED_SHA256_REQUIRED' }
}
$inspectionText = & (Join-Path $PSScriptRoot 'inspect-b2c-windows-release.ps1') -CandidateRoot $root | Out-String
$inspection = $inspectionText | ConvertFrom-Json
if ($inspection.status -ne 'B2C_WINDOWS_READ_ONLY_INSPECTION' -or $inspection.frontend.indexSha256 -ne $ExpectedBaselineIndexSha256 -or $inspection.courierConfigSha256 -ne $ExpectedCourierConfigSha256) { throw 'INSPECTION_BASELINE_CHANGED' }
foreach ($blocker in $inspection.blockers) { if ($blocker -ne 'IN_PLACE_WEB_UPDATE_WOULD_BREAK_COURIER_PINS') { throw ('STAGE_REVIEW_REQUIRED_'+$blocker) } }
$taskBefore = Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
if (@($taskBefore.Actions).Count -ne 1 -or $taskBefore.Actions[0].WorkingDirectory -ne $inspection.runtimeRoot -or -not $taskBefore.Actions[0].Arguments.Contains((Join-Path $inspection.runtimeRoot 'scripts\run-protected-web.ps1'))) { throw 'WEB_TASK_CHANGED_BEFORE_BACKUP' }
$previousTaskXml = Export-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
$taskAfter = Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
if (@($taskAfter.Actions).Count -ne 1 -or $taskAfter.Actions[0].Execute -cne $taskBefore.Actions[0].Execute -or $taskAfter.Actions[0].Arguments -cne $taskBefore.Actions[0].Arguments -or $taskAfter.Actions[0].WorkingDirectory -cne $taskBefore.Actions[0].WorkingDirectory -or $taskAfter.Principal.UserId -cne $taskBefore.Principal.UserId) { throw 'WEB_TASK_CHANGED_DURING_BACKUP' }
$target = Join-Path 'C:\ProgramData' ('HDWork2WebB2C-'+[Guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $target) { throw 'NEW_STAGE_DIRECTORY_REQUIRED' }
[void][IO.Directory]::CreateDirectory($target)
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
foreach ($sid in @($identity.User.Value,'S-1-5-18','S-1-5-32-544','S-1-5-19')) {
 $rights = if ($sid -eq 'S-1-5-19') { 'ReadAndExecute' } else { 'FullControl' }
 $rule = [Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),$rights,'ContainerInherit,ObjectInherit','None','Allow')
 [void]$acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $target -AclObject $acl
$state = Join-Path $target 'service\state'
[void][IO.Directory]::CreateDirectory($state)
$stateAcl = Get-Acl -LiteralPath $state
[void]$stateAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-19'),'Modify','ContainerInherit,ObjectInherit','None','Allow'))
Set-Acl -LiteralPath $state -AclObject $stateAcl
Write-Host "STAGED_RUNTIME_DIRECTORY=$target"
$payload = @{
 candidateRoot=$root
 runtimeRoot=$inspection.runtimeRoot
 courierConfig=$inspection.courierConfig
 configSha256=$ExpectedCourierConfigSha256
 ownerSid=$identity.User.Value
 webProcessVerified=$true
 stageRoot=$target
 manifestSha256=$ManifestSha256
 baselineIndexSha256=$ExpectedBaselineIndexSha256
 webTaskXml=[string]$previousTaskXml
} | ConvertTo-Json -Compress
$payload | & $node (Join-Path $PSScriptRoot 'stage-b2c-isolated-web.js')
if ($LASTEXITCODE -ne 0) { throw 'B2C_STAGE_FAILED_NOT_ACTIVATED_PRESERVE_DIRECTORY' }
