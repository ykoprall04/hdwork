[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$task=Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-LiveChat-Courier'
if($task.Settings.Enabled -or [string]$task.State -ne 'Disabled'){throw 'STOPPED_DISABLED_TASK_REQUIRED'}
$argsText=[string]$task.Actions[0].Arguments
$configFile=[regex]::Match($argsText,'(?i)(?:^|\s)-Config\s+"([^"]+)"').Groups[1].Value
$originalHash=[regex]::Match($argsText,'(?i)(?:^|\s)-ConfigSha256\s+([a-f0-9]{64})').Groups[1].Value
function HashFile($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
if(-not $configFile -or (HashFile $configFile) -cne $originalHash){throw 'ORIGINAL_RUNTIME_PIN_CHANGED'}
$runtime=Get-Content -LiteralPath $configFile -Raw|ConvertFrom-Json
if((HashFile $runtime.productionPlan) -cne $runtime.productionPlanSha256){throw 'ORIGINAL_PLAN_PIN_CHANGED'}
$plan=Get-Content -LiteralPath $runtime.productionPlan -Raw|ConvertFrom-Json
if($plan.botId -cne 'hdworkopsbot-testing'){throw 'PRODUCTION_BOT_SCOPE_MISMATCH'}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if($runtime.ownerSid -cne $sid){throw 'DPAPI_OWNER_MISMATCH'}
$root=Join-Path $env:ProgramData ('HDWork2CourierV2Activation-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root|Out-Null
$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false)
foreach($id in @($sid,'S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($id)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))}
Set-Acl -LiteralPath $root -AclObject $acl
$utf8=New-Object Text.UTF8Encoding($false)
function SaveJson($name,$value){[IO.File]::WriteAllText((Join-Path $root $name),($value|ConvertTo-Json -Depth 12),$utf8)}
[IO.File]::WriteAllText((Join-Path $root 'original-task.disabled.xml'),(Export-ScheduledTask -TaskPath '\' -TaskName $task.TaskName),$utf8)
Copy-Item -LiteralPath $configFile -Destination (Join-Path $root 'original-runtime.json')
Copy-Item -LiteralPath $runtime.productionPlan -Destination (Join-Path $root 'original-production-plan.json')
$runtime|Add-Member -NotePropertyName runtimeMode -NotePropertyValue 'flags-off' -Force
SaveJson 'runtime-flags-off.candidate.json' $runtime
$runtimeFile=Join-Path $root 'runtime-flags-off.candidate.json'
$supervisor=Join-Path $repo 'ops/windows/courier-native-supervisor.ps1'
$runner=Join-Path $repo 'scripts/courier-task-runner.js'
$head=(& git -c ('safe.directory='+$repo.Replace('\','/')) -C $repo rev-parse HEAD).Trim()
$cfg=@{version=1;kind='HDWORK2_NATIVE_SUPERVISOR';taskName=$task.TaskName;ownerSid=$sid;targetCommit=$head;pipeName=('hdwork2-courier-'+[Guid]::NewGuid().ToString('N'));stateFile=(Join-Path $root 'native-state.json');fenceFile=(Join-Path $root 'startup.fence.json');childExecutable=$runtime.nodeExecutable;childCodeFile=$runner;childCodeSha256=(HashFile $runner);childArguments=@($runner,'--config',$runtimeFile,'--config-sha256',(HashFile $runtimeFile));childWorkingDirectory=$root;supervisorScript=$supervisor;supervisorSha256=(HashFile $supervisor);graceSeconds=60}
SaveJson 'supervisor.candidate.json' $cfg
SaveJson 'startup.fence.json' @{reason='PREPARATION_ONLY_NOT_APPROVED';createdAtUtc=[DateTimeOffset]::UtcNow.ToString('o');configSha256=(HashFile (Join-Path $root 'supervisor.candidate.json'))}
SaveJson 'bindings.review.json' @{kind='HDWORK2_CURRENT_ACTIVATION_PREPARATION';executable=$false;productionChanged=$false;botId=$plan.botId;database=@{host='127.0.0.1';port=3306;database='hdwork2';writer='hdwork_ops_write@localhost';courier='hdwork_courier@localhost';courierSecretRoot=$plan.secretRoot;courierDbDpapiFile=$plan.dbPasswordDpapiFile;writerSecretMechanism='Existing HDWork2-Web service/secrets.dpapi LocalMachine, memory/stdin only'};runtimeMode='flags-off';flagsOffStartsBackend=$false;flagsOffStartsPython=$false;deliveryRuntimeReady=$false;writerFence=@{available=$false;reason='LIVE_WEB_HAS_NO_BOT_SCOPED_QUIESCENCE_PROTOCOL'};health=@{runnerCode='FLAGS_OFF_NO_TRANSPORT';pythonPidMustBeNull=$true;telegramCalls=0;requiresFreshReadOnlyDatabaseAndJournalAudit=$true};rollback=@{originalTask='original-task.disabled.xml';originalRuntime='original-runtime.json';originalPlan='original-production-plan.json';restoreDatabase=$false;keepTaskDisabled=$true;keepStartupFence=$true;preserveManualDeadAndAudit=$true};requiresReviewedReleasePins=$true;schemaAction='VERIFY_EXISTING_015_016_017_ONLY';grantsAction='VERIFY_ONLY';administrativeAction='RECORD_AFTER_MANUAL_CHANGE_NO_STATE_TRANSITION';legacyExecutorAllowed=$false}
SaveJson 'pins.json' @{supervisorConfigSha256=(HashFile (Join-Path $root 'supervisor.candidate.json'));runtimeConfigSha256=(HashFile $runtimeFile);originalRuntimeSha256=$originalHash;originalPlanSha256=$runtime.productionPlanSha256;supervisorSourceSha256=$cfg.supervisorSha256;runnerSourceSha256=$cfg.childCodeSha256}
@{status='PREPARED_STARTUP_FENCED_NOT_INSTALLED';directory=$root;productionChanged=$false;deliveryRuntimeReady=$false}|ConvertTo-Json
