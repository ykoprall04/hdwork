[CmdletBinding()]
param([switch]$Mock,[switch]$DryRun,[switch]$DatabasePrerequisitesVerified,[switch]$KeepPrevious,[string]$ChatMediaDirectory)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskNames=@('HDWork2-Web','HDWork2-Web-Standby','HDWork2-Web-Rollback')
$script:WebUpdatePhase='STARTUP'
$script:WebUpdateRelease=$null
$script:WebUpdateCandidateAttemptId=$null
$script:WebUpdateRollbackAttemptId=$null
function Fail([string]$code){throw $code}
function Need([bool]$ok,[string]$code){if(-not $ok){Fail $code}}
function Hash([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function AssertConfigFileSha([string]$path,[string]$expectedSha,[string]$failureCode){Need ($expectedSha -match '^[a-f0-9]{64}$' -and (Test-Path -LiteralPath $path) -and (Hash $path) -ceq $expectedSha) $failureCode;return $true}
function RelativePath([string]$base,[string]$path){
 $baseFull=[IO.Path]::GetFullPath($base).TrimEnd([char[]]@('\','/'))+[IO.Path]::DirectorySeparatorChar
 $pathFull=[IO.Path]::GetFullPath($path)
 if(-not $pathFull.StartsWith($baseFull,[StringComparison]::OrdinalIgnoreCase)){Fail 'WEB_RELEASE_PATH_OUTSIDE_ROOT'}
 return $pathFull.Substring($baseFull.Length).Replace('\','/')
}
function SafeDiagnostic([string]$value){
 return ($value -replace '\b\d{6,12}:[A-Za-z0-9_-]{30,}\b','[REDACTED_TOKEN]' -replace '(?i)(password|token|secret)(\s*[=:]\s*)\S+','$1$2[REDACTED]')
}
function SetJsonProperty($object,[string]$name,$value){$property=$object.PSObject.Properties[$name];if($property){$property.Value=$value}else{$object|Add-Member -NotePropertyName $name -NotePropertyValue $value -Force}}
function RewriteTaskConfigSha([string]$arguments,[string]$currentSha,[string]$newSha){
 Need ($currentSha -match '^[a-f0-9]{64}$' -and $newSha -match '^[a-f0-9]{64}$') 'WEB_TASK_CONFIG_SHA_INVALID'
 $shaMatches=[regex]::Matches($arguments,'(?i)(?<prefix>(?:^|\s)-ConfigSha256\s+)(?<sha>[a-f0-9]{64})(?=\s|$)')
 Need ($shaMatches.Count -eq 1 -and $shaMatches[0].Groups['sha'].Value -ceq $currentSha) 'WEB_TASK_CONFIG_SHA_SOURCE_MISMATCH'
 $m=$shaMatches[0];return ($arguments.Substring(0,$m.Index)+$m.Groups['prefix'].Value+$newSha+$arguments.Substring($m.Index+$m.Length))
}
function AssertTaskConfigAction([string]$arguments,[string]$configPath,[string]$expectedSha,[string]$failureCode='WEB_TASK_CONFIG_ACTION_INVALID'){
 $shaMatches=[regex]::Matches($arguments,'(?i)-ControlConfig\s+"([^"]+)"\s+-ConfigSha256\s+([a-f0-9]{64})(?=\s|$)')
 Need ($shaMatches.Count -eq 1 -and ([regex]::Matches($arguments,'(?i)(?:^|\s)-ConfigSha256(?=\s)')).Count -eq 1 -and ([regex]::Matches($arguments,'(?i)(?:^|\s)-ControlConfig(?=\s)')).Count -eq 1) $failureCode
 $actualPath=[IO.Path]::GetFullPath($shaMatches[0].Groups[1].Value);$expectedPath=[IO.Path]::GetFullPath($configPath)
 Need ($actualPath.Equals($expectedPath,[StringComparison]::OrdinalIgnoreCase) -and $shaMatches[0].Groups[2].Value -ceq $expectedSha) $failureCode
 return $true
}
function SameProcess($process,$identity){
 if(-not $process -or $process.Name -cne $identity.name -or [int]$process.ProcessId -ne [int]$identity.pid){return $false}
 try{return ([Math]::Abs(($process.CreationDate.ToUniversalTime()-[DateTimeOffset]::Parse($identity.createdUtc).UtcDateTime).TotalSeconds) -le 2)}catch{return $false}
}
function WaitUntilExit([scriptblock]$isAlive,[int]$timeoutMs,[string]$code,[int]$pollMs=100){
 $until=[DateTimeOffset]::UtcNow.AddMilliseconds($timeoutMs)
 do{if(-not (& $isAlive)){return};if($pollMs -gt 0){Start-Sleep -Milliseconds $pollMs}}while([DateTimeOffset]::UtcNow -lt $until)
 if(& $isAlive){Fail $code}
}
function RetryTransientHealth([scriptblock]$probe,[int]$attempts=5,[int]$delayMs=1000){
 for($attempt=1;$attempt -le $attempts;$attempt++){
  try{& $probe;return}
  catch{$message=$_.Exception.Message;if($attempt -ge $attempts -or $message -notmatch '^WEB_HEALTH_FAILED_(ECONNREFUSED|ECONNRESET|ETIMEDOUT|HEALTH_DEADLINE)$'){throw};Write-Host ('WEB_HEALTH_RETRY attempt='+$attempt+' reason='+$message);if($delayMs -gt 0){Start-Sleep -Milliseconds $delayMs}}
 }
 Fail 'WEB_HEALTH_RETRIES_EXHAUSTED'
}
function RollbackHealthFailureState([string]$taskState,[bool]$enabled){if($taskState -eq 'Running' -and $enabled){return 'ROLLED_BACK_WEB_READY_HEALTH_FAILED_TASK_PRESERVED'};return $null}
function TaskHandoffIdle([string]$state,[bool]$enabled){return ($state -ne 'Running' -and -not $enabled)}
function HealthFailureCode([string]$text){if($text -match '\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|HEALTH_DEADLINE)\b'){return 'WEB_HEALTH_FAILED_'+$Matches[1]};return 'WEB_HEALTH_FAILED_HEALTH_PROBE_FAILED'}
function DiagnosticAtom($value){$text=([string]$value).ToUpperInvariant();if($text -match '^[A-Z][A-Z0-9_]{0,63}$'){return $text};return $null}
function AttemptDiagnosticPath([string]$configPath,[string]$attemptId){return (Join-Path (Split-Path -Parent $configPath) ('startup-attempt-'+$attemptId+'.json'))}
function AttemptDiagnosis($state,[string]$expectedSha,[string]$attemptId){
 if(-not $state -or ($attemptId -and [string]$state.attemptId -cne $attemptId)){return 'ATTEMPT_STATE_MISSING_OR_STALE'}
 if([string]$state.configSha256 -cne $expectedSha){return 'ATTEMPT_STATE_CONFIG_HASH_MISMATCH'}
 if([string]$state.status -eq 'READY'){return 'ATTEMPT_READY'}
 if([string]$state.status -in @('CHILD_EXITED','CONTROL_FAILED','START_FAILED','FENCED_START_REFUSED')){return 'ATTEMPT_TERMINATED'}
 return 'ATTEMPT_NOT_READY'
}
function ReadyDiagnostic([string]$base,[string]$configPath,[string]$expectedSha,$state,[string]$taskState,$lastResult,[string]$attemptId=''){
 $parts=@($base);$diagnosis=AttemptDiagnosis $state $expectedSha $attemptId;$parts+= $diagnosis
 if($state -and [string]$state.attemptId -ceq $attemptId){$status=DiagnosticAtom $state.status;if($status){$parts+=('STATE_'+$status)};if($state.configSha256 -and [string]$state.configSha256 -cne $expectedSha){$parts+=('ATTEMPT_CONFIG_SHA_MISMATCH')};if($null -ne $state.exitCode){$parts+=('EXIT_'+[int]$state.exitCode)}}elseif($state -and $state.status){$parts+=('STALE_STATE_'+(DiagnosticAtom $state.status))}
 $task=DiagnosticAtom $taskState;if($task){$parts+=('TASK_'+$task)};if($null -ne $lastResult){$parts+=('RESULT_'+[int]$lastResult)}
 try{$attemptPath=AttemptDiagnosticPath $configPath $attemptId;if(Test-Path -LiteralPath $attemptPath){$d=Get-Content -LiteralPath $attemptPath -Raw|ConvertFrom-Json;$phase=DiagnosticAtom $d.phase;$type=DiagnosticAtom ([string]$d.exceptionType -replace '[.+]','_');$code=DiagnosticAtom $d.code;if($d.attemptId -ceq $attemptId -and ($phase -or $type -or $code)){$parts+=('ATTEMPT_'+(@($phase,$type,$code|Where-Object{$_}) -join '_'))};if($null -ne $d.taskResult){$parts+=('TASK_EXIT_'+[int]$d.taskResult)}}}catch{}
 try{$cfg=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json;$errorRoot=Split-Path -Parent $cfg.stateFile;$errorName=if($attemptId){'child-startup-error-'+$attemptId+'.json'}else{'child-startup-error.json'};$errorPath=Join-Path $errorRoot $errorName;if(Test-Path -LiteralPath $errorPath){$childError=Get-Content -LiteralPath $errorPath -Raw|ConvertFrom-Json;$code=DiagnosticAtom $childError.code;if(((-not $attemptId) -or $childError.attemptId -ceq $attemptId) -and $childError.status -eq 'FAILED' -and $code -and $childError.configSha256 -ceq $expectedSha -and $state.configSha256 -ceq $expectedSha){$parts+=('CHILD_'+$code)}};if($attemptId){$streamsPath=Join-Path $errorRoot ('startup-streams-'+$attemptId+'.json');if(Test-Path -LiteralPath $streamsPath){$streams=Get-Content -LiteralPath $streamsPath -Raw|ConvertFrom-Json;if($streams.attemptId -ceq $attemptId -and $streams.configSha256 -ceq $expectedSha){$parts+=('STREAMS_CAPTURED_STDOUT_'+[int]$streams.stdout.lines+'_STDERR_'+[int]$streams.stderr.lines)}}}}catch{}
 if(-not $attemptId){try{$legacyPath=Join-Path (Split-Path -Parent $configPath) 'failure.metadata.json';if(Test-Path -LiteralPath $legacyPath){$legacy=Get-Content -LiteralPath $legacyPath -Raw|ConvertFrom-Json;$phase=DiagnosticAtom $legacy.phase;$type=DiagnosticAtom $legacy.type;$code=DiagnosticAtom $legacy.code;if(($phase -or $type -or $code) -and $legacy.configSha256 -ceq $expectedSha -and [int]$legacy.ownerPid -eq [int]$state.ownerPid -and $state.configSha256 -ceq $expectedSha){$parts+=('SUPERVISOR_'+(@($phase,$type,$code|Where-Object{$_}) -join '_'))}}}catch{}}
 return ($parts -join '_')
}
function StartupStopped($state,[string]$expectedSha,[string]$attemptId=''){return ([string]$state.status -in @('CHILD_EXITED','CONTROL_FAILED','START_FAILED','FENCED_START_REFUSED') -and [string]$state.configSha256 -ceq $expectedSha -and ((-not $attemptId) -or [string]$state.attemptId -ceq $attemptId))}

function WebPath([string]$path){
 $p=$path.Replace('\','/')
 if($p -ceq 'src/b2c-workflow/order-network.js'){return $true}
 if($p -cin @('contracts/b2c-commands.json','contracts/workspace-commands.json','src/courier/contract.js')){return $true}
 if($DatabasePrerequisitesVerified -and $p -match '^database/.*\.sql$'){return $false}
 if($p -match '^(src/courier/|src/b2c-workflow/|src/config/production-courier\.js$|courier[-_]|courier_bot/|contracts/|docs/|tests/|scripts/hdwork-web-update\.ps1$|hdwork-update\.cmd$)'){return $false}
 if($p -match '(^|/)(migrations?|schema)(/|\.|$)|\.sql$|operational-grants\.js$|(^|/)\.env'){Fail 'WEB_UPDATE_DATABASE_OR_SECRET_CHANGE_REQUIRES_REVIEW'}
 return $p -match '^(frontend/|public/|views/|server\.js$|api-only-server\.js$|local-web-server\.js$|src/|scripts/(protected-web-service|run-protected-web|check-operational-release|build-operational-frontend)\.|ops/windows/web-|package\.json$|package-lock\.json$)'
}
function InvokeGit([string[]]$gitArgs){$out=& git.exe -C $root @gitArgs;if($LASTEXITCODE -ne 0){Fail 'GIT_UPDATE_FAILED'};return ($out -join [Environment]::NewLine)}
function RequiredVlanHelper($web,[string]$target){
 $format=Join-Path $web.Runtime 'src/vlan/format.js'
 & git.exe -C $root cat-file -e ($target+':src/vlan/format.js') 2>$null
 if($LASTEXITCODE -ne 0){return}
 RequiredWebSource $web $target 'src/b2c-workflow/order-network.js'
}
function RequiredWebContracts($web,[string]$target){
 foreach($relative in @('contracts/b2c-commands.json','contracts/workspace-commands.json')){RequiredWebSource $web $target $relative}
 & git.exe -C $root cat-file -e ($target+':src/chat/photos.js') 2>$null
 if($LASTEXITCODE -eq 0){RequiredWebSource $web $target 'src/courier/contract.js'}
}
function StageWebSource([string]$target,[string[]]$paths,[string]$payload,[string]$archive){
 $existing=@()
 foreach($relative in $paths){
  & git.exe -C $root cat-file -e ($target+':'+$relative) 2>$null
  if($LASTEXITCODE -eq 0){$existing+=,$relative}
 }
 if($existing.Count){
  & git.exe -C $root archive --format=tar ('--output='+$archive) $target -- @existing
  if($LASTEXITCODE -ne 0){Fail 'WEB_SOURCE_ARCHIVE_FAILED'}
  & tar.exe -xf $archive -C $payload
  if($LASTEXITCODE -ne 0){Fail 'WEB_SOURCE_EXTRACT_FAILED'}
 }
 if($paths -ccontains 'src/courier/contract.js'){
  $staged=Join-Path $payload 'src/courier/contract.js'
  $expected=(InvokeGit @('rev-parse',($target+':src/courier/contract.js'))).Trim()
  Need ((Test-Path -LiteralPath $staged -PathType Leaf) -and (InvokeGit @('hash-object','--path=src/courier/contract.js',$staged)).Trim() -ceq $expected) 'WEB_STAGED_COURIER_CONTRACT_MISMATCH'
 }
}
function StageChatMediaEnvironment($web,[string]$payload){
 $relative='service/environment.json'
 $source=Join-Path $web.Runtime $relative
 $pin=$web.Config.sourceHashes.PSObject.Properties[$relative]
 Need ($pin -and (Hash $source) -ceq $pin.Value) 'WEB_RUNTIME_ENVIRONMENT_DRIFT'
 $settings=Get-Content -LiteralPath $source -Raw|ConvertFrom-Json
 Need ($settings.HDWORK2_LIVE_CHAT_ENABLED -ceq 'true') 'WEB_LIVE_CHAT_PREREQUISITE_MISSING'
 $media=(Get-Item -LiteralPath $ChatMediaDirectory).FullName
 foreach($servedRoot in @($web.Runtime,$root,$settings.LOCAL_WEB_DIST)|Where-Object {$_}){
  $prefix=[IO.Path]::GetFullPath($servedRoot).TrimEnd('\','/')+'\'
  Need (-not ($media+'\').StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) 'WEB_CHAT_MEDIA_INSIDE_SERVED_ROOT'
 }
 foreach($directory in @($media,(Join-Path $media 'requests'),(Join-Path $media 'outgoing'))){
  $item=Get-Item -LiteralPath $directory
  Need ($item.PSIsContainer -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) 'WEB_CHAT_MEDIA_DIRECTORY_REJECTED'
 }
 $settings|Add-Member -NotePropertyName HDWORK2_CHAT_MEDIA_DIR -NotePropertyValue $media -Force
 $settings|Add-Member -NotePropertyName HDWORK2_CHAT_PHOTOS_ENABLED -NotePropertyValue 'true' -Force
 if($payload){SaveJson (Join-Path $payload $relative) $settings}
}
function RequiredWebSource($web,[string]$target,[string]$relative){
 $file=Join-Path $web.Runtime $relative
 $targetBlob=(InvokeGit @('rev-parse',($target+':'+$relative))).Trim()
 if(-not(Test-Path -LiteralPath $file)){return $relative}
 Need (-not((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint)) 'WEB_RUNTIME_LINK_REJECTED'
 $pin=$web.Config.sourceHashes.PSObject.Properties[$relative]
 Need ($pin -and (Hash $file) -ceq [string]$pin.Value) 'WEB_RUNTIME_SOURCE_DRIFT'
 if((InvokeGit @('hash-object',('--path='+$relative),$file)).Trim() -cne $targetBlob){return $relative}
}
function PinnedGrantMatches([string]$actualSha,[string]$pinnedSha,[string]$runtimeBlob,[string]$targetBlob){
 return ($actualSha -match '^[a-f0-9]{64}$' -and $actualSha -ceq $pinnedSha -and $runtimeBlob -match '^([a-f0-9]{40}|[a-f0-9]{64})$' -and $runtimeBlob -ceq $targetBlob)
}
function ReviewedGrantInstalled($web,[string]$target,[string]$relative){
 if($relative -cne 'src/config/operational-grants.js'){return $false}
 $file=Join-Path $web.Runtime $relative
 if(-not(Test-Path -LiteralPath $file) -or ((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint)){return $false}
 $pin=$web.Config.sourceHashes.PSObject.Properties[$relative];if(-not $pin){return $false}
 # Git's clean filter accounts for CRLF; the separate byte SHA still checks the active pin.
 $runtimeBlob=(InvokeGit @('hash-object',('--path='+$relative),$file)).Trim()
 $targetBlob=(InvokeGit @('rev-parse',($target+':'+$relative))).Trim()
 return (PinnedGrantMatches (Hash $file) ([string]$pin.Value) $runtimeBlob $targetBlob)
}
function Atomic([string]$path,[byte[]]$bytes){
 $dir=Split-Path -Parent $path;[void][IO.Directory]::CreateDirectory($dir)
 $tmp=$path+'.update-'+[Guid]::NewGuid().ToString('N')+'.tmp';[IO.File]::WriteAllBytes($tmp,$bytes)
 if(Test-Path -LiteralPath $path){$acl=Get-Acl -LiteralPath $path;Set-Acl -LiteralPath $tmp -AclObject $acl;Move-Item -LiteralPath $tmp -Destination $path -Force}else{[IO.File]::Move($tmp,$path)}
}
function SaveJson([string]$path,$value){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($value|ConvertTo-Json -Depth 100)+[Environment]::NewLine);Atomic $path $bytes}
function UpdateAttemptRecord([string]$path,[string]$attemptId,[string]$role,[string]$phase,[string]$expectedSha,[hashtable]$extra=@{}){
 $row=@{version=1;attemptId=$attemptId;role=$role;phase=$phase;expectedConfigSha256=$expectedSha;updatedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')}
 if(Test-Path -LiteralPath $path){try{$old=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json;if($old.attemptId -ceq $attemptId){foreach($name in @('ownerPid','childPid','exceptionType','code','taskResult','childExitCode','stdoutLineCount','stderrLineCount')){if($null -ne $old.$name){$row[$name]=$old.$name}}}}catch{}}
 foreach($name in @('ownerPid','childPid','exceptionType','code','taskResult','childExitCode','stdoutLineCount','stderrLineCount')){if($extra.ContainsKey($name)){$row[$name]=$extra[$name]}}
 SaveJson $path $row
}
function MockTests{
 $n=0
 foreach($p in @('frontend/src/App.tsx','server.js','src/operations/routes.js','package-lock.json')){Need ([bool](WebPath $p)) 'MOCK_WEB_CLASSIFICATION_FAILED';$n++}
 foreach($p in @('src/courier/groups.js','src/b2c-workflow/workflow.js','courier_bot/courier/groups.py','contracts/other.json','docs/release.md','tests/web.test.js','scripts/hdwork-web-update.ps1')){Need (-not (WebPath $p)) 'MOCK_COMPONENT_ISOLATION_FAILED';$n++}
 foreach($p in @('contracts/b2c-commands.json','contracts/workspace-commands.json')){Need (WebPath $p) 'MOCK_WEB_CONTRACT_EXCLUDED';$n++}
 Need (WebPath 'src/b2c-workflow/order-network.js') 'MOCK_VLAN_HELPER_EXCLUDED';$n++
 Need (-not(WebPath 'src/b2c-workflow/commands.js')) 'MOCK_COMMAND_PARSER_EXPOSED';$n++
 $priorDatabaseReview=$script:DatabasePrerequisitesVerified
 try{$script:DatabasePrerequisitesVerified=$false;try{[void](WebPath 'database/migrations/018.sql');Fail 'MOCK_MIGRATION_NOT_BLOCKED'}catch{Need ($_.Exception.Message -eq 'WEB_UPDATE_DATABASE_OR_SECRET_CHANGE_REQUIRES_REVIEW') 'MOCK_MIGRATION_GUARD_FAILED';$n++};$script:DatabasePrerequisitesVerified=$true;Need (-not(WebPath 'database/manual/019_hdwork2_order_notes.sql')) 'MOCK_REVIEWED_SQL_MUST_NOT_DEPLOY';$n++;try{[void](WebPath 'src/config/operational-grants.js');Fail 'MOCK_UNPINNED_GRANT_NOT_BLOCKED'}catch{Need ($_.Exception.Message -eq 'WEB_UPDATE_DATABASE_OR_SECRET_CHANGE_REQUIRES_REVIEW') 'MOCK_GRANT_GUARD_FAILED';$n++}}finally{$script:DatabasePrerequisitesVerified=$priorDatabaseReview}
 $validSha='a'*64;$validBlob='b'*40;Need (PinnedGrantMatches $validSha $validSha $validBlob $validBlob) 'MOCK_PINNED_GRANT_NOT_ACCEPTED';$n++
 foreach($tuple in @(@(('c'*64),$validSha,$validBlob,$validBlob),@($validSha,'',$validBlob,$validBlob),@($validSha,$validSha,('d'*40),$validBlob),@($validSha,$validSha,'',''))){Need (-not(PinnedGrantMatches $tuple[0] $tuple[1] $tuple[2] $tuple[3])) 'MOCK_GRANT_DRIFT_NOT_BLOCKED';$n++}
 $priorKeep=$script:KeepPrevious;try{$script:KeepPrevious=$true;PrunePrevious '__MUST_NOT_ENUMERATE__' '__MUST_NOT_ENUMERATE__';$n++}finally{$script:KeepPrevious=$priorKeep}
 $tmp=Join-Path $env:TEMP ('hdwork-web-update-mock-'+[Guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($tmp)
 try{$f=Join-Path $tmp 'service.js';[IO.File]::WriteAllText($f,'old');$old=[IO.File]::ReadAllBytes($f);Atomic $f ([Text.Encoding]::UTF8.GetBytes('new'));Need ([IO.File]::ReadAllText($f) -eq 'new') 'MOCK_APPLY_FAILED';$n++;Atomic $f $old;Need ([IO.File]::ReadAllText($f) -eq 'old') 'MOCK_ROLLBACK_FAILED';$n++;$mockDist=Join-Path $tmp 'frontend/dist';$nested=Join-Path $mockDist 'assets/app.js';[void][IO.Directory]::CreateDirectory((Split-Path -Parent $nested));[IO.File]::WriteAllText($nested,'asset');$releaseManifest=Join-Path $mockDist 'release-manifest.json';[IO.File]::WriteAllText($releaseManifest,'{}');Need ((RelativePath $mockDist $nested) -eq 'assets/app.js') 'MOCK_RELATIVE_PATH_FAILED';$n++;try{[void](RelativePath (Join-Path $mockDist 'assets') $f);Fail 'MOCK_RELATIVE_PATH_ESCAPE_NOT_BLOCKED'}catch{Need ($_.Exception.Message -eq 'WEB_RELEASE_PATH_OUTSIDE_ROOT') 'MOCK_RELATIVE_PATH_GUARD_FAILED';$n++};$mockPayload=Join-Path $tmp 'payload';Get-ChildItem -LiteralPath $mockDist -File -Recurse|Where-Object{$_.Name -ne 'release-manifest.json'}|ForEach-Object{$rel='frontend/dist/'+(RelativePath $mockDist $_.FullName);$to=Join-Path $mockPayload $rel;[void][IO.Directory]::CreateDirectory((Split-Path -Parent $to));Copy-Item -LiteralPath $_.FullName -Destination $to};Need ([IO.File]::ReadAllText((Join-Path $mockPayload 'frontend/dist/assets/app.js')) -eq 'asset') 'MOCK_FRONTEND_PACKAGE_COPY_FAILED';$n++;Need (-not(Test-Path -LiteralPath (Join-Path $mockPayload 'frontend/dist/release-manifest.json'))) 'MOCK_FRONTEND_MANIFEST_SHOULD_NOT_BE_DEPLOYED';$n++;$safe=SafeDiagnostic 'failed token=123456:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_1234';Need ($safe -notmatch '123456:') 'MOCK_DIAGNOSTIC_REDACTION_FAILED';$n++;$json=[pscustomobject]@{targetCommit='old'};SetJsonProperty $json 'webTargetCommit' 'new';Need ($json.webTargetCommit -eq 'new') 'MOCK_JSON_PROPERTY_ADD_FAILED';$n++;SetJsonProperty $json 'webTargetCommit' 'next';Need ($json.webTargetCommit -eq 'next') 'MOCK_JSON_PROPERTY_UPDATE_FAILED';$n++;
  $identity=[pscustomobject]@{pid=15;name='powershell.exe';createdUtc=[DateTimeOffset]::UtcNow.ToString('o')};$same=[pscustomobject]@{ProcessId=15;Name='powershell.exe';CreationDate=[DateTime]::UtcNow};Need (SameProcess $same $identity) 'MOCK_OWNER_IDENTITY_MATCH_FAILED';$n++;$reused=[pscustomobject]@{ProcessId=15;Name='powershell.exe';CreationDate=[DateTime]::UtcNow.AddMinutes(-2)};Need (-not(SameProcess $reused $identity)) 'MOCK_OWNER_PID_REUSE_NOT_DETECTED';$n++;
  $script:mockExitProbes=0;WaitUntilExit { $script:mockExitProbes++;$script:mockExitProbes -lt 3 } 1000 'MOCK_OWNER_EXIT_TIMEOUT' 0;Need ($script:mockExitProbes -eq 3) 'MOCK_OWNER_EXIT_WAIT_FAILED';$n++;
  $script:mockHealthProbes=0;RetryTransientHealth { $script:mockHealthProbes++;if($script:mockHealthProbes -lt 3){throw 'WEB_HEALTH_FAILED_ECONNREFUSED'} } 4 0;Need ($script:mockHealthProbes -eq 3) 'MOCK_TRANSIENT_HEALTH_RETRY_FAILED';$n++;
  $script:mockHealthProbes=0;try{RetryTransientHealth { $script:mockHealthProbes++;throw 'WEB_HEALTH_FAILED_CERTIFICATE_REJECTED' } 4 0;Fail 'MOCK_PERMANENT_HEALTH_FAILURE_RETRIED'}catch{Need ($_.Exception.Message -eq 'WEB_HEALTH_FAILED_CERTIFICATE_REJECTED' -and $script:mockHealthProbes -eq 1) 'MOCK_PERMANENT_HEALTH_RETRY_GUARD_FAILED';$n++}
  $diagnosticRoot=Join-Path $tmp 'diagnostic-control';$diagnosticState=Join-Path $diagnosticRoot 'state';[void][IO.Directory]::CreateDirectory($diagnosticState);$diagnosticConfig=Join-Path $diagnosticRoot 'new-control.json';$diagnosticStateFile=Join-Path $diagnosticState 'state.json';[IO.File]::WriteAllText($diagnosticConfig,(ConvertTo-Json @{stateFile=$diagnosticStateFile}));[IO.File]::WriteAllText((Join-Path $diagnosticState 'child-startup-error.json'),'{"status":"FAILED","code":"WEB_STAGE_LOCAL_WEB_FAILED","configSha256":"expected","ownerPid":55,"password":"DO_NOT_RECORD"}');[IO.File]::WriteAllText((Join-Path $diagnosticRoot 'failure.metadata.json'),'{"phase":"PIPE_WAIT","type":"IOException","code":"PIPE_NOT_AVAILABLE","configSha256":"expected","ownerPid":55,"message":"DO_NOT_RECORD"}');$diagnosticStateObject=[pscustomobject]@{status='CHILD_EXITED';configSha256='expected';ownerPid=55;exitCode=1};$detail=ReadyDiagnostic 'WEB_READY_TIMEOUT' $diagnosticConfig 'expected' $diagnosticStateObject 'Ready' 1;Need ($detail -match 'STATE_CHILD_EXITED' -and $detail -match 'EXIT_1' -and $detail -match 'CHILD_WEB_STAGE_LOCAL_WEB_FAILED' -and $detail -match 'SUPERVISOR_PIPE_WAIT_IOEXCEPTION_PIPE_NOT_AVAILABLE' -and $detail -notmatch 'DO_NOT_RECORD') 'MOCK_STARTUP_FAILURE_DIAGNOSTIC_INCOMPLETE_OR_UNSAFE';$n++;$staleState=[pscustomobject]@{status='CHILD_EXITED';configSha256='old';ownerPid=55;exitCode=1};$oldPinDiagnostic=ReadyDiagnostic 'WEB_READY_TIMEOUT' $diagnosticConfig 'expected' $staleState 'Ready' 1;Need ($oldPinDiagnostic -notmatch 'CHILD_WEB_STAGE_LOCAL_WEB_FAILED|SUPERVISOR_PIPE_WAIT') 'MOCK_OLD_PIN_DIAGNOSTIC_MISATTRIBUTED';$n++;Need (-not(StartupStopped $staleState 'expected')) 'MOCK_OLD_TERMINAL_STATE_ABORTED_NEW_STARTUP';$n++;$staleState.configSha256='expected';[IO.File]::WriteAllText((Join-Path $diagnosticState 'child-startup-error.json'),'{"status":"FAILED","code":"EACCES","configSha256":"stale","ownerPid":54}');[IO.File]::WriteAllText((Join-Path $diagnosticRoot 'failure.metadata.json'),'{"phase":"OLD","type":"IOException","code":"STALE","configSha256":"expected","ownerPid":54}');$stale=ReadyDiagnostic 'WEB_READY_TIMEOUT' $diagnosticConfig 'expected' $staleState 'Ready' 1;Need ($stale -notmatch 'CHILD_EACCES|SUPERVISOR_OLD') 'MOCK_STALE_STARTUP_DIAGNOSTIC_REJECTED';$n++;Need (StartupStopped $diagnosticStateObject 'expected') 'MOCK_EARLY_CHILD_EXIT_NOT_DETECTED';$n++;Need (-not(StartupStopped ([pscustomobject]@{status='READY';configSha256='expected'}) 'expected')) 'MOCK_READY_STATE_MISCLASSIFIED';$n++
  $candidateId=[Guid]::NewGuid().ToString('N');$rollbackId=[Guid]::NewGuid().ToString('N');$failedRollbackId=[Guid]::NewGuid().ToString('N');$candidatePath=AttemptDiagnosticPath $diagnosticConfig $candidateId;$rollbackPath=AttemptDiagnosticPath $diagnosticConfig $rollbackId;$failedRollbackPath=AttemptDiagnosticPath $diagnosticConfig $failedRollbackId;UpdateAttemptRecord $candidatePath $candidateId 'candidate' 'CHILD_EXITED' 'expected' @{childExitCode=1};UpdateAttemptRecord $rollbackPath $rollbackId 'rollback' 'ROLLBACK_COMPLETED' 'oldhash' @{};UpdateAttemptRecord $failedRollbackPath $failedRollbackId 'rollback' 'ROLLBACK_FAILED' 'oldhash' @{exceptionType='IOException';code='PIPE_TIMEOUT'};$candidateRecord=Get-Content -LiteralPath $candidatePath -Raw|ConvertFrom-Json;$rollbackRecord=Get-Content -LiteralPath $rollbackPath -Raw|ConvertFrom-Json;$failedRollbackRecord=Get-Content -LiteralPath $failedRollbackPath -Raw|ConvertFrom-Json;Need ($candidateRecord.attemptId -eq $candidateId -and $candidateRecord.childExitCode -eq 1 -and $rollbackRecord.attemptId -eq $rollbackId -and $rollbackRecord.role -eq 'rollback' -and $rollbackRecord.phase -eq 'ROLLBACK_COMPLETED' -and $failedRollbackRecord.phase -eq 'ROLLBACK_FAILED' -and $candidatePath -ne $rollbackPath) 'MOCK_CANDIDATE_ROLLBACK_DIAGNOSTICS_NOT_ISOLATED';$n++
  $priorState=[pscustomobject]@{status='STOPPED';configSha256='old';attemptId='oldattempt';exitCode=0};Need ((AttemptDiagnosis $priorState 'candidateSha' $candidateId) -eq 'ATTEMPT_STATE_MISSING_OR_STALE') 'MOCK_STALE_STATE_MISCLASSIFIED';$n++;$staleResult=ReadyDiagnostic 'WEB_READY_TIMEOUT' $diagnosticConfig 'candidateSha' $priorState 'Ready' 1 $candidateId;Need ($staleResult -match 'STALE_STATE_STOPPED' -and $staleResult -notmatch 'STATE_CONFIG_SHA_MISMATCH') 'MOCK_STALE_SHA_REPORTED_AS_ROOT_CAUSE';$n++;$candidateExited=[pscustomobject]@{status='CHILD_EXITED';configSha256='candidateSha';attemptId=$candidateId;exitCode=1};Need ((AttemptDiagnosis $candidateExited 'candidateSha' $candidateId) -eq 'ATTEMPT_TERMINATED') 'MOCK_CANDIDATE_EXIT_NOT_REPORTED';$n++;Need ((AttemptDiagnosis ([pscustomobject]@{status='READY';configSha256='candidateSha';attemptId=$candidateId}) 'candidateSha' $candidateId) -eq 'ATTEMPT_READY') 'MOCK_READY_ATTEMPT_NOT_RECOGNIZED';$n++;Need ((AttemptDiagnosis ([pscustomobject]@{status='STARTING';configSha256='candidateSha';attemptId=$candidateId}) 'candidateSha' $candidateId) -eq 'ATTEMPT_NOT_READY') 'MOCK_TIMEOUT_ATTEMPT_NOT_REPORTED';$n++
  $mockTaskConfig='C:\runtime\web-control.json';$mockCurrentSha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';$mockCandidateSha='413a46'+('b'*58);$mockRollbackSha='913a46'+('c'*58);$mockActionArgs='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\runtime\web-native-supervisor.ps1" -ControlConfig "'+$mockTaskConfig+'" -ConfigSha256 '+$mockCurrentSha;$legacyArgs=[regex]::Replace($mockActionArgs,'(-ConfigSha256\s+)[a-f0-9]{64}','$1'+$mockCandidateSha,1);Need ($legacyArgs -match '\$1413a46b') 'MOCK_LEGACY_NUMERIC_SHA_BUG_NOT_REPRODUCED';$fixedCandidateArgs=RewriteTaskConfigSha $mockActionArgs $mockCurrentSha $mockCandidateSha;Need (AssertTaskConfigAction $fixedCandidateArgs $mockTaskConfig $mockCandidateSha 'MOCK_CANDIDATE_ACTION_INVALID') 'MOCK_CANDIDATE_ACTION_VALIDATION_FAILED';$fixedRollbackArgs=RewriteTaskConfigSha $mockActionArgs $mockCurrentSha $mockRollbackSha;Need (AssertTaskConfigAction $fixedRollbackArgs $mockTaskConfig $mockRollbackSha 'MOCK_ROLLBACK_ACTION_INVALID') 'MOCK_ROLLBACK_ACTION_VALIDATION_FAILED';$n+=3
  $hashFixture=Join-Path $tmp 'pinned-config.json';[IO.File]::WriteAllText($hashFixture,'candidate');$fixtureSha=Hash $hashFixture;Need (AssertConfigFileSha $hashFixture $fixtureSha 'MOCK_CONFIG_HASH_ASSERT_FAILED') 'MOCK_CONFIG_FILE_SHA_NOT_ACCEPTED';[IO.File]::WriteAllText($hashFixture,'changed');try{[void](AssertConfigFileSha $hashFixture $fixtureSha 'MOCK_CONFIG_HASH_MISMATCH_REJECTED');Fail 'MOCK_CONFIG_HASH_MISMATCH_ACCEPTED'}catch{Need ($_.Exception.Message -eq 'MOCK_CONFIG_HASH_MISMATCH_REJECTED') 'MOCK_CONFIG_HASH_MISMATCH_NOT_REJECTED';$n++};$n++
  $mockOldWeb='READY';try{[void](AssertTaskConfigAction $legacyArgs $mockTaskConfig $mockCandidateSha 'MOCK_BROKEN_ACTION_REJECTED');Fail 'MOCK_BROKEN_ACTION_NOT_REJECTED'}catch{Need ($_.Exception.Message -eq 'MOCK_BROKEN_ACTION_REJECTED' -and $mockOldWeb -eq 'READY') 'MOCK_OLD_WEB_NOT_PRESERVED_ON_ARG_REJECTION';$n++}
  $mockOldWeb='STOPPED';$mockCandidateTask='RESULT_1';if($mockCandidateTask -eq 'RESULT_1' -and (AssertTaskConfigAction $fixedRollbackArgs $mockTaskConfig $mockRollbackSha 'MOCK_ROLLBACK_ACTION_INVALID')){$mockOldWeb='READY'};Need ($mockOldWeb -eq 'READY') 'MOCK_FAILED_DEPLOYMENT_DID_NOT_RESTORE_OLD_WEB';$n++
  Need ((RollbackHealthFailureState 'Running' $true) -eq 'ROLLED_BACK_WEB_READY_HEALTH_FAILED_TASK_PRESERVED') 'MOCK_READY_OLD_TASK_NOT_PRESERVED';$n++;Need ($null -eq (RollbackHealthFailureState 'Disabled' $false)) 'MOCK_FAILED_ROLLBACK_MISLABELED_PRESERVED';$n++
  Need (TaskHandoffIdle 'Ready' $false) 'MOCK_IDLE_WEB_TASK_NOT_ACCEPTED';$n++;Need (-not(TaskHandoffIdle 'Running' $false)) 'MOCK_RUNNING_WEB_TASK_ACCEPTED_AS_IDLE';$n++;Need ((HealthFailureCode 'ECONNREFUSED') -eq 'WEB_HEALTH_FAILED_ECONNREFUSED') 'MOCK_REFUSED_HEALTH_CODE_LOST';$n++;Need ((HealthFailureCode 'certificate validation failed') -eq 'WEB_HEALTH_FAILED_HEALTH_PROBE_FAILED') 'MOCK_PERMANENT_HEALTH_CODE_MISCLASSIFIED';$n++
 }finally{Remove-Item -LiteralPath $tmp -Recurse -Force}
 Write-Output ('MOCK_PASS checks='+$n+' webRuntimeChanged=false courierTouched=false')
}
function GetActiveWeb{
 $rows=@()
 foreach($name in $taskNames){try{$t=Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction Stop;if([string]$t.State -eq 'Running' -and $t.Settings.Enabled -and @($t.Actions).Count -eq 1){$m=[regex]::Match([string]$t.Actions[0].Arguments,'-ControlConfig\s+"([^"]+)"\s+-ConfigSha256\s+([a-f0-9]{64})');if($m.Success){$rows+=,[pscustomobject]@{task=$t;configPath=$m.Groups[1].Value;configSha=$m.Groups[2].Value}}}}catch{}}
 Need ($rows.Count -eq 1) 'EXACTLY_ONE_RUNNING_WEB_TASK_REQUIRED'
 $x=$rows[0];Need ((Hash $x.configPath) -eq $x.configSha) 'WEB_CONTROL_PIN_CHANGED'
 $cfg=Get-Content -LiteralPath $x.configPath -Raw|ConvertFrom-Json
 Need ($cfg.kind -eq 'HDWORK2_WEB_SUPERVISOR' -and $cfg.taskName -eq $x.task.TaskName -and $cfg.ownerSid -eq 'S-1-5-19') 'WEB_SUPERVISOR_IDENTITY_REJECTED'
 $state=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json
 Need ($state.status -eq 'READY' -and $state.configSha256 -eq $x.configSha -and $state.ownerSid -eq $cfg.ownerSid) 'WEB_NOT_READY'
 $proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$state.childPid)
 Need ($proc -and $proc.Name -eq 'node.exe' -and $proc.CommandLine.Contains([string]$cfg.childCodeFile)) 'WEB_PROCESS_IDENTITY_REJECTED'
 Need ((Invoke-CimMethod -InputObject $proc -MethodName GetOwnerSid).Sid -eq 'S-1-5-19') 'WEB_PROCESS_OWNER_REJECTED'
 return [pscustomobject]@{Task=$x.task;ConfigPath=$x.configPath;ConfigSha=$x.configSha;Config=$cfg;State=$state;Runtime=[IO.Path]::GetFullPath($cfg.childWorkingDirectory)}
}
function GetWebOwnerIdentity($web){
 $ownerPid=[int]$web.State.ownerPid;$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$ownerPid)
 Need ($process -and $process.Name -eq 'powershell.exe') 'WEB_OWNER_PROCESS_IDENTITY_REJECTED'
 Need ($process.CommandLine.Contains([string]$web.Config.supervisorScript) -and $process.CommandLine.Contains([string]$web.ConfigPath) -and $process.CommandLine.Contains([string]$web.ConfigSha)) 'WEB_OWNER_PROCESS_COMMAND_REJECTED'
 Need ((Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid).Sid -eq 'S-1-5-19') 'WEB_OWNER_PROCESS_OWNER_REJECTED'
 return [pscustomobject]@{pid=$ownerPid;name=[string]$process.Name;createdUtc=$process.CreationDate.ToUniversalTime().ToString('o')}
}
function WaitWebOwnerExit($identity){
 WaitUntilExit { $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$identity.pid);SameProcess $process $identity } 30000 'WEB_OLD_OWNER_EXIT_TIMEOUT' 100
}
function WaitWebTaskIdle($web){
 WaitUntilExit {
  $task=Get-ScheduledTask -TaskPath '\' -TaskName $web.Task.TaskName
  Need (@($task.Actions).Count -eq 1 -and ([string]$task.Actions[0].Arguments).Contains($web.ConfigPath) -and ([string]$task.Actions[0].Arguments).Contains($web.ConfigSha)) 'WEB_TASK_CHANGED_DURING_HANDOFF'
  -not (TaskHandoffIdle ([string]$task.State) ([bool]$task.Settings.Enabled))
 } 30000 'WEB_OLD_TASK_NOT_IDLE' 100
}
function Health($web,[string]$receipt){
 $envPath=Join-Path $web.Runtime 'service/environment.json';$e=Get-Content -LiteralPath $envPath -Raw|ConvertFrom-Json
 $api=[int]$e.PORT;$tls=[int]$e.LOCAL_HTTPS_PORT;$ca=if($e.LOCAL_TLS_CA){[string]$e.LOCAL_TLS_CA}else{'.local/tls/ca.crt'}
 if(-not [IO.Path]::IsPathRooted($ca)){$ca=Join-Path $web.Runtime $ca}
 Need (Test-Path -LiteralPath $ca) 'WEB_HEALTH_CA_MISSING'
 $previousPreference=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$output=@(& node (Join-Path $root 'scripts/check-web-health.cjs') $api $tls $ca $receipt 2>&1);$exitCode=$LASTEXITCODE}finally{$ErrorActionPreference=$previousPreference}
 if($exitCode -ne 0){$text=($output|ForEach-Object{[string]$_}) -join ' ';Fail (HealthFailureCode $text)}
 $output|ForEach-Object{Write-Output $_}
}
function Control([string]$script,[string]$mode,[string]$config,[string]$sha,[string]$approval,[string]$plan,[string]$barrier){
 $controlArgs=@('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$script,'-Mode',$mode,'-ControlConfig',$config,'-ConfigSha256',$sha)
 if($mode -eq 'StopFence'){$controlArgs+=@('-ApprovalFile',$approval,'-PlanSha256',$plan,'-BarrierId',$barrier,'-Execute')}
 if($mode -eq 'AssertFence'){$controlArgs+=@('-BarrierId',$barrier)}
 $out=& powershell.exe @controlArgs;if($LASTEXITCODE -ne 0){Fail 'WEB_COOPERATIVE_STOP_FAILED'};return (($out -join "`n")|ConvertFrom-Json)
}
function WaitReady([string]$configPath,[string]$sha,[string]$attemptId,[int]$seconds=60){
 $until=[DateTimeOffset]::UtcNow.AddSeconds($seconds);$terminal=$null
 do{try{$cfg=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json;$state=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json;if(StartupStopped $state $sha $attemptId){$terminal=$state;break};if($state.attemptId -ceq $attemptId -and $state.status -eq 'READY' -and $state.configSha256 -eq $sha -and $state.ownerSid -eq $cfg.ownerSid){$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$state.childPid);if($p -and $p.Name -eq 'node.exe' -and (Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid).Sid -eq 'S-1-5-19'){return $state}}}catch{};Start-Sleep -Milliseconds 500}while([DateTimeOffset]::UtcNow -lt $until)
 $state=$terminal;$taskState='UNKNOWN';$lastResult=$null;try{$cfg=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json;if(-not $state){$state=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json};$task=Get-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName;$taskState=[string]$task.State;$info=Get-ScheduledTaskInfo -TaskPath '\' -TaskName $cfg.taskName;$lastResult=[int]$info.LastTaskResult}catch{}
 $attemptPath=AttemptDiagnosticPath $configPath $attemptId;$phase=if($terminal){'STARTUP_FAILED'}elseif($lastResult -and $lastResult -ne 267009){'TASK_EXITED_WITHOUT_ATTEMPT_STATE'}else{'READY_TIMEOUT'};UpdateAttemptRecord $attemptPath $attemptId 'candidate' $phase $sha @{taskResult=$lastResult}
 if($terminal){Fail (ReadyDiagnostic 'WEB_STARTUP_FAILED' $configPath $sha $terminal $taskState $lastResult $attemptId)}
 Fail (ReadyDiagnostic 'WEB_READY_TIMEOUT' $configPath $sha $state $taskState $lastResult $attemptId)
}
function IsAdmin{$id=[Security.Principal.WindowsIdentity]::GetCurrent();return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)}
function PrunePrevious([string]$releaseRoot,[string]$currentRelease){
 if($KeepPrevious){Write-Output 'WEB_PREVIOUS_RELEASES_RETAINED';return}
 $rootFull=[IO.Path]::GetFullPath($releaseRoot).TrimEnd('\')+'\';$currentFull=[IO.Path]::GetFullPath($currentRelease)
 foreach($dir in Get-ChildItem -LiteralPath $releaseRoot -Directory){
  $full=[IO.Path]::GetFullPath($dir.FullName);if($full -ieq $currentFull -or -not $full.StartsWith($rootFull,[StringComparison]::OrdinalIgnoreCase) -or ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint)){continue}
  $manifestPath=Join-Path $full 'manifest.json';if(-not(Test-Path -LiteralPath $manifestPath)){continue};try{$m=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json}catch{continue}
  if($m.kind -ne 'HDWORK2_WEB_UPDATE' -or $m.state -ne 'ACTIVE'){continue}
  $referenced=$false;foreach($name in $taskNames){try{$t=Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction Stop;if(([string]$t.Actions[0].Arguments).Contains($full)){$referenced=$true}}catch{}}
  if(-not $referenced){Remove-Item -LiteralPath $full -Recurse -Force}
 }
}
function Elevate{
 $exe=(Get-Process -Id $PID).Path;$arguments='-NoLogo -NoProfile -ExecutionPolicy Bypass -File "'+$PSCommandPath+'"';if($DryRun){$arguments+=' -DryRun'};if($DatabasePrerequisitesVerified){$arguments+=' -DatabasePrerequisitesVerified'};if($KeepPrevious){$arguments+=' -KeepPrevious'}
 if($ChatMediaDirectory){$arguments+=' -ChatMediaDirectory "'+$ChatMediaDirectory+'"'}
 $p=Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $root -Verb RunAs -PassThru -Wait;exit $p.ExitCode
}
function Main{
 if($Mock){MockTests;return}
 if($ChatMediaDirectory){Need ($ChatMediaDirectory -match '^[A-Za-z]:\\[^"\r\n]*[^\\"]$') 'WEB_CHAT_MEDIA_DIRECTORY_REJECTED'}
 if(-not $DryRun -and -not (IsAdmin)){Elevate}
 if(-not $DryRun){Need (IsAdmin) 'RUN_AS_ADMINISTRATOR'}
 $script:WebUpdatePhase='CHECK_MAIN_CHECKOUT';Write-Output 'CHECKING_MAIN_CHECKOUT'
 $branch=(InvokeGit @('branch','--show-current')).Trim();Need ($branch -eq 'main') 'CHECKOUT_MUST_BE_MAIN'
 & git.exe -C $root diff --quiet;if($LASTEXITCODE -ne 0){Fail 'TRACKED_LOCAL_CHANGES_BLOCK_UPDATE'}
 & git.exe -C $root diff --cached --quiet;if($LASTEXITCODE -ne 0){Fail 'STAGED_LOCAL_CHANGES_BLOCK_UPDATE'}
 if(-not $DryRun){InvokeGit @('fetch','origin','main')|Out-Null}
 $localHead=(InvokeGit @('rev-parse','HEAD')).Trim();$target=(InvokeGit @('rev-parse',$(if($DryRun){'origin/main'}else{'FETCH_HEAD'}))).Trim()
 if(-not $DryRun -and $target -ne $localHead){InvokeGit @('pull','--ff-only','origin','main')|Out-Null;$target=(InvokeGit @('rev-parse','HEAD')).Trim()}
 $script:WebUpdatePhase='READ_ACTIVE_WEB_TASK';Write-Output 'READING_ACTIVE_WEB_TASK';$web=GetActiveWeb;$activeCommit=if($web.Config.webTargetCommit){[string]$web.Config.webTargetCommit}else{[string]$web.Config.targetCommit};$ancestor=& git -C $root merge-base --is-ancestor $activeCommit $target;if($LASTEXITCODE -ne 0){Fail 'ACTIVE_WEB_PIN_NOT_ANCESTOR_OF_MAIN'}
 $changed=@((InvokeGit @('diff','--name-only',($activeCommit+'..'+$target))).Split([Environment]::NewLine,[StringSplitOptions]::RemoveEmptyEntries));$webPaths=@();foreach($p in $changed){if($p -ceq 'src/config/operational-grants.js' -and $DatabasePrerequisitesVerified){Need (ReviewedGrantInstalled $web $target $p) 'WEB_REVIEWED_GRANT_NOT_INSTALLED_OR_PINNED';Write-Output 'WEB_REVIEWED_GRANT_ALREADY_INSTALLED';continue};if(WebPath $p){$webPaths+=,$p}}
 $webPaths=@(@($webPaths)+@(RequiredVlanHelper $web $target)+@(RequiredWebContracts $web $target)|Sort-Object -Unique)
 if($ChatMediaDirectory){
  & git.exe -C $root cat-file -e ($target+':src/chat/photos.js') 2>$null
  Need ($LASTEXITCODE -eq 0) 'WEB_CHAT_PHOTOS_SOURCE_MISSING'
  StageChatMediaEnvironment $web ''
  $webPaths+=,'service/environment.json'
 }
 if($DryRun){
  if($webPaths -ccontains 'src/courier/contract.js'){
   $tempRoot=(Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).ProviderPath
   $stage=Join-Path $tempRoot ('hdwork-web-contract-'+[Guid]::NewGuid().ToString('N'))
   [void][IO.Directory]::CreateDirectory($stage)
   try{
    StageWebSource $target @('src/courier/contract.js') $stage (Join-Path $stage 'source.tar')
    Write-Output 'WEB_STAGED_COURIER_CONTRACT_MATCH'
   }finally{
    $resolved=(Resolve-Path -LiteralPath $stage).ProviderPath
    if($resolved -ceq $stage -and (Split-Path -Parent $resolved) -ieq $tempRoot){Remove-Item -LiteralPath $resolved -Recurse -Force}
   }
  }
  Write-Output ('DRY_RUN target='+$target+' webChanges='+$webPaths.Count+' activeTask='+$web.Task.TaskName+' runtimeChanged=false courierTouched=false');return
 }
 if($webPaths.Count -eq 0){$receipt=Join-Path $env:TEMP ('hdwork-web-health-'+[Guid]::NewGuid().ToString('N')+'.json');RetryTransientHealth { $null=Health $web $receipt };$h=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json;Remove-Item -LiteralPath $receipt -Force;Write-Output ('SUCCESS commit='+$target+' activeWebPin='+$activeCommit+' web=UNCHANGED health=PASS courier=UNTOUCHED rounds='+$h.rounds.Count);return}
 DeployWeb $web $target $webPaths
}
function DeployWeb($web,[string]$target,[string[]]$paths){
 $script:WebUpdatePhase='WEB_RELEASE_PRECHECK'
 if(@($paths|Where-Object{$_ -match '^package(-lock)?\.json$'}).Count){Fail 'WEB_DEPENDENCY_CHANGE_REQUIRES_STAGED_DEPENDENCY_INSTALL'}
 $ownerIdentity=GetWebOwnerIdentity $web;$script:WebUpdatePhase='WEB_OLD_HEALTH_PREFLIGHT';$preflightReceipt=Join-Path $env:TEMP ('web-preflight-'+[Guid]::NewGuid().ToString('N')+'.json');RetryTransientHealth { $null=Health $web $preflightReceipt };Remove-Item -LiteralPath $preflightReceipt -Force
 $runtime=$web.Runtime;$cfgPath=$web.ConfigPath;$cfg=$web.Config
 foreach($rel in $paths){if($rel.StartsWith('/') -or $rel.Split('/') -contains '..'){Fail 'WEB_PATH_REJECTED'};$p=Join-Path $runtime $rel;if(Test-Path -LiteralPath $p){$i=Get-Item -LiteralPath $p;if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){Fail 'WEB_RUNTIME_LINK_REJECTED'};$pin=$cfg.sourceHashes.PSObject.Properties[$rel];$expected=if($pin){[string]$pin.Value}else{$null};if(-not $expected -or (Hash $p) -ne $expected){Fail 'WEB_RUNTIME_SOURCE_DRIFT'}}}
 $script:WebUpdatePhase='WEB_RELEASE_DIRECTORY';$releaseRoot=Join-Path (Split-Path -Parent $cfgPath) 'updates';[void][IO.Directory]::CreateDirectory($releaseRoot);$release=Join-Path $releaseRoot ($target.Substring(0,12)+'-'+[Guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($release);$script:WebUpdateRelease=$release
 $payload=Join-Path $release 'payload';$backup=Join-Path $release 'backup';[void][IO.Directory]::CreateDirectory($payload);[void][IO.Directory]::CreateDirectory($backup)
 $script:WebUpdatePhase='WEB_SOURCE_ARCHIVE'
 $sourcePaths=@($paths|Where-Object {$_ -cne 'service/environment.json'})
 StageWebSource $target $sourcePaths $payload (Join-Path $release 'source.tar')
 if($ChatMediaDirectory){StageChatMediaEnvironment $web $payload}
 $frontendChanged=@($paths|Where-Object{$_ -like 'frontend/*'}).Count -gt 0
 if($frontendChanged){$script:WebUpdatePhase='WEB_FRONTEND_BUILD';$envPath=Join-Path $runtime 'service/environment.json';$envMap=Get-Content -LiteralPath $envPath -Raw|ConvertFrom-Json;$env:VITE_API_BASE_URL=[string]$envMap.HDWORK2_PUBLIC_ORIGIN;& node (Join-Path $root 'scripts/build-operational-frontend.js') --build;if($LASTEXITCODE -ne 0){Fail 'WEB_FRONTEND_BUILD_FAILED'};$script:WebUpdatePhase='WEB_FRONTEND_PACKAGE_COPY';$dist=Join-Path $root 'frontend/dist';Get-ChildItem -LiteralPath $dist -File -Recurse|Where-Object{$_.Name -ne 'release-manifest.json'}|ForEach-Object{$rel='frontend/dist/'+(RelativePath $dist $_.FullName);$to=Join-Path $payload $rel;[void][IO.Directory]::CreateDirectory((Split-Path -Parent $to));Copy-Item -LiteralPath $_.FullName -Destination $to}}
 $script:WebUpdatePhase='WEB_RELEASE_ENTRY_HASHES';$entries=@();$all=@($paths);if($frontendChanged){$payloadDist=Join-Path $payload 'frontend/dist';$all+=@(Get-ChildItem -LiteralPath $payloadDist -File -Recurse|ForEach-Object{'frontend/dist/'+(RelativePath $payloadDist $_.FullName)})};$all=@($all|Sort-Object -Unique)
 foreach($rel in $all){$dest=Join-Path $runtime $rel;$payloadFile=Join-Path $payload $rel;$oldHash=$null;$newHash=$null;if(Test-Path -LiteralPath $dest){$oldHash=Hash $dest;$b=Join-Path $backup $rel;[void][IO.Directory]::CreateDirectory((Split-Path -Parent $b));Copy-Item -LiteralPath $dest -Destination $b};if(Test-Path -LiteralPath $payloadFile){$newHash=Hash $payloadFile};$entries+=,[pscustomobject]@{path=$rel;before=$oldHash;after=$newHash}}
 if((Test-Path -LiteralPath (Join-Path $runtime 'src/vlan/format.js')) -or (Test-Path -LiteralPath (Join-Path $payload 'src/vlan/format.js'))){
  $script:WebUpdatePhase='WEB_VLAN_PAYLOAD_CHECK'
  & node (Join-Path $root 'scripts/check-web-vlan-payload.cjs') $runtime $payload $cfgPath $target
  if($LASTEXITCODE -ne 0){Fail 'WEB_VLAN_PAYLOAD_CHECK_FAILED'}
 }
 $oldConfigBytes=[IO.File]::ReadAllBytes($cfgPath);[IO.File]::WriteAllBytes((Join-Path $backup 'web-control.json'),$oldConfigBytes);$oldAction=$web.Task.Actions[0]
 $script:WebUpdatePhase='WEB_CONTROL_CONFIG';$next=$cfg|ConvertTo-Json -Depth 100|ConvertFrom-Json;$candidateAttemptId=[Guid]::NewGuid().ToString('N');$script:WebUpdateCandidateAttemptId=$candidateAttemptId;SetJsonProperty $next 'attemptId' $candidateAttemptId;SetJsonProperty $next 'attemptRole' 'candidate';SetJsonProperty $next 'webTargetCommit' $target
 foreach($entry in $entries){if($entry.after){$next.sourceHashes|Add-Member -NotePropertyName $entry.path -NotePropertyValue $entry.after -Force}else{$next.sourceHashes.PSObject.Properties.Remove($entry.path)}}
 $codePath=[string]$next.childCodeFile;$supervisor=[string]$next.supervisorScript;if(Test-Path (Join-Path $payload 'scripts/protected-web-service.js')){$next.childCodeSha256=Hash (Join-Path $payload 'scripts/protected-web-service.js')};if(Test-Path (Join-Path $payload 'ops/windows/web-native-supervisor.ps1')){$next.supervisorSha256=Hash (Join-Path $payload 'ops/windows/web-native-supervisor.ps1')}
 $newConfigBytes=[Text.UTF8Encoding]::new($false).GetBytes(($next|ConvertTo-Json -Depth 100)+[Environment]::NewLine);[IO.File]::WriteAllBytes((Join-Path $release 'new-control.json'),$newConfigBytes);$newConfigHash=Hash (Join-Path $release 'new-control.json')
 $rollbackAttemptId=[Guid]::NewGuid().ToString('N');$script:WebUpdateRollbackAttemptId=$rollbackAttemptId;$rollbackCfg=$web.Config|ConvertTo-Json -Depth 100|ConvertFrom-Json;SetJsonProperty $rollbackCfg 'attemptId' $rollbackAttemptId;SetJsonProperty $rollbackCfg 'attemptRole' 'rollback';$rollbackConfigBytes=[Text.UTF8Encoding]::new($false).GetBytes(($rollbackCfg|ConvertTo-Json -Depth 100)+[Environment]::NewLine);$rollbackConfigPath=Join-Path $release 'rollback-control.json';[IO.File]::WriteAllBytes($rollbackConfigPath,$rollbackConfigBytes);$rollbackConfigHash=Hash $rollbackConfigPath
 $argsNew=RewriteTaskConfigSha ([string]$oldAction.Arguments) $web.ConfigSha $newConfigHash;[void](AssertTaskConfigAction $argsNew $cfgPath $newConfigHash 'WEB_TASK_CANDIDATE_ACTION_INVALID')
 $rollbackArgs=RewriteTaskConfigSha ([string]$oldAction.Arguments) $web.ConfigSha $rollbackConfigHash;[void](AssertTaskConfigAction $rollbackArgs $cfgPath $rollbackConfigHash 'WEB_TASK_ROLLBACK_ACTION_INVALID')
 $rollbackAction=New-ScheduledTaskAction -Execute $oldAction.Execute -Argument $rollbackArgs -WorkingDirectory $oldAction.WorkingDirectory
 $script:WebUpdatePhase='WEB_RELEASE_MANIFEST';$manifest=@{kind='HDWORK2_WEB_UPDATE';version=1;state='STAGED';targetCommit=$target;runtime=$runtime;taskName=$cfg.taskName;configPath=$cfgPath;beforeConfigSha256=$web.ConfigSha;afterConfigSha256=$newConfigHash;candidateAttemptId=$candidateAttemptId;rollbackAttemptId=$rollbackAttemptId;rollbackConfigSha256=$rollbackConfigHash;oldTaskArguments=[string]$oldAction.Arguments;candidateTaskArguments=$argsNew;rollbackTaskArguments=$rollbackArgs;entries=$entries;checkedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')};SaveJson (Join-Path $release 'manifest.json') $manifest;$planHash=Hash (Join-Path $release 'manifest.json');$barrier=[Guid]::NewGuid().ToString()
 $operator=[Security.Principal.WindowsIdentity]::GetCurrent().Name;$approvalPath=Join-Path $release 'approval.json';SaveJson $approvalPath @{kind='HDWORK2_OPERATOR_WEB_HANDOFF_APPROVAL';approved=$true;scope='WEB_HANDOFF_ONLY_NO_TELEGRAM';operator=$operator;decisionId=('WEBUPDATE-'+$barrier);targetCommit=$cfg.targetCommit;planSha256=$planHash;nativeConfigSha256=$web.ConfigSha;expiresAtUtc=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o')}
 $control=Join-Path $runtime 'ops/windows/web-native-control.ps1';$fenceAttempted=$false;$fenced=$false;$quiescent=$false;$mutated=$false
 try{
  $script:WebUpdatePhase='WEB_STOP_FENCE'
  $fenceAttempted=$true;$null=Control $control 'StopFence' $cfgPath $web.ConfigSha $approvalPath $planHash $barrier;$fenced=$true;$null=Control $control 'AssertFence' $cfgPath $web.ConfigSha '' $planHash $barrier;$script:WebUpdatePhase='WEB_OLD_OWNER_EXIT';WaitWebOwnerExit $ownerIdentity;WaitWebTaskIdle $web;$quiescent=$true
  $script:WebUpdatePhase='WEB_FILE_ACTIVATION'
  foreach($entry in $entries){$dest=Join-Path $runtime $entry.path;$src=Join-Path $payload $entry.path;$mutated=$true;if($entry.after){Atomic $dest ([IO.File]::ReadAllBytes($src))}elseif(Test-Path -LiteralPath $dest){Remove-Item -LiteralPath $dest -Force}}
  Atomic $cfgPath $newConfigBytes
  [void](AssertConfigFileSha $cfgPath $newConfigHash 'WEB_CANDIDATE_CONFIG_PIN_MISMATCH')
  $action=New-ScheduledTaskAction -Execute $oldAction.Execute -Argument $argsNew -WorkingDirectory $oldAction.WorkingDirectory;Set-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName -Action $action|Out-Null
  $candidateTask=Get-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName;Need (@($candidateTask.Actions).Count -eq 1 -and $candidateTask.Actions[0].Execute -ceq $oldAction.Execute -and $candidateTask.Actions[0].WorkingDirectory -ceq $oldAction.WorkingDirectory) 'WEB_TASK_CANDIDATE_ACTION_CHANGED';[void](AssertTaskConfigAction ([string]$candidateTask.Actions[0].Arguments) $cfgPath $newConfigHash 'WEB_TASK_CANDIDATE_ACTION_READBACK_INVALID')
  $script:WebUpdatePhase='WEB_TASK_HANDOFF';$fence=Get-Content -LiteralPath $cfg.fenceFile -Raw|ConvertFrom-Json;Need ($fence.barrierId -eq $barrier -and $fence.configSha256 -eq $web.ConfigSha) 'WEB_FENCE_RECEIPT_MISMATCH';Remove-Item -LiteralPath $cfg.fenceFile -Force
  $candidateDiag=AttemptDiagnosticPath $cfgPath $candidateAttemptId;UpdateAttemptRecord $candidateDiag $candidateAttemptId 'candidate' 'HANDOFF_STARTING' $newConfigHash @{}
  Enable-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName|Out-Null;Start-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName;$null=WaitReady $cfgPath $newConfigHash $candidateAttemptId
  $script:WebUpdatePhase='WEB_POST_START_HEALTH';$receipt=Join-Path $release 'health.json';$webNew=[pscustomobject]@{Runtime=$runtime};RetryTransientHealth { $null=Health $webNew $receipt }
  $manifest.state='ACTIVE';$manifest.health='PASS';$manifest.checkedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');SaveJson (Join-Path $release 'manifest.json') $manifest;PrunePrevious $releaseRoot $release
  Write-Output ('SUCCESS commit='+$target+' web=DEPLOYED task='+$cfg.taskName+' courier=UNTOUCHED rollback='+$release)
 }catch{
  $original=$_.Exception.Message
  if(-not $fenced){$currentTask=Get-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName;$fenceExists=Test-Path -LiteralPath $cfg.fenceFile;$manifest.state=if($fenceAttempted -and ($fenceExists -or -not $currentTask.Settings.Enabled)){'STOP_UNCERTAIN_TASK_LEFT_UNTOUCHED'}else{'STOP_FAILED_NO_RUNTIME_MUTATION'};$manifest.failureCode=$original;SaveJson (Join-Path $release 'manifest.json') $manifest;if($manifest.state -eq 'STOP_UNCERTAIN_TASK_LEFT_UNTOUCHED'){Fail 'WEB_STOP_UNCERTAIN_NO_CODE_WRITES'};throw}
  if(-not $quiescent){$manifest.state='STOP_BARRIER_UNPROVEN_TASK_LEFT_FENCED';$manifest.failureCode=$original;SaveJson (Join-Path $release 'manifest.json') $manifest;Fail 'WEB_STOP_BARRIER_UNPROVEN_TASK_LEFT_FENCED'}
  try{
   $taskNow=Get-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName
   if([string]$taskNow.State -eq 'Running'){Disable-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName|Out-Null;Stop-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName;for($i=0;$i -lt 60;$i++){if(-not(Get-CimInstance Win32_Process -Filter ("Name='powershell.exe' OR Name='node.exe'" )|Where-Object{$_.CommandLine -and $_.CommandLine.Contains($runtime)})){break};Start-Sleep -Milliseconds 500};$alive=@(Get-CimInstance Win32_Process -Filter ("Name='powershell.exe' OR Name='node.exe'" )|Where-Object{$_.CommandLine -and $_.CommandLine.Contains($runtime)});if($alive.Count){Fail 'WEB_ROLLBACK_STOP_NOT_CONFIRMED'}}
   if($mutated){foreach($entry in $entries){$dest=Join-Path $runtime $entry.path;$b=Join-Path $backup $entry.path;if($entry.before){Atomic $dest ([IO.File]::ReadAllBytes($b))}elseif(Test-Path -LiteralPath $dest){Remove-Item -LiteralPath $dest -Force}}}
   [void](AssertConfigFileSha $rollbackConfigPath $rollbackConfigHash 'WEB_ROLLBACK_CONFIG_PIN_MISMATCH');Atomic $cfgPath $rollbackConfigBytes;if(Test-Path -LiteralPath $cfg.fenceFile){$f=Get-Content -LiteralPath $cfg.fenceFile -Raw|ConvertFrom-Json;if($f.barrierId -ne $barrier -or $f.configSha256 -ne $web.ConfigSha){Fail 'UNEXPECTED_WEB_STARTUP_FENCE'};Remove-Item -LiteralPath $cfg.fenceFile -Force};[void](AssertConfigFileSha $cfgPath $rollbackConfigHash 'WEB_ROLLBACK_CONFIG_ACTIVATION_PIN_MISMATCH');Set-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName -Action $rollbackAction|Out-Null;$rollbackTask=Get-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName;Need (@($rollbackTask.Actions).Count -eq 1 -and $rollbackTask.Actions[0].Execute -ceq $oldAction.Execute -and $rollbackTask.Actions[0].WorkingDirectory -ceq $oldAction.WorkingDirectory) 'WEB_TASK_ROLLBACK_ACTION_CHANGED';[void](AssertTaskConfigAction ([string]$rollbackTask.Actions[0].Arguments) $cfgPath $rollbackConfigHash 'WEB_TASK_ROLLBACK_ACTION_READBACK_INVALID');UpdateAttemptRecord (AttemptDiagnosticPath $cfgPath $rollbackAttemptId) $rollbackAttemptId 'rollback' 'ROLLBACK_STARTING' $rollbackConfigHash @{ };Enable-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName|Out-Null;Start-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName;$null=WaitReady $cfgPath $rollbackConfigHash $rollbackAttemptId
   $rollbackHealth=Join-Path $release 'rollback-health.json';RetryTransientHealth { $null=Health $web $rollbackHealth };UpdateAttemptRecord (AttemptDiagnosticPath $cfgPath $rollbackAttemptId) $rollbackAttemptId 'rollback' 'ROLLBACK_COMPLETED' $rollbackConfigHash @{};$manifest.state='ROLLED_BACK';$manifest.failureCode=$original;$manifest.rollbackHealth='PASS';SaveJson (Join-Path $release 'manifest.json') $manifest;Fail ('WEB_UPDATE_FAILED_ROLLED_BACK_'+$original)
  }catch{if($_.Exception.Message -like 'WEB_UPDATE_FAILED_ROLLED_BACK_*'){throw};$rollbackError=$_.Exception.Message;$rollbackExceptionType=$_.Exception.GetType().Name;$rollbackCode=if($rollbackError -match '^([A-Z][A-Z0-9_]{0,63})'){$Matches[1]}else{'WEB_ROLLBACK_FAILED'};UpdateAttemptRecord (AttemptDiagnosticPath $cfgPath $rollbackAttemptId) $rollbackAttemptId 'rollback' 'ROLLBACK_FAILED' $rollbackConfigHash @{exceptionType=$rollbackExceptionType;code=$rollbackCode;taskResult=1};if($rollbackError -like 'WEB_HEALTH_FAILED_*'){$restoredTask=Get-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName;$preservedState=RollbackHealthFailureState ([string]$restoredTask.State) ([bool]$restoredTask.Settings.Enabled);if($preservedState){$manifest.state=$preservedState;$manifest.failureCode=$original;$manifest.rollbackError=$rollbackError;$manifest.rollbackHealth='FAIL';$manifest.rollbackTaskPreserved=$true;SaveJson (Join-Path $release 'manifest.json') $manifest;Fail 'WEB_ROLLBACK_HEALTH_FAILED_TASK_PRESERVED'}};$manifest.state='ROLLBACK_FAILED';$manifest.failureCode=$original;$manifest.rollbackError=$rollbackError;SaveJson (Join-Path $release 'manifest.json') $manifest;Fail 'WEB_ROLLBACK_FAILED_PRESERVE_RELEASE_AND_TASK_STATE'}
 }
}
try{Main;exit 0}catch{$exceptionType=$_.Exception.GetType().FullName;$reason=SafeDiagnostic $_.Exception.Message;$code=if($_.Exception.Message -match '^[A-Z0-9_-]+$'){$_.Exception.Message}else{'WEB_UPDATE_FAILED'};Write-Output ('DIAGNOSTIC phase='+$script:WebUpdatePhase+' exception='+$exceptionType+' reason='+$reason);if($script:WebUpdateRelease){try{$failure=@{kind='HDWORK2_WEB_UPDATE_FAILURE';phase=$script:WebUpdatePhase;code=$code;exception=$exceptionType;reason=$reason;candidateAttemptId=$script:WebUpdateCandidateAttemptId;rollbackAttemptId=$script:WebUpdateRollbackAttemptId;failedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')};SaveJson (Join-Path $script:WebUpdateRelease 'failure.json') $failure}catch{Write-Output ('DIAGNOSTIC_RECEIPT_WRITE_FAILED '+(SafeDiagnostic $_.Exception.Message))}};Write-Output ('FAILED code='+$code+' courier=UNTOUCHED');exit 1}
