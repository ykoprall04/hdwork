# Task Scheduler ALTERNATIVE to PM2; never run both for the same API.
[CmdletBinding()]
param(
    [switch]$ApprovedStart,
    [string]$NodeExe = 'C:\Program Files\nodejs\node.exe',
    [string]$LogDirectory = ''
)
$ErrorActionPreference = 'Stop'
if (-not $ApprovedStart) { Write-Error 'Template inactive; explicit reviewed start required.'; exit 1 }
if (-not [IO.Path]::IsPathRooted($LogDirectory) -or -not (Test-Path -LiteralPath $LogDirectory -PathType Container) -or -not (Test-Path -LiteralPath $NodeExe -PathType Leaf)) { Write-Error 'Approved local paths required.'; exit 1 }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$env:NODE_ENV = 'production'
$env:PORT = '3090'
$env:B2C_WORKFLOW_READ_ENABLED = 'false'
$env:B2C_STAGING_ENABLED = 'false'
$env:COURIER_ENABLED = 'false'
$env:COURIER_ALLOW_NETWORK = 'false'
Set-Location -LiteralPath $root
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
try {
    & $NodeExe '--max-old-space-size=192' '.\api-only-server.js' 1>> (Join-Path $LogDirectory "api-$stamp-out.log") 2>> (Join-Path $LogDirectory "api-$stamp-error.log")
    exit $LASTEXITCODE
} catch { Write-Error 'API process failed; inspect private logs locally.'; exit 1 }
