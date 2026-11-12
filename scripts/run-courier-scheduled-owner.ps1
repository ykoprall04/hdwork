# Hidden owner for exactly one Node supervisor. Closing owned stdin requests clean shutdown.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Config,[Parameter(Mandatory=$true)][string]$ConfigSha256)
$ErrorActionPreference='Stop'
$child=$null
function WriteOwnerLog([string]$Event,$Failure=$null) {
 if($env:HDWORK2_RAW_LOG_ENABLED -ne 'true'){return}
 try {
  $root=$env:HDWORK2_LOG_DIRECTORY
  if(-not $root){$root=Join-Path $env:ProgramData 'HDWork2\Logs'}
  [void][IO.Directory]::CreateDirectory($root)
  $date=[DateTime]::UtcNow.AddHours(7).ToString('yyyy-MM-dd')
  $row=@{timestamp=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ');source='owner';pid=$PID;event=$Event}
  if($Failure){
   $frames=@()
   foreach($frame in ($Failure.ScriptStackTrace -split "`n")){
    if($frame -match '([A-Za-z0-9_.-]+\.ps1): line (\d+)$'){$frames+=@{file=$Matches[1];line=[int]$Matches[2]}}
   }
   $reason=if($Failure.FullyQualifiedErrorId -in @('CONFIG_HASH_REQUIRED','CONFIG_CHANGED','DPAPI_OWNER_MISMATCH','RUNNER_CHANGED','PATH_REJECTED')){$Failure.FullyQualifiedErrorId}else{'OWNER_EXCEPTION'}
   $row.error=@{message='[redacted]';code=$reason;hresult=$Failure.Exception.HResult;traceback=$frames}
  }
  [IO.File]::AppendAllText((Join-Path $root "hdwork2-$date-owner-$PID.jsonl"),(ConvertTo-Json $row -Compress)+[Environment]::NewLine,(New-Object Text.UTF8Encoding($false)))
 }catch{} # owner lifecycle must remain independent from log storage
}
try {
 if($ConfigSha256 -notmatch '^[a-f0-9]{64}$'){throw 'CONFIG_HASH_REQUIRED'}
 $actual=(Get-FileHash -LiteralPath $Config -Algorithm SHA256).Hash.ToLowerInvariant()
 if($actual -ne $ConfigSha256){throw 'CONFIG_CHANGED'}
 $cfg=Get-Content -LiteralPath $Config -Raw|ConvertFrom-Json
 if($cfg.rawLog){
  if($cfg.rawLog.enabled -ne $true -or $cfg.rawLog.directory -cne 'C:\ProgramData\HDWork2\Logs'){throw 'RAW_LOG_CONFIG_REJECTED'}
  $env:HDWORK2_RAW_LOG_ENABLED='true';$env:HDWORK2_LOG_DIRECTORY=$cfg.rawLog.directory
 }
 WriteOwnerLog 'OWNER_START'
 if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $cfg.ownerSid){throw 'DPAPI_OWNER_MISMATCH'}
 $runner=Join-Path (Split-Path -Parent $Config) 'courier-task-runner.js'
 if((Get-FileHash -LiteralPath $runner -Algorithm SHA256).Hash.ToLowerInvariant() -ne $cfg.runnerSha256){throw 'RUNNER_CHANGED'}
 if($runner.Contains('"') -or $Config.Contains('"')){throw 'PATH_REJECTED'}
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$cfg.nodeExecutable
 $info.Arguments='"'+$runner+'" --config "'+$Config+'" --config-sha256 '+$ConfigSha256
 $info.WorkingDirectory=$cfg.snapshot
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear()
 foreach($key in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData','HDWORK2_RAW_LOG_ENABLED','HDWORK2_LOG_DIRECTORY')){
  $value=[Environment]::GetEnvironmentVariable($key);if($value){$info.EnvironmentVariables[$key]=$value}
 }
 $child=New-Object Diagnostics.Process;$child.StartInfo=$info;[void]$child.Start()
 $child.BeginOutputReadLine();$child.BeginErrorReadLine();$child.WaitForExit()
 exit $child.ExitCode
}catch{
 WriteOwnerLog 'OWNER_FAILED' $_
 Write-Output 'COURIER_SCHEDULED_OWNER_FAILED'
 exit 1
}finally{
 WriteOwnerLog 'OWNER_STOP'
 if($child){
  try{if(-not $child.HasExited){$child.StandardInput.WriteLine('STOP');$child.StandardInput.Close();if(-not $child.WaitForExit(25000)){$child.Kill()}}}catch{}
  $child.Dispose()
 }
}
