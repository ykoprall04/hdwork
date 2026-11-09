const test=require('node:test'),assert=require('node:assert/strict');
const {environment,ingress,validateEnvironment}=require('../src/config/online-candidate');
const {validateAuthWriteScope,authWritePolicy}=require('../src/config/auth-write-policy');
const {validatePersistentAuth}=require('../src/config/persistent-auth');
const {options}=require('../src/config/operational-pools');
const active=()=>({...environment(),HDWORK2_SERVICE_AUTH_APPROVED:'true'});
function reached(env,method,path,clock){let allowed=false,status;authWritePolicy(env,{now:()=>clock})({method,path},{status(n){status=n;return this;},json(){}},()=>allowed=true);return {allowed,status};}
test('candidate remains inactive, no plaintext credentials, read options only and no write pool',()=>{
 const env=environment();assert.equal(validateEnvironment(env).databaseConnected,false);assert.throws(()=>validatePersistentAuth(env));assert.equal(options('read',env).user,'hdwork_ops_read');assert.throws(()=>options('write',env));assert.throws(()=>validateEnvironment({...env,DB_PASSWORD:'synthetic'}));
});
test('continuous auth allows only exact login/logout mutations beyond the old test window',()=>{
 const env=active();assert.equal(validateAuthWriteScope(env,1),Infinity);
 for(const path of ['/api/auth/login','/api/auth/logout'])assert.equal(reached(env,'POST',path,Date.now()+86400000).allowed,true);
 for(const path of ['/api/auth/login/','/api/auth/refresh','/api/admin/users','/api/operations/orders','/internal/courier/v1/events'])assert.equal(reached(env,'POST',path,1).status,503);
 for(const method of ['PUT','PATCH','DELETE'])assert.equal(reached(env,method,'/api/auth/login',1).status,503);
 assert.equal(reached(env,'GET','/api/auth/me',1).allowed,true);assert.equal(reached(env,'GET','/api/operations/orders',1).allowed,true);assert.equal(reached(env,'GET','/api/admin/users',1).status,503);
});
test('continuous scope fails closed for writer, root, courier, split origin or missing approval',()=>{
 for(const patch of [{DB_USER:'root'},{DB_NAME:'wrong_database'},{HDWORK2_LOCAL_READ_ONLY:'false'},{OP_WRITE_ENABLED:'true'},{OP_READ_ENABLED:'false'},{HDWORK2_SERVICE_AUTH_APPROVED:'false'},{COURIER_ENABLED:'true'},{HDWORK2_AUTH_WRITE_ENABLED:'true'},{HDWORK2_AUTH_WRITE_UNTIL:'2099-01-01'},{HDWORK2_PUBLIC_API_ORIGIN:'https://api.hdwork.yoloo.space'},{FRONTEND_ORIGINS:'*'},{HDWORK2_SERVICE_AUTH_POLICY:'other'}])assert.throws(()=>validatePersistentAuth({...active(),...patch}));
});
test('revoking process approval blocks subsequent login without broadening operational access',()=>{
 const env=active();let allowed=false,status;const policy=authWritePolicy(env);env.HDWORK2_SERVICE_AUTH_APPROVED='false';policy({method:'POST',path:'/api/auth/login'},{status(n){status=n;return this;},json(){}},()=>allowed=true);assert.equal(allowed,false);assert.equal(status,503);
});
test('single-host ingress has explicit internal/API deny rules, Access on every origin rule and verified TLS',()=>{
 const text=ingress();assert.equal((text.match(/service: https:/g)||[]).length,3);assert.equal((text.match(/required: true/g)||[]).length,3);assert.equal((text.match(/noTLSVerify: false/g)||[]).length,3);
 assert.ok(text.indexOf('ready|internal')<text.indexOf('^/api/auth/'));assert.ok(text.includes('^/api(/|$)'));assert.ok(text.trimEnd().endsWith('service: http_status:404'));assert.ok(!text.includes('3306'));assert.ok(!text.includes('3091'));assert.ok(!text.includes('api.hdwork.yoloo.space'));
});
test('persistent cookie stays host-only Secure/HttpOnly/Lax with eight-hour lifetime and explicit clearing',()=>{
 const old=process.env.HDWORK2_SERVICE_AUTH_POLICY;process.env.HDWORK2_SERVICE_AUTH_POLICY='session-audit-only';
 try{const {setCookie}=require('../src/access/http');let cookie;const res={set(name,value){assert.equal(name,'Set-Cookie');cookie=value;}};setCookie(res,'synthetic');assert.ok(cookie.startsWith('__Host-hdwork2-session='));for(const text of ['Path=/','HttpOnly','Secure','SameSite=Lax','Max-Age=28800'])assert.ok(cookie.includes(text));assert.ok(!cookie.includes('Domain='));setCookie(res,'',true);assert.ok(cookie.includes('Max-Age=0'));}
 finally{if(old===undefined)delete process.env.HDWORK2_SERVICE_AUTH_POLICY;else process.env.HDWORK2_SERVICE_AUTH_POLICY=old;}
});
test('private web secrets use separate DPAPI references and memory only, with no storage or pools',async()=>{
 const {loadPrivateWebSecrets}=require('../src/config/private-web-env');const env=active(),calls=[];
 await loadPrivateWebSecrets(env,{read:async file=>{calls.push(file);return file===env.DB_PASSWORD_DPAPI_FILE?'synthetic-db-only':'synthetic-signing-only-'.repeat(3);}});
 assert.equal(calls.length,2);assert.equal(env.DB_PASSWORD,'synthetic-db-only');assert.ok(env.JWT_SECRET.length>=32);
 for(const patch of [{HDWORK2_SERVICE_AUTH_APPROVED:'false'},{JWT_SECRET_DPAPI_FILE:'outside.dpapi'},{JWT_SECRET_DPAPI_FILE:environment().DB_PASSWORD_DPAPI_FILE}]){let read=false;await assert.rejects(loadPrivateWebSecrets({...active(),...patch},{read:async()=>{read=true;return 'unused';}}));assert.equal(read,false);}
 const rejected=active();await assert.rejects(loadPrivateWebSecrets(rejected,{read:async()=>{throw Error('synthetic-failure');}}));assert.ok(!rejected.DB_PASSWORD&&!rejected.JWT_SECRET);
});
test('candidate static root is restricted to its dist folder, never the private credentials root',()=>{
 const path=require('node:path'),root=path.resolve('.'),{webBuild}=require('../src/config/web-build');
 assert.equal(webBuild(root,{}),path.join(root,'frontend/dist'));
 assert.equal(webBuild(root,{LOCAL_WEB_DIST:'.local/online-candidate-synthetic/dist'}),path.join(root,'.local/online-candidate-synthetic/dist'));
 for(const dist of ['.local','.local/courier-secrets','.local/online-candidate-synthetic','../outside/dist'])assert.throws(()=>webBuild(root,{LOCAL_WEB_DIST:dist}));
});
test('approved candidate runtime captures private secrets before cleanup without loading existing environment',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const env={...active(),HDWORK2_ONLINE_RUNTIME_APPROVED:'true'},events=[],handlers={};
 const pool={async end(){events.push('pool-end');}},app={async close(){events.push('web-close');}},m={exports:{}};
 const mocked=name=>{
  if(name==='node:path')return path;
  const dependencies={
   '../src/config/private-web-env':{async loadPrivateWebSecrets(){env.DB_PASSWORD='synthetic-memory-only';env.JWT_SECRET='synthetic-signing-only-'.repeat(3);events.push('private-secrets');}},
   '../src/config/api-only-startup':{validateApiOnlyConfig(){assert.ok(env.DB_PASSWORD&&env.JWT_SECRET);}},
   '../src/config/database':pool,
   '../src/access/http':{service(){assert.ok(env.JWT_SECRET);events.push('capture-service');}},
   '../src/config/private-pool-plan':{applyPrivatePoolPlan(){}},
   '../src/config/operational-pools':{async initialize(){events.push('read-pool');},getReadPool(){return {};},async close(){events.push('read-close');}},
   '../local-web-server':{async startLocalWeb(){assert.ok(env.DB_PASSWORD&&env.JWT_SECRET);events.push('web-start');return app;}},
  };
  if(!Object.hasOwn(dependencies,name))throw Error('Unexpected runtime dependency '+name);return dependencies[name];
 };
 mocked.main={};vm.runInNewContext(fs.readFileSync('scripts/private-runtime.js','utf8'),{module:m,require:mocked,__dirname:path.resolve('scripts'),process:{argv:['node','runtime','local'],env,once:(name,fn)=>handlers[name]=fn},console:{log(){},error(){}}});
 await m.exports.run();assert.deepEqual(events.slice(0,4),['private-secrets','capture-service','read-pool','web-start']);assert.ok(!env.DB_PASSWORD&&!env.JWT_SECRET);handlers.SIGINT();await new Promise(r=>setImmediate(r));assert.ok(events.includes('web-close'));assert.ok(events.includes('read-close'));
});
