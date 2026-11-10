# Approved preparation: static build, private verified backups and native READ-ONLY metadata.
# Does not stop/start tasks, alter databases or contact Telegram.
[CmdletBinding()]
param(
 [string]$AutostartDirectory='C:\ProgramData\HDWork2CourierAutostart-e119dcbb14804568a245acb506f2f5e7',
 [string]$CurrentConfigSha256='d65e9eb1005953ebd26a9c6f2bec528f20fca663c155def56d6a63f17d45cb45'
)
$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ELEVATED_EXISTING_DPAPI_OWNER_REQUIRED'}
$root=Split-Path -Parent $PSScriptRoot
$node=(Get-Command node.exe -ErrorAction Stop).Source
$configFile=Join-Path $AutostartDirectory 'config.json'
if((Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $CurrentConfigSha256){throw 'APPROVED_AUTOSTART_CONFIG_CHANGED'}
$cfg=Get-Content -LiteralPath $configFile -Raw|ConvertFrom-Json
if($cfg.ownerSid -ne $identity.User.Value){throw 'DPAPI_OWNER_MISMATCH'}
$statusText=& (Join-Path $PSScriptRoot 'install-live-chat-autostart.ps1') -Mode Status -Directory $AutostartDirectory
$status=$statusText|ConvertFrom-Json
if($status.Status -ne 'COURIER_AUTOSTART_READY' -or -not $status.Healthy){throw 'CURRENT_COURIER_NOT_HEALTHY_PREPARATION_STOPPED'}
$environment=Get-Content -LiteralPath (Join-Path $cfg.snapshot 'service/environment.json') -Raw|ConvertFrom-Json
$webTask=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'
if([string]$webTask.State -ne 'Running'){throw 'CURRENT_WEB_TASK_NOT_RUNNING'}
if(@($webTask.Actions).Count -ne 1 -or -not $webTask.Actions[0].Arguments.Contains($cfg.snapshot)){throw 'WEB_TASK_RUNTIME_IDENTITY_MISMATCH'}
$directory=Join-Path $env:ProgramData ('HDWork2SharedGroups-'+[Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $directory)
$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @('S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))}
Set-Acl -LiteralPath $directory -AclObject $acl
Export-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'|Set-Content -LiteralPath (Join-Path $directory 'previous-courier-task.xml') -Encoding Unicode
# The immutable application source remains 827bb86 even when management scripts have newer commits.
& git -C $root diff --quiet '827bb86c83ae5b6edd8f0e8f601df2e4cd00207a' -- frontend scripts/build-operational-frontend.js scripts/frontend-only-release.js
if($LASTEXITCODE -ne 0){throw 'FRONTEND_SOURCE_DIFFERS_FROM_APPROVED_RELEASE'}
$priorApi=[Environment]::GetEnvironmentVariable('VITE_API_BASE_URL','Process')
try{
 $env:VITE_API_BASE_URL=$environment.HDWORK2_PUBLIC_ORIGIN
 Push-Location $root
 try{& npm.cmd run build:operational;if($LASTEXITCODE -ne 0){throw 'PRODUCTION_FRONTEND_BUILD_FAILED'}}finally{Pop-Location}
}finally{[Environment]::SetEnvironmentVariable('VITE_API_BASE_URL',$priorApi,'Process')}
$build=Join-Path $root 'frontend/dist'
$manifest=(Get-FileHash -LiteralPath (Join-Path $build 'release-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
& $node (Join-Path $PSScriptRoot 'prepare-shared-groups-release.js') --autostart $AutostartDirectory --config-sha256 $CurrentConfigSha256 --output $directory --build $build --manifest-sha256 $manifest --owner-sid $identity.User.Value
if($LASTEXITCODE -ne 0){throw 'RELEASE_PREPARATION_FAILED_RUNTIME_UNCHANGED'}
Export-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web'|Set-Content -LiteralPath (Join-Path $directory 'previous-web-task.xml') -Encoding Unicode
# Only the existing web READ credential crosses the private stdin pipe; never stdout/env/args/files.
$plain=$null;$bundle=$null;$transfer=$null;$child=$null
try{
 Add-Type -AssemblyName System.Security
 $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $cfg.snapshot 'service/secrets.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
 $bundle=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json
 [Array]::Clear($plain,0,$plain.Length);$plain=$null
 if(-not $bundle.readPassword){throw 'NATIVE_READER_CREDENTIAL_UNAVAILABLE'}
 $transfer=@{readPassword=$bundle.readPassword}|ConvertTo-Json -Compress;$bundle=$null
 $engine=Join-Path $PSScriptRoot 'backup-shared-group-metadata.js'
 if($directory.Contains('"') -or $engine.Contains('"')){throw 'PATH_REJECTED'}
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$node;$info.Arguments='"'+$engine+'" --release-directory "'+$directory+'"';$info.WorkingDirectory=$root
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear()
 foreach($key in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP')){$v=[Environment]::GetEnvironmentVariable($key);if($v){$info.EnvironmentVariables[$key]=$v}}
 $child=[Diagnostics.Process]::Start($info)
 $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
 $child.StandardInput.WriteLine($transfer);$child.StandardInput.Close();$transfer=$null
 if(-not $child.WaitForExit(45000)){$child.Kill();throw 'OWNED_NATIVE_BACKUP_TIMEOUT'}
 if($child.ExitCode -ne 0){Write-Output $stderr.Result;throw 'NATIVE_MAPPING_BACKUP_FAILED_RUNTIME_UNCHANGED'}
 Write-Output $stdout.Result
 [pscustomobject]@{Status='SHARED_RELEASE_AND_MAPPING_BACKUP_READY_NOT_DEPLOYED';Directory=$directory;Release='827bb86c83ae5b6edd8f0e8f601df2e4cd00207a';RuntimeChanged=$false;TasksChanged=$false;MigrationApplied=$false;TelegramAccessed=$false}|ConvertTo-Json
}finally{
 $transfer=$null;$bundle=$null;if($plain){[Array]::Clear($plain,0,$plain.Length)}
 if($child){try{if(-not $child.HasExited){$child.Kill()}}finally{$child.Dispose()}}
}
