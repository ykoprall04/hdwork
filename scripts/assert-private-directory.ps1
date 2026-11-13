param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference='Stop'
$item=Get-Item -LiteralPath $Directory -Force
if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'PRIVATE_DIRECTORY_REQUIRED'}
$allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')
foreach($rule in (Get-Acl -LiteralPath $Directory).Access){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed){throw 'PRIVATE_DIRECTORY_ACL_REJECTED'}}
