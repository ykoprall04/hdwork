# Cooperative owner protocol v1. Only owns the child it creates. No kill/task-stop fallback.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ControlConfig,[Parameter(Mandatory=$true)][string]$ConfigSha256)
$ErrorActionPreference='Stop'
$child=$null;$server=$null;$requested=$false;$childStartedAtUtc=$null;$childPid=0;$phase='START';$stderrCapture=$null;$stderrHandler=$null
$previousStopClean=$false
function HashFile($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
if((HashFile $ControlConfig) -cne $ConfigSha256){throw 'CONTROL_CONFIG_CHANGED'}
$cfg=Get-Content -LiteralPath $ControlConfig -Raw|ConvertFrom-Json
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if($cfg.kind -cne 'HDWORK2_WEB_SUPERVISOR' -or $cfg.version -ne 1 -or $cfg.ownerSid -cne $sid -or $cfg.taskName -notmatch '^(HDWork2-Web(?:-Standby|-Rollback)?|HDWork2-WebFixture-[a-f0-9]{32})$' -or $cfg.pipeName -notmatch '^hdwork2-web-[a-f0-9]{32}$' -or $cfg.graceSeconds -lt 1 -or $cfg.graceSeconds -gt 60){throw 'NATIVE_OWNER_REJECTED'}
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
if($cfg.taskName -in @('HDWork2-Web','HDWork2-Web-Standby','HDWork2-Web-Rollback') -and ((HashFile $cfg.childExecutable) -cne $cfg.childExecutableSha256 -or ([IO.Path]::GetFileName($cfg.childCodeFile) -cne 'protected-web-service.js' -or $cfg.childArguments.Count -ne 1))){throw 'WEB_CHILD_REJECTED'}
foreach($arg in $cfg.childArguments){if($arg.Contains('"') -or $arg.Contains("`r") -or $arg.Contains("`n")){throw 'CHILD_ARGUMENT_REJECTED'}}
try{
 # DataReceived runs on a CLR worker thread, without a PowerShell runspace.
 # Parse only bounded FAILED JSON frames and persist exactly two allowlisted fields.
 if(-not ('HDWork2.WebStartupStderrCaptureV1' -as [type])){
  Add-Type -ReferencedAssemblies @('System.dll','System.Core.dll','System.Web.Extensions.dll') -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
namespace HDWork2 {
 public sealed class WebStartupStderrCaptureV1 {
  private readonly string path;
  private readonly object gate = new object();
  private bool saved;
  private static readonly HashSet<string> codes = new HashSet<string>(StringComparer.Ordinal) {
   "WEB_STARTUP_FAILED", "PROTECTED_WEB_START_FAILED", "PRIVATE_DB_CONFIG_REJECTED",
   "WEB_STAGE_CONFIG_FAILED", "WEB_STAGE_BOOTSTRAP_FAILED", "WEB_STAGE_API_CONFIG_FAILED",
   "WEB_STAGE_OPERATIONAL_POOLS_FAILED", "WEB_STAGE_TESTING_RUNTIME_FAILED",
   "WEB_STAGE_LOCAL_WEB_FAILED", "WEB_STAGE_READY_STATE_FAILED",
   "EACCES", "EPERM", "ENOENT", "EADDRINUSE", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET",
   "ENOSPC", "EMFILE", "ENFILE", "EIO", "MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND",
   "ERR_DLOPEN_FAILED", "ERR_PACKAGE_PATH_NOT_EXPORTED", "ERR_REQUIRE_ESM",
   "ERR_INVALID_ARG_TYPE", "ERR_INVALID_ARG_VALUE", "ER_ACCESS_DENIED_ERROR",
   "ER_DBACCESS_DENIED_ERROR", "ER_TABLEACCESS_DENIED_ERROR", "ER_SPECIFIC_ACCESS_DENIED_ERROR",
   "ER_BAD_DB_ERROR", "ER_BAD_FIELD_ERROR", "ER_NO_SUCH_TABLE", "ER_CON_COUNT_ERROR",
   "ER_USER_LIMIT_REACHED", "ER_LOCK_WAIT_TIMEOUT", "ER_LOCK_DEADLOCK",
   "DPAPI_TIMEOUT", "DPAPI_FILE_READ_FAILED", "DPAPI_UNPROTECT_FAILED",
   "DPAPI_MEMORY_READ_FAILED", "DPAPI_PIPE_FAILED", "DPAPI_DECRYPT_FAILED"
  };
  public WebStartupStderrCaptureV1(string outputPath) { path = outputPath; }
  public DataReceivedEventHandler Handler { get { return Receive; } }
  private void Receive(object sender, DataReceivedEventArgs args) {
   if (String.IsNullOrEmpty(args.Data) || args.Data.Length > 4096) return;
   string temporary = null;
   try {
    var parser = new JavaScriptSerializer { MaxJsonLength = 4096, RecursionLimit = 4 };
    var frame = parser.DeserializeObject(args.Data) as Dictionary<string, object>;
    object status, value;
    if (frame == null || !frame.TryGetValue("status", out status) ||
        !String.Equals(status as string, "FAILED", StringComparison.Ordinal)) return;
    string code = frame.TryGetValue("code", out value) ? value as string : null;
    if (code == null || !codes.Contains(code)) code = "WEB_STARTUP_FAILED";
    lock (gate) {
     if (saved) return;
     temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
     File.WriteAllText(temporary, "{\"status\":\"FAILED\",\"code\":\"" + code + "\"}", new UTF8Encoding(false));
     if (File.Exists(path)) File.Replace(temporary, path, null); else File.Move(temporary, path);
     temporary = null;
     saved = true; // Preserve the first failure, not a later cleanup error.
    }
   } catch { /* Never persist raw input/exception messages or fail the owner from a reader thread. */ }
   finally { if (temporary != null) { try { File.Delete(temporary); } catch {} } }
  }
 }
}
'@
 }
 [IO.File]::WriteAllText((Join-Path $root 'startup.metadata.json'),'{"phase":"CHILD_PREPARE"}')
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$cfg.childExecutable;$info.Arguments=(@($cfg.childArguments|ForEach-Object {'"'+$_+'"'}) -join ' ');$info.WorkingDirectory=$cfg.childWorkingDirectory
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear();foreach($key in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData')){$value=[Environment]::GetEnvironmentVariable($key);if($value){$info.EnvironmentVariables[$key]=$value}}
 $info.EnvironmentVariables['HDWORK2_NATIVE_GRACEFUL_ONLY']='true'
 if(Test-Path -LiteralPath $cfg.fenceFile){SaveState 'FENCED_START_REFUSED';exit 0}
 if($cfg.taskName -in @('HDWork2-Web','HDWork2-Web-Standby','HDWork2-Web-Rollback') -or $cfg.secretBundleFile){
  if($cfg.ownerSid -cne 'S-1-5-19'){throw 'WEB_SERVICE_IDENTITY_REQUIRED'}
  if(-not $cfg.sourceHashes -or $cfg.secretBundleFile -cne (Join-Path $cfg.childWorkingDirectory 'service\secrets.dpapi') -or (HashFile $cfg.secretBundleFile) -cne $cfg.encryptedBundleSha256){throw 'WEB_BOOTSTRAP_PIN_REJECTED'}
  foreach($required in @('scripts/protected-web-service.js','local-web-server.js','api-only-server.js','src/config/web-drain.js','src/courier/mysql-store.js','src/operations/transaction-gate.js','src/config/operational-grants.js','service/environment.json')){if(-not $cfg.sourceHashes.PSObject.Properties[$required]){throw 'WEB_SOURCE_COVERAGE_REJECTED'}}
  foreach($entry in $cfg.sourceHashes.PSObject.Properties){$file=[IO.Path]::GetFullPath((Join-Path $cfg.childWorkingDirectory $entry.Name));if(-not $file.StartsWith($cfg.childWorkingDirectory+'\') -or (HashFile $file) -cne $entry.Value){throw 'WEB_RUNTIME_SOURCE_DRIFT'}}
  $webEnv=Get-Content (Join-Path $cfg.childWorkingDirectory 'service\environment.json') -Raw|ConvertFrom-Json
  if($webEnv.HDWORK2_COURIER_WRITER_V2_BOTS_JSON -cne '["hdworkopsbot-testing"]'){throw 'WEB_WRITER_SCOPE_REJECTED'}
  if($webEnv.COURIER_ENABLED -cne 'false' -or $webEnv.HDWORK2_TESTING_SOLVER_ENABLED -cne 'false'){throw 'WEB_EXTERNAL_SENDER_REJECTED'}
 }
 $child=New-Object Diagnostics.Process;$child.StartInfo=$info
 $stderrCapture=New-Object HDWork2.WebStartupStderrCaptureV1((Join-Path ([IO.Path]::GetDirectoryName($cfg.stateFile)) 'child-startup-error.json'))
 $stderrHandler=$stderrCapture.Handler;$child.add_ErrorDataReceived($stderrHandler)
 [IO.File]::WriteAllText((Join-Path $root 'startup.metadata.json'),'{"phase":"CHILD_START"}');[void]$child.Start();$childPid=$child.Id;$childStartedAtUtc=$child.StartTime.ToUniversalTime().ToString('o');
 $child.BeginOutputReadLine();$child.BeginErrorReadLine()
 if($cfg.secretBundleFile){
  Add-Type -AssemblyName System.Security
  $plain=$null;try{$plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($cfg.secretBundleFile),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine);$child.StandardInput.WriteLine([Text.Encoding]::UTF8.GetString($plain));$child.StandardInput.Flush()}finally{if($plain){[Array]::Clear($plain,0,$plain.Length)}}
 }
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
 if($child.HasExited){$child.WaitForExit();SaveState $(if($requested){'STOPPED'}else{'CHILD_EXITED'}) $child.ExitCode}
}catch{
 $failure=@{phase=$phase;type=$_.Exception.GetType().Name;code=($_.FullyQualifiedErrorId -split ',')[0]}
 try{[IO.File]::WriteAllText((Join-Path $root 'failure.metadata.json'),($failure|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)));SaveState 'CONTROL_FAILED'}catch{}
 if($child -and -not $child.HasExited){$child.StandardInput.Close();$child.WaitForExit()}
 throw 'NATIVE_OWNER_CONTROL_FAILED'
}finally{
 if($server){$server.Dispose()}
 if($child -and $child.HasExited){$child.WaitForExit();if($stderrHandler){$child.remove_ErrorDataReceived($stderrHandler)};$child.Dispose()}
}

} finally {if($mutexHeld){$ownerMutex.ReleaseMutex()};$ownerMutex.Dispose()}
