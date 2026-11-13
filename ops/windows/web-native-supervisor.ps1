# Cooperative owner protocol v1. Only owns the child it creates. No kill/task-stop fallback.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ControlConfig,[Parameter(Mandatory=$true)][string]$ConfigSha256)
$ErrorActionPreference='Stop'
$child=$null;$server=$null;$requested=$false;$childStartedAtUtc=$null;$childPid=0;$phase='START'
$previousStopClean=$false
function HashFile($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
if((HashFile $ControlConfig) -cne $ConfigSha256){throw 'CONTROL_CONFIG_CHANGED'}
$cfg=Get-Content -LiteralPath $ControlConfig -Raw|ConvertFrom-Json
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if($cfg.kind -cne 'HDWORK2_WEB_SUPERVISOR' -or $cfg.version -ne 1 -or $cfg.ownerSid -cne $sid -or $cfg.taskName -notmatch '^(HDWork2-Web|HDWork2-WebFixture-[a-f0-9]{32})$' -or $cfg.pipeName -notmatch '^hdwork2-web-[a-f0-9]{32}$' -or $cfg.graceSeconds -lt 1 -or $cfg.graceSeconds -gt 60){throw 'NATIVE_OWNER_REJECTED'}
$root=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ControlConfig))
foreach($file in @($cfg.stateFile,$cfg.fenceFile)){if(-not ([IO.Path]::GetFullPath($file)).StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'CONTROL_PATH_ESCAPE'}}
if((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'CONTROL_DIRECTORY_LINK'}
function SaveState($status,$exitCode=$null){
 $row=@{version=1;protocol='HDWORK2_WEB_OWNER_V1';status=$status;ownerPid=$PID;ownerSid=$sid;taskName=$cfg.taskName;configSha256=$ConfigSha256;pipeName=$cfg.pipeName;childPid=$childPid;childStartedAtUtc=$childStartedAtUtc;updatedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');exitCode=$exitCode;forced=$false;previousStopClean=$previousStopClean}
 $temp=$cfg.stateFile+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
 [IO.File]::WriteAllText($temp,($row|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
 # Windows readers can briefly hold a handle without FileShare.Delete.
 # Preserve atomic replacement and tolerate that sharing violation, never truncate state.
 $saved=$false
 for($attempt=0;$attempt -lt 80;$attempt++){
  try{if(Test-Path -LiteralPath $cfg.stateFile){[IO.File]::Replace($temp,$cfg.stateFile,[NullString]::Value)}else{[IO.File]::Move($temp,$cfg.stateFile)};$saved=$true;break}
  catch [IO.IOException]{if($attempt -eq 79){throw};Start-Sleep -Milliseconds 25}
 }
 if(-not $saved){throw 'NATIVE_STATE_NOT_SAVED'}
}
# A Scheduled Task policy alone does not fence a second direct invocation.
$ownerMutex=New-Object Threading.Mutex($false,('Global\HDWork2Web-'+$cfg.taskName))
$mutexHeld=$false
try {
 try {$mutexHeld=$ownerMutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {throw 'NATIVE_PREVIOUS_OWNER_UNCLEAN'}
 if(-not $mutexHeld){throw 'NATIVE_OWNER_ALREADY_RUNNING'}
if(Test-Path -LiteralPath $cfg.fenceFile){
 if(Test-Path -LiteralPath $cfg.stateFile){try{$old=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json;$previousStopClean=$old.configSha256 -ceq $ConfigSha256 -and (($old.status -ceq 'STOPPED' -and $null -ne $old.exitCode -and $old.exitCode -eq 0) -or $old.previousStopClean -eq $true)}catch{}}
 SaveState 'FENCED_START_REFUSED';exit 0
}
if((HashFile $cfg.childCodeFile) -cne $cfg.childCodeSha256 -or (HashFile $cfg.supervisorScript) -cne $cfg.supervisorSha256){throw 'NATIVE_SOURCE_DRIFT'}
if([IO.Path]::GetFileName($cfg.childExecutable) -cne 'node.exe' -or $cfg.childArguments.Count -lt 1 -or $cfg.childArguments[0] -cne $cfg.childCodeFile){throw 'NATIVE_CHILD_REJECTED'}
if($cfg.taskName -ceq 'HDWork2-Web' -and ((HashFile $cfg.childExecutable) -cne $cfg.childExecutableSha256 -or ([IO.Path]::GetFileName($cfg.childCodeFile) -cne 'protected-web-service.js' -or $cfg.childArguments.Count -ne 1))){throw 'WEB_CHILD_REJECTED'}
foreach($arg in $cfg.childArguments){if($arg.Contains('"') -or $arg.Contains("`r") -or $arg.Contains("`n")){throw 'CHILD_ARGUMENT_REJECTED'}}
try{
 [IO.File]::WriteAllText((Join-Path $root 'startup.metadata.json'),'{"phase":"CHILD_PREPARE"}')
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$cfg.childExecutable;$info.Arguments=(@($cfg.childArguments|ForEach-Object {'"'+$_+'"'}) -join ' ');$info.WorkingDirectory=$cfg.childWorkingDirectory
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear();foreach($key in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData')){$value=[Environment]::GetEnvironmentVariable($key);if($value){$info.EnvironmentVariables[$key]=$value}}
 $info.EnvironmentVariables['HDWORK2_NATIVE_GRACEFUL_ONLY']='true'
 if(Test-Path -LiteralPath $cfg.fenceFile){SaveState 'FENCED_START_REFUSED';exit 0}
 if($cfg.taskName -ceq 'HDWork2-Web' -or $cfg.secretBundleFile){
  if(-not $cfg.sourceHashes -or $cfg.secretBundleFile -cne (Join-Path $cfg.childWorkingDirectory 'service\secrets.dpapi') -or (HashFile $cfg.secretBundleFile) -cne $cfg.encryptedBundleSha256){throw 'WEB_BOOTSTRAP_PIN_REJECTED'}
  foreach($required in @('scripts/protected-web-service.js','local-web-server.js','api-only-server.js','src/config/web-drain.js','src/courier/mysql-store.js','src/operations/transaction-gate.js','src/config/operational-grants.js','service/environment.json')){if(-not $cfg.sourceHashes.PSObject.Properties[$required]){throw 'WEB_SOURCE_COVERAGE_REJECTED'}}
  foreach($entry in $cfg.sourceHashes.PSObject.Properties){$file=[IO.Path]::GetFullPath((Join-Path $cfg.childWorkingDirectory $entry.Name));if(-not $file.StartsWith($cfg.childWorkingDirectory+'\') -or (HashFile $file) -cne $entry.Value){throw 'WEB_RUNTIME_SOURCE_DRIFT'}}
  $webEnv=Get-Content (Join-Path $cfg.childWorkingDirectory 'service\environment.json') -Raw|ConvertFrom-Json
  if($webEnv.COURIER_ENABLED -cne 'false' -or $webEnv.HDWORK2_TESTING_SOLVER_ENABLED -cne 'false'){throw 'WEB_EXTERNAL_SENDER_REJECTED'}
 }
 $child=New-Object Diagnostics.Process;$child.StartInfo=$info;[IO.File]::WriteAllText((Join-Path $root 'startup.metadata.json'),'{"phase":"CHILD_START"}');[void]$child.Start();$childPid=$child.Id;$childStartedAtUtc=$child.StartTime.ToUniversalTime().ToString('o');
 if($cfg.secretBundleFile){
  Add-Type -AssemblyName System.Security
  $plain=$null;try{$plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($cfg.secretBundleFile),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine);$child.StandardInput.WriteLine([Text.Encoding]::UTF8.GetString($plain));$child.StandardInput.Flush()}finally{if($plain){[Array]::Clear($plain,0,$plain.Length)}}
 }
 $child.BeginOutputReadLine();$child.BeginErrorReadLine()
 $security=New-Object IO.Pipes.PipeSecurity
 foreach($account in @($sid,'S-1-5-18','S-1-5-32-544')){$security.AddAccessRule((New-Object IO.Pipes.PipeAccessRule((New-Object Security.Principal.SecurityIdentifier($account)),[IO.Pipes.PipeAccessRights]::ReadWrite,[Security.AccessControl.AccessControlType]::Allow)))}
 while(-not $child.HasExited){
  $server=New-Object IO.Pipes.NamedPipeServerStream($cfg.pipeName,[IO.Pipes.PipeDirection]::InOut,1,[IO.Pipes.PipeTransmissionMode]::Byte,[IO.Pipes.PipeOptions]::Asynchronous,4096,4096,$security)
  $phase='PIPE_WAIT';$pending=$server.WaitForConnectionAsync();SaveState 'READY'
  while(-not $pending.Wait(250)){if($child.HasExited){break}}
  if($child.HasExited){break}
  $phase='REQUEST_READ';$reader=New-Object IO.StreamReader($server);$writer=New-Object IO.StreamWriter($server);$writer.AutoFlush=$true
  $line=$reader.ReadLineAsync();if(-not $line.Wait(5000)){throw 'CONTROL_REQUEST_TIMEOUT'}
  if($line.Result.Length -gt 4096){throw 'CONTROL_REQUEST_TOO_LARGE'}
  $request=$line.Result|ConvertFrom-Json
  $fence=if(Test-Path -LiteralPath $cfg.fenceFile){Get-Content -LiteralPath $cfg.fenceFile -Raw|ConvertFrom-Json}else{$null}
  $valid=$request.action -ceq 'STOP' -and $request.configSha256 -ceq $ConfigSha256 -and [int]$request.childPid -eq $childPid -and $request.childStartedAtUtc -ceq $childStartedAtUtc -and $fence -and $fence.barrierId -ceq $request.barrierId -and $fence.configSha256 -ceq $ConfigSha256
  if(-not $valid){$writer.WriteLine('{"status":"REJECTED"}');$server.Dispose();$server=$null;continue}
  $phase='STOPPING';$requested=$true;SaveState 'STOPPING'
  $child.StandardInput.WriteLine('STOP');$child.StandardInput.Close()
  if($child.WaitForExit([int]$cfg.graceSeconds*1000)){
   SaveState 'STOPPED' $child.ExitCode
   $writer.WriteLine((@{status='STOPPED';clean=($child.ExitCode -eq 0);forced=$false;childExitCode=$child.ExitCode;configSha256=$ConfigSha256;barrierId=$request.barrierId}|ConvertTo-Json -Compress));break
  }
  SaveState 'STOP_TIMEOUT';try{$writer.WriteLine('{"status":"STOP_TIMEOUT","clean":false,"forced":false}')}catch{}
  # Keep ownership after timeout. Never orphan/kill a possibly active sender.
  $server.Dispose();$server=$null;$child.WaitForExit();break
 }
 if($child.HasExited){SaveState $(if($requested){'STOPPED'}else{'CHILD_EXITED'}) $child.ExitCode}
}catch{
 $failure=@{phase=$phase;type=$_.Exception.GetType().Name;code=($_.FullyQualifiedErrorId -split ',')[0]}
 try{[IO.File]::WriteAllText((Join-Path $root 'failure.metadata.json'),($failure|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)));SaveState 'CONTROL_FAILED'}catch{}
 if($child -and -not $child.HasExited){$child.StandardInput.Close();$child.WaitForExit()}
 throw 'NATIVE_OWNER_CONTROL_FAILED'
}finally{
 if($server){$server.Dispose()}
 if($child -and $child.HasExited){$child.Dispose()}
}

} finally {if($mutexHeld){$ownerMutex.ReleaseMutex()};$ownerMutex.Dispose()}
