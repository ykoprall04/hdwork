[CmdletBinding()]
param([switch]$ApprovedSetup)
$ErrorActionPreference='Stop';$stage='APPROVAL';$root='D:\HDWork2-New'
$report=Join-Path $root '.local\protected-web-deployment.json'
try{
 $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
 if(-not $ApprovedSetup -or -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Admin approval required'}
 $stage='PRECHECK'
 if(Get-ScheduledTask -TaskName 'HDWork2-Web' -ErrorAction SilentlyContinue){throw 'Existing task preserved'}
 $parent='C:\ProgramData'
 foreach($p in @('C:\',$parent)){
  if((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Parent reparse point rejected'}
 foreach($r in (Get-Acl -LiteralPath $p).Access){
  $sid=$r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
  if($r.PropagationFlags -ne 'InheritOnly' -and $r.AccessControlType -eq 'Allow' -and $sid -in @('S-1-1-0','S-1-5-11','S-1-5-32-545','S-1-5-19') -and ($r.FileSystemRights -band [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles)){throw 'Parent permits untrusted child deletion'}
 }
 }
 $snapshot=Join-Path $parent ('HDWork2Runtime-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
 New-Item -ItemType Directory -Path $snapshot | Out-Null
 $acl=New-Object Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 $acl.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
 foreach($sid in @('S-1-5-18','S-1-5-32-544','S-1-5-19')){
  $rights=if($sid -eq 'S-1-5-19'){'ReadAndExecute'}else{'FullControl'}
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),$rights,'ContainerInherit,ObjectInherit','None','Allow'))
 }
 Set-Acl -LiteralPath $snapshot -AclObject $acl
 $stage='COPY'
 foreach($folder in @('src','node_modules')){
  $source=Join-Path $root $folder
  if(@(Get-ChildItem -LiteralPath $source -Recurse -Force -Attributes ReparsePoint).Count){throw 'Source reparse point rejected'}
  & robocopy.exe $source (Join-Path $snapshot $folder) /E /COPY:DAT /DCOPY:DAT /XJ /R:0 /W:0 /NFL /NDL /NJH /NJS /NP | Out-Null
  if($LASTEXITCODE -ge 8){throw 'Snapshot copy failed'}
 }
 foreach($file in @('api-only-server.js','local-web-server.js','package.json')){Copy-Item -LiteralPath (Join-Path $root $file) -Destination $snapshot}
 New-Item -ItemType Directory -Path (Join-Path $snapshot 'scripts') | Out-Null
 foreach($file in @('protected-web-service.js','office-web-service.js','run-protected-web.ps1')){Copy-Item -LiteralPath (Join-Path $root ('scripts\'+$file)) -Destination (Join-Path $snapshot 'scripts')}
 $candidate='online-candidate-hdwork2-service-9f638a40c09cf902'
 $candidateSource=Join-Path $root ('.local\'+$candidate)
 $candidateTarget=Join-Path $snapshot ('.local\'+$candidate)
 New-Item -ItemType Directory -Path $candidateTarget -Force | Out-Null
 & robocopy.exe (Join-Path $candidateSource 'dist') (Join-Path $candidateTarget 'dist') /E /COPY:DAT /DCOPY:DAT /XJ /R:0 /W:0 /NFL /NDL /NJH /NJS /NP | Out-Null
 if($LASTEXITCODE -ge 8){throw 'Build copy failed'}
 New-Item -ItemType Directory -Path (Join-Path $snapshot '.local\tls') | Out-Null
 foreach($file in @('localhost.crt','localhost.key','ca.crt')){Copy-Item -LiteralPath (Join-Path $root ('.local\tls\'+$file)) -Destination (Join-Path $snapshot '.local\tls')}
 $stage='ENVIRONMENT'
 $serviceHome=Join-Path $snapshot 'service'
 New-Item -ItemType Directory -Path (Join-Path $serviceHome 'state') -Force | Out-Null
 Copy-Item -LiteralPath 'C:\ProgramData\HDWork2\web\secrets.dpapi' -Destination (Join-Path $serviceHome 'secrets.dpapi')
 $envMap=@{}
 foreach($line in [IO.File]::ReadAllLines((Join-Path $candidateSource 'backend.environment'))){if($line -match '^([A-Z0-9_]+)=(.*)$'){$envMap[$matches[1]]=$matches[2]}}
 if($envMap.ContainsKey('DB_PASSWORD') -or $envMap.ContainsKey('JWT_SECRET') -or $envMap.HDWORK2_PUBLIC_ORIGIN -ne 'https://hdwork2.yoloo.space'){throw 'Environment scope rejected'}
 $envMap.HDWORK2_SERVICE_AUTH_APPROVED='true'
 $envMap.LOCAL_WEB_DIST=Join-Path $candidateTarget 'dist'
 $envMap.LOCAL_TLS_CERT=Join-Path $snapshot '.local\tls\localhost.crt'
 $envMap.LOCAL_TLS_KEY=Join-Path $snapshot '.local\tls\localhost.key'
 [IO.File]::WriteAllText((Join-Path $serviceHome 'environment.json'),($envMap|ConvertTo-Json))
 $stage='ACL_AUDIT'
 $items=@(Get-Item -LiteralPath $snapshot)+@(Get-ChildItem -LiteralPath $snapshot -Force -Recurse)
 foreach($item in $items){
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Snapshot reparse point rejected'}
  $itemAcl=Get-Acl -LiteralPath $item.FullName
  foreach($r in $itemAcl.Access){
   $sid=$r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
   if($r.AccessControlType -eq 'Allow' -and $sid -notin @('S-1-5-18','S-1-5-32-544') -and ($r.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Write)){throw 'Snapshot writable by non-admin'}
  }
 }
 $statePath=Join-Path $serviceHome 'state'
 $stateAcl=Get-Acl -LiteralPath $statePath
 $stateAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-19'),'Modify','ContainerInherit,ObjectInherit','None','Allow'))
 Set-Acl -LiteralPath $statePath -AclObject $stateAcl
 $stage='TASK_REGISTER'
 $action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $snapshot 'scripts\run-protected-web.ps1')+'"') -WorkingDirectory $snapshot
 $taskPrincipal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
 $trigger=New-ScheduledTaskTrigger -AtStartup
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
 Register-ScheduledTask -TaskName 'HDWork2-Web' -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Description 'HDWork2 protected snapshot; LocalService; loopback only; read-only operations' | Out-Null
 [IO.File]::WriteAllText($report,(@{status='REGISTERED_NOT_STARTED';snapshot=$snapshot;taskName='HDWork2-Web';accountSid='S-1-5-19';protectedItemsAudited=$items.Count;unprivilegedCodeWrite=$false;stateOnlyWritable=$true;projectAclChanged=$false;dnsChanged=$false;checkedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json))
 Write-Output 'HDWORK2_PROTECTED_WEB_REGISTERED_NOT_STARTED'
}catch{
 [IO.File]::WriteAllText($report,(@{status='BLOCKED';stage=$stage;errorType=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber;nativeResult=$_.Exception.HResult;snapshot=$snapshot;dnsChanged=$false;checkedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json));exit 1
}
