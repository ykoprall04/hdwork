# Manual hidden local input only. Never run automatically by a test/startup.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('ops-read-password','ops-write-password','courier-db-password','courier-token','courier-service-key','courier-identity-key')][string]$Name)
$ErrorActionPreference='Stop'
$privateValue=$null
try {
    $projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $category=if ($Name.StartsWith('courier-')) {'courier-secrets'} else {'database-secrets'}
    $localFolder=Join-Path $projectRoot '.local'
    if ((Test-Path -LiteralPath $localFolder) -and ((Get-Item -LiteralPath $localFolder).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Private directory rejected' }
    $privateFolder=Join-Path $projectRoot ('.local\'+$category)
    [IO.Directory]::CreateDirectory($privateFolder) | Out-Null
    if ((Get-Item -LiteralPath $privateFolder).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Private directory rejected' }
    $targetFile=Join-Path $privateFolder ($Name+'.dpapi')
    if (Test-Path -LiteralPath $targetFile) { throw 'Existing file preserved' }
    $privateValue=Read-Host ('Masukkan '+$Name+' melalui input lokal tersembunyi') -AsSecureString
    if ($privateValue.Length -eq 0) { throw 'Empty input' }
    $cipherText=ConvertFrom-SecureString -SecureString $privateValue
    $stream=[IO.File]::Open($targetFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $writer=New-Object IO.StreamWriter($stream);$writer.Write($cipherText);$writer.Dispose() } finally { $stream.Dispose() }
    Write-Output 'Secret terenkripsi disimpan untuk akun Windows ini; nilai tidak ditampilkan.'
} catch {
    Write-Output 'Penyimpanan ditolak atau gagal; file existing dipertahankan.'
    exit 1
} finally {
    if ($privateValue) { $privateValue.Dispose() }
    $cipherText=$null
}
