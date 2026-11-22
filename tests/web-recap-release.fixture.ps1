param([Parameter(Mandatory=$true)][string]$TargetWorktree)
$ErrorActionPreference='Stop'
$updater=Join-Path $PSScriptRoot '../scripts/hdwork-web-update.ps1'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($updater,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors -join [Environment]::NewLine)}
foreach($definition in $ast.EndBlock.Statements){
 if($definition -is [System.Management.Automation.Language.FunctionDefinitionAst]){
  . ([scriptblock]::Create($definition.Extent.Text))
 }
}
if(-not (Get-Command git.exe -ErrorAction SilentlyContinue)){Set-Alias git.exe git}
if(-not (Get-Command tar.exe -ErrorAction SilentlyContinue)){Set-Alias tar.exe tar}
# Fixture-only substitutes. No real Scheduled Task, ACL, or health command is called.
function Get-Acl { param($LiteralPath) @{} }
function Set-Acl { param($LiteralPath,$AclObject) }
function GetActiveWeb { $script:fixtureWeb }
function DeployWeb($web,$target,$paths) { throw 'FIXTURE_UNEXPECTED_HANDOFF' }
$root=$TargetWorktree
$TargetCommit='6cda7056cce3073b369529309e224b7a32315720'
$ExpectedActiveCommit='f63b0a1b0f42a57e5438f3d0a4dd7594db6606a3'
$explicitTargetRequested=$true
$DryRun=$true
$env:TEMP=[IO.Path]::GetTempPath()
$fixture=Join-Path $env:TEMP ('recap-release-fixture-'+[Guid]::NewGuid().ToString('N'))
try {
 $runtime=Join-Path $fixture 'runtime'
 $payload=Join-Path $fixture 'payload'
 $backup=Join-Path $fixture 'backup'
 foreach($dir in @($runtime,$payload,$backup)){[void][IO.Directory]::CreateDirectory($dir)}
 $dependencies=@('src/b2c-workflow/order-network.js','contracts/b2c-commands.json','contracts/workspace-commands.json','src/courier/contract.js')
 StageWebSource $ExpectedActiveCommit $dependencies $runtime (Join-Path $fixture 'prereqs.tar')
 $pins=[ordered]@{}
 foreach($path in $dependencies){$pins[$path]=Hash (Join-Path $runtime $path)}
 $config=[pscustomobject]@{targetCommit=('0'*40);webTargetCommit=$ExpectedActiveCommit;sourceHashes=[pscustomobject]$pins}
 $script:fixtureWeb=[pscustomobject]@{Runtime=$runtime;Config=$config;Task=[pscustomobject]@{TaskName='HDWork2-Web-Standby'}}
 $valid=@(Main) -join [Environment]::NewLine
 Need ($valid -match 'changed=8 payloadSource=6' -and $valid -match 'DRY_RUN target=6cda705') 'FIXTURE_EXPLICIT_SCOPE_FAILED'
 Need $KeepPrevious 'FIXTURE_BACKUP_RETENTION_FAILED'
 Write-Output 'PASS: real target, baseline, Git delta, runtime dependency checks and DryRun dispatch.'
 $config.webTargetCommit='a'*40
 try{Main;throw 'FIXTURE_EXPECTED_BASELINE_REJECTION'}catch{Need ($_.Exception.Message -eq 'WEB_EXPLICIT_ACTIVE_COMMIT_MISMATCH') 'FIXTURE_BASELINE_NOT_BLOCKED'}
 $config.webTargetCommit=$ExpectedActiveCommit
 $contract=Join-Path $runtime 'contracts/b2c-commands.json'
 [IO.File]::AppendAllText($contract,' ')
 $config.sourceHashes.'contracts/b2c-commands.json'=Hash $contract
 try{Main;throw 'FIXTURE_EXPECTED_EXTRA_DEPENDENCY_REJECTION'}catch{Need ($_.Exception.Message -eq 'WEB_EXPLICIT_RECAP_PAYLOAD_MISMATCH') 'FIXTURE_EXTRA_DEPENDENCY_NOT_BLOCKED'}
 $expected=@(RecapReleasePaths)
 $webPaths=@($expected | Where-Object { WebPath $_ })
 foreach($changed in @(@($expected+'src/chat/service.js'),@($expected[0..6]))){
  try{AssertRecapReleaseScope $changed $webPaths;throw 'FIXTURE_EXPECTED_DELTA_REJECTION'}catch{Need ($_.Exception.Message -eq 'WEB_EXPLICIT_RECAP_DELTA_MISMATCH') 'FIXTURE_WRONG_DELTA_NOT_BLOCKED'}
 }
 $TargetCommit='a'*40
 try{Main;throw 'FIXTURE_EXPECTED_HEAD_REJECTION'}catch{Need ($_.Exception.Message -eq 'WEB_EXPLICIT_WORKTREE_HEAD_MISMATCH') 'FIXTURE_WRONG_HEAD_NOT_BLOCKED'}
 $TargetCommit='6cda7056cce3073b369529309e224b7a32315720'
 Write-Output 'PASS: incorrect HEAD or active pin, missing or extra delta, and a pinned but different contract all fail closed.'

 StageWebSource $ExpectedActiveCommit $webPaths $runtime (Join-Path $fixture 'before.tar')
 StageWebSource $TargetCommit $webPaths $payload (Join-Path $fixture 'candidate.tar')
 $before=@{}
 $entries=foreach($rel in $webPaths){
  $dest=Join-Path $runtime $rel
  $old=$null
  if(Test-Path -LiteralPath $dest){
   $old=Hash $dest
   $b=Join-Path $backup $rel
   [void][IO.Directory]::CreateDirectory((Split-Path -Parent $b))
   Copy-Item -LiteralPath $dest -Destination $b
  }
  $before[$rel]=$old
  Atomic $dest ([IO.File]::ReadAllBytes((Join-Path $payload $rel)))
  [pscustomobject]@{path=$rel;before=$old}
 }
 $rollback=NewWebRollbackConfig $config ('b'*32)
 Need ((ActiveWebCommit $rollback) -ceq $ExpectedActiveCommit -and $rollback.attemptRole -ceq 'rollback') 'FIXTURE_ROLLBACK_COMMIT_WRONG'
 RestoreWebFiles $runtime $backup $entries
 foreach($rel in $webPaths){
  $dest=Join-Path $runtime $rel
  if($before[$rel]){Need ((Hash $dest) -ceq $before[$rel]) 'FIXTURE_ROLLBACK_BYTES_WRONG'}
  else{Need (-not (Test-Path -LiteralPath $dest)) 'FIXTURE_NEW_FILE_LEFT_BEHIND'}
 }
 Need ((Hash $contract) -ceq $config.sourceHashes.'contracts/b2c-commands.json') 'FIXTURE_UNRELATED_FILE_CHANGED'
 Write-Output 'PASS: real payload archive, old bytes restored, new files removed, rollback pin f63b0a1 and unrelated contract preserved.'
 MockTests
}finally{
 if(Test-Path -LiteralPath $fixture){Remove-Item -LiteralPath $fixture -Recurse -Force}
}
