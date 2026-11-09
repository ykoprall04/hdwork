# Run visibly on the office PC after elevation. Secrets never enter arguments/logs.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$secure=$null;$ptr=[IntPtr]::Zero;$stage='SCOPE'
function Protect-Bytes([byte[]]$bytes,[string]$file){
    $cipher=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
    $stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($cipher,0,$cipher.Length)}finally{$stream.Dispose();[Array]::Clear($bytes,0,$bytes.Length)}
}
function Read-UserSecret([string]$file){
    $value=ConvertTo-SecureString ([IO.File]::ReadAllText($file).Trim())
    $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
    try{return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p);$value.Dispose()}
}
try{
    Add-Type -AssemblyName System.Security
    $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ADMIN_REQUIRED'}
    $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $tunnelFolder='C:\ProgramData\HDWork2\cloudflared';$webFolder='C:\ProgramData\HDWork2\web'
    $tokenFile=Join-Path $tunnelFolder 'tunnel-token.dpapi';$bundleFile=Join-Path $webFolder 'secrets.dpapi'
    if(Test-Path $webFolder){
        $existingAcl=Get-Acl -LiteralPath $webFolder
        $existingSids=@($existingAcl.Access|ForEach-Object{$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value})
        if(-not $existingAcl.AreAccessRulesProtected -or $existingSids.Count -ne 2 -or @($existingSids|Where-Object{$_ -notin @('S-1-5-18','S-1-5-32-544')}).Count){throw 'EXISTING_WEB_DIRECTORY_PRESERVED'}
    }
    if((Get-Service Cloudflared).StartType -ne 'Disabled' -or (Get-Service Cloudflared).Status -ne 'Stopped'){throw 'TUNNEL_MUST_REMAIN_DISABLED'}
    $stage='LOCAL_INPUT'
    Write-Host 'Pilih tunnel EXISTING hdwork2 di Cloudflare Dashboard. Jangan memilih hostname trial.'
    Write-Host 'Gunakan token BARU hasil rotasi dari tunnel hdwork2. Tidak ada input teks biasa sebelum token.'
    $routesConfirmed=$false # Requires a separate Dashboard/operator review, never assumed from a token.
    if(Test-Path $tokenFile){$storedBytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($tokenFile),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine);try{$token=[Text.Encoding]::UTF8.GetString($storedBytes)}finally{[Array]::Clear($storedBytes,0,$storedBytes.Length)}}
    else{$secure=Read-Host 'Masukkan HANYA token hdwork2, bukan perintah service install (tersembunyi)' -AsSecureString;$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
    $stage='TOKEN_VALIDATION'
    $encoded=$token.Replace('-','+').Replace('_','/');while($encoded.Length%4){$encoded+='='}
    $binding=([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded)) | ConvertFrom-Json)
    if($binding.t -notmatch '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$' -or -not $binding.a -or -not $binding.s){throw 'TOKEN_FORMAT_REJECTED'}
    $stage='ENCRYPTED_TOKEN_STORAGE'
    if(-not(Test-Path $tokenFile)){Protect-Bytes ([Text.Encoding]::UTF8.GetBytes($token)) $tokenFile}
    [IO.File]::WriteAllText((Join-Path $root '.local\office-tunnel-token.ready.json'),(@{ready=$true;existingTunnelOperatorConfirmed=$true;tokenExposureResolvedByOperator=$true;noPublishedOrPrivateRoutesConfirmed=$false;storage='DPAPI-LocalMachine plus restricted ACL';publicStarted=$false}|ConvertTo-Json))
    $stage='APPLICATION_SECRET_COPY'
    if(-not(Test-Path $bundleFile)){$bundle=@{authPassword=(Read-UserSecret (Join-Path $root '.local\hdwork-auth.password.dpapi'));readPassword=(Read-UserSecret (Join-Path $root '.local\database-secrets\ops-read-password.dpapi'));signingSecret=(Read-UserSecret (Join-Path $root '.local\web-secrets\session-signing.dpapi'))}}
    else{$existingBundle=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($bundleFile),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine);try{$bundle=[Text.Encoding]::UTF8.GetString($existingBundle)|ConvertFrom-Json}finally{[Array]::Clear($existingBundle,0,$existingBundle.Length)}}
    if(-not $bundle.authPassword -or -not $bundle.readPassword -or [Text.Encoding]::UTF8.GetByteCount($bundle.signingSecret) -lt 32){throw 'APPLICATION_SECRET_REJECTED'}
    if(-not(Test-Path $webFolder)){
        [IO.Directory]::CreateDirectory($webFolder)|Out-Null
        $acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false)
        foreach($sidText in @('S-1-5-18','S-1-5-32-544')){$sid=New-Object Security.Principal.SecurityIdentifier($sidText);$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))}
        Set-Acl -LiteralPath $webFolder -AclObject $acl
    }
    $stage='ENCRYPTED_STORAGE'
    if(-not(Test-Path $bundleFile)){Protect-Bytes ([Text.Encoding]::UTF8.GetBytes(($bundle|ConvertTo-Json -Compress))) $bundleFile}
    [IO.File]::WriteAllText((Join-Path $root '.local\office-service-secrets.ready.json'),(@{ready=$true;existingTunnelOperatorConfirmed=$true;tokenExposureResolvedByOperator=$true;noPublishedOrPrivateRoutesConfirmed=$routesConfirmed;storage='DPAPI-LocalMachine plus SYSTEM/Administrators ACL';credentialsRotatedByAgent=$false;publicStarted=$false}|ConvertTo-Json))
    Write-Host 'SECRETS_READY: terenkripsi; tidak ada rotasi, koneksi tunnel atau perubahan database.'
}catch{
    $statusFile=Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))) '.local\office-service-secrets.blocked.json'
    [IO.File]::WriteAllText($statusFile,(@{ready=$false;stage=$stage;secretValuesLogged=$false}|ConvertTo-Json))
    Write-Host ('SECRET_SETUP_BLOCKED_'+$stage+': nilai rahasia disembunyikan; konfigurasi existing dipertahankan.')
    Write-Host 'Tekan satu tombol untuk menutup; jangan tempel token lagi pada kondisi gagal.'
    try{[void]$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')}catch{};exit 1
}
finally{if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)};if($secure){$secure.Dispose()};$token=$null;$encoded=$null;$binding=$null;$bundle=$null}
