const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),http=require('node:http');
const {validateAuthWriteScope,authWritePolicy}=require('../src/config/auth-write-policy');
const now=1700000000000;
const env=()=>({HDWORK2_AUTH_WRITE_ENABLED:'true',HDWORK2_AUTH_ONLY:'true',HDWORK2_LOCAL_READ_ONLY:'true',HDWORK2_AUTH_V2:'true',DB_USER:'hdwork_auth',DB_NAME:'hdwork2',DB_HOST:'127.0.0.1',DB_PORT:'3306',HDWORK2_OPERATIONS_ENABLED:'false',B2C_WORKFLOW_READ_ENABLED:'false',B2C_STAGING_ENABLED:'false',COURIER_ENABLED:'false',COURIER_ALLOW_NETWORK:'false',HDWORK2_AUTH_WRITE_APPROVAL:'APPROVED_AUTH_SESSION_AUDIT_ONLY',HDWORK2_AUTH_WRITE_UNTIL:new Date(now+60000).toISOString()});
test('auth-write scope requires explicit bounded approval and preserves global read-only',()=>{
 assert.equal(validateAuthWriteScope(env(),now),now+60000);
 for(const patch of [{HDWORK2_AUTH_WRITE_APPROVAL:''},{HDWORK2_LOCAL_READ_ONLY:'false'},{HDWORK2_OPERATIONS_ENABLED:'true'},{DB_USER:'root'},{HDWORK2_AUTH_WRITE_UNTIL:new Date(now-1).toISOString()},{HDWORK2_AUTH_WRITE_UNTIL:new Date(now+900001).toISOString()},{COURIER_ENABLED:'true'}])assert.throws(()=>validateAuthWriteScope({...env(),...patch},now));
 assert.equal(validateAuthWriteScope({HDWORK2_LOCAL_READ_ONLY:'true'},now),null);
});
test('HTTP auth-write gate allows only login/logout; admin/orders and expired approval stay blocked',async()=>{
 let clock=now;const reached=[];const app=express();app.use(authWritePolicy(env(),{now:()=>clock}));app.use((req,res)=>{reached.push(req.method+' '+req.path);res.sendStatus(204);});const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  for(const path of ['/api/auth/login','/api/auth/logout'])assert.equal((await fetch(base+path,{method:'POST'})).status,204);
  for(const path of ['/api/admin/users','/api/operations/orders','/api/auth/login/reset','/api/auth/login/'])assert.equal((await fetch(base+path,{method:'POST'})).status,503);
  assert.equal((await fetch(base+'/api/admin/users')).status,503);assert.equal((await fetch(base+'/api/auth/me')).status,204);
  clock+=60001;assert.equal((await fetch(base+'/api/auth/login',{method:'POST'})).status,503);
  assert.deepEqual(reached,['POST /api/auth/login','POST /api/auth/logout','GET /api/auth/me']);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('read-only without approval blocks authentication before any storage handler',()=>{
 let next=false,status;authWritePolicy({HDWORK2_LOCAL_READ_ONLY:'true'})({method:'POST',path:'/api/auth/login'},{status(n){status=n;return this;},json(){}},()=>next=true);assert.equal(status,503);assert.equal(next,false);
});
