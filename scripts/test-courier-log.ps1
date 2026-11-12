# Offline Windows-only checks; never installs a viewer or changes a service/profile/ACL.
$ErrorActionPreference='Stop'
foreach($name in @('courier-log.ps1','install-courier-log.ps1','run-courier-scheduled-owner.ps1','inspect-raw-log-release.ps1')){
 $tokens=$null;$errors=$null
 [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name),[ref]$tokens,[ref]$errors)
 if($errors.Count){throw "POWERSHELL_PARSE_FAILED: $name"}
}
. (Join-Path $PSScriptRoot 'courier-log.ps1')
$script:ViewerCalled=$false
function node {param($Viewer,$Directory)
 if($Viewer -ne (Join-Path $PSScriptRoot 'courier-log.js')){throw 'VIEWER_PATH_CHANGED'}
 if($Directory -ne 'X:\SyntheticLogs'){throw 'DIRECTORY_CHANGED'}
 $script:ViewerCalled=$true
}
try {courier-log -Directory 'X:\SyntheticLogs';if(-not $script:ViewerCalled){throw 'VIEWER_NOT_INVOKED'}}finally{Remove-Item function:node}
Write-Output 'COURIER_LOG_WINDOWS_OFFLINE_PASS'
