const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('token collection has only SecureString input, no plaintext confirmation field',()=>{
 const source=fs.readFileSync('scripts/setup-office-service-secrets.ps1','utf8');
 const inputs=source.split(/\r?\n/).filter(line=>line.includes('Read-Host'));
 assert.equal(inputs.length,1);assert.ok(inputs[0].includes('-AsSecureString'));assert.ok(source.includes('tokenExposureResolvedByOperator'));assert.ok(source.includes('DataProtectionScope]::LocalMachine'));
});
test('connector start uses existing service, requires no-public/private-route review and fails closed',()=>{
 const source=fs.readFileSync('scripts/start-existing-hdwork2-connector.ps1','utf8');
 for(const key of ['ApprovedConnectorStart','noPublishedApplicationRoutes','noPrivateOrVpnRoutes','reviewExpiresAt','tokenExposureResolvedByOperator','cloudflared_tunnel_ha_connections'])assert.ok(source.includes(key));
 assert.ok(!/New-Service|service install|tunnel create/.test(source));assert.ok(source.indexOf('noPublishedApplicationRoutes')<source.indexOf('Start-Service'));assert.ok(source.includes("Stop-Service -Name Cloudflared"));assert.ok(source.includes('-StartupType Disabled'));
});
