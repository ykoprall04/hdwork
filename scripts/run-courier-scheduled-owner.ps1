# Hidden owner for exactly one Node supervisor. Closing owned stdin requests clean shutdown.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Config,[Parameter(Mandatory=$true)][string]$ConfigSha256)
$ErrorActionPreference='Stop'
$child=$null
try {
 if($ConfigSha256 -notmatch '^[a-f0-9]{64}$'){throw 'CONFIG_HASH_REQUIRED'}
 $actual=(Get-FileHash -LiteralPath $Config -Algorithm SHA256).Hash.ToLowerInvariant()
 if($actual -ne $ConfigSha256){throw 'CONFIG_CHANGED'}
 $cfg=Get-Content -LiteralPath $Config -Raw|ConvertFrom-Json
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
 foreach($key in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA')){
  $value=[Environment]::GetEnvironmentVariable($key);if($value){$info.EnvironmentVariables[$key]=$value}
 }
 $child=New-Object Diagnostics.Process;$child.StartInfo=$info;[void]$child.Start()
 $child.BeginOutputReadLine();$child.BeginErrorReadLine();$child.WaitForExit()
 exit $child.ExitCode
}catch{
 Write-Output 'COURIER_SCHEDULED_OWNER_FAILED'
 exit 1
}finally{
 if($child){
  try{if(-not $child.HasExited){$child.StandardInput.WriteLine('STOP');$child.StandardInput.Close();if(-not $child.WaitForExit(25000)){$child.Kill()}}}catch{}
  $child.Dispose()
 }
}
