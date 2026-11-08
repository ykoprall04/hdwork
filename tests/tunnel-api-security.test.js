const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createRateLimit}=require('../src/middlewares/api-rate-limit');
test('Cloudflare/XFF spoofing cannot partition rate limits while proxy trust is disabled',()=>{
 const limit=createRateLimit({limit:2,windowMs:60000,now:()=>1000});let next=0,status;
 const res={set(){},status(n){status=n;return this;},json(){}};
 for(let i=0;i<3;i++)limit({socket:{remoteAddress:'127.0.0.1'},headers:{'cf-connecting-ip':'192.0.2.'+(i+1),'x-forwarded-for':'198.51.100.'+(i+1)}},res,()=>next++);
 assert.equal(next,2);assert.equal(status,429);
});
test('tunnel-facing API requires authentication on sensitive GETs and refuses all writes without approval',async()=>{
 const {createApiOnlyApp}=require('../src/api-only-app');const app=createApiOnlyApp({HDWORK2_AUTH_V2:'true',HDWORK2_LOCAL_READ_ONLY:'true',HDWORK2_OPERATIONS_ENABLED:'true',FRONTEND_ORIGINS:'https://owned-example.test'});
 assert.equal(app.get('trust proxy'),false);const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/health')).status,200);
  for(const route of ['/api/auth/me','/api/admin/users','/api/operations/orders'])assert.equal((await fetch(base+route)).status,401);
  for(const route of ['/api/auth/login','/api/admin/users','/api/operations/orders'])assert.equal((await fetch(base+route,{method:'POST',body:'{}'})).status,503);
  assert.equal((await fetch(base+'/api/auth/me',{headers:{Origin:'https://foreign.test'}})).status,403);
  assert.equal(require.cache[require.resolve('../src/config/database')],undefined);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
