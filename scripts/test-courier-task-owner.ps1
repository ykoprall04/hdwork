# Windows-only regression checks. No task registration or production access.
$ErrorActionPreference='Stop'
$file=Join-Path $PSScriptRoot 'install-live-chat-autostart.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'INSTALLER_PARSE_FAILED'}
foreach($name in @('ResolveTaskOwnerSid','AssertOwnedTask')){
 $definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
 if(-not $definition){throw 'EXPECTED_FUNCTION_MISSING'}
 . ([scriptblock]::Create($definition.Extent.Text))
}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$powershell=Join-Path $PSHOME 'powershell.exe';$arguments='synthetic fixture arguments'
$task=[pscustomobject]@{Actions=@([pscustomobject]@{Execute=$powershell;Arguments=$arguments});Principal=[pscustomobject]@{UserId=$identity.Name;LogonType='Interactive';RunLevel='Highest'}}
AssertOwnedTask
$task.Principal.UserId=$identity.User.Value
AssertOwnedTask
$task.Principal.UserId='S-1-5-18'
$rejected=$false
try{AssertOwnedTask}catch{$rejected=$true}
if(-not $rejected){throw 'DIFFERENT_OWNER_ACCEPTED'}
$task.Principal.UserId=$identity.User.Value
$task.Actions[0].Arguments='different action'
$rejected=$false
try{AssertOwnedTask}catch{$rejected=$true}
if(-not $rejected){throw 'CHANGED_ACTION_ACCEPTED'}
$task.Actions[0].Arguments=$arguments;$task.Principal.RunLevel='Limited'
$rejected=$false
try{AssertOwnedTask}catch{$rejected=$true}
if(-not $rejected){throw 'CHANGED_PRIVILEGE_ACCEPTED'}
Write-Output 'TASK_OWNER_REGRESSION_PASS'
