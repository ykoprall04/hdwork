const test=require('node:test'),assert=require('node:assert/strict'),bcrypt=require('bcrypt'),fs=require('node:fs'),vm=require('node:vm');
const {createService,digest}=require('../src/access/service');
function memory(){const state={users:[],sessions:[],audit:[]};let tail=Promise.resolve();
 const s={state,async tx(fn){const last=tail;let release;tail=new Promise(r=>release=r);await last;const backup=structuredClone(state);try{return await fn(s);}catch(e){Object.assign(state,backup);throw e;}finally{release();}},async lock(){},async user(id){return state.users.find(u=>u.id===Number(id));},async username(name){return state.users.find(u=>u.username===name);},async modules(id){return (await s.user(id))?.modules||[];},async session(hash){return state.sessions.find(r=>r.hash===hash&&!r.revoked&&r.expires>Date.now());},async addSession(hash,id){state.sessions.push({hash,user_id:id,expires:Date.now()+28800000});},async revoke(id){state.sessions.filter(r=>r.user_id===id).forEach(r=>r.revoked=true);},async logout(hash){const row=state.sessions.find(r=>r.hash===hash);if(row)row.revoked=true;},async audit(actor,target,action){state.audit.push({actor,target,action});},async activeSupers(){return state.users.filter(u=>u.role==='SUPER_ADMIN'&&u.is_active).length;},async save(id,data){if(id)Object.assign(await s.user(id),data);else{id=state.users.length+1;state.users.push({...data,id});}return id;}};return s;}
const secret='synthetic-jwt-session-test-secret-only';
const account=(role='HD',modules=['TIAL'])=>({name:'Test Account',username:'test.user',password:'synthetic-password-123',role,modules,is_active:true});
test('same login service, bcrypt, independent device sessions, logout/revoke/expiry and safe audits',async()=>{
 const store=memory(),service=createService(store,secret);await service.bootstrap(account());
 assert.ok(await bcrypt.compare('synthetic-password-123',store.state.users[0].password_hash));
 assert.notEqual(store.state.users[0].password_hash,'synthetic-password-123');
 for(const [u,p] of [['unknown','synthetic-password-123'],['test.user','wrong']])assert.equal(await service.login(u,p),null);
 const a=await service.login('test.user','synthetic-password-123'),b=await service.login('test.user','synthetic-password-123');assert.notEqual(a.token,b.token);
 assert.equal(store.state.sessions[0].hash,digest(a.token));assert.ok(!JSON.stringify(store.state).includes(a.token));
 await service.logout(a.token);await assert.rejects(service.me(a.token));assert.equal((await service.me(b.token)).role,'SUPER_ADMIN');
 store.state.sessions.find(r=>r.hash===digest(b.token)).expires=0;await assert.rejects(service.me(b.token));
 assert.ok(store.state.audit.some(a=>a.action==='LOGIN_FAILED'));assert.ok(!JSON.stringify(store.state.audit).includes('password'));
});
test('pending accounts, role hierarchy, approval and password changes',async()=>{
 const store=memory(),service=createService(store,secret);await service.bootstrap(account());
 const admin=await service.manage(1,null,{...account('ADMIN'),username:'admin'});
 assert.equal(await service.login('admin','synthetic-password-123'),null);
 await assert.rejects(service.manage(admin,admin,{},'APPROVE'));
 await service.manage(1,admin,{},'APPROVE');
 const viewer=await service.manage(admin,null,{...account('SHOW_ONLY',['REQ']),username:'viewer'});
 assert.equal(store.state.users.find(u=>u.id===viewer).approval_status,'PENDING');
 await assert.rejects(service.manage(admin,viewer,{name:'Viewer',role:'HD',modules:[],is_active:true}));
 await assert.rejects(service.manage(admin,null,{...account('ADMIN'),username:'forbidden'}));
 await assert.rejects(service.manage(1,null,{...account('SUPER_ADMIN'),username:'forbidden'}));
 await service.manage(admin,viewer,{},'APPROVE');
 const session=await service.login('viewer','synthetic-password-123');assert.deepEqual((await service.me(session.token)).modules,['REQ']);
 await assert.rejects(service.manage(viewer,null,{...account(),username:'forbidden'}));
 await assert.rejects(service.changePassword(viewer,{currentPassword:'wrong',password:'replacement-password-123'}));
 await service.changePassword(viewer,{currentPassword:'synthetic-password-123',password:'replacement-password-123'});
 await assert.rejects(service.me(session.token));assert.equal(await service.login('viewer','synthetic-password-123'),null);
 assert.ok(await service.login('viewer','replacement-password-123'));
 await service.manage(admin,viewer,{password:'reset-password-123'},'RESET');assert.equal(await service.login('viewer','replacement-password-123'),null);
 assert.ok(store.state.audit.some(a=>a.action==='USER_APPROVED'));assert.ok(store.state.audit.some(a=>a.action==='PASSWORD_CHANGED'));
 // Legacy trial accounts with no approval marker retain login behavior.
 store.state.users.push({...account(),id:99,password_hash:await bcrypt.hash('trial-password-123',12),username:'trial_yanto'});
 assert.ok(await service.login('trial_yanto','trial-password-123'));
});

