# Preparation only: no service/task mutations, SQL writes, journal edits or activation.
[CmdletBinding()]
param([string]$GitRepository='D:\HDWork2-New',[string]$Directory)
$ErrorActionPreference='Stop'
if([Environment]::OSVersion.Platform -ne 'Win32NT'){throw 'WINDOWS_PREPARATION_REQUIRED'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ELEVATED_EXISTING_DPAPI_OWNER_REQUIRED'}
function Sid([string]$Value){if($Value -match '^S-1-'){return $Value};return (New-Object Security.Principal.NTAccount($Value)).Translate([Security.Principal.SecurityIdentifier]).Value}
function OwnedState {
 $wt=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web' -ErrorAction Stop
 $ct=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier' -ErrorAction Stop
 if(@($wt.Actions).Count -ne 1 -or @($ct.Actions).Count -ne 1 -or [string]$wt.State -ne 'Running' -or [string]$ct.State -ne 'Running' -or (Sid ([string]$wt.Principal.UserId)) -ne 'S-1-5-19' -or (Sid ([string]$ct.Principal.UserId)) -ne $identity.User.Value){throw 'EXISTING_READY_OWNED_TASKS_REQUIRED'}
 $web=[string]$wt.Actions[0].WorkingDirectory
 if(-not $web -or -not $wt.Actions[0].Arguments.Contains((Join-Path $web 'scripts\run-protected-web.ps1'))){throw 'WEB_RUNTIME_ACTION_MISMATCH'}
 $cm=[regex]::Match([string]$ct.Actions[0].Arguments,'(?i)(?:^|\s)-Config\s+"([^"]+)"(?=\s|$)');$hm=[regex]::Match([string]$ct.Actions[0].Arguments,'(?i)(?:^|\s)-ConfigSha256\s+([a-f0-9]{64})(?=\s|$)')
 if(-not $cm.Success -or -not $hm.Success){throw 'EXISTING_PINNED_CONFIG_REQUIRED'}
 $config=$cm.Groups[1].Value
 $ws=Get-Content -LiteralPath (Join-Path $web 'service/state/state.json') -Raw|ConvertFrom-Json
 $cs=Get-Content -LiteralPath (Join-Path (Split-Path -Parent $config) 'state.json') -Raw|ConvertFrom-Json
 $wp=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$ws.pid)";$np=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$cs.nodePid)";$py=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$cs.pythonPid)"
 if($ws.status -ne 'READY' -or $ws.readOnly -or -not $ws.pools.read -or -not $ws.pools.write -or $cs.status -ne 'READY' -or $cs.configSha256 -ne $hm.Groups[1].Value.ToLowerInvariant() -or [DateTimeOffset]::Parse($cs.updatedAt) -lt [DateTimeOffset]::UtcNow.AddSeconds(-30) -or -not $wp -or -not $np -or -not $py -or $wp.Name -ne 'node.exe' -or $np.Name -ne 'node.exe' -or $py.Name -notmatch '^python(?:w)?\.exe$' -or $py.ParentProcessId -ne $np.ProcessId -or -not $wp.CommandLine.Contains((Join-Path $web 'scripts/protected-web-service.js')) -or -not $np.CommandLine.Contains($config)){throw 'CURRENT_READY_PROCESS_PROOF_FAILED'}
 foreach($pair in @(@($wp,'S-1-5-19'),@($np,$identity.User.Value),@($py,$identity.User.Value))){$owner=Invoke-CimMethod -InputObject $pair[0] -MethodName GetOwnerSid;if($owner.ReturnValue -ne 0 -or $owner.Sid -ne $pair[1]){throw 'EXISTING_PROCESS_IDENTITY_MISMATCH'}}
 $nodes=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"|Where-Object {$_.CommandLine -and $_.CommandLine.Contains($config)});if($nodes.Count -ne 1){throw 'SINGLE_OWNED_COURIER_REQUIRED'}
 return @{webRuntime=$web;config=$config;configSha256=$hm.Groups[1].Value.ToLowerInvariant();ownerSid=$identity.User.Value;webPid=[int]$wp.ProcessId;nodePid=[int]$np.ProcessId;pythonPid=[int]$py.ProcessId}
}
$before=OwnedState
if(-not $Directory){$Directory='C:\ProgramData\HDWork2CourierV2Prep-'+[Guid]::NewGuid().ToString('N')}
$Directory=[IO.Path]::GetFullPath($Directory)
if($Directory -notmatch '^C:\\ProgramData\\HDWork2CourierV2Prep-[a-f0-9]{32}$' -or (Test-Path -LiteralPath $Directory)){throw 'NEW_PRIVATE_PREPARATION_DIRECTORY_REQUIRED'}
New-Item -ItemType Directory -Path $Directory|Out-Null
$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @($identity.User.Value,'S-1-5-32-544','S-1-5-18')){$rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)}
Set-Acl -LiteralPath $Directory -AclObject $acl
Write-Output ('PREPARATION_DIRECTORY='+$Directory)
$node=(Get-Command node.exe).Source;$engine=Join-Path $PSScriptRoot 'courier-v2-preparation.js'
$runtimeText=@{metadata=$before}|ConvertTo-Json -Compress|& $node $engine --runtime|Out-String
if($LASTEXITCODE -ne 0){Write-Host $runtimeText;throw 'BASELINE_READ_ONLY_CHECK_FAILED'}
$runtime=$runtimeText|ConvertFrom-Json;$before.frontend=$runtime.frontend;Write-Host $runtimeText
foreach($pair in @(@('HDWork2-Web','previous-web-task.xml'),@('HDWork2-LiveChat-Courier','previous-courier-task.xml'))){$xml=Export-ScheduledTask -TaskPath '\' -TaskName $pair[0] -ErrorAction Stop;[IO.File]::WriteAllText((Join-Path $Directory $pair[1]),$xml,[Text.Encoding]::Unicode)}
$backupDirectory=Join-Path $Directory 'journal-backup';New-Item -ItemType Directory -Path $backupDirectory|Out-Null
$backupText=& $runtime.pythonExecutable -B (Join-Path $PSScriptRoot 'backup-courier-v2-journal.py') --source $runtime.journalSource --destination (Join-Path $backupDirectory 'courier.sqlite3') --bot-id $runtime.botId|Out-String
if($LASTEXITCODE -ne 0){Write-Host $backupText;throw 'JOURNAL_BACKUP_OR_REHEARSAL_FAILED_NO_ACTIVATION'}
$journal=$backupText|ConvertFrom-Json
[IO.File]::WriteAllText((Join-Path $Directory 'journal-backup.report.json'),$backupText,[Text.Encoding]::UTF8)
Write-Host 'JOURNAL_ONLINE_BACKUP_INTEGRITY_AND_COPY_UPGRADE_PASS'
# ACL metadata only; actual access is also evidenced by files written by current service PIDs.
$log='C:\ProgramData\HDWork2\Logs';$logAcl=@{safe=$false;ownerWrite=$false;localServiceWrite=$false;broadWrite=$false;denyPresent=$false;currentWebLogPresent=$false;currentCourierLogPresent=$false}
if(Test-Path -LiteralPath $log){
 if((Get-Item -LiteralPath $log -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'LOG_DIRECTORY_LINK_REQUIRES_REVIEW'}
 foreach($rule in (Get-Acl -LiteralPath $log).Access){$sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($rule.AccessControlType -eq 'Deny'){$logAcl.denyPresent=$true};if($rule.AccessControlType -eq 'Allow' -and ([int]$rule.FileSystemRights -band [int][Security.AccessControl.FileSystemRights]::Write)){
  if($sid -eq $identity.User.Value){$logAcl.ownerWrite=$true};if($sid -eq 'S-1-5-19'){$logAcl.localServiceWrite=$true};if($sid -notin @($identity.User.Value,'S-1-5-19','S-1-5-18','S-1-5-32-544')){$logAcl.broadWrite=$true}
 }}
 $logAcl.currentWebLogPresent=@(Get-ChildItem -LiteralPath $log -Filter ('hdwork2-*-node-'+$before.webPid+'.jsonl')|Where-Object Length -gt 0).Count -gt 0
 $logAcl.currentCourierLogPresent=@(Get-ChildItem -LiteralPath $log -Filter ('hdwork2-*-python-'+$before.pythonPid+'.jsonl')|Where-Object Length -gt 0).Count -gt 0
 $logAcl.safe=$logAcl.ownerWrite -and $logAcl.localServiceWrite -and -not $logAcl.broadWrite -and -not $logAcl.denyPresent -and $logAcl.currentWebLogPresent -and $logAcl.currentCourierLogPresent
}
$before.logAcl=$logAcl
$envFile=Join-Path $before.webRuntime 'service/environment.json';$webEnvironment=Get-Content -LiteralPath $envFile -Raw|ConvertFrom-Json
$plain=$null;$bundle=$null;$transfer=$null;$child=$null
try{
 Add-Type -AssemblyName System.Security
 $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $before.webRuntime 'service/secrets.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
 $bundle=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json;[Array]::Clear($plain,0,$plain.Length);$plain=$null
 if(-not $bundle.readPassword -or -not $bundle.writePassword){throw 'EXISTING_NATIVE_AUDIT_CREDENTIALS_REQUIRED'}
 $value=@{root=$Directory;repo=$GitRepository;metadata=$before;journal=$journal;env=$webEnvironment;readPassword=$bundle.readPassword;writePassword=$bundle.writePassword}
 $transfer=$value|ConvertTo-Json -Depth 24 -Compress;$value.readPassword=$null;$value.writePassword=$null;$bundle=$null
 $info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=$node;$info.Arguments='"'+$engine+'" --prepare';$info.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear();foreach($key in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP')){$v=[Environment]::GetEnvironmentVariable($key);if($v){$info.EnvironmentVariables[$key]=$v}}
 $child=[Diagnostics.Process]::Start($info);$stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync();$child.StandardInput.WriteLine($transfer);$child.StandardInput.Close();$transfer=$null
 if(-not $child.WaitForExit(180000)){$child.Kill();throw 'OWNED_PREPARATION_CHILD_TIMEOUT_NO_SERVICE_CHANGE'}
 if($child.ExitCode -ne 0){Write-Host $stderr.Result;throw 'NATIVE_READ_ONLY_PREPARATION_FAILED'}
 $after=OwnedState;foreach($key in @('webPid','nodePid','pythonPid','configSha256')){if($before[$key] -ne $after[$key]){throw 'SERVICE_BASELINE_CHANGED_FRESH_PREPARATION_REQUIRED'}}
 Write-Output $stdout.Result
 Write-Output 'PREPARATION_FINISHED_NO_ACTIVATION_NO_RESTART_NO_REPLAY'
}finally{
 $transfer=$null;$bundle=$null;if($plain){[Array]::Clear($plain,0,$plain.Length)}
 if($child){try{if(-not $child.HasExited){$child.Kill()}}finally{$child.Dispose()}}
}
