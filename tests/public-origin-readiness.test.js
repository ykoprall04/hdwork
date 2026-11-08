const test=require('node:test'),assert=require('node:assert/strict');
const {webOrigin}=require('../src/config/web-origin');
test('local origin remains default and public HTTPS requires explicit approval plus matching CORS',()=>{
 assert.equal(webOrigin({FRONTEND_ORIGINS:'https://localhost:8443'},8443).origin,'https://localhost:8443');
 const env={HDWORK2_PUBLIC_ORIGIN:'https://hdwork.example.com',HDWORK2_PUBLIC_ORIGIN_APPROVED:'true',FRONTEND_ORIGINS:'https://hdwork.example.com'};
 assert.deepEqual(webOrigin(env,8443).allowedHosts,['hdwork.example.com','localhost:8443','127.0.0.1:8443']);
 for(const patch of [{HDWORK2_PUBLIC_ORIGIN_APPROVED:'false'},{FRONTEND_ORIGINS:'*'},...['http://hdwork.example.com','https://127.0.0.1','https://third.trycloudflare.com','https://hdwork.example.com/path','https://user:password@hdwork.example.com','https://hdwork.example.com:8443','https://hdwork.example.invalid'].map(HDWORK2_PUBLIC_ORIGIN=>({HDWORK2_PUBLIC_ORIGIN,FRONTEND_ORIGINS:HDWORK2_PUBLIC_ORIGIN}))])assert.throws(()=>webOrigin({...env,...patch},8443));
});
test('local web rejects unapproved Host before proxying to API or serving static content',async()=>{
 const fs=require('node:fs'),https=require('node:https'),path=require('node:path');
 const server=require('../src/local-web').createLocalWeb({cert:fs.readFileSync('.local/tls/localhost.crt'),key:fs.readFileSync('.local/tls/localhost.key'),dist:path.resolve('frontend/dist'),allowedHosts:['localhost'],apiPort:1});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const status=await new Promise((resolve,reject)=>{const req=https.get({hostname:'127.0.0.1',port:server.address().port,servername:'localhost',ca:fs.readFileSync('.local/tls/ca.crt'),headers:{Host:'foreign.example.com'},path:'/api/auth/me',agent:false},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.once('error',reject);});
  assert.equal(status,421);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
