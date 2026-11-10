# Resume only the failed read-only mapping backup; reuse the verified release packet.
[CmdletBinding()]
param(
 [string]$Directory='C:\ProgramData\HDWork2SharedGroups-d9252dccb37d4cc383a644c3b1ba44f0',
 [string]$ReleasePlanSha256='17c858079bb10c54bff4474a3bf5bc437f5e013fb06b7b5357b512eadd729674',
 [switch]$VerifyMigrationOnly
)
$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ELEVATED_EXISTING_DPAPI_OWNER_REQUIRED'}
$root=Split-Path -Parent $PSScriptRoot;$node=(Get-Command node.exe -ErrorAction Stop).Source
$planFile=Join-Path $Directory 'release.review.json'
if((Get-FileHash -LiteralPath $planFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ReleasePlanSha256){throw 'VERIFIED_RELEASE_PLAN_CHANGED'}
$plan=Get-Content -LiteralPath $planFile -Raw|ConvertFrom-Json
if($plan.ownerSid -ne $identity.User.Value -or $plan.release -ne '827bb86c83ae5b6edd8f0e8f601df2e4cd00207a' -or -not $plan.backupComplete){throw 'APPROVED_RELEASE_AND_OWNER_REQUIRED'}
if(-not $VerifyMigrationOnly){foreach($file in @('mapping-backup.json','mapping-backup.report.json','migration-014.native.review.sql')){if(Test-Path -LiteralPath (Join-Path $Directory $file)){throw 'MAPPING_BACKUP_ARTIFACT_ALREADY_EXISTS_DO_NOT_OVERWRITE'}}}
# Revalidate all pinned active runtime/configuration bytes before reading the existing credential.
Push-Location $root
try{
 & $node -e "const fs=require('node:fs'),path=require('node:path');const p=JSON.parse(fs.readFileSync(path.join(process.argv[1],'release.review.json')));require('./scripts/courier-task-runner').configuration(path.join(p.autostart,'config.json'),p.configSha256);" $Directory
 if($LASTEXITCODE -ne 0){throw 'PINNED_RUNTIME_CHANGED_STOPPED'}
}finally{Pop-Location}
$plain=$null;$bundle=$null;$transfer=$null;$child=$null
try{
 Add-Type -AssemblyName System.Security
 $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $plan.snapshot 'service/secrets.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
 $bundle=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json
 [Array]::Clear($plain,0,$plain.Length);$plain=$null
 if(-not $bundle.readPassword){throw 'NATIVE_READER_CREDENTIAL_UNAVAILABLE'}
 $transfer=@{readPassword=$bundle.readPassword}|ConvertTo-Json -Compress;$bundle=$null
 $engine=Join-Path $PSScriptRoot 'backup-shared-group-metadata.js'
 if($Directory.Contains('"') -or $engine.Contains('"')){throw 'PATH_REJECTED'}
 $info=New-Object Diagnostics.ProcessStartInfo
 $argumentMode=if($VerifyMigrationOnly){'--verify-migration-directory'}else{'--release-directory'}
 $info.FileName=$node;$info.Arguments='"'+$engine+'" '+$argumentMode+' "'+$Directory+'"';$info.WorkingDirectory=$root
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear()
 foreach($key in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP')){$v=[Environment]::GetEnvironmentVariable($key);if($v){$info.EnvironmentVariables[$key]=$v}}
 $child=[Diagnostics.Process]::Start($info)
 $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
 $child.StandardInput.WriteLine($transfer);$child.StandardInput.Close();$transfer=$null
 if(-not $child.WaitForExit(45000)){$child.Kill();throw 'OWNED_NATIVE_BACKUP_TIMEOUT'}
 if($child.ExitCode -ne 0){Write-Output $stderr.Result;throw 'NATIVE_MAPPING_BACKUP_FAILED_RUNTIME_UNCHANGED'}
 Write-Output $stdout.Result
 [pscustomobject]@{Status=$(if($VerifyMigrationOnly){'MIGRATION014_VERIFIED_RUNTIME_UNCHANGED'}else{'SHARED_RELEASE_AND_MAPPING_BACKUP_READY_NOT_DEPLOYED'});Directory=$Directory;RuntimeChanged=$false;AutostartChanged=$false;MigrationAppliedByThisCommand=$false;Migration014=$(if($VerifyMigrationOnly){'VERIFIED'}else{'PENDING'});TelegramAccessed=$false}|ConvertTo-Json
}finally{
 $transfer=$null;$bundle=$null;if($plain){[Array]::Clear($plain,0,$plain.Length)}
 if($child){try{if(-not $child.HasExited){$child.Kill()}}finally{$child.Dispose()}}
}