test('access middleware uses only cookie, CSRF bound to session and exact trusted Origin',async()=>{
 const source=fs.readFileSync('src/access/http.js','utf8'),module={exports:{}};
 const env={DB_NAME:'hdwork2',HDWORK2_AUTH_V2:'true',FRONTEND_ORIGINS:'https://web.example',JWT_SECRET:secret};
 const mock={csrf:()=> 'a'.repeat(64),me:async()=>({id:1,role:'SHOW_ONLY',modules:['TIAL']})};
 vm.runInNewContext(source,{module,Buffer,process:{env},require:n=>n==='node:crypto'?require(n):n==='./service'?{reject:code=>Object.assign(Error(),{statusCode:code}),createService:()=>mock}:n==='./store'?{createStore:()=>({})}:n==='../config/database'?{}:null});
 const h=module.exports,req={headers:{cookie:'__Host-hdwork2-session=test.token',origin:'https://web.example','x-csrf-token':'a'.repeat(64)}};
 assert.equal(h.cookie(req),'test.token');h.csrf(req,'test.token');
 assert.throws(()=>h.csrf({...req,headers:{...req.headers,origin:'https://evil.example'}},'test.token'));
 assert.throws(()=>h.csrf({...req,headers:{...req.headers,'x-csrf-token':'b'.repeat(64)}},'test.token'));
 assert.throws(()=>h.cookie({headers:{authorization:'Bearer test.token'}}));
 let cookie;h.setCookie({set(_key,value){cookie=value;}},'opaque');for(const flag of ['HttpOnly','Secure','SameSite=None','Path=/'])assert.ok(cookie.includes(flag));
});
test('SQL module scope covers list, direct detail/history and duplicate previous order without sensitive projection',async()=>{
 const {createOrderReader}=require('../src/b2c-read/orders');const calls=[];
 const pool={async getConnection(){return {async query(){},async beginTransaction(){},async commit(){},async rollback(){},release(){},async execute(sql,p){calls.push([sql,p]);return [[]];}};}};
 const reader=createOrderReader(pool,true,['TIAL']);await assert.rejects(reader.list({module:'REQ'}),{statusCode:403});
 await reader.list({module:'TIAL'});const id='00000000-0000-4000-8000-000000000001';await assert.rejects(reader.detail(id),{statusCode:404});await assert.rejects(reader.history(id,{}),{statusCode:404});
 assert.ok(calls.every(([sql])=>sql.includes('CASE command')));assert.ok(calls.every(([sql])=>!sql.includes('raw_text')));
});
test('HD and SHOW_ONLY cannot access user-management handlers',()=>{
 const router={stack:[],use(fn){this.stack.push(fn);},get(){},post(){}};const module={exports:{}};
 vm.runInNewContext(fs.readFileSync('src/access/admin-routes.js','utf8'),{module,require:n=>n==='express'?{Router:()=>router}:n==='./http'?{auth:()=>{},error:(res,e)=>res.status(e.statusCode)}:n==='./service'?{reject:()=>({statusCode:403})}:null});
 for(const role of ['HD','SHOW_ONLY']){let status;router.stack[1]({user:{role}},{status(code){status=code;}},()=>assert.fail('must deny'));assert.equal(status,403);}
});
test('provisioning is disabled by default and cookie config rejects insecure origins',async()=>{
 await assert.rejects(require('../scripts/provision-first-admin').provision({},[]));
 const {corsOptions}=require('../src/config/api-cors');assert.throws(()=>corsOptions({HDWORK2_AUTH_V2:'true',FRONTEND_ORIGINS:'http://web.example'}));
 const options=corsOptions({HDWORK2_AUTH_V2:'true',FRONTEND_ORIGINS:'https://web.example'});assert.equal(options.credentials,true);assert.ok(options.allowedHeaders.includes('X-CSRF-Token'));
 const config=require('../src/config/api-only-startup').validateApiOnlyConfig;const env={DB_NAME:'hdwork2',DB_HOST:'127.0.0.1',DB_USER:'synthetic',DB_PASSWORD:'synthetic',JWT_SECRET:'synthetic-test-secret-at-least-32-bytes',FRONTEND_ORIGINS:'https://web.example',HDWORK2_AUTH_V2:'true'};assert.equal(config(env).database,'hdwork2');assert.throws(()=>config({...env,JWT_SECRET:'short'}));
 const schema=fs.readFileSync('database/manual/007_hdwork2_auth.sql','utf8');assert.match(schema,/CREATE TABLE users/);assert.doesNotMatch(schema,/CREATE TABLE IF NOT EXISTS users/);
});
