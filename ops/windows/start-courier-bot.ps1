# Manual foreground startup only. Does not read .env, change flags or register tasks.
$ErrorActionPreference = 'Stop'
if (-not $env:COURIER_PYTHON_EXE -or -not [IO.Path]::IsPathRooted($env:COURIER_PYTHON_EXE) -or
    -not (Test-Path -LiteralPath $env:COURIER_PYTHON_EXE -PathType Leaf)) { throw 'Private Python executable configuration required.' }
$repoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$previousPythonPath = $env:PYTHONPATH
try {
    # Only this process and its child use the module path; no global Windows setting.
    $env:PYTHONPATH = Join-Path $repoPath 'courier_bot'
    Push-Location $repoPath
    try { & $env:COURIER_PYTHON_EXE -m courier --run; $courierExit = $LASTEXITCODE }
    finally { Pop-Location }
} finally { $env:PYTHONPATH = $previousPythonPath }
exit $courierExit
