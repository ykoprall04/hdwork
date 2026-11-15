const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {check}=require('../scripts/lib/vlan-connection-check.cjs');
const uuid='00000000-0000-4000-8000-000000000001';
test('one-shot mock: server identity SELECT only, release and close on success or failure',async()=>{
 for(const server of [{hostname:'woc',port:3306},{hostname:'wrong',port:3306},{hostname:'woc',port:3307}]){
  let closed=0,released=0;
  const pending=check({env:{},uuid,createAdapter:opts=>{assert.equal(opts.env.VLAN_IMPORT_SERVER_UUID,uuid);return {async create(){return {pool:{async getConnection(){return {async query(sql){assert.equal(sql,'SELECT @@hostname AS hostname,@@port AS port');return [[server]];},release(){released++;}};}},async close(){closed++;}};}};}});
  if(server.hostname==='woc'&&server.port===3306)assert.equal((await pending).status,'PASS');else await assert.rejects(pending,/VLAN_CHECK_REJECTED/);
  assert.equal(closed,1);assert.equal(released,1);
 }
 let called=false;await assert.rejects(check({uuid:'invalid',createAdapter:()=>{called=true;}}));assert.equal(called,false);
});
test('one-shot entry mock bypasses ordinary Web run and never loads database/auth/listeners',async()=>{
 const seen=[],output=[],module={exports:{}};
 const env={HDWORK2_PUBLIC_ORIGIN:'https://hdwork2.yoloo.space',HDWORK2_EDGE_AUTH_MODE:'application-session'};
 const mocked=name=>{seen.push(name);if(name==='node:fs')return {readFileSync:()=>JSON.stringify(env)};if(name==='node:path')return require('node:path');if(name==='./lib/vlan-connection-check.cjs')return {async check(opts){assert.equal(opts.uuid,uuid);return {status:'PASS'};}};throw Error('Unexpected dependency '+name);};
 vm.runInNewContext(fs.readFileSync('scripts/protected-web-service.js','utf8'),{module,require:mocked,__dirname:require('path').resolve('scripts'),process:{stdin:{},argv:[]},console:{log:s=>output.push(s),error:()=>{}}});
 await module.exports.entry(['--check-vlan-adapter',uuid]);assert.deepEqual(output,['{"status":"PASS"}']);
 await assert.rejects(module.exports.entry(['--unknown']),/VLAN_CHECK_ARGUMENTS_REJECTED/);
 assert.deepEqual(seen,['node:fs','node:path','./lib/vlan-connection-check.cjs']);
});
test('existing wrapper one-shot mode has owner/pin gates and no task mutation',()=>{
 const source=fs.readFileSync('scripts/run-protected-web.ps1','utf8');assert.match(source,/VLAN_CHECK_OWNER_REJECTED/);assert.match(source,/VLAN_CHECK_SOURCE_DRIFT/);assert.match(source,/VLAN_CHECK_ACL_REJECTED/);assert.match(source,/WaitForExit\(30000\)/);assert.match(source,/if\(-not \$CheckVlanAdapter\)/);assert.doesNotMatch(source,/Set-ScheduledTask|Start-ScheduledTask|Stop-ScheduledTask|Register-ScheduledTask/);
});
test('normal Web startup implementation is byte-identical to the reviewed pre-check commit',()=>{
 const before=require('node:child_process').execFileSync('git',['show','a3d8483:scripts/protected-web-service.js'],{encoding:'utf8'}).replace(/\r\n/g,'\n');
 const after=fs.readFileSync('scripts/protected-web-service.js','utf8').replace(/\r\n/g,'\n');
 assert.equal(after.slice(0,after.indexOf('async function entry(')),before.slice(0,before.indexOf('if(require.main===module)')));
 assert.match(after,/if\(argv.length===0\)return run\(\)/);
});
test('PowerShell check rejects invalid arguments and non-LocalService before bootstrap',()=>{
 if(process.platform!=='win32')return;
 const {spawnSync}=require('node:child_process');
 const invoke=args=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File','scripts/run-protected-web.ps1','-CheckVlanAdapter',...args],{encoding:'utf8',windowsHide:true,timeout:10000});
 let r=invoke(['-ExpectedServerUuid','invalid','-ConfigSha256','invalid']);assert.notEqual(r.status,0);assert.match(r.stderr,/VLAN_CHECK_PIN_REQUIRED/);
 const sid=spawnSync('powershell.exe',['-NoProfile','-Command','[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8',windowsHide:true}).stdout.trim();
 if(sid!=='S-1-5-19'){
  r=invoke(['-ExpectedServerUuid',uuid,'-ConfigSha256','a'.repeat(64),'-ControlConfig','nonexistent-config-never-opened.json']);assert.notEqual(r.status,0);assert.match(r.stderr,/VLAN_CHECK_OWNER_REJECTED/);
 }
});
