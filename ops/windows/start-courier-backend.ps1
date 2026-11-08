# Manual foreground startup only. Never starts the web API or Telegram client.
$ErrorActionPreference = 'Stop'
$repoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Push-Location $repoPath
try { & node '.\courier-b2c-server.js' --run; $courierExit = $LASTEXITCODE }
finally { Pop-Location }
exit $courierExit
