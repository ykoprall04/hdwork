# Dot-source this file from your PowerShell profile, or run it once per terminal.
# The function starts only the independent viewer; closing it never signals Courier.
$script:HDWork2LogViewer=Join-Path $PSScriptRoot 'courier-log.js'
function courier-log {
 [CmdletBinding()]
 param([string]$Directory=$env:HDWORK2_LOG_DIRECTORY)
 $viewer=$script:HDWork2LogViewer
 if(-not $Directory){$Directory=Join-Path $env:ProgramData 'HDWork2\Logs'}
 & node $viewer $Directory
}
