# Preparation only: preserve active runtime and credentials; no service or network action.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Review,[string]$Routing)
$ErrorActionPreference='Stop'
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ADMINISTRATOR_REQUIRED_OPEN_ELEVATED_POWERSHELL'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$deployment=Get-Content -LiteralPath (Join-Path $root '.local/protected-web-deployment.json') -Raw|ConvertFrom-Json
$snapshot=[IO.Path]::GetFullPath($deployment.snapshot)
$reviewPath=(Resolve-Path -LiteralPath $Review).Path
# A new dedicated directory gets a private ACL; no existing directory ACL is altered.
$parent=Join-Path 'C:\ProgramData' ('HDWork2LiveChatPreparation-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($parent)
$acl=New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @('S-1-5-18','S-1-5-32-544')){
 $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
Set-Acl -LiteralPath $parent -AclObject $acl
$observed=Get-Acl -LiteralPath $parent
if(-not $observed.AreAccessRulesProtected){throw 'PRIVATE_PREPARATION_ACL_REQUIRED'}
$rules=@($observed.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
foreach($rule in $rules){if($rule.AccessControlType -ne 'Allow' -or $rule.IdentityReference.Value -notin @('S-1-5-18','S-1-5-32-544')){throw 'PRIVATE_PREPARATION_ACL_REJECTED'}}
foreach($sid in @('S-1-5-18','S-1-5-32-544')){if(-not($rules|Where-Object{$_.IdentityReference.Value -eq $sid -and ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl})){throw 'PRIVATE_PREPARATION_ACL_REJECTED'}}
$output=Join-Path $parent 'prepared'
$arguments=@((Join-Path $root 'scripts/prepare-live-chat-production.js'),'--prepare','--snapshot',$snapshot,'--review',$reviewPath,'--output',$output)
if($Routing){$arguments+=@('--routing',(Resolve-Path -LiteralPath $Routing).Path)}
$priorParent=$env:HDWORK2_PRIVATE_PREPARATION_PARENT
try{
 $env:HDWORK2_PRIVATE_PREPARATION_PARENT=$parent
 & (Get-Command node.exe).Source @arguments
 if($LASTEXITCODE -ne 0){throw 'PRODUCTION_PREPARATION_FAILED_REVIEW_RETAINED'}
}finally{$env:HDWORK2_PRIVATE_PREPARATION_PARENT=$priorParent}
# Read-only inventory: no task arguments, command lines, tokens or credential paths.
$tasks=@(Get-ScheduledTask -TaskName 'HDWork2*' -ErrorAction SilentlyContinue|ForEach-Object{
 [pscustomobject]@{taskName=$_.TaskName;state=[string]$_.State;localService=($_.Principal.UserId -in @('S-1-5-19','LOCAL SERVICE','NT AUTHORITY\LOCAL SERVICE'));executables=@($_.Actions|ForEach-Object{[IO.Path]::GetFileName($_.Execute)})}
})
[pscustomobject]@{status='PREPARATION_ONLY';preparedDirectory=$output;tasks=$tasks;servicesRestarted=$false;telegramAccessed=$false}|ConvertTo-Json -Depth 6
