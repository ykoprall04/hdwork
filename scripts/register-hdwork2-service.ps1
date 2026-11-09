# REVIEWED PREPARATION ONLY. Run only after explicit administrator approval.
# Registers a DISABLED service. Does not provision tokens, start it or change DNS.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$PlanFile,[switch]$ApprovedServiceRegistration,[string]$ResultFile)
$ErrorActionPreference='Stop'
try {
    if(-not $ApprovedServiceRegistration){throw 'Explicit service-registration approval required'}
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    $principal=New-Object Security.Principal.WindowsPrincipal($identity)
    if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Administrator rights required; no elevation performed'}
    $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $resolved=[IO.Path]::GetFullPath($PlanFile)
    if(-not $resolved.StartsWith((Join-Path $root '.local')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Private plan path rejected'}
    $plan=Get-Content -LiteralPath $resolved -Raw | ConvertFrom-Json
    if($plan.installationApproved -ne $true -or $plan.tunnelName -ne 'hdwork2' -or $plan.hostname -ne 'hdwork2.yoloo.space' -or $plan.windowsServiceName -ne 'Cloudflared' -or $plan.startupType -ne 'Disabled' -or $plan.startApproved -ne $false -or $plan.dnsApproved -ne $false -or $plan.publicRouteApproved -ne $false){throw 'Service plan not approved for disabled registration'}
    # Registration does not connect. Token-derived identity verification is deferred
    # to activation, so neither a token nor UUID is placed in SCM arguments.
    if($plan.credentialBinding -ne 'verify-existing-hdwork2-before-activation'){throw 'Explicit deferred credential binding required'}
    if(Get-Service -Name 'Cloudflared' -ErrorAction SilentlyContinue){throw 'Existing Cloudflared service preserved'}
    if([Diagnostics.EventLog]::SourceExists('Cloudflared')){throw 'Existing event source preserved; review required'}
    $exe='C:\Program Files (x86)\cloudflared\cloudflared.exe'
    if(-not(Test-Path -LiteralPath $exe)){throw 'cloudflared executable missing'}
    $target='C:\ProgramData\HDWork2\cloudflared'
    if(Test-Path -LiteralPath $target){throw 'Existing service directory preserved'}
    [IO.Directory]::CreateDirectory($target) | Out-Null
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true,$false)
    foreach($sidText in @('S-1-5-18','S-1-5-32-544')){
        $sid=New-Object Security.Principal.SecurityIdentifier($sidText)
        $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $target -AclObject $acl
    Copy-Item -LiteralPath (Join-Path $root '.local\tls\ca.crt') -Destination (Join-Path $target 'origin-ca.crt')
    $runtimeConfig=Join-Path $target 'remote-run.yml'
    [IO.File]::WriteAllText($runtimeConfig,"# Remote-managed; credentials NOT provisioned.`nloglevel: error`nmetrics: 127.0.0.1:0`n")
    # Path only, never a token value. Token provisioning/storage needs separate review.
    $tokenFile=Join-Path $target 'token'
    $binary='"'+$exe+'" tunnel --config "'+$runtimeConfig+'" --no-autoupdate run --token-file "'+$tokenFile+'"'
    New-EventLog -LogName Application -Source 'Cloudflared'
    New-Service -Name 'Cloudflared' -DisplayName 'HD Work 2.0 Cloudflare hdwork2' -BinaryPathName $binary -StartupType Disabled -Description 'Existing hdwork2 tunnel; disabled pending credential and public-route approval.' | Out-Null
    if($ResultFile){[IO.File]::WriteAllText($ResultFile,(@{status='REGISTERED_DISABLED';serviceName='Cloudflared';credentialsProvisioned=$false;serviceStarted=$false;dnsChanged=$false}|ConvertTo-Json))}
    Write-Output 'CLOUDFLARED_REGISTERED_DISABLED: no token provisioned, no service start, no DNS or route change.'
} catch {
    if($ResultFile){[IO.File]::WriteAllText($ResultFile,(@{status='BLOCKED';reason=$_.Exception.Message}|ConvertTo-Json))}
    Write-Output ('SERVICE_REGISTRATION_BLOCKED: '+$_.Exception.Message);exit 1
}
