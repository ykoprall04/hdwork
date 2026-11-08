# Inventory only by default. Optional probes are loopback-only and read-only.
[CmdletBinding()]
param(
    [switch]$CheckLocalTcp,
    [switch]$CheckMySqlMetadata,
    [ValidateRange(1, 65535)][int]$DatabasePort = 3306,
    [ValidatePattern('^[a-zA-Z0-9_-]{1,64}$')][string]$MySqlLoginPath = 'hdwork2_preflight'
)
$ErrorActionPreference = 'Stop'
function Read-Version([string]$Command, [string[]]$Arguments, [string]$Pattern) {
    try {
        if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { return $null }
        $output = (& $Command @Arguments 2>$null | Out-String)
        if ($LASTEXITCODE -ne 0) { return $null }
        $match = [regex]::Match($output, $Pattern)
        if ($match.Success) { return $match.Groups[1].Value }
    } catch { return $null }
    return $null
}
function Test-LoopbackPort([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(750)) { return $false }
        $client.EndConnect($pending)
        return $true
    } catch { return $false } finally { $client.Dispose() }
}
$report = [ordered]@{ mode = 'read-only-preflight'; serviceActivated = $false; databaseExpected = 'hdwork2' }
$report.nodeVersion = Read-Version 'node' @('--version') '^v(\d+\.\d+\.\d+)'
$report.pythonVersion = Read-Version 'python' @('-I', '--version') 'Python (\d+\.\d+\.\d+)'
$report.mysqlClientVersion = Read-Version 'mysql' @('--no-defaults', '--version') 'Ver (\d+\.\d+\.\d+)'
try {
    $os = Get-CimInstance Win32_OperatingSystem
    $report.totalRamGiB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    $report.freeRamGiB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
    $report.ramHeadroomWarning = $report.freeRamGiB -lt 2
} catch { $report.ramInventory = 'unavailable' }
$ports = @($DatabasePort, 3090, 3091) | Select-Object -Unique
try {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop)
    $report.ports = @($ports | ForEach-Object {
        $port = $_
        $found = @($listeners | Where-Object { $_.LocalPort -eq $port })
        [ordered]@{ port = $port; listening = $found.Count -gt 0; loopbackOnly = if ($found.Count) { @($found | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') }).Count -eq 0 } else { $null } }
    })
} catch { $report.portInventory = 'unavailable' }
$report.localTcpChecked = [bool]$CheckLocalTcp
if ($CheckLocalTcp) {
    $report.localTcp = @($ports | ForEach-Object { [ordered]@{ port = $_; reachable = Test-LoopbackPort $_ } })
}
$report.mysqlMetadataChecked = [bool]$CheckMySqlMetadata
if ($CheckMySqlMetadata) {
    # Credentials must already be stored privately by the operator with mysql_config_editor.
    # CLI overrides profile host/port; never take an arbitrary host or connection URL.
    try {
        $output = @(& mysql '--no-defaults' "--login-path=$MySqlLoginPath" '--protocol=TCP' '--host=127.0.0.1' "--port=$DatabasePort" '--connect-timeout=3' '--database=hdwork2' '--batch' '--skip-column-names' '--execute=SELECT VERSION(), DATABASE()' 2>$null)
        if ($LASTEXITCODE -ne 0 -or $output.Count -ne 1) { throw 'metadata rejected' }
        $parts = $output[0] -split "`t"
        if ($parts.Count -ne 2 -or $parts[1] -cne 'hdwork2' -or $parts[0] -notmatch '^8\.\d+\.\d+') { throw 'metadata rejected' }
        $report.mysqlMetadata = 'expected-database-confirmed'
        $report.mysqlServerVersion = [regex]::Match($parts[0], '^8\.\d+\.\d+').Value
    } catch { $report.mysqlMetadata = 'unavailable-or-not-approved-target' }
}
$report | ConvertTo-Json -Depth 5
# No .env reads, table reads/writes, service/PM2 calls, task creation or secret output.
