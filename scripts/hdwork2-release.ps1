[CmdletBinding()]
param(
 [ValidateSet('RestoreRehearsal','Inspect','Apply')][string]$Mode='Inspect',
 [string]$BackupFile='.local\backups\20261109-153956\hdwork2.sql',
 [string]$RehearsalReport,
 [switch]$ConfirmApply
)
$ErrorActionPreference='Stop'
$rootSecret=$null;$rootPointer=[IntPtr]::Zero;$child=$null;$privateInput=$null
try {
 $projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
 if($Mode -eq 'Apply' -and (-not $ConfirmApply -or [string]::IsNullOrWhiteSpace($RehearsalReport))){throw 'Apply requires explicit confirmation and passing restore report'}
 $localRoot=Join-Path $projectRoot '.local'
 foreach($checkedPath in @($projectRoot,$localRoot)){
  if((Get-Item -LiteralPath $checkedPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse path rejected'}
 }
 $prefix=if($Mode -eq 'RestoreRehearsal'){'restore-rehearsal-'}else{'release-maintenance-'}
 $runDir=Join-Path $localRoot ($prefix+[Guid]::NewGuid().ToString('N'))
 [void][IO.Directory]::CreateDirectory($runDir)
 $acl=New-Object Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 $currentSid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 foreach($sid in @($currentSid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),(New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))){
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  [void]$acl.AddAccessRule($rule)
 }
 Set-Acl -LiteralPath $runDir -AclObject $acl
 $payload=@{reportDirectory=$runDir;backupFile=$BackupFile;rehearsalReport=$RehearsalReport}
 if($Mode -ne 'RestoreRehearsal'){
  $rootSecret=Read-Host 'Password root MySQL lokal (tersembunyi, tidak disimpan)' -AsSecureString
  if(-not $rootSecret.Length){throw 'Empty root password'}
  $rootPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($rootSecret)
  $payload.adminPassword=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($rootPointer)
 }
 $cliMode=switch($Mode){'RestoreRehearsal'{'--restore-rehearsal'}'Inspect'{'--inspect'}'Apply'{'--apply-confirmed'}}
 $start=New-Object Diagnostics.ProcessStartInfo
 $start.FileName=(Get-Command node.exe -ErrorAction Stop).Source
 $start.Arguments='"'+(Join-Path $projectRoot 'scripts\hdwork2-release.js')+'" '+$cliMode
 $start.WorkingDirectory=$projectRoot;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
 $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $start.EnvironmentVariables.Clear()
 foreach($key in @('SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','COMSPEC','USERPROFILE','LOCALAPPDATA')){
  $value=[Environment]::GetEnvironmentVariable($key)
  if($value){$start.EnvironmentVariables[$key]=$value}
 }
 $child=New-Object Diagnostics.Process;$child.StartInfo=$start
 [void]$child.Start()
 $privateInput=$payload|ConvertTo-Json -Compress
 $child.StandardInput.Write($privateInput);$child.StandardInput.Close()
 $privateInput=$null;$payload.adminPassword=$null
 if($rootPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($rootPointer);$rootPointer=[IntPtr]::Zero}
 $safeOutput=$child.StandardOutput.ReadToEnd();$discarded=$child.StandardError.ReadToEnd();$child.WaitForExit()
 $discarded=$null
 try{$result=$safeOutput|ConvertFrom-Json}catch{throw 'Safe result unavailable; preserve private report for review'}
 $result|Select-Object status,code,stage,report,isolated,restoredTableCount,cleanShutdown,orderDataPreserved,activeDatabaseWritesAttempted,partialChangesPossible|ConvertTo-Json -Depth 5
 exit $child.ExitCode
}catch{
 [pscustomobject]@{status='BLOCKED';code='LOCAL_RELEASE_WRAPPER_FAILED';reportDirectory=$runDir;passwordLogged=$false;automaticRetry=$false}|ConvertTo-Json
 exit 1
}finally{
 if($rootPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($rootPointer)}
 if($rootSecret){$rootSecret.Dispose()};if($child){$child.Dispose()}
 $privateInput=$null;$payload=$null;$safeOutput=$null;$discarded=$null
}
