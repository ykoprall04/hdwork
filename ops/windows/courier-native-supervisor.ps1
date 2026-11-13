# Cooperative owner protocol v1. Only owns the child it creates. No kill/task-stop fallback.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ControlConfig,[Parameter(Mandatory=$true)][string]$ConfigSha256)
$ErrorActionPreference='Stop'
$child=$null;$server=$null;$requested=$false;$childStartedAtUtc=$null;$childPid=0;$phase='START'
function HashFile($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
if((HashFile $ControlConfig) -cne $ConfigSha256){throw 'CONTROL_CONFIG_CHANGED'}
$cfg=Get-Content -LiteralPath $ControlConfig -Raw|ConvertFrom-Json
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if($cfg.kind -cne 'HDWORK2_NATIVE_SUPERVISOR' -or $cfg.version -ne 1 -or $cfg.ownerSid -cne $sid -or $cfg.taskName -notmatch '^(HDWork2-LiveChat-Courier|HDWork2-CourierFixture-[a-f0-9]{32})$' -or $cfg.pipeName -notmatch '^hdwork2-courier-[a-f0-9]{32}$' -or $cfg.graceSeconds -lt 1 -or $cfg.graceSeconds -gt 60){throw 'NATIVE_OWNER_REJECTED'}
$root=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ControlConfig))
foreach($file in @($cfg.stateFile,$cfg.fenceFile)){if(-not ([IO.Path]::GetFullPath($file)).StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'CONTROL_PATH_ESCAPE'}}
if((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'CONTROL_DIRECTORY_LINK'}
function SaveState($status,$exitCode=$null){
 $row=@{version=1;protocol='HDWORK2_COOPERATIVE_OWNER_V1';status=$status;ownerPid=$PID;ownerSid=$sid;taskName=$cfg.taskName;configSha256=$ConfigSha256;pipeName=$cfg.pipeName;childPid=$childPid;childStartedAtUtc=$childStartedAtUtc;updatedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');exitCode=$exitCode;forced=$false}
 $temp=$cfg.stateFile+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
 [IO.File]::WriteAllText($temp,($row|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
 if(Test-Path -LiteralPath $cfg.stateFile){[IO.File]::Replace($temp,$cfg.stateFile,[NullString]::Value)}else{[IO.File]::Move($temp,$cfg.stateFile)}
}
if(Test-Path -LiteralPath $cfg.fenceFile){SaveState 'FENCED_START_REFUSED';exit 0}
if((HashFile $cfg.childCodeFile) -cne $cfg.childCodeSha256 -or (HashFile $cfg.supervisorScript) -cne $cfg.supervisorSha256){throw 'NATIVE_SOURCE_DRIFT'}
if([IO.Path]::GetFileName($cfg.childExecutable) -cne 'node.exe' -or $cfg.childArguments.Count -lt 1 -or $cfg.childArguments[0] -cne $cfg.childCodeFile){throw 'NATIVE_CHILD_REJECTED'}
foreach($arg in $cfg.childArguments){if($arg.Contains('"') -or $arg.Contains("`r") -or $arg.Contains("`n")){throw 'CHILD_ARGUMENT_REJECTED'}}
try{
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$cfg.childExecutable;$info.Arguments=(@($cfg.childArguments|ForEach-Object {'"'+$_+'"'}) -join ' ');$info.WorkingDirectory=$cfg.childWorkingDirectory
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear();foreach($key in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData')){$value=[Environment]::GetEnvironmentVariable($key);if($value){$info.EnvironmentVariables[$key]=$value}}
 $info.EnvironmentVariables['HDWORK2_NATIVE_GRACEFUL_ONLY']='true'
 if(Test-Path -LiteralPath $cfg.fenceFile){SaveState 'FENCED_START_REFUSED';exit 0}
 $child=New-Object Diagnostics.Process;$child.StartInfo=$info;[void]$child.Start();$childPid=$child.Id;$childStartedAtUtc=$child.StartTime.ToUniversalTime().ToString('o');$child.BeginOutputReadLine();$child.BeginErrorReadLine()
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
  SaveState 'STOP_TIMEOUT';$writer.WriteLine('{"status":"STOP_TIMEOUT","clean":false,"forced":false}')
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
