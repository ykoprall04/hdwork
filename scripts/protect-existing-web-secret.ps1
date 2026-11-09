[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$secureValue=$null;$signingValue=$null;$stage='PATH_CHECK'
try {
    $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $folder=Join-Path $root '.local\web-secrets'
    $target=Join-Path $folder 'session-signing.dpapi'
    if(Test-Path -LiteralPath $target){Write-Output 'EXISTING_SIGNING_DPAPI_PRESERVED';exit 0}
    foreach($part in @((Join-Path $root '.local'),$folder)){
        if((Test-Path -LiteralPath $part) -and ((Get-Item -LiteralPath $part).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Private directory rejected'}
    }
    # Capture existing secret in memory; no secret value in arguments or logs.
    Push-Location $root
    $stage='READ_EXISTING'
    try {$signingValue=& node -e "const fs=require('fs'),e=require('dotenv').parse(fs.readFileSync('.env'));if(typeof e.JWT_SECRET!=='string'||Buffer.byteLength(e.JWT_SECRET)<32)process.exit(2);process.stdout.write(e.JWT_SECRET)";if($LASTEXITCODE -ne 0){throw 'Existing signing secret unavailable'}} finally {Pop-Location}
    if([string]::IsNullOrEmpty($signingValue)){throw 'Existing signing secret unavailable'}
    $stage='SECURE_MEMORY'
    $secureValue=ConvertTo-SecureString -String $signingValue -AsPlainText -Force
    $stage='DPAPI_PROTECT'
    $cipher=ConvertFrom-SecureString -SecureString $secureValue
    $stage='WRITE_NEW_PRIVATE_FILE'
    [IO.Directory]::CreateDirectory($folder) | Out-Null
    $stream=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {$writer=New-Object IO.StreamWriter($stream);$writer.Write($cipher);$writer.Dispose()} finally {$stream.Dispose()}
    Write-Output 'EXISTING_SIGNING_SECRET_PROTECTED_NO_ROTATION'
} catch {Write-Output ('SIGNING_SECRET_SETUP_BLOCKED_'+$stage+': existing configuration preserved; no secret displayed.');exit 1}
finally {if($secureValue){$secureValue.Dispose()};$signingValue=$null;$cipher=$null}
