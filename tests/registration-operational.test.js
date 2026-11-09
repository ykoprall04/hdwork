const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {memory}=require('./helpers/auth-memory.cjs');
const {fixture}=require('./helpers/operations-fixture.cjs');
const {runtime}=require('./helpers/e2e-contracts.cjs');
const {createService}=require('../src/access/service');
const secret='synthetic-registration-secret-only-000000',password='synthetic-password-123';
const application=(username='new.user')=>({name:'New User',username,password,confirmPassword:password});
const managed=(username,role='HD')=>({name:'Managed',username,password,role,modules:['TIAL'],is_active:true});
test('registration is atomic, lowercases usernames, hashes passwords, denies privilege fields and keeps existing sessions',async()=>{
 const store=memory(),service=createService(store,secret);await service.bootstrap({name:'Root',username:'root',password});
 const existing=await service.login('root',password);
 for(const input of [{...application(),role:'SUPER_ADMIN'},{...application(),modules:['TIAL']},{...application(),password:'short',confirmPassword:'short'},{...application(),confirmPassword:'different'}])await assert.rejects(service.register(input),{statusCode:400});
 const responses=await Promise.allSettled([service.register(application('Same.User')),service.register(application('same.user'))]);
 assert.equal(responses.filter(r=>r.status==='fulfilled').length,1);assert.equal(responses.find(r=>r.status==='rejected').reason.statusCode,409);
 const user=store.state.users.find(u=>u.username==='same.user');assert.equal(user.approval_status,'PENDING');assert.equal(user.is_active,false);assert.equal(user.role,'SHOW_ONLY');assert.deepEqual(user.modules,[]);
 assert.ok(await require('bcrypt').compare(password,user.password_hash));assert.ok(!('password' in user));assert.equal(await service.login('same.user',password),null);
 assert.equal((await service.me(existing.token)).role,'SUPER_ADMIN');assert.equal(store.state.audit.filter(a=>a.action==='USER_REGISTERED').length,1);
 const original=store.audit;store.audit=async()=>{throw Error('synthetic-audit-failure');};await assert.rejects(service.register(application('rollback.user')));store.audit=original;assert.equal(await store.username('rollback.user'),undefined);
});
test('only Super Admin decides public applications with role/modules; rejection persists and cannot be enabled',async()=>{
 const store=memory(),service=createService(store,secret);await service.bootstrap({name:'Root',username:'root',password});
 const admin=await service.manage(1,null,managed('admin','ADMIN'));await service.manage(1,admin,{},'APPROVE');
 const id=await service.register(application());
 await assert.rejects(service.manage(admin,id,{role:'HD',modules:['TIAL']},'APPROVE'),{statusCode:403});
 await assert.rejects(service.manage(1,id,{},'APPROVE'),{statusCode:400});
 await assert.rejects(service.manage(1,id,{role:'SUPER_ADMIN',modules:[]},'APPROVE'),{statusCode:400});
 await service.manage(1,id,{role:'HD',modules:['TIAL']},'APPROVE');const login=await service.login('new.user',password);assert.equal(login.user.role,'HD');assert.deepEqual(login.user.modules,['TIAL']);
 const denied=await service.register(application('denied'));await service.manage(1,denied,{},'REJECT');assert.equal((await store.user(denied)).approval_status,'REJECTED');
 assert.equal(await service.login('denied',password),null);await assert.rejects(service.manage(1,denied,{name:'Denied',role:'HD',modules:['TIAL'],is_active:true}),{statusCode:403});await assert.rejects(service.manage(1,denied,{role:'HD',modules:['TIAL']},'APPROVE'),{statusCode:409});
 assert.ok(store.state.audit.some(a=>a.action==='USER_REJECTED'&&a.target===denied));
});
test('real HTTP policy reaches account routes: registration CSRF/rate limit, Super Admin create/approve/reject and unique errors',async()=>{
 const store=memory(),{pool}=fixture();
 const env={...require('../src/config/office-web').officeEnvironment({dist:'.local/online-candidate-security/dist',publicOrigin:'https://hdwork2.yoloo.space'}),HDWORK2_SERVICE_AUTH_APPROVED:'true',HDWORK2_SERVICE_AUTH_POLICY:'operational-write',HDWORK2_LOCAL_READ_ONLY:'false',HDWORK2_AUTH_WRITE_ENABLED:'true',OP_WRITE_ENABLED:'true',HDWORK2_OPERATIONAL_WRITE_APPROVED:'true',OP_WRITE_DB_USER:'hdwork_ops_write',OP_WRITE_DB_NAME:'hdwork2',OP_WRITE_DB_HOST:'127.0.0.1',OP_WRITE_DB_PORT:'3306',JWT_SECRET:secret};
 const isolated=runtime(pool,env,{authStore:store}),service=isolated.h.service();await service.bootstrap({name:'Root',username:'root',password});
 const server=http.createServer(isolated.createApp());await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,origin=env.FRONTEND_ORIGINS;
 const send=(path,body,headers={})=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{origin,...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  const login=await send('/api/auth/login',{username:'root',password}),profile=await login.json();assert.equal(login.status,200);const session=login.headers.get('set-cookie').split(';')[0],auth={cookie:session,'x-csrf-token':profile.data.csrf};
  const created=await send('/api/admin/users',managed('direct'),auth);assert.equal(created.status,201);const id=(await created.json()).id;
  const duplicate=await send('/api/admin/users',managed('DIRECT'),auth);assert.equal(duplicate.status,409);assert.equal((await duplicate.json()).message,'Username sudah digunakan');
  assert.equal((await send(`/api/admin/users/${id}/approve`,{},auth)).status,200);
  const challenge=await send('/api/auth/registration-token');assert.equal(challenge.status,200);const token=(await challenge.json()).csrf,cookie=challenge.headers.get('set-cookie').split(';')[0];assert.ok(cookie.startsWith('__Host-hdwork2-registration='));assert.ok(!cookie.includes('__Host-hdwork2-session='));
  assert.equal((await send('/api/auth/register',application('http.user'))).status,403);
  assert.equal((await send('/api/auth/register',application('http.user'),{cookie,'x-csrf-token':token,origin:'https://evil.invalid'})).status,403);
  assert.equal((await send('/api/auth/register',application('http.user'),{cookie,'x-csrf-token':token})).status,201);
  assert.equal((await send('/api/auth/login',{username:'http.user',password})).status,401);
  const applicant=await store.username('http.user');assert.equal((await send(`/api/admin/users/${applicant.id}/approve`,{role:'HD',modules:['TIAL']},auth)).status,200);
  assert.equal((await send('/api/auth/login',{username:'http.user',password})).status,200);
  assert.equal((await send('/api/auth/me',undefined,{cookie:session})).status,200);
  // Cross-origin CORS rejection never reaches the limiter. Exhaust five accepted-origin requests.
  assert.equal((await send('/api/auth/register',application('http.user'),{cookie,'x-csrf-token':token})).status,409);
  assert.equal((await send('/api/auth/register',application('http.user'),{cookie,'x-csrf-token':token})).status,409);
  assert.equal((await send('/api/auth/register',application('limited'),{cookie,'x-csrf-token':token})).status,429);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 assert.equal(require.cache[require.resolve('../src/config/database')],undefined);assert.equal(require.cache[require.resolve('mysql2/promise')],undefined);
});
test('registration double-submit rejects tampering, duplicate cookies, future/expired challenges without touching sessions',()=>{
 let now=1800000000000;const service=createService(memory(),secret),h={service:()=>service,allowedOrigin:req=>req.headers.origin==='https://test.invalid'};
 const csrf=require('../src/access/registration-csrf').registrationCsrf(h,{now:()=>now});let cookie;
 const token=csrf.issue({headers:{}},{set(_name,value){cookie=value.split(';')[0];}}),req={headers:{origin:'https://test.invalid','content-type':'application/json',cookie,'x-csrf-token':token}};
 csrf.verify(req);for(const patch of [{cookie:cookie+'; '+cookie},{cookie:cookie+'x'},{'x-csrf-token':token.slice(0,-1)+'z'},{'content-type':'text/plain'}])assert.throws(()=>csrf.verify({headers:{...req.headers,...patch}}));
 now--;assert.throws(()=>csrf.verify(req));now+=900002;assert.throws(()=>csrf.verify(req));
});
