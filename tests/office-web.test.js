const test=require('node:test'),assert=require('node:assert/strict');
const {officeEnvironment,officeIngress}=require('../src/config/office-web');
const {applicationSessionBoundary}=require('../src/middlewares/application-session-boundary');
const {validatePersistentAuth}=require('../src/config/persistent-auth');
const {blockers,checks}=require('../src/config/tunnel-plan');
function boundary(method,path,headers={}){let passed=false,status;applicationSessionBoundary({method,path,headers,socket:{remoteAddress:'127.0.0.1'}},{set(){},status(n){status=n;return this;},json(){}},()=>passed=true);return {passed,status};}
test('local service requires explicit loopback approval and leaves courier/writes disabled',()=>{
 const env={...officeEnvironment({local:true}),HDWORK2_SERVICE_AUTH_APPROVED:'true'};assert.equal(validatePersistentAuth(env),true);assert.equal(env.COURIER_ENABLED,'false');assert.equal(env.OP_WRITE_ENABLED,'false');
 assert.throws(()=>validatePersistentAuth({...env,HDWORK2_LOCAL_SERVICE_AUTH_APPROVED:'false'}));assert.throws(()=>validatePersistentAuth({...env,HDWORK2_PUBLIC_ORIGIN:'https://127.0.0.1:8443',FRONTEND_ORIGINS:'https://127.0.0.1:8443'}));
});
test('app-only HTTPS handler blocks internal paths before proxying and sets frame protections without listeners',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),m={exports:{}};let handler;
 const mock=name=>name==='node:https'?{createServer(_opts,fn){handler=fn;return {};}}:name==='node:http'?{request(){throw Error('Internal path was proxied');}}:require(name);
 vm.runInNewContext(fs.readFileSync('src/local-web.js','utf8'),{module:m,require:mock,URL});
 m.exports.createLocalWeb({dist:path.resolve('frontend/dist'),applicationSessionOnly:true});let status;const headers={};
 handler({url:'/internal/courier/v1/events',headers:{},method:'GET'},{setHeader(k,v){headers[k]=v;},writeHead(n){status=n;},end(){}});
 assert.equal(status,404);assert.equal(headers['X-Frame-Options'],'DENY');assert.ok(headers['Content-Security-Policy'].includes("frame-ancestors 'none'"));
});
test('without Access, backend boundary denies internal, legacy, malformed and extra auth routes',()=>{
 for(const path of ['/internal/courier/v1/events','/api/internal/courier/v1/events','/api/b2c/orders','/api/auth/reset','/api/auth/login/','/api/Auth/login','/api/auth/%6cogin'])assert.equal(boundary('POST',path,{'cf-access-authenticated-user-email':'forged'}).status,404);
 assert.equal(boundary('POST','/api/admin/users').passed,true);assert.equal(boundary('POST','/api/auth/change-password').passed,true);assert.equal(boundary('GET','/api/auth/change-password').status,405);assert.equal(boundary('GET','/api/auth/login').status,405);assert.equal(boundary('POST','/api/auth/me').status,405);assert.equal(boundary('POST','/api/auth/login').passed,true);assert.equal(boundary('GET','/api/operations/orders').passed,true);
});
test('forged edge identity cannot replace the application session on operations',async()=>{
 const h=require('../src/access/http');let passed=false,status;
 await h.auth({headers:{'cf-access-authenticated-user-email':'forged','cf-connecting-ip':'198.51.100.1'}},{set(){},status(n){status=n;return this;},json(){}},()=>passed=true);
 assert.equal(status,401);assert.equal(passed,false);
});
test('login limiter ignores spoofed proxy headers and retains bounded global protection',()=>{
 const {createRateLimit}=require('../src/middlewares/api-rate-limit'),limiter=createRateLimit({limit:10,windowMs:900000,now:()=>1});let passed=0,status;
 for(let i=0;i<11;i++)limiter({socket:{remoteAddress:'127.0.0.1'},headers:{'cf-connecting-ip':'198.51.100.'+i,'x-forwarded-for':'198.51.100.'+i}},{set(){},status(n){status=n;return this;},json(){}},()=>passed++);
 assert.equal(passed,10);assert.equal(status,429);
});
test('hdwork2 ingress removes Access but retains TLS validation, API allowlist and default denial',()=>{
 const text=officeIngress();assert.ok(text.includes('tunnel: hdwork2'));assert.ok(!text.includes('required: true'));assert.ok(!text.includes('teamName:'));assert.equal((text.match(/noTLSVerify: false/g)||[]).length,3);assert.ok(text.includes('health|ready|internal'));assert.ok(text.includes('^/api(/|$)'));assert.ok(text.trimEnd().endsWith('service: http_status:404'));
});
test('removing Access alone never passes the public gate; application-session mode requires its own verified checks',()=>{
 const p={hostname:'hdwork.yoloo.space',tunnelName:'hdwork2',tunnelId:'12345678-1234-4123-8123-123456789abc',origin:'https://127.0.0.1:8443',originServerName:'localhost',noTLSVerify:false,access:{required:false},checks:Object.fromEntries(checks.map(key=>[key,true])),publicStartApproved:true,approvalUntil:new Date(Date.now()+60000).toISOString(),tokenDpapiFile:'.local/cloudflare/hdwork2-token.dpapi'};
 assert.ok(blockers(p).includes('CLOUDFLARE_ACCESS_REQUIRED'));
 p.securityMode='application-session';assert.ok(blockers(p).includes('APPLICATION_AUTH_REVIEW_REQUIRED'));
 p.applicationAuth={sessionV2:true,operationalReadOnly:true,endpointAllowlistVerified:true,loginRateLimitVerified:true,proxyBoundaryVerified:true,liveSessionVerified:true};assert.deepEqual(blockers(p),[]);
 p.applicationAuth.liveSessionVerified=false;assert.ok(blockers(p).includes('APPLICATION_AUTH_REVIEW_REQUIRED'));
});
test('generic tunnel renderer preserves named application-only ingress and explicit hostname scope',()=>{
 const {renderIngress}=require('../src/config/tunnel-plan');const text=renderIngress({securityMode:'application-session',access:{required:false},hostname:'hdwork.yoloo.space',tunnelName:'hdwork2'});
 assert.ok(text.includes('tunnel: hdwork2'));assert.ok(!text.includes('required: true'));assert.ok(text.includes('^/api(/|$)'));
 assert.throws(()=>renderIngress({securityMode:'application-session',access:{required:false},hostname:'unapproved.example.org',tunnelName:'hdwork2'}));
});

test('proposed office ingress routes real account APIs before API deny without changing read-only candidate',()=>{const {officeIngress}=require('../src/config/office-web');const proposed=officeIngress({hostname:'hdwork2.yoloo.space'});assert.ok(proposed.includes('login|logout|me|change-password|register|registration-token'));assert.ok(proposed.indexOf('operations|admin/users')<proposed.indexOf('^/api(/|$)'));const candidate=require('../src/config/online-candidate').ingress();assert.ok(!candidate.includes('admin/users'));});
