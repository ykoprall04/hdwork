# Real Telegram metadata verification only; source/credentials/old services are preserved.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$TelegramBotId,
 [Parameter(Mandatory=$true)][string]$BotUsername,
 [Parameter(Mandatory=$true)][string]$Tial1ChatId,
 [Parameter(Mandatory=$true)][string]$Tial2ChatId,
 [Parameter(Mandatory=$true)][string]$SolverChatId,
 [Parameter(Mandatory=$true)][string]$Source,
 [string]$CourierPlan,[string]$Review,
 [switch]$ApprovedReadOnly,[switch]$ApprovedCourierReadOnly,[switch]$ConfirmedNewBot
)
$ErrorActionPreference='Stop'
if(-not $ApprovedReadOnly -or -not $ConfirmedNewBot){throw 'EXPLICIT_METADATA_CHECK_AND_NEW_BOT_CONFIRMATION_REQUIRED'}
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ADMINISTRATOR_REQUIRED_OPEN_ELEVATED_POWERSHELL'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$folder=Join-Path 'C:\ProgramData' ('HDWork2LiveChatVerification-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($folder)
$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @('S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
Set-Acl -LiteralPath $folder -AclObject $acl
$actualAcl=Get-Acl -LiteralPath $folder
if(-not $actualAcl.AreAccessRulesProtected){throw 'PRIVATE_VERIFICATION_ACL_REQUIRED'}
foreach($rule in $actualAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.AccessControlType -ne 'Allow' -or $rule.IdentityReference.Value -notin @('S-1-5-18','S-1-5-32-544')){throw 'PRIVATE_VERIFICATION_ACL_REJECTED'}}
$operator=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$candidate=@{telegramBotId=$TelegramBotId;botUsername=$BotUsername;source=$Source;operator=$operator;newBotConfirmed=$true;groups=@(@{profile='TIAL1';chatId=$Tial1ChatId;threadId=$null},@{profile='TIAL2';chatId=$Tial2ChatId;threadId=$null},@{profile='SOLVER1';chatId=$SolverChatId;threadId=$null})}
$candidateFile=Join-Path $folder 'candidate.json';$reportFile=Join-Path $folder 'telegram-verification.report.json'
[IO.File]::WriteAllText($candidateFile,($candidate|ConvertTo-Json -Depth 8))
$arguments=@((Join-Path $root 'scripts/verify-live-chat-production-routing.js'),'--approved-telegram-read-only','--candidate',$candidateFile,'--output',$reportFile)
if($CourierPlan){$arguments+=@('--courier-plan',(Resolve-Path -LiteralPath $CourierPlan).Path)}
if($ApprovedCourierReadOnly){$arguments+=@('--courier-db-read-only','yes')}
$prior=$env:HDWORK2_PRIVATE_PREPARATION_PARENT
try{$env:HDWORK2_PRIVATE_PREPARATION_PARENT=$folder;& (Get-Command node.exe).Source @arguments;if($LASTEXITCODE -ne 0){throw 'REAL_TELEGRAM_METADATA_CHECK_BLOCKED'}}finally{$env:HDWORK2_PRIVATE_PREPARATION_PARENT=$prior}
$report=Get-Content -LiteralPath $reportFile -Raw|ConvertFrom-Json
if($report.status -eq 'ROUTING_VERIFIED_NO_MESSAGES' -and -not $report.webhookConfigured){
 $targets=@($report.groups|ForEach-Object{@{botId=$report.internalBotId;botUsername=$report.botUsername;category=$(if($_.profile -eq 'SOLVER1'){'LOGIC'}else{'TIAL'});profile=$_.profile;chatId=$_.chatId;threadId=$null;verified=$true;verifiedBy=$operator;verifiedAt=$report.checkedAt;evidence=('Telegram API read-only metadata; '+$Source)}})
 $verified=@{version=1;environment='production';newBotIsolationConfirmed=$true;targets=$targets}
 $routingFile=Join-Path $folder 'verified-routing.review.json';[IO.File]::WriteAllText($routingFile,($verified|ConvertTo-Json -Depth 8))
 [pscustomobject]@{status='ROUTING_METADATA_VERIFIED_ACTIVATION_PENDING';routingReview=$routingFile;telegramReport=$reportFile;messagesSent=0;productionConfigurationChanged=$false}|ConvertTo-Json
 if($Review){& (Join-Path $PSScriptRoot 'prepare-live-chat-production.ps1') -Review $Review -Routing $routingFile}
}
