$ErrorActionPreference='Stop';$raw=$null;$ptr=[IntPtr]::Zero;$child=$null
try{
 Add-Type -AssemblyName System.Security
 $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
 $credential=Import-Clixml -LiteralPath (Join-Path $root '.local/trial-yanto-login.private.clixml')
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
 $raw=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $root '.local/database-secrets/ops-write-password.machine.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
 $payload=@{username=$credential.UserName;password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr);writePassword=[Text.Encoding]::UTF8.GetString($raw)}
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=(Get-Command node.exe).Source;$info.Arguments='"'+(Join-Path $root 'scripts/check-operational-flow.js')+'"'
 $info.WorkingDirectory=$root;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $child=[Diagnostics.Process]::Start($info)
 $child.StandardInput.Write(($payload|ConvertTo-Json -Compress));$child.StandardInput.Close();$payload=$null
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$ptr=[IntPtr]::Zero
 [Array]::Clear($raw,0,$raw.Length);$raw=$null
 $output=$child.StandardOutput.ReadToEnd();$discard=$child.StandardError.ReadToEnd();$child.WaitForExit();$discard=$null
 Write-Output $output;exit $child.ExitCode
}finally{if($raw){[Array]::Clear($raw,0,$raw.Length)};if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)};if($child){$child.Dispose()};$payload=$null;$credential=$null}
