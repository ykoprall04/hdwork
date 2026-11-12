# Viewer installation only. Never starts, stops, deploys or modifies Courier.
[CmdletBinding()]
param([string]$Root=(Join-Path $env:ProgramData 'HDWork2'),[switch]$IncludeWebLocalService)
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'WINDOWS_REQUIRED'}
$Root=[IO.Path]::GetFullPath($Root)
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
foreach($folder in @($Root,(Join-Path $Root 'Logs'),(Join-Path $Root 'Tools'))){
 $created=-not (Test-Path -LiteralPath $folder)
 if(Test-Path -LiteralPath $folder){if((Get-Item -LiteralPath $folder -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE_DIRECTORY_REJECTED'}}
 [void][IO.Directory]::CreateDirectory($folder)
 if($folder -eq $Root -and -not $created){
  if($IncludeWebLocalService){$parentAcl=Get-Acl -LiteralPath $folder;$rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-19')),'ReadAndExecute','Allow');$parentAcl.AddAccessRule($rule);Set-Acl -LiteralPath $folder -AclObject $parentAcl}
  continue
 } # preserve an existing parent ACL
 $acl=New-Object Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @($identity.User,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))){
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
 }
 if($IncludeWebLocalService -and $folder -eq (Join-Path $Root 'Logs')){
  $rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-19')),'Modify','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)
 }
 if($IncludeWebLocalService -and $folder -eq $Root){$rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-19')),'ReadAndExecute','Allow');$acl.AddAccessRule($rule)}
 Set-Acl -LiteralPath $folder -AclObject $acl
}
$tools=Join-Path $Root 'Tools'
foreach($name in @('courier-log.js','courier-log.ps1')){
 $target=Join-Path $tools $name
 if(Test-Path -LiteralPath $target){
  if((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name)).Hash){throw 'EXISTING_VIEWER_DIFFERS_USE_NEW_ROOT'}
 }else{Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $target}
}
# The profile gets only a dot-source line; enable logging separately in an approved release.
$line=". '"+(Join-Path $tools 'courier-log.ps1').Replace("'","''")+"'"
$documents=[Environment]::GetFolderPath('MyDocuments')
$profilePaths=@($PROFILE.CurrentUserAllHosts,(Join-Path $documents 'WindowsPowerShell\profile.ps1'),(Join-Path $documents 'PowerShell\profile.ps1'))|Select-Object -Unique
foreach($profilePath in $profilePaths){
 [void][IO.Directory]::CreateDirectory((Split-Path -Parent $profilePath))
 [string]$existing=if(Test-Path -LiteralPath $profilePath){Get-Content -LiteralPath $profilePath -Raw}else{''}
 if(-not $existing.Contains($line)){
  $encoding=New-Object Text.UTF8Encoding($false)
  if(Test-Path -LiteralPath $profilePath){$bytes=[IO.File]::ReadAllBytes($profilePath);if($bytes.Length -ge 4 -and $bytes[0] -eq 255 -and $bytes[1] -eq 254 -and $bytes[2] -eq 0 -and $bytes[3] -eq 0){$encoding=[Text.Encoding]::UTF32}elseif($bytes.Length -ge 2 -and $bytes[0] -eq 255 -and $bytes[1] -eq 254){$encoding=[Text.Encoding]::Unicode}elseif($bytes.Length -ge 2 -and $bytes[0] -eq 254 -and $bytes[1] -eq 255){$encoding=[Text.Encoding]::BigEndianUnicode}}
  [IO.File]::AppendAllText($profilePath,([Environment]::NewLine+$line+[Environment]::NewLine),$encoding)
 }
}
. (Join-Path $tools 'courier-log.ps1')
Write-Output 'COURIER_LOG_VIEWER_INSTALLED_NO_SERVICE_CHANGE'
