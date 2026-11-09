const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {officeEnvironment,officeIngress}=require('../src/config/office-web');
const {renderIngress}=require('../src/config/tunnel-plan');
test('testing hostname stays isolated from trial origin, Access and internal services',()=>{
 const env=officeEnvironment({dist:'.local/online-candidate-synthetic/dist',publicOrigin:'https://hdwork2.yoloo.space'}),text=officeIngress({hostname:'hdwork2.yoloo.space'});
 assert.equal(env.FRONTEND_ORIGINS,'https://hdwork2.yoloo.space');assert.equal(env.HDWORK2_SERVICE_AUTH_APPROVED,'false');assert.equal(env.OP_WRITE_ENABLED,'false');assert.equal(env.COURIER_ENABLED,'false');
 assert.ok(text.includes('hostname: hdwork2.yoloo.space'));assert.ok(!text.includes('hostname: hdwork.yoloo.space'));assert.ok(!text.includes('required: true'));assert.ok(!text.includes('3306'));assert.ok(!text.includes('3091'));
 assert.ok(renderIngress({securityMode:'application-session',access:{required:false},hostname:'hdwork2.yoloo.space',tunnelName:'hdwork2'}).includes('hostname: hdwork2.yoloo.space'));
});
test('registration is explicitly gated, disabled, token-free and cannot start or replace a service',()=>{
 const text=fs.readFileSync('scripts/register-hdwork2-service.ps1','utf8');
 assert.ok(text.includes('ApprovedServiceRegistration'));assert.ok(text.includes('WindowsBuiltInRole]::Administrator'));assert.ok(text.includes('-StartupType Disabled'));assert.ok(text.includes('Existing Cloudflared service preserved'));
 assert.ok(!/Start-Service|sc\.exe\s+start|service\s+install\s+/i.test(text));assert.ok(!/Read-Host|TUNNEL_TOKEN=/.test(text));assert.ok(text.includes('--token-file'));
});
test('disabled registration defers credential identity to activation and never includes a UUID or token value in SCM arguments',()=>{
 const text=fs.readFileSync('scripts/register-hdwork2-service.ps1','utf8');
 assert.ok(text.includes('verify-existing-hdwork2-before-activation'));
 const binary=text.split(/\r?\n/).find(line=>line.trim().startsWith('$binary='));
 assert.ok(binary.includes('--token-file'));assert.ok(!binary.includes('$plan.tunnelId'));assert.ok(!binary.includes('$tokenValue'));
 assert.ok(text.includes("status='REGISTERED_DISABLED'"));assert.ok(!text.includes('Start-Service'));
});
