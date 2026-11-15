# Dot-source this file from your PowerShell profile, or run it once per terminal.
# The function starts only the independent viewer; closing it never signals Courier.
$script:HDWork2LogViewer=Join-Path $PSScriptRoot 'courier-log.js'
$script:HDWork2TelegramLogViewer=Join-Path $PSScriptRoot 'telegram-log.js'
function telegram-log {
 [CmdletBinding()]
 param([switch]$Errors,[ValidateRange(1,10000)][int]$Last=100,[switch]$NoFollow)
 $viewerArgs=@($script:HDWork2TelegramLogViewer,'--last',[string]$Last)
 if($Errors){$viewerArgs+='--errors'}
 if($NoFollow){$viewerArgs+='--no-follow'}
 & node @viewerArgs
}
function courier-log {
 [CmdletBinding(DefaultParameterSetName='Default')]
 param([string]$Directory=$env:HDWORK2_LOG_DIRECTORY,[Parameter(ParameterSetName='Raw')][switch]$Raw,[Parameter(ParameterSetName='Errors')][switch]$Errors)
 $viewer=$script:HDWork2LogViewer
 if(-not $Directory){$Directory=Join-Path $env:ProgramData 'HDWork2\Logs'}
 if($Raw){& node $viewer $Directory --raw}elseif($Errors){& node $viewer $Directory --errors}else{& node $viewer $Directory}
}
