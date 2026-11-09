# Approved setup only: web and pipe-broker tasks; native tunnel remains DISABLED.
[CmdletBinding()]
param([switch]$ApprovedStartupSetup,[ValidateSet('All','Broker','Web')][string]$Target='All')
$ErrorActionPreference='Stop';$stage='APPROVAL'
try{
 if(-not $ApprovedStartupSetup){throw 'Approval required'}
 $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent());if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Admin required'}
 $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$web='C:\ProgramData\HDWork2\web';$tunnel='C:\ProgramData\HDWork2\cloudflared'
 $stage='CREDENTIAL_FILES'
 if($Target -ne 'Web' -and ((Get-Service Cloudflared).Status -ne 'Stopped' -or (Get-Service Cloudflared).StartType -ne 'Disabled')){throw 'Tunnel must remain disabled'}
 if(($Target -ne 'Broker' -and -not(Test-Path (Join-Path $web 'secrets.dpapi'))) -or ($Target -ne 'Web' -and -not(Test-Path (Join-Path $tunnel 'tunnel-token.dpapi')))){throw 'Encrypted credentials not ready'}
 # SYSTEM must not execute project code writable by broad unprivileged groups.
 if($Target -ne 'Broker'){foreach($codePath in @($root,(Join-Path $root 'scripts'),(Join-Path $root 'src'),(Join-Path $root 'node_modules'))){
  $codeAcl=Get-Acl -LiteralPath $codePath
  foreach($rule in $codeAcl.Access){
   $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
   if($sid -in @('S-1-1-0','S-1-5-11','S-1-5-32-545') -and $rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Write)){throw 'Unsafe code ACL for SYSTEM startup; no permissions changed'}
  }
 }}
 $taskPairs=@();$scriptPairs=@()
 if($Target -ne 'Broker'){$taskPairs+=,@('HDWork2-Web',(Join-Path $web 'run-office-web-service.ps1'));$scriptPairs+=,@('run-office-web-service.ps1',$web)}
 if($Target -ne 'Web'){$taskPairs+=,@('HDWork2-TunnelTokenBroker',(Join-Path $tunnel 'tunnel-token-broker.ps1'));$scriptPairs+=,@('tunnel-token-broker.ps1',$tunnel)}
 $stage='TASK_PRECHECK'
 foreach($pair in $taskPairs){if(Get-ScheduledTask -TaskName $pair[0] -ErrorAction SilentlyContinue){throw 'Existing task preserved'}}
 $stage='SCRIPT_COPY'
 foreach($pair in $scriptPairs){$dest=Join-Path $pair[1] $pair[0];$source=Join-Path $PSScriptRoot $pair[0];if(Test-Path $dest){if((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $dest).Hash){throw 'Existing service script preserved'}}else{Copy-Item -LiteralPath $source -Destination $dest}}
 if($Target -ne 'Broker'){
 $envFile=Join-Path $web 'environment.json';if(Test-Path $envFile){throw 'Existing web environment preserved'}
 $profile=Join-Path $root '.local\online-candidate-hdwork2-service-9f638a40c09cf902\backend.environment'
 $serviceEnvironment=@{};foreach($line in [IO.File]::ReadAllLines($profile)){if($line -match '^([A-Z0-9_]+)=(.*)$'){$serviceEnvironment[$matches[1]]=$matches[2]}}
 $serviceEnvironment.HDWORK2_SERVICE_AUTH_APPROVED='true';[IO.File]::WriteAllText($envFile,($serviceEnvironment|ConvertTo-Json))
 }
 if($Target -ne 'Web'){
 $stage='SERVICE_CONFIG'
 $exe='C:\Program Files (x86)\cloudflared\cloudflared.exe';$config=Join-Path $tunnel 'remote-run.yml'
 $binary='"'+$exe+'" tunnel --config "'+$config+'" --no-autoupdate run --token-file "\\.\pipe\HDWork2TunnelToken"'
 $existingService=Get-CimInstance Win32_Service -Filter "Name='Cloudflared'"
 $changed=Invoke-CimMethod -InputObject $existingService -MethodName Change -Arguments @{PathName=$binary;StartMode='Disabled'}
 if($changed.ReturnValue -ne 0){throw ('Service configuration failed with code '+$changed.ReturnValue)}
 }
 $stage='TASK_SETTINGS'
 $principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
 $trigger=New-ScheduledTaskTrigger -AtStartup
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
 foreach($pair in $taskPairs){
  $stage='TASK_REGISTER'
  $action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$pair[1]+'"')
  Register-ScheduledTask -TaskName $pair[0] -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'HD Work2 owned startup; no legacy service changes' | Out-Null
 }
 $stage='REPORT'
 [IO.File]::WriteAllText((Join-Path $root ('.local\office-startup-'+$Target+'.ready.json')),(@{registered=$true;target=$Target;tasksStarted=$false;secretsInPlaintextFiles=$false}|ConvertTo-Json))
 Write-Output 'OFFICE_STARTUP_REGISTERED_NOT_STARTED'
}catch{
 $safeMessage=if($_.Exception.Message -match '^[A-Za-z0-9 _.,:()/-]{1,180}$'){$_.Exception.Message}else{'Error detail suppressed'}
 if($root){[IO.File]::WriteAllText((Join-Path $root ('.local\office-startup-'+$Target+'.blocked.json')),(@{stage=$stage;reason=$safeMessage;secretValuesLogged=$false}|ConvertTo-Json))}
 Write-Output ('OFFICE_STARTUP_SETUP_BLOCKED_'+$stage);exit 1
}
