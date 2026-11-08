# IPC only: decrypted bytes go to a private per-run named pipe, never stdout.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$PasswordFile,[Parameter(Mandatory=$true)][string]$PipeName)
$ErrorActionPreference='Stop'
$secret=$null; $pointer=[IntPtr]::Zero; $bytes=$null; $pipe=$null
$phase=10
try {
    if ($PipeName -notmatch '^hdwork2-auth-[a-f0-9]{48}$') { throw 'Invalid pipe' }
    $cipher=[IO.File]::ReadAllText($PasswordFile).Trim()
    $phase=20
    $secret=ConvertTo-SecureString -String $cipher
    $phase=30
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrEmpty($plain)) { throw 'Empty credential' }
    $bytes=[Text.Encoding]::UTF8.GetBytes($plain)
    $phase=40
    $pipe=New-Object IO.Pipes.NamedPipeClientStream('.', $PipeName, [IO.Pipes.PipeDirection]::Out)
    $pipe.Connect(5000)
    $pipe.Write($bytes,0,$bytes.Length)
    $pipe.Flush()
} catch { exit $phase }
finally {
    if ($pipe) { $pipe.Dispose() }
    if ($bytes) { [Array]::Clear($bytes,0,$bytes.Length) }
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($secret) { $secret.Dispose() }
    $plain=$null; $cipher=$null
}
