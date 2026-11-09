# Static frontend only. Does not read environment/secrets, contact an API, or manage services/tasks.
[CmdletBinding()]
param(
 [ValidateSet('Stage','Apply','Rollback')][string]$Mode='Stage',
 [Parameter(Mandatory=$true)][string]$ReleaseDirectory,
 [string]$BuildDirectory,
 [string]$ActiveDist,
 [string]$ManifestSha256,
 [string]$HealthUrl,
 [switch]$ApproveFrontendOnly
)
$ErrorActionPreference='Stop'
$engine=Join-Path $PSScriptRoot 'frontend-only-release.js'
$node=(Get-Command node.exe -ErrorAction Stop).Source
if($Mode -eq 'Stage'){
 if(-not $BuildDirectory -or -not $ActiveDist -or -not $ManifestSha256){throw 'STAGE_REQUIRES_BUILD_ACTIVE_DIST_AND_MANIFEST_SHA256'}
 & $node $engine stage --source $BuildDirectory --active-dist $ActiveDist --release-dir $ReleaseDirectory --manifest-sha256 $ManifestSha256
}else{
 if(-not $ApproveFrontendOnly -or -not $HealthUrl){throw 'EXPLICIT_FRONTEND_ONLY_APPROVAL_AND_HEALTH_URL_REQUIRED'}
 $action=$Mode.ToLowerInvariant()
 & $node $engine $action --release-dir $ReleaseDirectory --health-url $HealthUrl --approve-frontend-only yes
}
if($LASTEXITCODE -ne 0){throw 'FRONTEND_ONLY_RELEASE_FAILED'}
