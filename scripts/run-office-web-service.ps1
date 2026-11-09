# SYSTEM startup task supervisor. Owned stdin is the secret/bootstrap lease.
$ErrorActionPreference='Stop';$child=$null;$plain=$null
try{
 Add-Type -AssemblyName System.Security
 $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes('C:\ProgramData\HDWork2\web\secrets.dpapi'),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName='C:\Program Files\nodejs\node.exe';$info.Arguments='D:\HDWork2-New\scripts\office-web-service.js';$info.WorkingDirectory='D:\HDWork2-New'
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $keep=@{};foreach($key in @('SystemRoot','PATH','TEMP','TMP','PROGRAMDATA')){if($info.EnvironmentVariables[$key]){$keep[$key]=$info.EnvironmentVariables[$key]}}
 $info.EnvironmentVariables.Clear();foreach($key in $keep.Keys){$info.EnvironmentVariables[$key]=$keep[$key]}
 $child=New-Object Diagnostics.Process;$child.StartInfo=$info;[void]$child.Start()
 $child.BeginOutputReadLine();$child.BeginErrorReadLine()
 $child.StandardInput.WriteLine([Text.Encoding]::UTF8.GetString($plain));$child.StandardInput.Flush();[Array]::Clear($plain,0,$plain.Length);$plain=$null
 $child.WaitForExit();if($child.ExitCode -ne 0){exit 1}
}catch{Write-Output 'HDWORK2_WEB_SUPERVISOR_FAILED';exit 1}
finally{if($plain){[Array]::Clear($plain,0,$plain.Length)};if($child){try{$child.StandardInput.Close()}catch{};$child.Dispose()}}
