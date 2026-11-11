# Read-only Windows handoff. Does not manage tasks/services, unwrap DPAPI or access SQL.
[CmdletBinding()]
param([string]$CandidateRoot = (Join-Path $PSScriptRoot '..'))
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'WINDOWS_INSPECTION_REQUIRED' }
$CandidateRoot = (Resolve-Path -LiteralPath $CandidateRoot).Path
$node = (Get-Command node.exe -ErrorAction Stop).Source
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'ADMINISTRATOR_INSPECTION_REQUIRED' }
$web = Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
$courier = Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'
if (@($web.Actions).Count -ne 1 -or @($courier.Actions).Count -ne 1) { throw 'SINGLE_TASK_ACTION_REQUIRED' }
$runtimeRoot = [string]$web.Actions[0].WorkingDirectory
if (-not $runtimeRoot -or -not $web.Actions[0].Arguments.Contains((Join-Path $runtimeRoot 'scripts\run-protected-web.ps1'))) { throw 'WEB_TASK_RUNTIME_NOT_VERIFIED' }
$state = Get-Content -LiteralPath (Join-Path $runtimeRoot 'service\state\state.json') -Raw | ConvertFrom-Json
$webProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.pid)"
if ($state.status -ne 'READY' -or $state.readOnly -or -not $state.pools.read -or -not $state.pools.write -or -not $webProcess -or $webProcess.Name -ne 'node.exe' -or -not $webProcess.CommandLine -or -not $webProcess.CommandLine.Contains((Join-Path $runtimeRoot 'scripts\protected-web-service.js'))) { throw 'WEB_PROCESS_NOT_READY_OR_NOT_OWNED' }
$processOwner = Invoke-CimMethod -InputObject $webProcess -MethodName GetOwnerSid
if ($processOwner.ReturnValue -ne 0 -or $processOwner.Sid -ne 'S-1-5-19') { throw 'WEB_PROCESS_LOCALSERVICE_REQUIRED' }
$configMatch = [regex]::Match([string]$courier.Actions[0].Arguments, '(?i)(?:^|\s)-Config\s+"([^"]+)"(?=\s|$)')
$hashMatch = [regex]::Match([string]$courier.Actions[0].Arguments, '(?i)(?:^|\s)-ConfigSha256\s+([a-f0-9]{64})(?=\s|$)')
if (-not $configMatch.Success -or -not $hashMatch.Success) { throw 'EXISTING_COURIER_CONFIG_ARGUMENTS_REQUIRED' }
$owner = [string]$courier.Principal.UserId
if ($owner -notmatch '^S-1-') { $owner = (New-Object Security.Principal.NTAccount($owner)).Translate([Security.Principal.SecurityIdentifier]).Value }
if ($owner -ne $identity.User.Value) { throw 'EXISTING_COURIER_OWNER_ACCOUNT_REQUIRED' }
$inputMetadata = @{
    candidateRoot = $CandidateRoot
    runtimeRoot = $runtimeRoot
    courierConfig = $configMatch.Groups[1].Value
    configSha256 = $hashMatch.Groups[1].Value.ToLowerInvariant()
    ownerSid = $identity.User.Value
    webProcessVerified = $true
} | ConvertTo-Json -Compress
$inputMetadata | & $node (Join-Path $PSScriptRoot 'inspect-b2c-windows-release.js')
if ($LASTEXITCODE -ne 0) { throw 'B2C_READ_ONLY_INSPECTION_FAILED' }
