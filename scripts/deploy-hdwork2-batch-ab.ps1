# Run in an existing Administrator PowerShell. Never self-elevates.
# Deploys Batch A+B code under the existing reviewed runtime policy.
# General writer activation requires a compatible persistent-auth policy implementation.
[CmdletBinding()]
param([switch]$Rollback,[string]$RunDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskName='HDWork2-Web';$switched=$false;$oldTask=$null;$stage='ADMIN_TOKEN';$run=$null
function Json($file){Get-Content -LiteralPath $file -Raw|ConvertFrom-Json}
function Save($value,$file){[IO.File]::WriteAllText($file,($value|ConvertTo-Json -Depth 12))}
function Copy-Tree($source,$destination){
 & robocopy.exe $source $destination /E /COPY:DAT /DCOPY:DAT /XJ /R:0 /W:0 /NFL /NDL /NJH /NJS /NP | Out-Null
 if($LASTEXITCODE -ge 8){throw 'COPY_FAILED'}
}
function Private-Directory($path){
 [void][IO.Directory]::CreateDirectory($path)
 $acl=New-Object Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 $acl.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
 foreach($sid in @('S-1-5-18','S-1-5-32-544','S-1-5-19')){
  $rights=if($sid -eq 'S-1-5-19'){'ReadAndExecute'}else{'FullControl'}
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),$rights,'ContainerInherit,ObjectInherit','None','Allow'))
 }
 Set-Acl -LiteralPath $path -AclObject $acl
}
function Runtime-Process($snapshot){
 $s=Json (Join-Path $snapshot 'service\state\state.json')
 $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$s.pid)
 if(-not $p -or -not $p.CommandLine.Contains($snapshot) -or (Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid).Sid -ne 'S-1-5-19'){throw 'RUNTIME_PROCESS_IDENTITY_REJECTED'}
 return $p
}
function Stop-Owned($snapshot){
 $p=Runtime-Process $snapshot
 Stop-ScheduledTask -TaskName $taskName
 # Closing the supervisor stdin lease gives Node time to close pools/sender.
 $deadline=[DateTime]::UtcNow.AddSeconds(25)
 do{if(-not (Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue)){return};Start-Sleep -Milliseconds 500}while([DateTime]::UtcNow -lt $deadline)
 # Refuse a replacement consumer while an old process may still send.
 throw 'OLD_RUNTIME_STILL_ALIVE_NO_FORCED_SENDER_RETRY'
}
function Wait-Ready($snapshot){
 $deadline=[DateTime]::UtcNow.AddSeconds(50)
 do{
  Start-Sleep -Milliseconds 500
  $f=Join-Path $snapshot 'service\state\state.json'
  if(Test-Path -LiteralPath $f){try{$s=Json $f;if($s.status -eq 'READY'){[void](Runtime-Process $snapshot);return}}catch{}}
 }while([DateTime]::UtcNow -lt $deadline)
 throw 'READY_TIMEOUT'
}
function Consumer-Pids{
 # Conservative: unknown/multiple project courier workers block the switch.
 @(Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and $_.Name -match '^(node|python|pythonw)(\.exe)?$' -and
  $_.CommandLine -match '(?i)(HDWork2|courier_bot)' -and
  $_.CommandLine -match '(?i)(courier[\\/]|courier_bot|live-ingestion|ingestion-live|courier-worker)'
 } | ForEach-Object {[int]$_.ProcessId})
}
try{
 $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
 if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ADMINISTRATOR_REQUIRED_NO_ELEVATION_ATTEMPT'}
 $mutex=New-Object Threading.Mutex($false,'Global\HDWork2BatchABDeployment')
 if(-not $mutex.WaitOne(0)){throw 'DEPLOYMENT_ALREADY_RUNNING'}
 $locked=$true
 if($Rollback){
  $run=[IO.Path]::GetFullPath($RunDirectory)
  if($run -notmatch '^C:\\ProgramData\\HDWork2BatchAB-[a-f0-9]{32}$'){throw 'ROLLBACK_PATH_REJECTED'}
  $record=Json (Join-Path $run 'rollback.json')
  $current=Get-ScheduledTask -TaskName $taskName
  if(-not $current.Actions[0].Arguments.Contains($record.newSnapshot)){throw 'CURRENT_TASK_CHANGED_PRESERVED'}
  Stop-Owned $record.newSnapshot
  Register-ScheduledTask -TaskName $taskName -Xml ([IO.File]::ReadAllText((Join-Path $run 'previous-task.xml'))) -Force|Out-Null
  Start-ScheduledTask -TaskName $taskName;Wait-Ready $record.oldSnapshot
  Copy-Item -LiteralPath (Join-Path $run 'previous-deployment.json') -Destination (Join-Path $root '.local\protected-web-deployment.json') -Force
  Write-Output 'ROLLBACK_PASS';exit 0
 }
 $stage='SOURCE_AND_ACTIVE_IDENTITY'
 $head=(& git -C $root rev-parse HEAD).Trim()
 if($LASTEXITCODE -ne 0 -or -not $head.StartsWith('0e86f20')){throw 'COMMIT_MISMATCH'}
 $d=Json (Join-Path $root '.local\protected-web-deployment.json');$old=$d.snapshot
 if($old -notmatch '^C:\\ProgramData\\HDWork2(Solver|Runtime)-[A-Za-z0-9-]+$'){throw 'ACTIVE_SNAPSHOT_PATH_REJECTED'}
 $oldTask=Get-ScheduledTask -TaskName $taskName
 if($oldTask.Actions.Count -ne 1 -or -not $oldTask.Actions[0].Arguments.Contains($old) -or $oldTask.Principal.UserId -notin @('LOCAL SERVICE','S-1-5-19')){throw 'TASK_IDENTITY_REJECTED'}
 [void](Runtime-Process $old)
 $consumers=@(Consumer-Pids)
 if($consumers.Count -ne 1){throw 'EXACTLY_ONE_EXISTING_COURIER_CONSUMER_REQUIRED'}
 $stage='WRITER_DPAPI_READ_ONLY_CHECK'
 Add-Type -AssemblyName System.Security
 $writer=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $root '.local\database-secrets\ops-write-password.machine.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
 try{if($writer.Length -eq 0){throw 'EMPTY_WRITER_SECRET'}}finally{[Array]::Clear($writer,0,$writer.Length);$writer=$null}
 $run=Join-Path 'C:\ProgramData' ('HDWork2BatchAB-'+[Guid]::NewGuid().ToString('N'));Private-Directory $run
 $new=Join-Path $run 'runtime';Private-Directory $new
 Export-ScheduledTask -TaskName $taskName|Set-Content -LiteralPath (Join-Path $run 'previous-task.xml') -Encoding Unicode
 Copy-Item -LiteralPath (Join-Path $root '.local\protected-web-deployment.json') -Destination (Join-Path $run 'previous-deployment.json')
 Save @{oldSnapshot=$old;newSnapshot=$new;commit=$head;consumerPids=$consumers;databaseRollback='No schema/grant/data changes; retain current DB';command=('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" -Rollback -RunDirectory "'+$run+'"')} (Join-Path $run 'rollback.json')
 $stage='SNAPSHOT_ACTIVE_RUNTIME'
 Copy-Tree $old (Join-Path $run 'active-snapshot')
 Copy-Tree $old $new
 # Do not reuse stale READY evidence or sender state in the new process.
 $newState=Join-Path $new 'service\state'
 if([IO.Path]::GetFullPath($newState) -ne ($new+'\service\state')){throw 'STATE_PATH_REJECTED'}
 if(Test-Path $newState){Remove-Item -LiteralPath $newState -Recurse -Force}
 Private-Directory $newState
 $acl=Get-Acl $newState;$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-19'),'Modify','ContainerInherit,ObjectInherit','None','Allow'));Set-Acl $newState $acl
 $stage='STAGE_COMMITTED_CODE'
 # Export exact commit, then preserve the already-reviewed grant policy adjustment.
 $archive=Join-Path $run 'source.tar'
 & git -C $root archive --format=tar ('--output='+$archive) $head
 if($LASTEXITCODE -ne 0){throw 'ARCHIVE_FAILED'}
 & tar.exe -xf $archive -C $new
 if($LASTEXITCODE -ne 0){throw 'EXTRACT_FAILED'}
 Copy-Item -LiteralPath (Join-Path $root 'src\config\operational-grants.js') -Destination (Join-Path $new 'src\config\operational-grants.js') -Force
 # Dependencies come from the active runtime; build tools come from the workspace.
 Copy-Tree (Join-Path $root 'frontend\node_modules') (Join-Path $new 'frontend\node_modules')
 $stage='BUILD_BATCH_AB'
 $priorCookie=$env:VITE_HDWORK2_AUTH_COOKIE;$priorOps=$env:VITE_HDWORK2_OPERATIONS
 try{
  $env:VITE_HDWORK2_AUTH_COOKIE='true';$env:VITE_HDWORK2_OPERATIONS='true'
  Push-Location (Join-Path $new 'frontend')
  try{& npm.cmd run build *> (Join-Path $run 'frontend-build.log');if($LASTEXITCODE -ne 0){throw 'BUILD_FAILED'}}finally{Pop-Location}
 }finally{$env:VITE_HDWORK2_AUTH_COOKIE=$priorCookie;$env:VITE_HDWORK2_OPERATIONS=$priorOps}
 $envMap=Json (Join-Path $new 'service\environment.json')
 foreach($p in $envMap.PSObject.Properties){if($p.Value -is [string] -and $p.Value.StartsWith($old,[StringComparison]::OrdinalIgnoreCase)){$p.Value=$new+$p.Value.Substring($old.Length)}}
 $envMap.PSObject.Properties.Remove('LOCAL_WEB_DIST')
 Save $envMap (Join-Path $new 'service\environment.json')
 # Validate the existing policy, never silently broaden persistent auth or Telegram scope.
 $node=(Get-Command node.exe).Source
 $policyHelper=Join-Path $run 'policy-check.cjs'
 [IO.File]::WriteAllText($policyHelper,'const p=require("path"),r=process.argv[2],e=require(p.join(r,"service/environment.json"));require(p.join(r,"src/config/persistent-auth")).validatePersistentAuth(e);require(p.join(r,"src/operations/testing-solver-scope")).configuration(e);')
 & $node $policyHelper $new *> (Join-Path $run 'policy-check.log')
 if($LASTEXITCODE -ne 0){throw 'ACTIVE_POLICY_INCOMPATIBLE'}
 $stage='VERIFY_SNAPSHOT'
 $manifest=@()
 foreach($item in Get-ChildItem -LiteralPath $new -Recurse -Force){
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE_POINT_REJECTED'}
  if(-not $item.PSIsContainer -and $item.FullName -notlike ($newState+'\*')){
   $itemAcl=Get-Acl $item.FullName
   foreach($rule in $itemAcl.Access){if($rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Write) -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544')){throw 'UNTRUSTED_RELEASE_WRITE_ACL'}}
   $manifest+=@{path=$item.FullName.Substring($new.Length+1);sha256=(Get-FileHash -LiteralPath $item.FullName).Hash}
  }
 }
 Save $manifest (Join-Path $run 'release-hashes.json')
 if((@(Consumer-Pids) -join ',') -ne ($consumers -join ',')){throw 'COURIER_CONSUMER_CHANGED'}
 $stage='SWITCH_ONLY_HDWORK2_WEB';$switched=$true
 Stop-Owned $old
 $action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $new 'scripts\run-protected-web.ps1')+'"') -WorkingDirectory $new
 Set-ScheduledTask -TaskName $taskName -Action $action|Out-Null
 Start-ScheduledTask -TaskName $taskName;Wait-Ready $new
 $stage='PUBLIC_LOGIN_DASHBOARD_READ_ONLY'
 $public=Invoke-WebRequest -Uri 'https://hdwork2.yoloo.space/login' -UseBasicParsing -TimeoutSec 20
 if($public.StatusCode -ne 200){throw 'PUBLIC_LOGIN_HTTP_FAILED'}
 # Existing browser harness restricts requests to GET/HEAD and auth login/logout.
 $browserStarted=[DateTime]::UtcNow
 & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $root '.local\run-trial-browser.ps1') *> (Join-Path $run 'browser-check.log')
 if($LASTEXITCODE -ne 0){throw 'PUBLIC_BROWSER_CHECK_FAILED'}
 $browser=Json (Join-Path $root '.local\trial-browser-result.json')
 if([DateTime]::Parse($browser.checkedAt).ToUniversalTime() -lt $browserStarted -or $browser.status -ne 'PASS' -or -not $browser.results.publicUiLogin -or -not $browser.results.publicDashboardRendered -or -not $browser.results.publicOrderListRendered){throw 'PUBLIC_BROWSER_EVIDENCE_FAILED'}
 if((@(Consumer-Pids) -join ',') -ne ($consumers -join ',')){throw 'COURIER_CONSUMER_CHANGED_AFTER_SWITCH'}
 Copy-Item -LiteralPath (Join-Path $root '.local\trial-browser-result.json') -Destination (Join-Path $run 'browser-result.json')
 $d.snapshot=$new;$d.status='ACTIVE_BATCH_AB_EXISTING_POLICY';Save $d (Join-Path $root '.local\protected-web-deployment.json')
 Save @{status='CODE_DEPLOYED_EXISTING_POLICY';commit=$head;snapshot=$new;previous=$old;writerDpapiReadable=$true;courierConsumers=1;publicBrowser='PASS';generalWriterActive=$false;limitation='session-audit-only policy preserved; general writer/account management not activated or tested';rollbackAvailable=$true;checkedAt=[DateTime]::UtcNow.ToString('o')} (Join-Path $run 'report.json')
 Write-Output ('CODE_DEPLOYED_EXISTING_POLICY; general writer NOT activated. Report: '+$run+'\report.json')
}catch{
 $rollbackPass=$false
 if($switched -and $oldTask){
  try{
   $current=Get-ScheduledTask -TaskName $taskName
   if($current.Actions[0].Arguments.Contains($new)){Stop-Owned $new}
   Set-ScheduledTask -TaskName $taskName -Action $oldTask.Actions|Out-Null
   # Do not create a second old instance if shutdown failed before switching.
   try{[void](Runtime-Process $old)}catch{Start-ScheduledTask -TaskName $taskName}
   Wait-Ready $old;$rollbackPass=$true
  }catch{}
 }
 $safeCode=if($_.Exception.Message -match '^[A-Z0-9_]+$'){$_.Exception.Message}else{'DEPLOYMENT_FAILED'}
 if($run){Save @{status='BLOCKED';stage=$stage;code=$safeCode;switched=$switched;rollbackVerified=$rollbackPass;automaticRetry=$false} (Join-Path $run 'report.json')}
 Write-Error ('BLOCKED '+$stage+' '+$safeCode+'; rollback verified='+$rollbackPass+'; run='+$run) -ErrorAction Continue
 exit 1
}finally{if(Get-Variable locked -ErrorAction SilentlyContinue){if($locked){$mutex.ReleaseMutex()}};if(Get-Variable mutex -ErrorAction SilentlyContinue){$mutex.Dispose()}}
