# Read-only runtime inspection. Optional native-reader metadata via existing protected bundle/stdin.
[CmdletBinding()]
param([string]$CandidateRoot = (Join-Path $PSScriptRoot '..'), [switch]$ReadDatabaseMetadata)
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
}
$engine = Join-Path $PSScriptRoot 'inspect-universal-b2c-release.js'
$inputMetadata | ConvertTo-Json -Compress | & $node $engine --runtime
if ($LASTEXITCODE -ne 0) { throw 'UNIVERSAL_RUNTIME_INSPECTION_FAILED_NO_CHANGES' }
if (-not $ReadDatabaseMetadata) { return }
$courierState=Get-Content -LiteralPath (Join-Path (Split-Path -Parent $inputMetadata.courierConfig) 'state.json') -Raw|ConvertFrom-Json
$courierNode=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$courierState.nodePid)"
$courierPython=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$courierState.pythonPid)"
if ([string]$courier.State -ne 'Running' -or $courierState.status -ne 'READY' -or [DateTimeOffset]::Parse($courierState.updatedAt) -lt [DateTimeOffset]::UtcNow.AddSeconds(-30) -or -not $courierNode -or -not $courierPython -or $courierNode.Name -ne 'node.exe' -or $courierPython.ParentProcessId -ne $courierNode.ProcessId -or -not $courierNode.CommandLine -or -not $courierNode.CommandLine.Contains([string]$inputMetadata.courierConfig)) { throw 'COURIER_PROCESS_NOT_READY' }
$courierOwner=Invoke-CimMethod -InputObject $courierNode -MethodName GetOwnerSid
if ($courierOwner.ReturnValue -ne 0 -or $courierOwner.Sid -ne $identity.User.Value) { throw 'COURIER_PROCESS_OWNER_CHANGED' }
$inputMetadata.courierProcess=@{nodePid=[int]$courierNode.ProcessId;pythonPid=[int]$courierPython.ProcessId;nodeStarted=[string]$courierNode.CreationDate;pythonStarted=[string]$courierPython.CreationDate;ready=$true}
# Same existing machine-DPAPI bundle and owned-stdin transfer as the read-only backup helper.
$plain=$null;$bundle=$null;$transfer=$null;$child=$null
try {
 Add-Type -AssemblyName System.Security
 $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $runtimeRoot 'service/secrets.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
 $bundle=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json
 [Array]::Clear($plain,0,$plain.Length);$plain=$null
 if (-not $bundle.readPassword) { throw 'EXISTING_NATIVE_READ_CREDENTIAL_UNAVAILABLE' }
 $inputMetadata.readPassword=$bundle.readPassword;$bundle=$null
 $transfer=$inputMetadata|ConvertTo-Json -Compress
 $inputMetadata.Remove('readPassword')
 if ($engine.Contains('"')) { throw 'ENGINE_PATH_REJECTED' }
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$node;$info.Arguments='"'+$engine+'" --schema';$info.WorkingDirectory=$CandidateRoot
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear()
 foreach($key in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP')) { $v=[Environment]::GetEnvironmentVariable($key);if($v){$info.EnvironmentVariables[$key]=$v} }
 $child=[Diagnostics.Process]::Start($info)
 $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
 $child.StandardInput.WriteLine($transfer);$child.StandardInput.Close();$transfer=$null
 if (-not $child.WaitForExit(55000)) { $child.Kill();throw 'OWNED_INSPECTION_TIMEOUT' }
 if ($child.ExitCode -ne 0) { Write-Output $stderr.Result;throw 'NATIVE_READ_ONLY_COMPATIBILITY_FAILED' }
 Write-Output $stdout.Result
} finally {
 $inputMetadata.Remove('readPassword');$transfer=$null;$bundle=$null
 if($plain){[Array]::Clear($plain,0,$plain.Length)}
 if($child){try{if(-not $child.HasExited){$child.Kill()}}finally{$child.Dispose()}}
}
