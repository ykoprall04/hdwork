# Protected snapshot supervisor. Scheduled as LocalService, not SYSTEM.
param([switch]$CheckVlanAdapter,[string]$ExpectedServerUuid,[string]$ControlConfig,[string]$ConfigSha256)
$ErrorActionPreference='Stop'
$snapshot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$state=Join-Path $snapshot 'service\state'
if($CheckVlanAdapter){
 # The existing wrapper owns bootstrap; this mode never edits/starts the Web task.
 if($ExpectedServerUuid -notmatch '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$' -or $ConfigSha256 -notmatch '^[a-f0-9]{64}$'){throw 'VLAN_CHECK_PIN_REQUIRED'}
 if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne 'S-1-5-19'){throw 'VLAN_CHECK_OWNER_REJECTED'}
 if((Get-FileHash -LiteralPath $ControlConfig -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ConfigSha256){throw 'VLAN_CHECK_CONFIG_DRIFT'}
 $checkConfig=Get-Content -LiteralPath $ControlConfig -Raw|ConvertFrom-Json
 if($checkConfig.kind -cne 'HDWORK2_WEB_SUPERVISOR' -or $checkConfig.ownerSid -cne 'S-1-5-19' -or [IO.Path]::GetFullPath($checkConfig.childWorkingDirectory) -ine $snapshot){throw 'VLAN_CHECK_SCOPE_REJECTED'}
 foreach($dir in @($snapshot,(Split-Path -Parent $ControlConfig),(Join-Path $snapshot 'service'))){
  if((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'VLAN_CHECK_PATH_REJECTED'}
  foreach($rule in (Get-Acl -LiteralPath $dir).Access){$sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($rule.AccessControlType -eq 'Allow' -and ([int]$rule.FileSystemRights -band [int][Security.AccessControl.FileSystemRights]::Write) -and $sid -notin @('S-1-5-19','S-1-5-18','S-1-5-32-544')){throw 'VLAN_CHECK_ACL_REJECTED'}}
 }
 foreach($relative in @('scripts/run-protected-web.ps1','scripts/protected-web-service.js','scripts/lib/vlan-connection-check.cjs','scripts/lib/vlan-import-session.cjs','scripts/office-web-service.js','src/config/protected-service-bundle.js','service/environment.json')){
  $pin=$checkConfig.sourceHashes.PSObject.Properties[$relative];$file=Join-Path $snapshot $relative
  if(-not $pin -or ((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne [string]$pin.Value){throw 'VLAN_CHECK_SOURCE_DRIFT'}
 }
 if($checkConfig.secretBundleFile -cne (Join-Path $snapshot 'service\secrets.dpapi') -or (Get-FileHash -LiteralPath $checkConfig.secretBundleFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $checkConfig.encryptedBundleSha256 -or (Get-FileHash -LiteralPath 'C:\Program Files\nodejs\node.exe' -Algorithm SHA256).Hash.ToLowerInvariant() -cne $checkConfig.childExecutableSha256){throw 'VLAN_CHECK_BOOTSTRAP_DRIFT'}
}elseif($ExpectedServerUuid -or $ControlConfig -or $ConfigSha256){throw 'VLAN_CHECK_MODE_REQUIRED'}
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
 if($CheckVlanAdapter){$info.Arguments+=' --check-vlan-adapter '+$ExpectedServerUuid}
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear()
 $info.EnvironmentVariables['SystemRoot']=$env:SystemRoot
 $info.EnvironmentVariables['PATH']='C:\Windows\System32;C:\Windows;C:\Program Files\nodejs'
 $info.EnvironmentVariables['TEMP']=$state;$info.EnvironmentVariables['TMP']=$state
 $child=New-Object Diagnostics.Process;$child.StartInfo=$info;[void]$child.Start()
 $child.BeginOutputReadLine();$errors=$child.StandardError.ReadToEndAsync()
 $child.StandardInput.WriteLine([Text.Encoding]::UTF8.GetString($plain));$child.StandardInput.Flush();[Array]::Clear($plain,0,$plain.Length);$plain=$null
 if($CheckVlanAdapter){
  if(-not $child.WaitForExit(30000)){$child.Kill();$webExit=1}else{$webExit=$child.ExitCode}
  if($webExit -eq 0){Write-Output '{"status":"PASS","check":"VLAN_WRITER_CONNECTION","readOnly":true}'}else{Write-Output '{"status":"FAILED","code":"VLAN_CHECK_FAILED"}'}
 }else{$child.WaitForExit();$webExit=$child.ExitCode}
 # Child emits codes only, no exception messages or credential contents.
 if(-not $CheckVlanAdapter){[IO.File]::WriteAllText((Join-Path $state 'supervisor.json'),(@{exited=$true;exitCode=$child.ExitCode;checkedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json))}
}catch{
 $webExit=1
 if($CheckVlanAdapter){Write-Output '{"status":"FAILED","code":"VLAN_CHECK_FAILED"}'}else{[IO.File]::WriteAllText((Join-Path $state 'supervisor.json'),(@{status='RETRYING';errorType=$_.Exception.GetType().Name;checkedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json))}
}finally{
 if($plain){[Array]::Clear($plain,0,$plain.Length)}
 if($child){try{$child.StandardInput.Close();if(-not $child.HasExited){$child.Kill()}}catch{};$child.Dispose()}
}
if($CheckVlanAdapter){break}
if($rawLogSingleAttempt){break}
Start-Sleep -Seconds 5
}

if($CheckVlanAdapter -or $rawLogSingleAttempt){exit $webExit}
