[CmdletBinding()]
param([switch]$KeysOnly)
$ErrorActionPreference='Stop'
function Save-EncryptedKey([string]$KeyName) {
    $rootPath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $localPath=Join-Path $rootPath '.local'
    if ((Test-Path -LiteralPath $localPath) -and ((Get-Item -LiteralPath $localPath).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Private path rejected' }
    $folderPath=Join-Path $localPath 'courier-secrets'
    [IO.Directory]::CreateDirectory($folderPath) | Out-Null
    if ((Get-Item -LiteralPath $folderPath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Private path rejected' }
    $keyPath=Join-Path $folderPath ($KeyName+'.dpapi')
    if (Test-Path -LiteralPath $keyPath) { Write-Output ($KeyName+': existing ciphertext preserved'); return }
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    $keyBytes=New-Object byte[] 32
    $secureKey=$null
    try {
        $rng.GetBytes($keyBytes)
        $secureKey=ConvertTo-SecureString ([Convert]::ToBase64String($keyBytes)) -AsPlainText -Force
        $cipherValue=ConvertFrom-SecureString $secureKey
        $keyStream=[IO.File]::Open($keyPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try { $keyWriter=New-Object IO.StreamWriter($keyStream);$keyWriter.Write($cipherValue);$keyWriter.Dispose() } finally { $keyStream.Dispose() }
        Write-Output ($KeyName+': DPAPI saved; value hidden')
    } finally { [Array]::Clear($keyBytes,0,$keyBytes.Length);$rng.Dispose();if($secureKey){$secureKey.Dispose()};$cipherValue=$null }
}
try {
    if (-not $KeysOnly) {
        foreach ($passwordName in @('courier-db-password','ops-read-password')) {
            $rootPath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
            $category=if ($passwordName.StartsWith('courier-')) {'courier-secrets'} else {'database-secrets'}
            $passwordPath=Join-Path $rootPath ('.local\'+$category+'\'+$passwordName+'.dpapi')
            if (Test-Path -LiteralPath $passwordPath) { Write-Output ($passwordName+': existing ciphertext preserved');continue }
            Write-Output 'Jika akun MySQL sudah ada, masukkan password existing. Jangan membuat/reset password existing.'
            & (Join-Path $PSScriptRoot 'store-private-secret.ps1') -Name $passwordName
            if (-not (Test-Path -LiteralPath $passwordPath)) { throw 'Password input incomplete' }
        }
    }
    Save-EncryptedKey 'courier-service-key'
    Save-EncryptedKey 'courier-identity-key'
    Write-Output 'No SQL or Telegram action performed.'
} catch { Write-Output 'Private secret setup blocked; existing files preserved.';exit 1 }
