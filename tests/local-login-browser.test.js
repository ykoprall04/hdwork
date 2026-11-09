const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {browserArguments}=require('../scripts/open-local-login');
test('local browser exception is restricted to one SPKI and a separate private profile',()=>{
 const args=browserArguments(path.resolve('.local/localhost-browser-synthetic'),'a'.repeat(43)+'=');
 assert.equal(args.at(-1),'https://localhost:8443/login');assert.equal(args.filter(x=>x.startsWith('--ignore-certificate-errors')).length,1);
 assert.ok(args.some(x=>x.startsWith('--ignore-certificate-errors-spki-list=')));assert.ok(args.some(x=>x.startsWith('--user-data-dir=')));
 assert.ok(!args.includes('--ignore-certificate-errors'));assert.ok(!args.some(x=>x.startsWith('--remote-debugging')));
});
test('ordinary profiles, paths outside project and malformed pins are rejected',()=>{
 const pin='a'.repeat(43)+'=';
 for(const profile of [path.resolve('.local'),path.resolve('.local/courier-secrets'),path.resolve('../localhost-browser-other')])assert.throws(()=>browserArguments(profile,pin));
 assert.throws(()=>browserArguments(path.resolve('.local/localhost-browser-test'),'not-a-pin'));
});
