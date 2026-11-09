[CmdletBinding()]
param([string]$AdminUser='root',[switch]$ConfirmTestingOrderDone)
$ErrorActionPreference='Stop'
$secureAdmin=$null;$adminPtr=[IntPtr]::Zero;$child=$null
try {
    if (-not $ConfirmTestingOrderDone) { throw 'Specific order UPDATE confirmation required' }
    if ($AdminUser -notmatch '^[A-Za-z0-9_]{1,64}$') { throw 'Admin identity rejected' }
    $secureAdmin=Read-Host 'Password administrator MySQL lokal untuk UPDATE satu order testing (tidak disimpan)' -AsSecureString
    $adminPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureAdmin)
    $plainAdmin=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPtr)
    $privateInput=@{adminUser=$AdminUser;adminPassword=$plainAdmin} | ConvertTo-Json -Compress
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=(Get-Command node).Source
    $info.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $info.Arguments='"'+(Join-Path $PSScriptRoot 'testing-order-done.js')+'" --apply --confirmed'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $child=New-Object Diagnostics.Process;$child.StartInfo=$info;[void]$child.Start()
    $child.StandardInput.Write($privateInput);$child.StandardInput.Close();$privateInput=$null;$plainAdmin=$null
    $output=$child.StandardOutput.ReadToEnd();$errorOutput=$child.StandardError.ReadToEnd();$child.WaitForExit()
    if ($child.ExitCode -ne 0) {
        try { $failure=$errorOutput | ConvertFrom-Json;if($failure.code -match '^[A-Z0-9_]{1,80}$'){[pscustomobject]@{status='BLOCKED';code=$failure.code} | ConvertTo-Json} } catch {}
        exit 1
    }
    $report=$output | ConvertFrom-Json
    $report | Select-Object status,orderId,orderStatus,changed,actorUserId,actorRole,administrativeSingleOrderOverride,telegramSent,usersRolesGrantsChanged,verifiedAt | ConvertTo-Json
} catch { Write-Output 'Single-order administrative update blocked; secret values hidden.';exit 1 }
finally {
    if($child){$child.Dispose()};if($adminPtr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPtr)};if($secureAdmin){$secureAdmin.Dispose()};$plainAdmin=$null;$privateInput=$null;$output=$null;$errorOutput=$null
}
