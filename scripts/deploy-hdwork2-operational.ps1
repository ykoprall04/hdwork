# Deploy only HDWork2-Web using existing accounts, protected secrets and infrastructure.
[CmdletBinding()]
param([switch]$StageOnly,[string]$PreparedDirectory)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$switched=$false;$plain=$null;$writer=$null;$bundle=$null;$new=$null
function Save($v,$p){[IO.File]::WriteAllText($p,($v|ConvertTo-Json -Depth 12))}
function ReadJson($p){Get-Content -LiteralPath $p -Raw|ConvertFrom-Json}
function PrivateDirectory($p){
 [void][IO.Directory]::CreateDirectory($p)
 $acl=New-Object Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @('S-1-5-18','S-1-5-32-544','S-1-5-19')){
  $rights=if($sid -eq 'S-1-5-19'){'ReadAndExecute'}else{'FullControl'}
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),$rights,'ContainerInherit,ObjectInherit','None','Allow'))
 }
 Set-Acl -LiteralPath $p -AclObject $acl
}
function CopyTree($a,$b){
 & robocopy.exe $a $b /E /COPY:DAT /DCOPY:DAT /XJ /R:0 /W:0 /NFL /NDL /NJH /NJS /NP | Out-Null
 if($LASTEXITCODE -ge 8){throw 'COPY_FAILED'}
}
function OwnedProcess($snapshot){
 $s=ReadJson (Join-Path $snapshot 'service/state/state.json')
 $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$s.pid)
 if(-not $p -or -not $p.CommandLine.Contains($snapshot) -or (Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid).Sid -ne 'S-1-5-19'){throw 'WEB_IDENTITY_REJECTED'}
 return $p
}
function WaitReady($snapshot){
 $deadline=[DateTime]::UtcNow.AddSeconds(50)
 do{
  Start-Sleep -Milliseconds 500
  try{$s=ReadJson (Join-Path $snapshot 'service/state/state.json');if($s.status -eq 'READY'){$p=OwnedProcess $snapshot;return}}catch{}
 }while([DateTime]::UtcNow -lt $deadline)
 throw 'WEB_READY_TIMEOUT'
}
function StopOwned($snapshot){
 $p=OwnedProcess $snapshot
 Stop-ScheduledTask -TaskName HDWork2-Web
 $deadline=[DateTime]::UtcNow.AddSeconds(25)
 do{if(-not(Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue)){return};Start-Sleep -Milliseconds 250}while([DateTime]::UtcNow -lt $deadline)
 throw 'OLD_WEB_STILL_RUNNING'
}
try{
 $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
 if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ADMINISTRATOR_REQUIRED'}
 $js=Get-ChildItem -LiteralPath (Join-Path $root 'frontend/dist/assets') -Filter '*.js'
 $publicBuild=$false
 foreach($asset in $js){$content=[IO.File]::ReadAllText($asset.FullName);if($content.Contains('https://localhost:8443')){throw 'FRONTEND_LOCALHOST_API_REJECTED'};if($content.Contains('https://hdwork2.yoloo.space')){$publicBuild=$true}}
 if(-not $publicBuild){throw 'FRONTEND_PUBLIC_API_REQUIRED'}
 Add-Type -AssemblyName System.Security
 $deployment=ReadJson (Join-Path $root '.local/protected-web-deployment.json');$old=$deployment.snapshot
 $oldTask=Get-ScheduledTask -TaskName HDWork2-Web
 if(-not $oldTask.Actions[0].Arguments.Contains($old)){throw 'ACTIVE_TASK_CHANGED'}
 [void](OwnedProcess $old)
 $telegram=ReadJson 'C:\ProgramData\HDWork2Telegram-20261109T043259Z-8764b02c\state\trial-state.json'
 if($telegram.status -ne 'READY' -or -not(Get-Process -Id $telegram.pid -ErrorAction SilentlyContinue) -or -not(Get-Process -Id $telegram.pythonPid -ErrorAction SilentlyContinue)){throw 'TELEGRAM_NOT_READY'}
 if($PreparedDirectory){
  $new=[IO.Path]::GetFullPath($PreparedDirectory)
  if($new -notmatch '^C:\\ProgramData\\HDWork2Runtime-[a-f0-9]{32}$'){throw 'PREPARED_PATH_REJECTED'}
  $previous=ReadJson (Join-Path $new 'service/previous-deployment.json')
  if($previous.snapshot -ne $old){throw 'PREPARED_BASE_CHANGED'}
 }else{
  $new=Join-Path 'C:\ProgramData' ('HDWork2Runtime-'+[Guid]::NewGuid().ToString('N'));PrivateDirectory $new
  CopyTree $old $new
  Export-ScheduledTask -TaskName HDWork2-Web|Set-Content -LiteralPath (Join-Path $new 'service/previous-task.xml') -Encoding Unicode
  Save $deployment (Join-Path $new 'service/previous-deployment.json')
  $archive=Join-Path $new 'service/source.tar'
  & git -C $root archive --format=tar ('--output='+$archive) HEAD
  if($LASTEXITCODE -ne 0){throw 'ARCHIVE_FAILED'}
  & tar.exe -xf $archive -C $new
  if($LASTEXITCODE -ne 0){throw 'EXTRACT_FAILED'}
  foreach($file in @('src/config/operational-grants.js','src/operations/testing-solver-scope.js','src/operations/routes.js','scripts/protected-web-service.js','scripts/check-operational-release.js','frontend/src/features/operational/Login.tsx')){Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $new $file) -Force}
  CopyTree (Join-Path $root 'frontend/dist') (Join-Path $new 'frontend/dist')
  $state=Join-Path $new 'service/operational-state';PrivateDirectory $state
  # Fresh state directory; keep the copied old evidence for review.
  $priorState=Join-Path $new 'service/state'
  if([IO.Path]::GetFullPath($priorState) -ne ($new+'\service\state')){throw 'STATE_PATH_REJECTED'}
    $previousState = Join-Path $new 'service/previous-state'
  if (Test-Path -LiteralPath $previousState) {
    $previousState = Join-Path $new ('service/previous-state-deploy-' + [Guid]::NewGuid().ToString('N'))
  }
  Move-Item -LiteralPath $priorState -Destination $previousState
  Move-Item -LiteralPath $state -Destination $priorState
  $acl=Get-Acl $priorState
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-19'),'Modify','ContainerInherit,ObjectInherit','None','Allow'))
  Set-Acl -LiteralPath $priorState -AclObject $acl
  $envMap=ReadJson (Join-Path $new 'service/environment.json')
  foreach($p in $envMap.PSObject.Properties){if($p.Value -is [string] -and $p.Value.StartsWith($old,[StringComparison]::OrdinalIgnoreCase)){$p.Value=$new+$p.Value.Substring($old.Length)}}
  $envMap.PSObject.Properties.Remove('LOCAL_WEB_DIST')
  $settings=@{HDWORK2_SERVICE_AUTH_POLICY='operational-write';HDWORK2_LOCAL_READ_ONLY='false';HDWORK2_AUTH_WRITE_ENABLED='true';OP_WRITE_ENABLED='true';HDWORK2_OPERATIONAL_WRITE_APPROVED='true';OP_WRITE_DB_USER='hdwork_ops_write';OP_WRITE_DB_NAME='hdwork2';OP_WRITE_DB_HOST='127.0.0.1';OP_WRITE_DB_PORT='3306';OP_WRITE_DB_PASSWORD_DPAPI_FILE='.local/database-secrets/ops-write-password.dpapi'}
  foreach($key in $settings.Keys){$envMap|Add-Member -NotePropertyName $key -NotePropertyValue $settings[$key] -Force}
  Save $envMap (Join-Path $new 'service/environment.json')
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $old 'service/secrets.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
  $bundle=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json
  [Array]::Clear($plain,0,$plain.Length);$plain=$null
  $writer=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $root '.local/database-secrets/ops-write-password.machine.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
  $bundle|Add-Member -NotePropertyName writePassword -NotePropertyValue ([Text.Encoding]::UTF8.GetString($writer)) -Force
  [Array]::Clear($writer,0,$writer.Length);$writer=$null
  $plain=[Text.Encoding]::UTF8.GetBytes(($bundle|ConvertTo-Json -Compress))
  [IO.File]::WriteAllBytes((Join-Path $new 'service/secrets.dpapi'),[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine))
  [Array]::Clear($plain,0,$plain.Length);$plain=$null;$bundle=$null
 }
 # Run preflight with private stdin; never print bundle or database errors.
 $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $new 'service/secrets.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=(Get-Command node.exe).Source;$info.Arguments='"'+(Join-Path $root 'scripts/check-operational-release.js')+'" "'+$new+'"'
 $info.WorkingDirectory=$root;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $child=[Diagnostics.Process]::Start($info)
 $child.StandardInput.Write([Text.Encoding]::UTF8.GetString($plain));$child.StandardInput.Close();[Array]::Clear($plain,0,$plain.Length);$plain=$null
 $output=$child.StandardOutput.ReadToEnd();$discard=$child.StandardError.ReadToEnd();$child.WaitForExit();$discard=$null
 if($child.ExitCode -ne 0){Write-Output $output;throw 'PREFLIGHT_FAILED'}
 $child.Dispose()
 Save @{status='STAGED_PREFLIGHT_PASS';snapshot=$new;previous=$old;checkedAt=[DateTime]::UtcNow.ToString('o')} (Join-Path $root '.local/operational-deployment.json')
 if($StageOnly){Write-Output ('STAGED_PREFLIGHT_PASS '+$new);exit 0}
 $switched=$true;StopOwned $old
 $action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $new 'scripts/run-protected-web.ps1')+'"') -WorkingDirectory $new
 Set-ScheduledTask -TaskName HDWork2-Web -Action $action|Out-Null
 Start-ScheduledTask -TaskName HDWork2-Web;WaitReady $new
 $s=ReadJson (Join-Path $new 'service/state/state.json')
 if($s.readOnly -or -not $s.pools.write){throw 'WRITER_NOT_ACTIVE'}
 if((Invoke-WebRequest -Uri 'https://hdwork2.yoloo.space/login' -UseBasicParsing -TimeoutSec 20).StatusCode -ne 200){throw 'PUBLIC_LOGIN_UNAVAILABLE'}
 foreach($pidValue in @($telegram.pid,$telegram.pythonPid)){if(-not(Get-Process -Id $pidValue -ErrorAction SilentlyContinue)){throw 'TELEGRAM_PROCESS_CHANGED'}}
 $deployment.snapshot=$new;$deployment.status='ACTIVE_OPERATIONAL_WRITE';$deployment.checkedAt=[DateTime]::UtcNow.ToString('o')
 Save $deployment (Join-Path $root '.local/protected-web-deployment.json')
 Save @{status='ACTIVE_OPERATIONAL_WRITE';snapshot=$new;previous=$old;writerActive=$true;telegramPreserved=$true;rollbackTask=(Join-Path $new 'service/previous-task.xml');checkedAt=[DateTime]::UtcNow.ToString('o')} (Join-Path $root '.local/operational-deployment.json')
 Write-Output ('ACTIVE_OPERATIONAL_WRITE '+$new)
}catch{
 $rollback=$false
 if($switched){try{
  $current=Get-ScheduledTask -TaskName HDWork2-Web
  if($current.Actions[0].Arguments.Contains($new)){StopOwned $new}
  Set-ScheduledTask -TaskName HDWork2-Web -Action $oldTask.Actions|Out-Null
  try{[void](OwnedProcess $old)}catch{Start-ScheduledTask -TaskName HDWork2-Web}
  WaitReady $old;$rollback=$true
 }catch{}}
 $code=if($_.Exception.Message -match '^[A-Z0-9_]+$'){$_.Exception.Message}else{'DEPLOYMENT_FAILED'}
 Save @{status='BLOCKED';code=$code;snapshot=$new;rollbackVerified=$rollback;checkedAt=[DateTime]::UtcNow.ToString('o')} (Join-Path $root '.local/operational-deployment.json')
 Write-Output ('BLOCKED '+$code+' rollback='+$rollback+' snapshot='+$new);exit 1
}finally{if($plain){[Array]::Clear($plain,0,$plain.Length)};if($writer){[Array]::Clear($writer,0,$writer.Length)};$bundle=$null}
