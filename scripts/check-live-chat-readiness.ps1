# Approved read-only metadata probe. No service control, SQL writes or config changes.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Review,[switch]$ApprovedReadOnly)
$ErrorActionPreference='Stop'
if(-not $ApprovedReadOnly){throw 'EXPLICIT_READ_ONLY_APPROVAL_REQUIRED'}
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ADMINISTRATOR_REQUIRED_OPEN_ELEVATED_POWERSHELL'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$deployment=Get-Content -LiteralPath (Join-Path $root '.local/protected-web-deployment.json') -Raw|ConvertFrom-Json
$snapshot=[IO.Path]::GetFullPath($deployment.snapshot)
$reviewPath=(Resolve-Path -LiteralPath $Review).Path
# Confirm the review still corresponds to the active environment before consuming protected credentials.
$expected=Get-Content -LiteralPath $reviewPath -Raw|ConvertFrom-Json
if($expected.status -ne 'REVIEW_ONLY_NOT_ACTIVATED'){throw 'REVIEW_REQUIRED'}
if($expected.environmentSha256 -notmatch '^[a-f0-9]{64}$'){throw 'INVALID_REVIEW_ENVIRONMENT_HASH'}
$environmentBytes=$null;$hasher=$null
try{
 $environmentBytes=[IO.File]::ReadAllBytes((Join-Path $snapshot 'service/environment.json'))
 $hasher=[Security.Cryptography.SHA256]::Create()
 $actualHash=[BitConverter]::ToString($hasher.ComputeHash($environmentBytes)).Replace('-','').ToLowerInvariant()
}catch{
 $failure=$_.Exception.GetBaseException()
 if($failure -is [UnauthorizedAccessException] -or $failure -is [Security.SecurityException]){throw 'ENVIRONMENT_ACCESS_DENIED_USE_AUTHORIZED_ADMIN_CONTEXT'}
 if($failure -is [IO.FileNotFoundException] -or $failure -is [IO.DirectoryNotFoundException]){throw 'ENVIRONMENT_PATH_NOT_FOUND'}
 throw 'ENVIRONMENT_HASH_CHECK_FAILED'
}finally{
 if($hasher){$hasher.Dispose()}
 if($environmentBytes){[Array]::Clear($environmentBytes,0,$environmentBytes.Length)}
}
if($actualHash -ne $expected.environmentSha256){throw 'ENVIRONMENT_CHANGED_PREPARE_AGAIN'}
$plain=$null;$bundle=$null;$transfer=$null;$child=$null
try{
 Add-Type -AssemblyName System.Security
 $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $snapshot 'service/secrets.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
 $bundle=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json
 [Array]::Clear($plain,0,$plain.Length);$plain=$null
 if(-not $bundle.readPassword -or -not $bundle.writePassword){throw 'EXISTING_READER_WRITER_CREDENTIALS_REQUIRED'}
 # Only the two existing DB credentials are passed through private stdin; no token/signing secret is forwarded.
 $transfer=@{readPassword=$bundle.readPassword;writePassword=$bundle.writePassword}|ConvertTo-Json -Compress
 $bundle=$null
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=(Get-Command node.exe).Source
 $engine=Join-Path $root 'scripts/check-live-chat-readiness.js'
 if($snapshot.Contains('"') -or $reviewPath.Contains('"')){throw 'PATH_REJECTED'}
 $info.Arguments='"'+$engine+'" --approved-read-only --snapshot "'+$snapshot+'" --review "'+$reviewPath+'"'
 $info.WorkingDirectory=$root;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear()
 foreach($key in @('SystemRoot','PATH','TEMP','TMP')){if([Environment]::GetEnvironmentVariable($key)){$info.EnvironmentVariables[$key]=[Environment]::GetEnvironmentVariable($key)}}
 $child=[Diagnostics.Process]::Start($info)
 $output=$child.StandardOutput.ReadToEndAsync();$errors=$child.StandardError.ReadToEndAsync()
 $child.StandardInput.WriteLine($transfer);$child.StandardInput.Flush();$child.StandardInput.Close();$transfer=$null
 if(-not $child.WaitForExit(60000)){$child.Kill();throw 'OWNED_DIAGNOSTIC_TIMEOUT'}
 $text=$output.Result;$safeCode=$errors.Result.Trim()
 if($child.ExitCode -ne 0){if($safeCode -match '^[A-Z0-9_]+$'){throw $safeCode};throw 'LIVE_CHAT_READ_ONLY_CHECK_FAILED'}
 $report=$text|ConvertFrom-Json
 if($report.writesPerformed -ne $false -or $report.orderRowsRead -ne $false -or $report.telegramAccessed -ne $false){throw 'UNEXPECTED_PROBE_OUTPUT'}
 Write-Output $text
}finally{
 if($plain){[Array]::Clear($plain,0,$plain.Length)}
 $bundle=$null;$transfer=$null
 if($child){try{$child.StandardInput.Close();if(-not $child.HasExited){$child.Kill()}}catch{};$child.Dispose()}
}
