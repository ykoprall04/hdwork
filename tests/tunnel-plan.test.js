const test=require('node:test'),assert=require('node:assert/strict');
const {blockers,renderIngress,checks}=require('../src/config/tunnel-plan');
function approved(){return {hostname:'hdwork.owned-example.test',tunnelId:'12345678-1234-4123-8123-123456789abc',origin:'https://127.0.0.1:8443',originServerName:'localhost',noTLSVerify:false,access:{required:true,teamName:'synthetic-team',audTag:['a'.repeat(64)]},checks:Object.fromEntries(checks.map(k=>[k,true])),publicStartApproved:true,approvalUntil:new Date(Date.now()+60000).toISOString(),tokenDpapiFile:'.local/cloudflare/token.dpapi'};}
test('tunnel plan fails closed for unconfirmed ownership, Access, data or public approval',()=>{
 assert.deepEqual(blockers(approved()),[]);
 for(const change of [{hostname:'third.trycloudflare.com'},{hostname:null},{noTLSVerify:true},{origin:'tcp://127.0.0.1:3306'},{access:{required:false}},{checks:{}},{publicStartApproved:false},{tokenDpapiFile:'token.txt'}])assert.ok(blockers({...approved(),...change}).length>0);
});
test('ingress always targets verified local TLS, blocks sensitive paths and ends in catch-all404',()=>{
 const text=renderIngress({});assert.ok(text.includes('https://127.0.0.1:8443'));assert.ok(text.includes('noTLSVerify: false'));assert.ok(text.includes('required: true'));assert.ok(text.includes('ready|internal|legacy|preview|uploads'));assert.ok(text.trimEnd().endsWith('service: http_status:404'));assert.ok(!text.includes('tcp://'));assert.ok(!text.includes('3306'));
});
