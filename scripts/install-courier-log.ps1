# Viewer installation only. Never starts, stops, deploys or modifies Courier.
[CmdletBinding()]
param([string]$Root=(Join-Path $env:ProgramData 'HDWork2'))
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'WINDOWS_REQUIRED'}
$Root=[IO.Path]::GetFullPath($Root)
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
foreach($folder in @($Root,(Join-Path $Root 'Logs'),(Join-Path $Root 'Tools'))){
 $created=-not (Test-Path -LiteralPath $folder)
 if(Test-Path -LiteralPath $folder){if((Get-Item -LiteralPath $folder -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE_DIRECTORY_REJECTED'}}
 [void][IO.Directory]::CreateDirectory($folder)
 if($folder -eq $Root -and -not $created){continue} # preserve an existing parent ACL
 $acl=New-Object Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @($identity.User,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))){
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
 }
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
$profilePath=$PROFILE.CurrentUserAllHosts
$line=". '"+(Join-Path $tools 'courier-log.ps1').Replace("'","''")+"'"
[void][IO.Directory]::CreateDirectory((Split-Path -Parent $profilePath))
[string]$existing=if(Test-Path -LiteralPath $profilePath){Get-Content -LiteralPath $profilePath -Raw}else{''}
if(-not $existing.Contains($line)){Add-Content -LiteralPath $profilePath -Value ([Environment]::NewLine+$line) -Encoding UTF8}
. (Join-Path $tools 'courier-log.ps1')
Write-Output 'COURIER_LOG_VIEWER_INSTALLED_NO_SERVICE_CHANGE'
