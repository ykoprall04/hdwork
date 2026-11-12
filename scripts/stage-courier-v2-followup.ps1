# New staging files only. No production connections, credential access or activation.
[CmdletBinding()]
param(
 [string]$Preparation='C:\ProgramData\HDWork2CourierV2Prep-2b68c600f8ce44c2a033f9b3902260e9',
 [string]$PythonExecutable='C:\Users\yayan\AppData\Local\Programs\Python\Python314\python.exe'
)
$ErrorActionPreference='Stop'
if([Environment]::OSVersion.Platform -ne 'Win32NT'){throw 'WINDOWS_REQUIRED'}
$expected='c48da7844ee8f854e247336c4dbb7305554224be8cbe2ed54d6ff5bab6ff084b'
if((Get-FileHash -LiteralPath (Join-Path $Preparation 'preparation.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'PREPARATION_HASH_MISMATCH'}
$stage=Join-Path $Preparation ('followup-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage -ErrorAction Stop|Out-Null
$review=& $PythonExecutable -B (Join-Path $PSScriptRoot 'review-courier-v2-backup.py') --directory $Preparation|Out-String
if($LASTEXITCODE -ne 0){throw 'OFFLINE_BACKUP_REVIEW_FAILED'}
[IO.File]::WriteAllText((Join-Path $stage 'backup-review.json'),$review,[Text.Encoding]::UTF8)
Write-Output $review
foreach($name in @('015_hdwork2_fifo_ack.review.sql','015_fifo_lane_grants.review.sql','015_metadata_dead.readonly.sql')){
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('..\database\manual\'+$name)) -Destination (Join-Path $stage $name) -ErrorAction Stop
}
$source=Join-Path $stage 'source'
git clone --single-branch --branch frontend/redesign-hdwork2 https://github.com/ykoprall04/hdwork.git $source
if($LASTEXITCODE -ne 0){throw 'GITHUB_CLONE_FAILED'}
$target='707f7ecd1aaafc810199e1016598d577f7e4390f'
git -C $source checkout --detach $target
if($LASTEXITCODE -ne 0){throw 'TARGET_CHECKOUT_FAILED'}
if((git -C $source rev-parse HEAD) -ne $target){throw 'TARGET_COMMIT_MISMATCH'}
$tree=git -C $source status --porcelain --untracked-files=all
if($LASTEXITCODE -ne 0 -or $tree){throw 'CLEAN_SOURCE_TREE_REQUIRED'}
$previousOrigin=$env:VITE_API_BASE_URL
Push-Location $source
try{
 & npm.cmd ci --prefix frontend --no-audit --no-fund
 if($LASTEXITCODE -ne 0){throw 'FRONTEND_DEPENDENCY_INSTALL_FAILED'}
 $env:VITE_API_BASE_URL='https://hdwork2.yoloo.space'
 & node.exe scripts/build-operational-frontend.js --build
 if($LASTEXITCODE -ne 0){throw 'OFFICIAL_FRONTEND_BUILD_FAILED'}
 $tree=git status --porcelain --untracked-files=all
 if($LASTEXITCODE -ne 0 -or $tree){throw 'SOURCE_TREE_CHANGED_DURING_BUILD'}
 $dist=Join-Path $source 'frontend\dist'
 $manifest=(Get-FileHash -LiteralPath (Join-Path $dist 'release-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
 & node.exe -e "require('./scripts/frontend-only-release').verified(process.argv[1],process.argv[2]).then(()=>console.log('OFFICIAL_MANIFEST_VERIFY_PASS')).catch(()=>process.exit(1))" $dist $manifest
 if($LASTEXITCODE -ne 0){throw 'OFFICIAL_MANIFEST_VERIFICATION_FAILED'}
 $report=@{status='FRONTEND_STAGED_NOT_DEPLOYED';applicationCommit=$target;cleanTree=$true;manifestSha256=$manifest;dist=$dist;productionChanged=$false;activationPerformed=$false;schemaStatus='TIDAK DAPAT DIPASTIKAN (izin/belum diperiksa langsung)';sqlExecuted=$false}
 $json=$report|ConvertTo-Json
 [IO.File]::WriteAllText((Join-Path $stage 'frontend-staging.json'),$json,[Text.Encoding]::UTF8)
 Write-Output $json
 Write-Output ('FOLLOWUP_DIRECTORY='+$stage)
}finally{
 $env:VITE_API_BASE_URL=$previousOrigin
 Pop-Location
}
