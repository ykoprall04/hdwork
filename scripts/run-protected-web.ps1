# Protected snapshot supervisor. Scheduled as LocalService, not SYSTEM.
$ErrorActionPreference='Stop'
$snapshot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$state=Join-Path $snapshot 'service\state'
# Logging release activation is single-attempt; Task Scheduler retry is disabled by controller.
$rawLogSingleAttempt=(Get-Content -LiteralPath (Join-Path $snapshot 'service/environment.json') -Raw|ConvertFrom-Json).HDWORK2_RAW_LOG_ENABLED -eq 'true'
$webExit=0
while($true){
$child=$null;$plain=$null
try{
 Add-Type -AssemblyName System.Security
 $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $snapshot 'service\secrets.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName='C:\Program Files\nodejs\node.exe';$info.Arguments='"'+(Join-Path $snapshot 'scripts\protected-web-service.js')+'"';$info.WorkingDirectory=$snapshot
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear()
 $info.EnvironmentVariables['SystemRoot']=$env:SystemRoot
 $info.EnvironmentVariables['PATH']='C:\Windows\System32;C:\Windows;C:\Program Files\nodejs'
 $info.EnvironmentVariables['TEMP']=$state;$info.EnvironmentVariables['TMP']=$state
 $child=New-Object Diagnostics.Process;$child.StartInfo=$info;[void]$child.Start()
 $child.BeginOutputReadLine();$errors=$child.StandardError.ReadToEndAsync()
 $child.StandardInput.WriteLine([Text.Encoding]::UTF8.GetString($plain));$child.StandardInput.Flush();[Array]::Clear($plain,0,$plain.Length);$plain=$null
 $child.WaitForExit();$webExit=$child.ExitCode
 # Child emits codes only, no exception messages or credential contents.
 [IO.File]::WriteAllText((Join-Path $state 'supervisor.json'),(@{exited=$true;exitCode=$child.ExitCode;checkedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json))
}catch{
 $webExit=1
 [IO.File]::WriteAllText((Join-Path $state 'supervisor.json'),(@{status='RETRYING';errorType=$_.Exception.GetType().Name;checkedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json))
}finally{
 if($plain){[Array]::Clear($plain,0,$plain.Length)}
 if($child){try{$child.StandardInput.Close();if(-not $child.HasExited){$child.Kill()}}catch{};$child.Dispose()}
}
if($rawLogSingleAttempt){break}
Start-Sleep -Seconds 5
}

if($rawLogSingleAttempt){exit $webExit}
