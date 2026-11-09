# Manual provisioning only. Does not deploy, restart, migrate schema, or contact Telegram.
[CmdletBinding()]
param([ValidateSet('Review','Inspect','Apply','Verify')][string]$Mode='Inspect',[switch]$ConfirmProvision)
$ErrorActionPreference='Stop'
$rootSecret=$null;$rootPointer=[IntPtr]::Zero;$writerSecure=$null;$writerPlain=$null;$random=$null;$machinePlain=$null;$stage='PREFLIGHT'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node=(Get-Command node.exe -ErrorAction Stop).Source
$helper=Join-Path $projectRoot 'scripts\provision-hdwork2-writer.js'
$currentSid=[Security.Principal.WindowsIdentity]::GetCurrent().User
function New-PrivateAcl([bool]$directory){
 $acl=if($directory){New-Object Security.AccessControl.DirectorySecurity}else{New-Object Security.AccessControl.FileSecurity}
 $acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($currentSid)
 foreach($sid in @($currentSid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),(New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))){
  if($directory){$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')}
  else{$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')}
  [void]$acl.AddAccessRule($rule)
 }
 return $acl
}
function Write-PrivateNew([string]$file,[byte[]]$bytes){
 # Stage inside the private run directory, then move atomically on the same volume.
 # FileStream's data handle need not have WRITE_DAC; Set-Acl opens the proper handle.
 if(Test-Path -LiteralPath $file){throw 'EXISTING_SECRET_PRESERVED'}
 $stagedFile=Join-Path $runDir ('secret-stage-'+[Guid]::NewGuid().ToString('N'))
 $stream=[IO.File]::Open($stagedFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush()}finally{$stream.Dispose()}
 Set-Acl -LiteralPath $stagedFile -AclObject (New-PrivateAcl $false)
 [IO.File]::Move($stagedFile,$file)
}
function Invoke-Writer([string]$cliMode){
 $child=$null;$privateInput=$null;$discarded=$null;$payload=$null;$ptr=[IntPtr]::Zero
 try{
  $start=New-Object Diagnostics.ProcessStartInfo
  $start.FileName=$node;$start.Arguments='"'+$helper+'" '+$cliMode;$start.WorkingDirectory=$projectRoot
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.EnvironmentVariables.Clear()
  foreach($key in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','COMSPEC','USERPROFILE','LOCALAPPDATA')){ $v=[Environment]::GetEnvironmentVariable($key);if($v){$start.EnvironmentVariables[$key]=$v} }
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($rootSecret)
  $payload=@{adminUser='root';adminPassword=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr);reportDirectory=$runDir}
  $privateInput=$payload|ConvertTo-Json -Compress
  $child=New-Object Diagnostics.Process;$child.StartInfo=$start;[void]$child.Start()
  $child.StandardInput.Write($privateInput);$child.StandardInput.Close();$privateInput=$null;$payload=$null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$ptr=[IntPtr]::Zero
  $output=$child.StandardOutput.ReadToEnd();$discarded=$child.StandardError.ReadToEnd();$child.WaitForExit();$discarded=$null
  try{$result=$output|ConvertFrom-Json}catch{throw 'SAFE_RESULT_UNAVAILABLE'}
  if($child.ExitCode -ne 0){$script:lastResult=$result;throw 'WRITER_HELPER_BLOCKED'}
  return $result
 }finally{if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)};if($child){$child.Dispose()};$privateInput=$null;$payload=$null;$output=$null;$discarded=$null}
}
try{
 if($Mode -eq 'Review'){& $node $helper --review;exit $LASTEXITCODE}
 if($Mode -eq 'Apply' -and -not $ConfirmProvision){throw 'EXPLICIT_CONFIRMATION_REQUIRED'}
 foreach($p in @($projectRoot,(Join-Path $projectRoot '.local'))){if((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE_PATH_REJECTED'}}
 $runDir=Join-Path $projectRoot ('.local\writer-provision-'+[Guid]::NewGuid().ToString('N'))
 [void][IO.Directory]::CreateDirectory($runDir);Set-Acl -LiteralPath $runDir -AclObject (New-PrivateAcl $true)
 $rootSecret=Read-Host 'Password root MySQL lokal (tersembunyi, tidak disimpan)' -AsSecureString
 if(-not $rootSecret.Length){throw 'ROOT_PASSWORD_REQUIRED'}
 $stage='INSPECT_ACCOUNTS'
 if($Mode -eq 'Inspect'){$result=Invoke-Writer '--inspect'}
 elseif($Mode -eq 'Verify'){$result=Invoke-Writer '--verify'}
 else{
  $preflight=Invoke-Writer '--inspect'
  if(-not $preflight.authExists -or $preflight.authLocked -or $preflight.authUnsafe -or -not $preflight.authProjectedPolicyPass -or -not $preflight.approvalColumnPresent){throw 'AUTH_PREFLIGHT_REQUIRES_REVIEW'}
  if($preflight.writerExists){throw 'EXISTING_WRITER_PRESERVED_USE_VERIFY'}
  $folder=Join-Path $projectRoot '.local\database-secrets'
  [void][IO.Directory]::CreateDirectory($folder)
  if((Get-Item -LiteralPath $folder).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'SECRET_DIRECTORY_REJECTED'}
  $writerFile=Join-Path $folder 'ops-write-password.dpapi'
  $machineFile=Join-Path $folder 'ops-write-password.machine.dpapi'
  if((Test-Path -LiteralPath $writerFile) -or (Test-Path -LiteralPath $machineFile)){throw 'EXISTING_WRITER_SECRET_PRESERVED'}
  # Confirm that the existing auth DPAPI is readable by this Windows identity.
  $authSecure=ConvertTo-SecureString -String ([IO.File]::ReadAllText((Join-Path $projectRoot '.local\hdwork-auth.password.dpapi')).Trim())
  $authSecure.Dispose();$authSecure=$null
  $stage='GENERATE_AND_PROTECT_WRITER_PASSWORD'
  Add-Type -AssemblyName System.Security
  $random=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{$rng.GetBytes($random)}finally{$rng.Dispose()}
  $writerPlain='Hd2!'+[Convert]::ToBase64String($random).TrimEnd('=').Replace('+','-').Replace('/','_')
  [Array]::Clear($random,0,$random.Length);$random=$null
  $writerSecure=New-Object Security.SecureString
  foreach($ch in $writerPlain.ToCharArray()){$writerSecure.AppendChar($ch)};$writerSecure.MakeReadOnly()
  $cipher=ConvertFrom-SecureString -SecureString $writerSecure
  Write-PrivateNew $writerFile ([Text.Encoding]::UTF8.GetBytes($cipher));$cipher=$null
  $machinePlain=[Text.Encoding]::UTF8.GetBytes($writerPlain)
  $machineCipher=[Security.Cryptography.ProtectedData]::Protect($machinePlain,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
  Write-PrivateNew $machineFile $machineCipher
  $probe=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($machineFile),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
  try{if([Text.Encoding]::UTF8.GetString($probe) -cne $writerPlain){throw 'MACHINE_DPAPI_ROUNDTRIP_FAILED'}}finally{[Array]::Clear($probe,0,$probe.Length);$probe=$null}
  [Array]::Clear($machinePlain,0,$machinePlain.Length);$machinePlain=$null;$writerPlain=$null;$machineCipher=$null
  $stage='PROVISION_AUTH_AND_WRITER'
  $result=Invoke-Writer '--apply-confirmed'
  $result|Add-Member -NotePropertyName machineDpapiFile -NotePropertyValue '.local/database-secrets/ops-write-password.machine.dpapi'
  $result|Add-Member -NotePropertyName activeRuntimeChanged -NotePropertyValue $false
 }
 $result|Select-Object status,stage,target,authExists,authLocked,authPolicyPass,authProjectedPolicyPass,writerExists,writerPolicyPass,createdWriter,writerUnlocked,writerConnection,authConnection,authGrantStatements,writerOrderInsertAllowed,orderAndUserDataPreserved,writerDpapiFile,machineDpapiFile,activeRuntimeChanged,report|ConvertTo-Json -Depth 6
 exit 0
}catch{
 if($lastResult){$lastResult|Select-Object status,code,stage,createdWriter,writerUnlocked,authGrantStatements,partialChangesPossible,automaticRetry,report|ConvertTo-Json -Depth 5}
 else{[pscustomobject]@{status='BLOCKED';code='LOCAL_WRITER_PROVISIONING_BLOCKED';stage=$stage;reportDirectory=$runDir;automaticRetry=$false;passwordLogged=$false}|ConvertTo-Json}
 exit 1
}finally{
 if($rootSecret){$rootSecret.Dispose()};if($writerSecure){$writerSecure.Dispose()}
 if($random){[Array]::Clear($random,0,$random.Length)};if($machinePlain){[Array]::Clear($machinePlain,0,$machinePlain.Length)}
 $writerPlain=$null;$cipher=$null;$machineCipher=$null;$rootSecret=$null
}
