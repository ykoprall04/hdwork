// Shared assertions for offline rehearsal and explicitly opted-in disposable E2E.
// Importing this module never loads a driver, credentials, .env or a service.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const schemaFiles=['007_hdwork2_auth.sql','008_hdwork2_operations.sql','009_hdwork2_courier_runtime.sql','010_hdwork2_account_approval.sql'];
function schemaStatements(files=schemaFiles){
 return files.flatMap(file=>{
  assert.ok(schemaFiles.includes(file));
  const parts=fs.readFileSync(path.join(root,'database/manual',file),'utf8').replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);
  assert.equal(parts.shift(),'USE hdwork2');
  for(const sql of parts){assert.match(sql,/^(CREATE TABLE (users|hd2_[a-z_]+)|ALTER TABLE (users|hd2_orders|hd2_audit|hd2_courier_inbox)|INSERT INTO hd2_auth_guard)/);assert.doesNotMatch(sql,/\b(USE|DROP|TRUNCATE|GRANT|DATABASE|PROCEDURE|TRIGGER)\b|hdwork2\.|hd_b2c\./i);}
  return parts;
 });
}
async function approvedAccount(auth,approver,input){
 const id=await auth.manage(approver,null,input);
 assert.equal(await auth.login(input.username,input.password),null,'PENDING account must not log in');
 await assert.rejects(auth.manage(approver,id,{name:input.name,role:input.role,modules:input.modules,is_active:true}),{statusCode:403});
 await assert.rejects(auth.manage(id,id,{},'APPROVE'),{statusCode:403});
 await auth.manage(approver,id,{},'APPROVE');
 const login=await auth.login(input.username,input.password);assert.ok(login?.token);
 return {id,...login};
}
function durationStats(data){
 for(const key of ['durationSeconds','durationCount','averageDurationSeconds'])assert.ok(Number.isFinite(data[key])&&data[key]>=0,key);
 assert.ok(Number.isInteger(data.durationCount));
 assert.ok(data.durationCount<=data.done+data.failed);
 assert.equal(data.averageDurationSeconds,data.durationCount?data.durationSeconds/data.durationCount:0);
}
async function pickRace(send){
 const bodies=[0,1].map(()=>({requestId:randomUUID(),version:0,action:'PICK'}));
 const responses=await Promise.all(bodies.map((body,i)=>send(i,body)));
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const winner=responses.findIndex(r=>r.status===200);
 assert.equal((await send(winner,bodies[winner])).status,200,'Replay succeeds despite version increment');
 return {winner,body:bodies[winner]};
}
async function auditLinks(pool,id){
 const [rows]=await pool.execute('SELECT action,detail FROM hd2_audit WHERE order_id=? AND user_id IS NOT NULL',[id]);
 assert.ok(rows.length);
 for(const row of rows){
  const d=typeof row.detail==='string'?JSON.parse(row.detail):row.detail;
  assert.match(d.requestId,/^[a-f0-9-]{36}$/i);
  const [[request]]=await pool.execute('SELECT result FROM hd2_web_requests WHERE order_id=? AND request_id=?',[id,d.requestId]);assert.ok(request?.result);
  if(d.outboxId){const [[out]]=await pool.execute('SELECT id,idem_key FROM hd2_courier_outbox WHERE id=?',[d.outboxId]);assert.equal(out?.id,d.outboxId);assert.ok(out.idem_key.endsWith(':'+d.requestId));}
  else assert.equal(row.action,'REOPEN');
 }
 return rows;
}
// Test-only dependency injection; no production pool module/cache/env mutation.
function runtime(pool,env,{authStore}={}){
 function load(file,overrides={}){
  const filename=path.join(root,file),native=createRequire(filename),module={exports:{}};
  const requireForFile=n=>{
   if(Object.hasOwn(overrides,n))return overrides[n];
   if(/config\/(database|operational-pools)|mysql2|dotenv|private.*env/.test(n))throw Error('Runtime credential dependency forbidden in E2E');
   return native(n);
  };
  const factory=vm.runInThisContext('(function(module,require,process,Buffer){\n'+fs.readFileSync(filename,'utf8')+'\n})',{filename});
  factory(module,requireForFile,{env},Buffer);return module.exports;
 }
 const h=load('src/access/http.js',{'../config/database':pool,...(authStore?{'./store':{createStore:()=>authStore}}:{})});
 const operations=load('src/operations/routes.js',{'../access/http':h,'../config/operational-pools':{getReadPool:()=>pool,getWritePool:()=>pool}});
 const accounts=load('src/access/admin-routes.js',{'./http':h,'../config/database':pool});
 const auth=load('src/access/routes.js',{'./http':h});
 const disabled=(_req,res)=>res.status(503).json({success:false});
 const readiness={async checkRuntimeDatabases(){throw Error('Runtime readiness is not available in the injected E2E app');}};
 const api=load('src/api-only-app.js',{'./access/routes':auth,'./access/admin-routes':accounts,'./operations/routes':operations,'./b2c-read/routes':disabled,'./config/local-database-check':readiness});
 return {h,operations,createApp:()=>api.createApiOnlyApp(env),createReadOnlyApp:()=>api.createApiOnlyApp({...env,HDWORK2_LOCAL_READ_ONLY:'true'})};
}
// Child processes receive OS essentials plus explicit test values, never runtime secrets.
function childEnvironment(source=process.env,extra={}){
 const env={};for(const key of ['SystemRoot','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','COMSPEC','USERPROFILE','LOCALAPPDATA'])if(source[key])env[key]=source[key];
 return {...env,...extra};
}
module.exports={schemaFiles,schemaStatements,approvedAccount,durationStats,pickRace,auditLinks,runtime,childEnvironment};
