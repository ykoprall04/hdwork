# Cooperative owner protocol v1. Only owns the child it creates. No kill/task-stop fallback.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ControlConfig,[Parameter(Mandatory=$true)][string]$ConfigSha256)
$ErrorActionPreference='Stop'
$child=$null;$server=$null;$requested=$false;$childStartedAtUtc=$null;$childPid=0;$phase='START'
$previousStopClean=$false
$supervisorExit=0
function HashFile($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
if((HashFile $ControlConfig) -cne $ConfigSha256){throw 'CONTROL_CONFIG_CHANGED'}
$cfg=Get-Content -LiteralPath $ControlConfig -Raw|ConvertFrom-Json
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if($cfg.kind -cne 'HDWORK2_NATIVE_SUPERVISOR' -or $cfg.version -ne 1 -or $cfg.ownerSid -cne $sid -or $cfg.taskName -notmatch '^(HDWork2-LiveChat-Courier|HDWork2-CourierFixture-[a-f0-9]{32})$' -or $cfg.pipeName -notmatch '^hdwork2-courier-[a-f0-9]{32}$' -or $cfg.graceSeconds -lt 1 -or $cfg.graceSeconds -gt 60){throw 'NATIVE_OWNER_REJECTED'}
$root=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ControlConfig))
foreach($file in @($cfg.stateFile,$cfg.fenceFile)){if(-not ([IO.Path]::GetFullPath($file)).StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'CONTROL_PATH_ESCAPE'}}
if((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'CONTROL_DIRECTORY_LINK'}
$lastHeartbeat=[DateTime]::MinValue
$taskInstanceId='UNKNOWN'
try{
 foreach($event in @(Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-TaskScheduler/Operational';Id=129,200;StartTime=(Get-Date).AddMinutes(-2)} -MaxEvents 12 -ErrorAction Stop)){
  $xml=[xml]$event.ToXml();$data=@{};foreach($item in $xml.Event.EventData.Data){$data[[string]$item.Name]=[string]$item.'#text'}
  if($data.TaskName -eq ('\'+$cfg.taskName) -and ($data.ProcessId -eq [string]$PID -or $data.EnginePID -eq [string]$PID)){
   foreach($key in @('TaskInstanceId','InstanceId')){if($data[$key] -match '^\{?[a-fA-F0-9-]{36}\}?$'){$taskInstanceId=$data[$key]}};break
  }
 }
}catch{} # Event history may be unavailable; never guess a Task Instance ID.
function Lifecycle($event,$details=@{}){
 if(Get-Command WriteOwnerLog -ErrorAction SilentlyContinue){$details.taskInstanceId=$taskInstanceId;WriteOwnerLog $event -Details $details}
}
function IncidentSnapshot {
 $snapshot=@{sessionId=[Diagnostics.Process]::GetCurrentProcess().SessionId;networkAvailable='UNKNOWN';power='UNKNOWN';events=@()}
 try{$snapshot.networkAvailable=[Net.NetworkInformation.NetworkInterface]::GetIsNetworkAvailable()}catch{}
 try{$snapshot.power=@(Get-CimInstance Win32_Battery -ErrorAction Stop|Select-Object -ExpandProperty BatteryStatus)}catch{}
 foreach($log in @('System','Microsoft-Windows-TaskScheduler/Operational')){
  try{$snapshot.events+=@(Get-WinEvent -FilterHashtable @{LogName=$log;StartTime=(Get-Date).AddMinutes(-3);Id=$(if($log -eq 'System'){@(41,42,107,1074,6006,6008)}else{@(100,102,111,129,200,201,203)})} -MaxEvents 12 -ErrorAction Stop|ForEach-Object {@{log=$log;id=$_.Id;timeUtc=$_.TimeCreated.ToUniversalTime().ToString('o')}})}catch{}
 }
 # Only fixed schema diagnostics are passed, never Event.Message/EventData.
 if(Get-Command WriteOwnerLog -ErrorAction SilentlyContinue){WriteOwnerLog 'INCIDENT_SNAPSHOT' -Details @{incident=$snapshot;reason='UNKNOWN';taskInstanceId=$taskInstanceId}}
}
function SaveState($status,$exitCode=$null){
 $row=@{version=1;protocol='HDWORK2_COOPERATIVE_OWNER_V1';status=$status;ownerPid=$PID;ownerSid=$sid;taskName=$cfg.taskName;configSha256=$ConfigSha256;pipeName=$cfg.pipeName;childPid=$childPid;childStartedAtUtc=$childStartedAtUtc;updatedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');exitCode=$exitCode;forced=$false;previousStopClean=$previousStopClean;taskInstanceId=$taskInstanceId;heartbeatIntervalSeconds=15}
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
 $script:lastHeartbeat=[DateTime]::UtcNow
 Lifecycle 'SUPERVISOR_STATE' @{phase=$status;childPid=$childPid;exitCode=$exitCode}
}
# A Scheduled Task policy alone does not fence a second direct invocation.
$ownerMutex=New-Object Threading.Mutex($false,('Global\HDWork2Courier-'+$cfg.taskName))
$mutexHeld=$false
try {
 try {$mutexHeld=$ownerMutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$mutexHeld=$true;Lifecycle 'PREVIOUS_SHUTDOWN_UNKNOWN' @{reason='UNKNOWN'}}
 if(-not $mutexHeld){throw 'NATIVE_OWNER_ALREADY_RUNNING'}
if(Test-Path -LiteralPath $cfg.fenceFile){
 if(Test-Path -LiteralPath $cfg.stateFile){try{$old=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json;$previousStopClean=$old.configSha256 -ceq $ConfigSha256 -and (($old.status -ceq 'STOPPED' -and $null -ne $old.exitCode -and $old.exitCode -eq 0) -or $old.previousStopClean -eq $true)}catch{}}
 SaveState 'FENCED_START_REFUSED';exit 0
}
# A dead supervisor may leave Node/Python draining. Never overlap an old chain.
if(Test-Path -LiteralPath $cfg.stateFile){
 $prior=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json
 if($prior.childPid -and $prior.childStartedAtUtc){
  $old=Get-Process -Id ([int]$prior.childPid) -ErrorAction SilentlyContinue
  if($old -and [Math]::Abs(($old.StartTime.ToUniversalTime()-[DateTimeOffset]::Parse($prior.childStartedAtUtc).UtcDateTime).TotalSeconds) -lt 2){throw 'NATIVE_PREVIOUS_CHILD_STILL_ALIVE'}
  if(@(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+[int]$prior.childPid)|Where-Object {$_.CreationDate.ToUniversalTime() -ge [DateTimeOffset]::Parse($prior.childStartedAtUtc).UtcDateTime}).Count){throw 'NATIVE_PREVIOUS_DESCENDANT_STILL_ALIVE'}
 }
 if($prior.status -in @('READY','STOPPING','DRAINING_DESCENDANTS')){Lifecycle 'PREVIOUS_SHUTDOWN_UNKNOWN' @{reason='UNKNOWN'};IncidentSnapshot}
}
if((HashFile $cfg.childCodeFile) -cne $cfg.childCodeSha256 -or (HashFile $cfg.supervisorScript) -cne $cfg.supervisorSha256){throw 'NATIVE_SOURCE_DRIFT'}
if([IO.Path]::GetFileName($cfg.childExecutable) -cne 'node.exe' -or $cfg.childArguments.Count -lt 1 -or $cfg.childArguments[0] -cne $cfg.childCodeFile){throw 'NATIVE_CHILD_REJECTED'}
foreach($arg in $cfg.childArguments){if($arg.Contains('"') -or $arg.Contains("`r") -or $arg.Contains("`n")){throw 'CHILD_ARGUMENT_REJECTED'}}
try{
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$cfg.childExecutable;$info.Arguments=(@($cfg.childArguments|ForEach-Object {'"'+$_+'"'}) -join ' ');$info.WorkingDirectory=$cfg.childWorkingDirectory
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear();foreach($key in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData','HDWORK2_RAW_LOG_ENABLED','HDWORK2_LOG_DIRECTORY')){$value=[Environment]::GetEnvironmentVariable($key);if($value){$info.EnvironmentVariables[$key]=$value}}
 $info.EnvironmentVariables['HDWORK2_NATIVE_GRACEFUL_ONLY']='true'
 if(Test-Path -LiteralPath $cfg.fenceFile){SaveState 'FENCED_START_REFUSED';exit 0}
 $child=New-Object Diagnostics.Process;$child.StartInfo=$info;[void]$child.Start();$childPid=$child.Id;$childStartedAtUtc=$child.StartTime.ToUniversalTime().ToString('o');$child.BeginOutputReadLine();$child.BeginErrorReadLine();SaveState 'CHILD_STARTED'
 $security=New-Object IO.Pipes.PipeSecurity
 foreach($account in @($sid,'S-1-5-18','S-1-5-32-544')){$security.AddAccessRule((New-Object IO.Pipes.PipeAccessRule((New-Object Security.Principal.SecurityIdentifier($account)),[IO.Pipes.PipeAccessRights]::ReadWrite,[Security.AccessControl.AccessControlType]::Allow)))}
 while(-not $child.HasExited){
  $server=New-Object IO.Pipes.NamedPipeServerStream($cfg.pipeName,[IO.Pipes.PipeDirection]::InOut,1,[IO.Pipes.PipeTransmissionMode]::Byte,[IO.Pipes.PipeOptions]::Asynchronous,4096,4096,$security)
  $phase='PIPE_WAIT';$pending=$server.WaitForConnectionAsync();SaveState 'READY'
  while(-not $pending.Wait(250)){if($child.HasExited){break};if(([DateTime]::UtcNow-$lastHeartbeat).TotalSeconds -ge 15){SaveState 'READY'}}
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
 if($child.HasExited){
  # A dead Node can leave its Python child draining after stdin EOF. Hold the
  # mutex until every direct child from this run is gone; never kill a sender.
  do {
   $descendants=@(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$childPid) | Where-Object {$_.CreationDate.ToUniversalTime() -ge [DateTimeOffset]::Parse($childStartedAtUtc).UtcDateTime})
   if($descendants.Count){SaveState 'DRAINING_DESCENDANTS' $child.ExitCode;Start-Sleep -Milliseconds 250}
  }while($descendants.Count)
  SaveState $(if($requested){'STOPPED'}else{'CHILD_EXITED'}) $child.ExitCode
  if(-not $requested){Lifecycle 'SUPERVISOR_INCIDENT' @{reason='UNKNOWN';childPid=$childPid;exitCode=$child.ExitCode};IncidentSnapshot}
  if(-not $requested){
   $supervisorExit=if($child.ExitCode -eq 1){1}else{75}
   # An unhandled Node crash commonly exits 1 too. Only a READY receipt bound
   # to this exact Node run can distinguish that from a permanent startup error.
   if($child.ExitCode -eq 1 -and $cfg.childArguments.Count -eq 5 -and $cfg.childArguments[1] -ceq '--config'){
    try{
     $runnerState=Get-Content -LiteralPath (Join-Path (Split-Path -Parent $cfg.childArguments[2]) 'state.json') -Raw|ConvertFrom-Json
     if($runnerState.nodePid -eq $childPid -and $runnerState.configSha256 -ceq $cfg.childArguments[4] -and $runnerState.status -ceq 'READY' -and [DateTimeOffset]::Parse($runnerState.startedAt) -ge [DateTimeOffset]::Parse($childStartedAtUtc)){$supervisorExit=75}
    }catch{} # Missing/stale/invalid proof fails closed, without restart.
   }
  }
 }
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
Lifecycle 'SUPERVISOR_SHUTDOWN' @{exitCode=$supervisorExit;reason=$(if($requested){'COOPERATIVE_STOP'}else{'UNKNOWN'})}
exit $supervisorExit
