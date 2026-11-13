const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {nativeClient,createWindowsHost}=require('../scripts/lib/windows-courier-adapter.cjs');
const {sha}=require('../scripts/lib/courier-cutover.cjs');
test('native transport defaults PLAN and scopes explicit execution to pinned config',()=>{
 if(process.platform!=='win32')return;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hdwork-native-client-')),file=path.join(dir,'config.json'),bytes=JSON.stringify({kind:'HDWORK2_NATIVE_SUPERVISOR',taskName:'HDWork2-CourierFixture-'+'a'.repeat(32)});fs.writeFileSync(file,bytes);
 const calls=[],client=nativeClient({source:dir,configFile:file,configSha256:sha(bytes),approvalFile:'owner-approval.json',planSha256:'b'.repeat(64)},{invoke:args=>{calls.push(args);return {status:'FIXTURE'};}});
 client.planStop();assert.equal(calls[0].includes('-Execute'),false);client.stopFence('fixture-barrier');assert.ok(calls[1].includes('-Execute'));assert.ok(calls[1].includes('owner-approval.json'));client.assertFence('fixture-barrier');assert.ok(calls[2].includes('AssertFence'));
 assert.throws(()=>nativeClient({source:dir,configFile:file,configSha256:'c'.repeat(64)}),{code:'NATIVE_CONFIG_PIN_MISMATCH'});
 const other=JSON.stringify({kind:'HDWORK2_NATIVE_SUPERVISOR',taskName:'OtherTelegramBot'});fs.writeFileSync(file,other);assert.throws(()=>nativeClient({source:dir,configFile:file,configSha256:sha(other)}),{code:'NATIVE_SCOPE_REJECTED'});
});
test('missing owner bindings fail closed without native control',async()=>{await assert.rejects(createWindowsHost({infrastructure:{}},{}),{code:'NATIVE_AND_DATABASE_BINDINGS_REQUIRED'});});
