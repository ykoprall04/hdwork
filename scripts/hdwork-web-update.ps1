[CmdletBinding()]
param([switch]$Mock,[switch]$DryRun)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskNames=@('HDWork2-Web','HDWork2-Web-Standby','HDWork2-Web-Rollback')
$script:WebUpdatePhase='STARTUP'
$script:WebUpdateRelease=$null
function Fail([string]$code){throw $code}
function Need([bool]$ok,[string]$code){if(-not $ok){Fail $code}}
function Hash([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
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
function WebPath([string]$path){
 $p=$path.Replace('\','/')
 if($p -match '^(src/courier/|src/b2c-workflow/|src/config/production-courier\.js$|courier[-_]|courier_bot/|contracts/|docs/|tests/|scripts/hdwork-web-update\.ps1$|hdwork-update\.cmd$)'){return $false}
 if($p -match '(^|/)(migrations?|schema)(/|\.|$)|\.sql$|operational-grants\.js$|(^|/)\.env'){Fail 'WEB_UPDATE_DATABASE_OR_SECRET_CHANGE_REQUIRES_REVIEW'}
 return $p -match '^(frontend/|public/|views/|server\.js$|api-only-server\.js$|local-web-server\.js$|src/|scripts/(protected-web-service|run-protected-web|check-operational-release|build-operational-frontend)\.|ops/windows/web-|package\.json$|package-lock\.json$)'
}
function InvokeGit([string[]]$gitArgs){$out=& git.exe -C $root @gitArgs;if($LASTEXITCODE -ne 0){Fail 'GIT_UPDATE_FAILED'};return ($out -join [Environment]::NewLine)}
function Atomic([string]$path,[byte[]]$bytes){
 $dir=Split-Path -Parent $path;[void][IO.Directory]::CreateDirectory($dir)
 $tmp=$path+'.update-'+[Guid]::NewGuid().ToString('N')+'.tmp';[IO.File]::WriteAllBytes($tmp,$bytes)
 if(Test-Path -LiteralPath $path){$acl=Get-Acl -LiteralPath $path;Set-Acl -LiteralPath $tmp -AclObject $acl;Move-Item -LiteralPath $tmp -Destination $path -Force}else{[IO.File]::Move($tmp,$path)}
}
function SaveJson([string]$path,$value){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($value|ConvertTo-Json -Depth 100)+[Environment]::NewLine);Atomic $path $bytes}
function MockTests{
 $n=0
 foreach($p in @('frontend/src/App.tsx','server.js','src/operations/routes.js','package-lock.json')){Need ([bool](WebPath $p)) 'MOCK_WEB_CLASSIFICATION_FAILED';$n++}
 foreach($p in @('src/courier/groups.js','src/b2c-workflow/workflow.js','courier_bot/courier/groups.py','contracts/b2c-commands.json','docs/release.md','tests/web.test.js','scripts/hdwork-web-update.ps1')){Need (-not (WebPath $p)) 'MOCK_COMPONENT_ISOLATION_FAILED';$n++}
 try{[void](WebPath 'database/migrations/018.sql');Fail 'MOCK_MIGRATION_NOT_BLOCKED'}catch{Need ($_.Exception.Message -eq 'WEB_UPDATE_DATABASE_OR_SECRET_CHANGE_REQUIRES_REVIEW') 'MOCK_MIGRATION_GUARD_FAILED';$n++}
 $tmp=Join-Path $env:TEMP ('hdwork-web-update-mock-'+[Guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($tmp)
 try{$f=Join-Path $tmp 'service.js';[IO.File]::WriteAllText($f,'old');$old=[IO.File]::ReadAllBytes($f);Atomic $f ([Text.Encoding]::UTF8.GetBytes('new'));Need ([IO.File]::ReadAllText($f) -eq 'new') 'MOCK_APPLY_FAILED';$n++;Atomic $f $old;Need ([IO.File]::ReadAllText($f) -eq 'old') 'MOCK_ROLLBACK_FAILED';$n++;$mockDist=Join-Path $tmp 'frontend/dist';$nested=Join-Path $mockDist 'assets/app.js';[void][IO.Directory]::CreateDirectory((Split-Path -Parent $nested));[IO.File]::WriteAllText($nested,'asset');$releaseManifest=Join-Path $mockDist 'release-manifest.json';[IO.File]::WriteAllText($releaseManifest,'{}');Need ((RelativePath $mockDist $nested) -eq 'assets/app.js') 'MOCK_RELATIVE_PATH_FAILED';$n++;try{[void](RelativePath (Join-Path $mockDist 'assets') $f);Fail 'MOCK_RELATIVE_PATH_ESCAPE_NOT_BLOCKED'}catch{Need ($_.Exception.Message -eq 'WEB_RELEASE_PATH_OUTSIDE_ROOT') 'MOCK_RELATIVE_PATH_GUARD_FAILED';$n++};$mockPayload=Join-Path $tmp 'payload';Get-ChildItem -LiteralPath $mockDist -File -Recurse|Where-Object{$_.Name -ne 'release-manifest.json'}|ForEach-Object{$rel='frontend/dist/'+(RelativePath $mockDist $_.FullName);$to=Join-Path $mockPayload $rel;[void][IO.Directory]::CreateDirectory((Split-Path -Parent $to));Copy-Item -LiteralPath $_.FullName -Destination $to};Need ([IO.File]::ReadAllText((Join-Path $mockPayload 'frontend/dist/assets/app.js')) -eq 'asset') 'MOCK_FRONTEND_PACKAGE_COPY_FAILED';$n++;Need (-not(Test-Path -LiteralPath (Join-Path $mockPayload 'frontend/dist/release-manifest.json'))) 'MOCK_FRONTEND_MANIFEST_SHOULD_NOT_BE_DEPLOYED';$n++;$safe=SafeDiagnostic 'failed token=123456:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_1234';Need ($safe -notmatch '123456:') 'MOCK_DIAGNOSTIC_REDACTION_FAILED';$n++;$json=[pscustomobject]@{targetCommit='old'};SetJsonProperty $json 'webTargetCommit' 'new';Need ($json.webTargetCommit -eq 'new') 'MOCK_JSON_PROPERTY_ADD_FAILED';$n++;SetJsonProperty $json 'webTargetCommit' 'next';Need ($json.webTargetCommit -eq 'next') 'MOCK_JSON_PROPERTY_UPDATE_FAILED';$n++}finally{Remove-Item -LiteralPath $tmp -Recurse -Force}
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
function Health($web,[string]$receipt){
 $envPath=Join-Path $web.Runtime 'service/environment.json';$e=Get-Content -LiteralPath $envPath -Raw|ConvertFrom-Json
 $api=[int]$e.PORT;$tls=[int]$e.LOCAL_HTTPS_PORT;$ca=if($e.LOCAL_TLS_CA){[string]$e.LOCAL_TLS_CA}else{'.local/tls/ca.crt'}
 if(-not [IO.Path]::IsPathRooted($ca)){$ca=Join-Path $web.Runtime $ca}
 Need (Test-Path -LiteralPath $ca) 'WEB_HEALTH_CA_MISSING'
 & node (Join-Path $root 'scripts/check-web-health.cjs') $api $tls $ca $receipt
 if($LASTEXITCODE -ne 0){Fail 'WEB_HEALTH_FAILED'}
}
function Control([string]$script,[string]$mode,[string]$config,[string]$sha,[string]$approval,[string]$plan,[string]$barrier){
 $controlArgs=@('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$script,'-Mode',$mode,'-ControlConfig',$config,'-ConfigSha256',$sha)
 if($mode -eq 'StopFence'){$controlArgs+=@('-ApprovalFile',$approval,'-PlanSha256',$plan,'-BarrierId',$barrier,'-Execute')}
 if($mode -eq 'AssertFence'){$controlArgs+=@('-BarrierId',$barrier)}
 $out=& powershell.exe @controlArgs;if($LASTEXITCODE -ne 0){Fail 'WEB_COOPERATIVE_STOP_FAILED'};return (($out -join "`n")|ConvertFrom-Json)
}
function WaitReady([string]$configPath,[string]$sha,[int]$seconds=60){
 $until=[DateTimeOffset]::UtcNow.AddSeconds($seconds)
 do{try{$cfg=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json;$s=Get-Content -LiteralPath $cfg.stateFile -Raw|ConvertFrom-Json;if($s.status -eq 'READY' -and $s.configSha256 -eq $sha -and $s.ownerSid -eq $cfg.ownerSid){$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$s.childPid);if($p -and $p.Name -eq 'node.exe' -and (Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid).Sid -eq 'S-1-5-19'){return $s}}}catch{};Start-Sleep -Milliseconds 500}while([DateTimeOffset]::UtcNow -lt $until)
 Fail 'WEB_READY_TIMEOUT'
}
function IsAdmin{$id=[Security.Principal.WindowsIdentity]::GetCurrent();return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)}
function PrunePrevious([string]$releaseRoot,[string]$currentRelease){
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
 $exe=(Get-Process -Id $PID).Path;$arguments='-NoLogo -NoProfile -ExecutionPolicy Bypass -File "'+$PSCommandPath+'"';if($DryRun){$arguments+=' -DryRun'}
 $p=Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $root -Verb RunAs -PassThru -Wait;exit $p.ExitCode
}
function Main{
 if($Mock){MockTests;return}
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
 $changed=@((InvokeGit @('diff','--name-only',($activeCommit+'..'+$target))).Split([Environment]::NewLine,[StringSplitOptions]::RemoveEmptyEntries));$webPaths=@();foreach($p in $changed){if(WebPath $p){$webPaths+=,$p}}
 if($DryRun){Write-Output ('DRY_RUN target='+$target+' webChanges='+$webPaths.Count+' activeTask='+$web.Task.TaskName+' runtimeChanged=false courierTouched=false');return}
 if($webPaths.Count -eq 0){$receipt=Join-Path $env:TEMP ('hdwork-web-health-'+[Guid]::NewGuid().ToString('N')+'.json');Health $web $receipt;$h=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json;Remove-Item -LiteralPath $receipt -Force;Write-Output ('SUCCESS commit='+$target+' activeWebPin='+$activeCommit+' web=UNCHANGED health=PASS courier=UNTOUCHED rounds='+$h.rounds.Count);return}
 DeployWeb $web $target $webPaths
}
function DeployWeb($web,[string]$target,[string[]]$paths){
 $script:WebUpdatePhase='WEB_RELEASE_PRECHECK'
 if(@($paths|Where-Object{$_ -match '^package(-lock)?\.json$'}).Count){Fail 'WEB_DEPENDENCY_CHANGE_REQUIRES_STAGED_DEPENDENCY_INSTALL'}
 $runtime=$web.Runtime;$cfgPath=$web.ConfigPath;$cfg=$web.Config
 foreach($rel in $paths){if($rel.StartsWith('/') -or $rel.Split('/') -contains '..'){Fail 'WEB_PATH_REJECTED'};$p=Join-Path $runtime $rel;if(Test-Path -LiteralPath $p){$i=Get-Item -LiteralPath $p;if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){Fail 'WEB_RUNTIME_LINK_REJECTED'};$pin=$cfg.sourceHashes.PSObject.Properties[$rel];$expected=if($pin){[string]$pin.Value}else{$null};if(-not $expected -or (Hash $p) -ne $expected){Fail 'WEB_RUNTIME_SOURCE_DRIFT'}}}
 $script:WebUpdatePhase='WEB_RELEASE_DIRECTORY';$releaseRoot=Join-Path (Split-Path -Parent $cfgPath) 'updates';[void][IO.Directory]::CreateDirectory($releaseRoot);$release=Join-Path $releaseRoot ($target.Substring(0,12)+'-'+[Guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($release);$script:WebUpdateRelease=$release
 $payload=Join-Path $release 'payload';$backup=Join-Path $release 'backup';[void][IO.Directory]::CreateDirectory($payload);[void][IO.Directory]::CreateDirectory($backup)
 $script:WebUpdatePhase='WEB_SOURCE_ARCHIVE';$archive=Join-Path $release 'source.tar';$existing=@();foreach($rel in $paths){& git.exe -C $root cat-file -e ($target+':'+$rel) 2>$null;if($LASTEXITCODE -eq 0){$existing+=,$rel}}
 if($existing.Count){& git.exe -C $root archive --format=tar ('--output='+$archive) $target -- @existing;if($LASTEXITCODE -ne 0){Fail 'WEB_SOURCE_ARCHIVE_FAILED'};& tar.exe -xf $archive -C $payload;if($LASTEXITCODE -ne 0){Fail 'WEB_SOURCE_EXTRACT_FAILED'}}
 $frontendChanged=@($paths|Where-Object{$_ -like 'frontend/*'}).Count -gt 0
 if($frontendChanged){$script:WebUpdatePhase='WEB_FRONTEND_BUILD';$envPath=Join-Path $runtime 'service/environment.json';$envMap=Get-Content -LiteralPath $envPath -Raw|ConvertFrom-Json;$env:VITE_API_BASE_URL=[string]$envMap.HDWORK2_PUBLIC_ORIGIN;& node (Join-Path $root 'scripts/build-operational-frontend.js') --build;if($LASTEXITCODE -ne 0){Fail 'WEB_FRONTEND_BUILD_FAILED'};$script:WebUpdatePhase='WEB_FRONTEND_PACKAGE_COPY';$dist=Join-Path $root 'frontend/dist';Get-ChildItem -LiteralPath $dist -File -Recurse|Where-Object{$_.Name -ne 'release-manifest.json'}|ForEach-Object{$rel='frontend/dist/'+(RelativePath $dist $_.FullName);$to=Join-Path $payload $rel;[void][IO.Directory]::CreateDirectory((Split-Path -Parent $to));Copy-Item -LiteralPath $_.FullName -Destination $to}}
 $script:WebUpdatePhase='WEB_RELEASE_ENTRY_HASHES';$entries=@();$all=@($paths);if($frontendChanged){$payloadDist=Join-Path $payload 'frontend/dist';$all+=@(Get-ChildItem -LiteralPath $payloadDist -File -Recurse|ForEach-Object{'frontend/dist/'+(RelativePath $payloadDist $_.FullName)})};$all=@($all|Sort-Object -Unique)
 foreach($rel in $all){$dest=Join-Path $runtime $rel;$payloadFile=Join-Path $payload $rel;$oldHash=$null;$newHash=$null;if(Test-Path -LiteralPath $dest){$oldHash=Hash $dest;$b=Join-Path $backup $rel;[void][IO.Directory]::CreateDirectory((Split-Path -Parent $b));Copy-Item -LiteralPath $dest -Destination $b};if(Test-Path -LiteralPath $payloadFile){$newHash=Hash $payloadFile};$entries+=,[pscustomobject]@{path=$rel;before=$oldHash;after=$newHash}}
 $oldConfigBytes=[IO.File]::ReadAllBytes($cfgPath);[IO.File]::WriteAllBytes((Join-Path $backup 'web-control.json'),$oldConfigBytes);$oldAction=$web.Task.Actions[0]
 $script:WebUpdatePhase='WEB_CONTROL_CONFIG';$next=$cfg|ConvertTo-Json -Depth 100|ConvertFrom-Json;SetJsonProperty $next 'webTargetCommit' $target
 foreach($entry in $entries){if($entry.after){$next.sourceHashes|Add-Member -NotePropertyName $entry.path -NotePropertyValue $entry.after -Force}else{$next.sourceHashes.PSObject.Properties.Remove($entry.path)}}
 $codePath=[string]$next.childCodeFile;$supervisor=[string]$next.supervisorScript;if(Test-Path (Join-Path $payload 'scripts/protected-web-service.js')){$next.childCodeSha256=Hash (Join-Path $payload 'scripts/protected-web-service.js')};if(Test-Path (Join-Path $payload 'ops/windows/web-native-supervisor.ps1')){$next.supervisorSha256=Hash (Join-Path $payload 'ops/windows/web-native-supervisor.ps1')}
 $newConfigBytes=[Text.UTF8Encoding]::new($false).GetBytes(($next|ConvertTo-Json -Depth 100)+[Environment]::NewLine);[IO.File]::WriteAllBytes((Join-Path $release 'new-control.json'),$newConfigBytes);$newConfigHash=Hash (Join-Path $release 'new-control.json')
 $script:WebUpdatePhase='WEB_RELEASE_MANIFEST';$manifest=@{kind='HDWORK2_WEB_UPDATE';version=1;state='STAGED';targetCommit=$target;runtime=$runtime;taskName=$cfg.taskName;configPath=$cfgPath;beforeConfigSha256=$web.ConfigSha;afterConfigSha256=$newConfigHash;oldTaskArguments=[string]$oldAction.Arguments;entries=$entries;checkedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')};SaveJson (Join-Path $release 'manifest.json') $manifest;$planHash=Hash (Join-Path $release 'manifest.json');$barrier=[Guid]::NewGuid().ToString()
 $operator=[Security.Principal.WindowsIdentity]::GetCurrent().Name;$approvalPath=Join-Path $release 'approval.json';SaveJson $approvalPath @{kind='HDWORK2_OPERATOR_WEB_HANDOFF_APPROVAL';approved=$true;scope='WEB_HANDOFF_ONLY_NO_TELEGRAM';operator=$operator;decisionId=('WEBUPDATE-'+$barrier);targetCommit=$cfg.targetCommit;planSha256=$planHash;nativeConfigSha256=$web.ConfigSha;expiresAtUtc=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o')}
 $control=Join-Path $runtime 'ops/windows/web-native-control.ps1';$fenceAttempted=$false;$fenced=$false;$quiescent=$false;$mutated=$false
 try{
  $script:WebUpdatePhase='WEB_STOP_FENCE'
  $fenceAttempted=$true;$null=Control $control 'StopFence' $cfgPath $web.ConfigSha $approvalPath $planHash $barrier;$fenced=$true;$null=Control $control 'AssertFence' $cfgPath $web.ConfigSha '' $planHash $barrier;$quiescent=$true
  $script:WebUpdatePhase='WEB_FILE_ACTIVATION'
  foreach($entry in $entries){$dest=Join-Path $runtime $entry.path;$src=Join-Path $payload $entry.path;$mutated=$true;if($entry.after){Atomic $dest ([IO.File]::ReadAllBytes($src))}elseif(Test-Path -LiteralPath $dest){Remove-Item -LiteralPath $dest -Force}}
  Atomic $cfgPath $newConfigBytes
  $argsNew=[regex]::Replace([string]$oldAction.Arguments,'(-ConfigSha256\s+)[a-f0-9]{64}','$1'+$newConfigHash,1);if($argsNew -ceq [string]$oldAction.Arguments){Fail 'WEB_TASK_ACTION_PIN_NOT_FOUND'}
  $action=New-ScheduledTaskAction -Execute $oldAction.Execute -Argument $argsNew -WorkingDirectory $oldAction.WorkingDirectory;Set-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName -Action $action|Out-Null
  $script:WebUpdatePhase='WEB_TASK_HANDOFF';$fence=Get-Content -LiteralPath $cfg.fenceFile -Raw|ConvertFrom-Json;Need ($fence.barrierId -eq $barrier -and $fence.configSha256 -eq $web.ConfigSha) 'WEB_FENCE_RECEIPT_MISMATCH';Remove-Item -LiteralPath $cfg.fenceFile -Force
  Enable-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName|Out-Null;Start-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName;$null=WaitReady $cfgPath $newConfigHash
  $script:WebUpdatePhase='WEB_POST_START_HEALTH';$receipt=Join-Path $release 'health.json';$webNew=[pscustomobject]@{Runtime=$runtime};Health $webNew $receipt
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
   Atomic $cfgPath $oldConfigBytes;if(Test-Path -LiteralPath $cfg.fenceFile){$f=Get-Content -LiteralPath $cfg.fenceFile -Raw|ConvertFrom-Json;if($f.barrierId -ne $barrier -and $f.configSha256 -ne $newConfigHash){Fail 'UNEXPECTED_WEB_STARTUP_FENCE'};Remove-Item -LiteralPath $cfg.fenceFile -Force};Set-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName -Action $oldAction|Out-Null;Enable-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName|Out-Null;Start-ScheduledTask -TaskPath '\' -TaskName $cfg.taskName;$null=WaitReady $cfgPath $web.ConfigSha
   $rollbackHealth=Join-Path $release 'rollback-health.json';Health $web $rollbackHealth;$manifest.state='ROLLED_BACK';$manifest.failureCode=$original;$manifest.rollbackHealth='PASS';SaveJson (Join-Path $release 'manifest.json') $manifest;Fail ('WEB_UPDATE_FAILED_ROLLED_BACK_'+$original)
  }catch{if($_.Exception.Message -like 'WEB_UPDATE_FAILED_ROLLED_BACK_*'){throw};$manifest.state='ROLLBACK_FAILED';$manifest.failureCode=$original;$manifest.rollbackError=$_.Exception.Message;SaveJson (Join-Path $release 'manifest.json') $manifest;Fail 'WEB_ROLLBACK_FAILED_PRESERVE_RELEASE_AND_TASK_STATE'}
 }
}
try{Main;exit 0}catch{$exceptionType=$_.Exception.GetType().FullName;$reason=SafeDiagnostic $_.Exception.Message;$code=if($_.Exception.Message -match '^[A-Z0-9_-]+$'){$_.Exception.Message}else{'WEB_UPDATE_FAILED'};Write-Output ('DIAGNOSTIC phase='+$script:WebUpdatePhase+' exception='+$exceptionType+' reason='+$reason);if($script:WebUpdateRelease){try{$failure=@{kind='HDWORK2_WEB_UPDATE_FAILURE';phase=$script:WebUpdatePhase;code=$code;exception=$exceptionType;reason=$reason;failedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')};SaveJson (Join-Path $script:WebUpdateRelease 'failure.json') $failure}catch{Write-Output ('DIAGNOSTIC_RECEIPT_WRITE_FAILED '+(SafeDiagnostic $_.Exception.Message))}};Write-Output ('FAILED code='+$code+' courier=UNTOUCHED');exit 1}
