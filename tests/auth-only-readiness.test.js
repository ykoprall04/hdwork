const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {checkDatabase}=require('../src/config/local-database-check');
const {validateAuthWriteScope}=require('../src/config/auth-write-policy');
test('auth-only readiness accepts only four visible auth tables while full operational readiness stays closed',async()=>{
 const names={users:['id','password_hash','role','is_active','approval_status'],hd2_sessions:['token_hash','expires_at','revoked'],hd2_user_modules:['module'],hd2_security_audit:['action']};
 const queries=[];const pool={async query(sql){queries.push(sql);return sql.includes('DATABASE() AS')?[[{name:'hdwork2'}]]:[Object.entries(names).flatMap(([table,columns])=>columns.map(column=>({TABLE_NAME:table,COLUMN_NAME:column})))];}};
 const result=await checkDatabase(pool,{authOnly:true});assert.equal(result.ok,true);assert.equal(result.scope,'auth');await assert.rejects(checkDatabase(pool,{authOnly:false}));assert.ok(queries.every(sql=>sql.startsWith('SELECT')));
});
test('auth-only cannot bypass approval by disabling read-only or falling back to bearer',()=>{
 for(const patch of [{HDWORK2_LOCAL_READ_ONLY:'false'},{HDWORK2_AUTH_V2:'false'}])assert.throws(()=>validateAuthWriteScope({HDWORK2_AUTH_ONLY:'true',HDWORK2_LOCAL_READ_ONLY:'true',HDWORK2_AUTH_V2:'true',...patch}));
});
test('actual auth-only app exposes health and denies admin/operations without loading any DB pool',async()=>{
 const env={HDWORK2_AUTH_ONLY:'true',HDWORK2_LOCAL_READ_ONLY:'true',HDWORK2_AUTH_V2:'true',FRONTEND_ORIGINS:'https://mock.local'};
 const {createApiOnlyApp}=require('../src/api-only-app');const server=http.createServer(createApiOnlyApp(env));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(base+'/health')).status,200);
  assert.equal((await fetch(base+'/api/auth/me')).status,401);
  for(const url of ['/api/admin/users','/api/operations/orders'])assert.equal((await fetch(base+url)).status,503);
  assert.equal((await fetch(base+'/api/auth/login',{method:'POST',body:'{}'})).status,503);
  assert.equal((await fetch(base+'/api/auth/me',{headers:{Origin:'https://foreign.local'}})).status,403);
  assert.equal(require.cache[require.resolve('../src/config/database')],undefined);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
