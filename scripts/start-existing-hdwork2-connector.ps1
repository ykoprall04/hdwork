# Starts only the existing connector after private credentials + no-route review.
[CmdletBinding()]
param([switch]$ApprovedConnectorStart)
$ErrorActionPreference='Stop';$stage='APPROVAL';$touched=$false
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$reportFile=Join-Path $root '.local\connector-health.json'
try{
 if(-not $ApprovedConnectorStart){throw 'Approval required'}
 $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent());if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Administrator required'}
 $service=Get-Service -Name Cloudflared
 if($service.DisplayName -ne 'HD Work 2.0 Cloudflare hdwork2' -or $service.Status -ne 'Stopped'){throw 'Existing service identity/state rejected'}
 $ready=Get-Content -LiteralPath (Join-Path $root '.local\office-tunnel-token.ready.json') -Raw | ConvertFrom-Json
 $review=Get-Content -LiteralPath (Join-Path $root '.local\connector-route-review.approved.json') -Raw | ConvertFrom-Json
 if($ready.ready -ne $true -or $ready.existingTunnelOperatorConfirmed -ne $true -or $ready.tokenExposureResolvedByOperator -ne $true){throw 'Credential binding incomplete'}
 if($review.tunnelName -ne 'hdwork2' -or $review.noPublishedApplicationRoutes -ne $true -or $review.noPrivateOrVpnRoutes -ne $true -or $review.publicActivationApproved -ne $false -or [DateTime]::Parse($review.reviewExpiresAt).ToUniversalTime() -le [DateTime]::UtcNow){throw 'No-route review incomplete'}
 $stage='BROKER_START'
 $task=Get-ScheduledTask -TaskName 'HDWork2-TunnelTokenBroker'
 if($task.State -ne 'Running'){Start-ScheduledTask -TaskName 'HDWork2-TunnelTokenBroker';Start-Sleep -Seconds 2}
 if((Get-ScheduledTask -TaskName 'HDWork2-TunnelTokenBroker').State -ne 'Running'){throw 'Broker failed'}
 $stage='CONNECTOR_START';$touched=$true
 Set-Service -Name Cloudflared -StartupType Manual
 Start-Service -Name Cloudflared
 $stage='CONNECTOR_HEALTH';$connections=0;$deadline=[DateTime]::UtcNow.AddSeconds(40)
 do{
  $service.Refresh();if($service.Status -ne 'Running'){throw 'Connector stopped'}
  $serviceProcess=Get-CimInstance Win32_Service -Filter "Name='Cloudflared'"
  $ports=@(Get-NetTCPConnection -State Listen -OwningProcess $serviceProcess.ProcessId -ErrorAction SilentlyContinue | Where-Object {$_.LocalAddress -eq '127.0.0.1'} | Select-Object -ExpandProperty LocalPort)
  foreach($port in $ports){
   try{
    $metrics=(Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:'+$port+'/metrics') -TimeoutSec 2).Content
    $matchesFound=[regex]::Matches($metrics,'(?m)^cloudflared_tunnel_ha_connections(?:\{[^\r\n]*\})?\s+([0-9.]+)')
    foreach($m in $matchesFound){$connections+=[double]::Parse($m.Groups[1].Value,[Globalization.CultureInfo]::InvariantCulture)}
   }catch{}finally{$metrics=$null}
  }
  if($connections -gt 0){break};Start-Sleep -Seconds 2
 }while([DateTime]::UtcNow -lt $deadline)
 if($connections -le 0){throw 'Healthy metrics not proven'}
 [IO.File]::WriteAllText($reportFile,(@{status='HEALTHY_LOCAL_CONNECTOR_METRICS';serviceName='Cloudflared';serviceRunning=$true;activeEdgeConnections=$connections;dnsChanged=$false;publicRouteCreated=$false;privateRoutingApproved=$false;startupType='Manual';checkedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json))
 Write-Output 'HDWORK2_CONNECTOR_HEALTHY: no DNS or public route created.'
}catch{
 if($touched){Stop-Service -Name Cloudflared -ErrorAction SilentlyContinue;Set-Service -Name Cloudflared -StartupType Disabled -ErrorAction SilentlyContinue}
 [IO.File]::WriteAllText($reportFile,(@{status='BLOCKED';stage=$stage;serviceStartAttempted=$touched;dnsChanged=$false;publicRouteCreated=$false;secretValuesLogged=$false}|ConvertTo-Json))
 Write-Output ('HDWORK2_CONNECTOR_BLOCKED_'+$stage);exit 1
}
