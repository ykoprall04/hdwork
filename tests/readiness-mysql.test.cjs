const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{randomUUID}=require('crypto');
test('real readiness checks remain strict, single-flight and fail closed under slow SQL',async()=>{
 const parent=fs.readFileSync('.local/remediation-parent.txt','utf8').trim(),f=await require('./helpers/temporary-courier-mysql.cjs').start(parent),schema=require('./helpers/writer-schema.cjs');let auth,read;
 const old=process.env.HDWORK2_LOCAL_READ_ONLY;process.env.HDWORK2_LOCAL_READ_ONLY='false';let server;
 try{
  await schema.install(f.c);const password=randomUUID();await schema.account(f.c,'chatRead','hdwork_ops_read',password);
  await f.c.query("CREATE USER 'hdwork_auth'@'localhost' IDENTIFIED BY ?",[password]);
  for(const [table,privileges] of Object.entries({users:'SELECT,INSERT,UPDATE',hd2_sessions:'SELECT,INSERT,UPDATE',hd2_security_audit:'SELECT,INSERT',hd2_user_modules:'SELECT,INSERT,DELETE',hd2_auth_guard:'SELECT,UPDATE'}))await f.c.query('GRANT '+privileges+' ON hdwork2.'+table+" TO 'hdwork_auth'@'localhost'");
  const mysql=require('mysql2/promise');auth=mysql.createPool(schema.options(f,'hdwork_auth',password));read=mysql.createPool(schema.options(f,'hdwork_ops_read',password));let calls=0;
  const full=require('../src/config/readiness-probe').create({timeoutMs:2000,check:()=>{calls++;return require('../src/config/local-database-check').checkRuntimeDatabases({authPool:auth,readPool:read,operations:true});}});
  const values=await Promise.all(Array.from({length:20},()=>full.probe()));assert.ok(values.every(v=>v.ok));assert.equal(calls,1);
  await full.probe();assert.equal(calls,2,'No cached PASS may bypass the next grant check');
  const http=require('http'),app=require('../src/api-only-app').createApiOnlyApp({FRONTEND_ORIGINS:'https://fixture.invalid',HDWORK2_LOCAL_READ_ONLY:'true',HDWORK2_AUTH_V2:'true',HDWORK2_AUTH_ONLY:'true'},{readinessCheck:()=>require('../src/config/local-database-check').checkRuntimeDatabases({authPool:auth,readPool:read,operations:true})});
  server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const rounds=[];for(let i=0;i<3;i++){const started=Date.now();for(const route of ['/health','/ready']){const response=await fetch(base+route);assert.equal(response.status,200);assert.equal((await response.json()).ok,true);}rounds.push(Date.now()-started);}
  assert.ok(rounds.every(ms=>ms<5000),'Three real HTTP readiness rounds must pass under the proposed gate');
  await f.c.query("REVOKE SELECT ON hdwork2.users FROM 'hdwork_auth'@'localhost'");await assert.rejects(full.probe(),/Auth grants rejected/);
  let slowCalls=0;const slow=require('../src/config/readiness-probe').create({timeoutMs:25,check:()=>{slowCalls++;return f.c.query('SELECT SLEEP(0.3)');}});
  const failed=await Promise.allSettled(Array.from({length:10},()=>slow.probe()));assert.ok(failed.every(r=>r.status==='rejected'&&r.reason.code==='READINESS_TIMEOUT'));assert.equal(slowCalls,1);assert.equal(slow.snapshot().inFlight,true);
  await assert.rejects(slow.probe(),{code:'READINESS_TIMEOUT'});assert.equal(slowCalls,1,'A timeout must not create another queued SQL probe');
  for(let i=0;i<100&&slow.snapshot().inFlight;i++)await new Promise(r=>setTimeout(r,20));assert.equal(slow.snapshot().inFlight,false);
  fs.writeFileSync(path.join(parent,'readiness-result.json'),JSON.stringify({status:'STRICT_READINESS_MYSQL_PASS',httpRoundMs:rounds,singleFlightCalls:1,stalePassAllowed:false,slowSqlFailsClosed:true,productionAccessed:false}));
 }finally{if(server)await new Promise(r=>server.close(r));await auth?.end();await read?.end();if(old===undefined)delete process.env.HDWORK2_LOCAL_READ_ONLY;else process.env.HDWORK2_LOCAL_READ_ONLY=old;await f.stop();}
});
