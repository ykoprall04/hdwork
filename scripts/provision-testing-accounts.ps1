[CmdletBinding()]
param([ValidateSet('Review','Inspect','Apply')][string]$Mode='Review',[string]$AdminUser='root',[switch]$ConfirmProvision)
$ErrorActionPreference='Stop'
$adminSecure=$null;$adminPtr=[IntPtr]::Zero;$childProcess=$null
try {
    $projectPath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    if ($Mode -eq 'Review') { & node (Join-Path $PSScriptRoot 'provision-testing-accounts.js') --review;exit $LASTEXITCODE }
    if ($Mode -eq 'Apply' -and -not $ConfirmProvision) { throw 'Confirmation required' }
    if ($AdminUser -notmatch '^[A-Za-z0-9_]{1,64}$') { throw 'Administrator identity rejected' }
    $adminSecure=Read-Host 'Password administrator MySQL lokal (tidak disimpan)' -AsSecureString
    if ($adminSecure.Length -eq 0) { throw 'Empty administrator password' }
    $adminPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecure)
    $adminPlain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPtr)
    $privateInput=@{adminUser=$AdminUser;adminPassword=$adminPlain} | ConvertTo-Json -Compress
    $startInfo=New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName=(Get-Command node -ErrorAction Stop).Source
    $startInfo.WorkingDirectory=$projectPath
    $cliMode=if ($Mode -eq 'Inspect') {'--inspect'} else {'--apply --confirmed'}
    $startInfo.Arguments='"'+(Join-Path $PSScriptRoot 'provision-testing-accounts.js')+'" '+$cliMode
    $startInfo.UseShellExecute=$false;$startInfo.CreateNoWindow=$true
    $startInfo.RedirectStandardInput=$true;$startInfo.RedirectStandardOutput=$true;$startInfo.RedirectStandardError=$true
    $childProcess=New-Object Diagnostics.Process
    $childProcess.StartInfo=$startInfo
    [void]$childProcess.Start()
    # Anonymous local stdin pipe only: no password in argv, env, file or output.
    $childProcess.StandardInput.Write($privateInput);$childProcess.StandardInput.Close()
    $privateInput=$null;$adminPlain=$null
    $safeOutput=$childProcess.StandardOutput.ReadToEnd()
    $discardedErrors=$childProcess.StandardError.ReadToEnd()
    $childProcess.WaitForExit()
    if ($childProcess.ExitCode -ne 0) {
        try {
            $failure=$discardedErrors | ConvertFrom-Json
            if ($failure.code -match '^[A-Z0-9_]{1,80}$') {
                [pscustomobject]@{status='BLOCKED';code=$failure.code;partialChangesPossible=($failure.partialChangesPossible -eq $true)} | ConvertTo-Json
            }
        } catch { }
        $discardedErrors=$null
        # Do not print raw child output or SQL exceptions.
        Write-Output 'Provisioning/check berhenti. Jangan ulang Apply secara buta; periksa status akun dengan Inspect. Tidak ada password existing direset.'
        exit 1
    }
    $report=$safeOutput | ConvertFrom-Json
    $report | Select-Object status,accounts,created,verified,sqlSha256,writesPerformed,applicationDataWritten,telegramStarted | ConvertTo-Json -Depth 5
} catch { Write-Output 'Local administrator action blocked; secret values hidden. SQL tidak dijalankan tanpa mode Apply dan konfirmasi.';exit 1 }
finally {
    if ($childProcess) { $childProcess.Dispose() }
    if ($adminPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPtr) }
    if ($adminSecure) { $adminSecure.Dispose() }
    $adminPlain=$null;$privateInput=$null;$safeOutput=$null
}
