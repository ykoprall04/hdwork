# Entry point distributed with a verified Git bundle. No worktree/checkouts or mock suites.
[CmdletBinding()]
param([switch]$Activate)
$ErrorActionPreference='Stop'
if([Environment]::OSVersion.Platform -ne 'Win32NT'){throw 'WINDOWS_REQUIRED'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ELEVATED_EXISTING_DPAPI_OWNER_REQUIRED'}
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw|ConvertFrom-Json
if($manifest.kind -ne 'HDWORK2_RAW_LOG_PACKAGE' -or $manifest.applicationCommit -ne '1fc87f5df8aea39df6e813625248de6adf8a0a0a' -or $manifest.codeCommit -notmatch '^[a-f0-9]{40}$' -or $manifest.bundleSha256 -notmatch '^[a-f0-9]{64}$'){throw 'VERIFIED_PACKAGE_MANIFEST_REQUIRED'}
$bundle=Join-Path $PSScriptRoot 'hdwork-raw-log-release.bundle'
if((Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.bundleSha256){throw 'BUNDLE_CHECKSUM_CHANGED'}
$repository='D:\HDWork2-New'
Push-Location $repository
try{
 git bundle verify $bundle
 if($LASTEXITCODE -ne 0){throw 'BUNDLE_VERIFY_FAILED_NO_SERVICE_CHANGE'}
 git fetch $bundle refs/heads/frontend/redesign-hdwork2
 if($LASTEXITCODE -ne 0){throw 'BUNDLE_FETCH_FAILED_NO_SERVICE_CHANGE'}
 $fetched=git rev-parse FETCH_HEAD
 if($LASTEXITCODE -ne 0 -or $fetched.Trim() -cne $manifest.codeCommit){throw 'EXACT_RELEASE_COMMIT_REQUIRED'}
 git merge-base --is-ancestor $manifest.applicationCommit $manifest.codeCommit
 if($LASTEXITCODE -ne 0){throw 'RAW_LOG_APPLICATION_ANCESTRY_REQUIRED'}
 $root='C:\ProgramData\HDWork2RawLog-'+[Guid]::NewGuid().ToString('N')
 New-Item -ItemType Directory -Path $root|Out-Null
 $acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @($identity.User.Value,'S-1-5-32-544','S-1-5-18')){$rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)}
 Set-Acl -LiteralPath $root -AclObject $acl
 $archive=Join-Path $root 'source.tar';$code=Join-Path $root 'source';New-Item -ItemType Directory -Path $code|Out-Null
 git archive --format=tar --output=$archive $manifest.codeCommit
 if($LASTEXITCODE -ne 0){throw 'SOURCE_ARCHIVE_FAILED_NO_SERVICE_CHANGE'}
 & (Get-Command tar.exe).Source -xf $archive -C $code
 if($LASTEXITCODE -ne 0){throw 'SOURCE_EXTRACTION_FAILED_NO_SERVICE_CHANGE'}
 # Syntax-only validation before any task/file/ACL modification. Never run mock suites here.
 foreach($file in @('deploy-raw-log.ps1','run-courier-scheduled-owner.ps1','run-protected-web.ps1','install-courier-log.ps1','courier-log.ps1')){
  $tokens=$null;$errors=$null
  [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $code ('scripts/'+$file)),[ref]$tokens,[ref]$errors)
  if($errors.Count){$errors|Format-List;throw ('RELEASE_POWERSHELL_PARSE_FAILED_'+$file)}
 }
 Write-Host ('RELEASE_DIRECTORY='+$root)
 & (Join-Path $code 'scripts/deploy-raw-log.ps1') -Directory $root -CodeCommit $manifest.codeCommit -GitRepository $repository -Activate:$Activate
}finally{Pop-Location}
