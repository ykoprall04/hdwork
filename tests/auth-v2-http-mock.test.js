// Real API-only routes; synthetic users/sessions/audit in memory. No DB imports.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),http=require('node:http');
const {createRequire}=require('node:module');
test('API-only cookie login/me/logout, CSRF, expiry, roles and read-only gate with memory storage',async()=>{
 const bcrypt=require('bcrypt'),password='synthetic-http-password-only';
 const users=[{id:1,name:'Synthetic Admin',username:'synthetic.admin',password_hash:await bcrypt.hash(password,12),role:'SUPER_ADMIN',is_active:1,city_id:null},{id:2,name:'Synthetic HD',username:'synthetic.hd',role:'HD',is_active:1,city_id:null}];users[1].password_hash=users[0].password_hash;
 const sessions=new Map(),audits=[];
 const store={async tx(fn){return fn(store);},async username(name){return users.find(u=>u.username===name);},async user(id){return users.find(u=>u.id===id);},async modules(){return ['B2B'];},async addSession(hash,id){sessions.set(hash,{user_id:id,revoked:false,expires:Date.now()+28800000});},async session(hash){const s=sessions.get(hash);return s&&!s.revoked&&s.expires>Date.now()?s:null;},async logout(hash){if(sessions.has(hash))sessions.get(hash).revoked=true;},async audit(_actor,_target,action){audits.push(action);}};
 const env={DB_NAME:'hdwork2',HDWORK2_AUTH_V2:'true',HDWORK2_LOCAL_READ_ONLY:'false',JWT_SECRET:'synthetic-http-jwt-key-only-0000000',FRONTEND_ORIGINS:'https://mock.local'};
 const file=require.resolve('../src/access/http'),original=require.cache[file],nativeRequire=createRequire(file),m={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:m,Buffer,process:{env},require:name=>name==='./store'?{createStore:()=>store}:name==='../config/database'?{}:nativeRequire(name)});
 require.cache[file]={id:file,filename:file,loaded:true,exports:m.exports};
 const {createApiOnlyApp}=require('../src/api-only-app');let server;
 try{
  server=http.createServer(createApiOnlyApp(env));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const send=(url,{body,cookie,csrf,origin='https://mock.local'}={})=>fetch(base+url,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  assert.equal((await send('/api/auth/me')).status,401);
  assert.equal((await send('/api/auth/login',{body:{username:'synthetic.admin',password},origin:'https://foreign.local'})).status,403);assert.equal(audits.length,0);
  const login=await send('/api/auth/login',{body:{username:'synthetic.admin',password}});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0],result=await login.json();assert.ok(!Object.hasOwn(result.data,'token'));assert.equal(result.data.user.role,'SUPER_ADMIN');
  for(const attr of ['Secure','HttpOnly','SameSite=None'])assert.ok(login.headers.get('set-cookie').includes(attr));
  const me=await send('/api/auth/me',{cookie});assert.equal(me.status,200);assert.equal((await me.json()).data.role,'SUPER_ADMIN');assert.equal(sessions.size,1);
  assert.equal((await send('/api/auth/logout',{body:{},cookie,csrf:'0'.repeat(64)})).status,403);assert.equal(audits.length,1);
  const logout=await send('/api/auth/logout',{body:{},cookie,csrf:result.data.csrf});assert.equal(logout.status,200);assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));assert.equal((await send('/api/auth/me',{cookie})).status,401);
  const hdLogin=await send('/api/auth/login',{body:{username:'synthetic.hd',password}}),hdCookie=hdLogin.headers.get('set-cookie').split(';')[0];assert.equal((await send('/api/admin/users',{cookie:hdCookie})).status,403);
  for(const s of sessions.values())s.expires=0;assert.equal((await send('/api/auth/me',{cookie:hdCookie})).status,401);
  assert.deepEqual(audits,['LOGIN_SUCCESS','LOGOUT','LOGIN_SUCCESS']);
  server.closeAllConnections();await new Promise(r=>server.close(r));
  server=http.createServer(createApiOnlyApp({...env,HDWORK2_LOCAL_READ_ONLY:'true'}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const before=audits.length;const denied=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth/login',{method:'POST',headers:{Origin:'https://mock.local','Content-Type':'application/json'},body:JSON.stringify({username:'synthetic.admin',password})});assert.equal(denied.status,503);assert.equal(audits.length,before);
 }finally{if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}if(original)require.cache[file]=original;else delete require.cache[file];}
});
