# Dot-source this file from your PowerShell profile, or run it once per terminal.
# The function starts only the independent viewer; closing it never signals Courier.
$script:HDWork2LogViewer=Join-Path $PSScriptRoot 'courier-log.js'
function courier-log {
 [CmdletBinding(DefaultParameterSetName='Default')]
 param([string]$Directory=$env:HDWORK2_LOG_DIRECTORY,[Parameter(ParameterSetName='Raw')][switch]$Raw,[Parameter(ParameterSetName='Errors')][switch]$Errors)
 $viewer=$script:HDWork2LogViewer
 if(-not $Directory){$Directory=Join-Path $env:ProgramData 'HDWork2\Logs'}
 if($Raw){& node $viewer $Directory --raw}elseif($Errors){& node $viewer $Directory --errors}else{& node $viewer $Directory}
}
