const test=require('node:test'),assert=require('node:assert/strict'),{PassThrough}=require('node:stream'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {bootstrap,validateBundle}=require('../scripts/office-web-service');
const bundle=()=>({authPassword:'synthetic-auth',readPassword:'synthetic-reader',signingSecret:'synthetic-signing-only-'.repeat(3)});
test('service bootstrap uses bounded stdin only, preserves UTF8 and rejects missing/extra secrets',async()=>{
 const stream=new PassThrough(),waiting=bootstrap(stream);const value={...bundle(),authPassword:'synthetic-漢字'},bytes=Buffer.from(JSON.stringify(value)+'\n');for(const byte of bytes)stream.write(Buffer.from([byte]));assert.deepEqual(await waiting,value);stream.destroy();
 for(const value of [{},{...bundle(),extra:'not-allowed'},{...bundle(),signingSecret:'short'}])assert.throws(()=>validateBundle(value));
 const oversize=new PassThrough(),rejected=bootstrap(oversize);oversize.write('x'.repeat(16385));await assert.rejects(rejected,/oversized/);oversize.destroy();
 const eof=new PassThrough(),ended=bootstrap(eof);eof.end();await assert.rejects(ended,/EOF/);
});
test('service captures secrets into mocked auth/read pools then clears bootstrap values and closes on lease EOF',async()=>{
 const env={...require('../src/config/office-web').officeEnvironment({dist:'.local/online-candidate-synthetic/dist',publicOrigin:'https://hdwork2.yoloo.space'}),HDWORK2_SERVICE_AUTH_APPROVED:'true'};
 const stdin=new PassThrough(),events=[],states=[],processEnv={},handlers={},module={exports:{}};
 const control={listening:false,once(){},listen(_name,fn){this.listening=true;fn();},close(){this.listening=false;}};
 const pool={async end(){events.push('auth-close');}};
 const pools={async initializeWithSecrets(read){assert.equal(await read(env.OP_READ_DB_PASSWORD_DPAPI_FILE),bundle().readPassword);events.push('read-pool');},async close(){events.push('read-close');}};
 const mocked=name=>{
  if(name==='node:fs')return {readFileSync(){return JSON.stringify(env);},writeFileSync(_file,value){states.push(JSON.parse(value).status);}};
  if(name==='node:path')return path;
  if(name==='node:net')return {createServer(){return control;}};
  if(name==='../src/config/persistent-auth')return require('../src/config/persistent-auth');
  if(name==='../src/config/api-only-startup')return {validateApiOnlyConfig(){assert.ok(processEnv.DB_PASSWORD&&processEnv.JWT_SECRET);}};
  if(name==='../src/config/database')return pool;
  if(name==='../src/access/http')return {service(){assert.equal(processEnv.JWT_SECRET,bundle().signingSecret);events.push('auth-service');}};
  if(name==='../src/config/operational-pools')return pools;
  if(name==='../local-web-server')return {async startLocalWeb(){events.push('web-start');return {async close(){events.push('web-close');}};}};
  throw Error('Unexpected dependency '+name);
 };
 mocked.main={};vm.runInNewContext(fs.readFileSync('scripts/office-web-service.js','utf8'),{module,require:mocked,Buffer,setTimeout,clearTimeout,process:{env:processEnv,stdin,pid:123,once:(name,fn)=>handlers[name]=fn},console:{error(){}}});
 const running=module.exports.run();stdin.write(JSON.stringify(bundle())+'\n');await running;
 assert.deepEqual(events.slice(0,3),['auth-service','read-pool','web-start']);assert.ok(!processEnv.DB_PASSWORD&&!processEnv.JWT_SECRET);assert.deepEqual(states,['READY']);stdin.end();await new Promise(r=>setImmediate(r));assert.ok(events.includes('web-close'));assert.ok(events.includes('read-close'));assert.equal(states.at(-1),'STOPPED');
});
test('startup installation never starts native tunnel and token broker has no plaintext file or network',()=>{
 const installer=fs.readFileSync('scripts/install-office-startup.ps1','utf8'),broker=fs.readFileSync('scripts/tunnel-token-broker.ps1','utf8');
 assert.ok(!/Start-Service|Start-ScheduledTask/.test(installer));assert.ok(installer.includes("StartMode='Disabled'"));assert.ok(installer.includes('HDWork2-Web'));assert.ok(installer.includes('HDWork2-TunnelTokenBroker'));
 assert.ok(broker.includes('DataProtectionScope]::LocalMachine'));assert.ok(broker.includes('S-1-5-18'));assert.ok(!/WriteAllText|WriteAllBytes|Invoke-WebRequest|Invoke-RestMethod/.test(broker));
});
