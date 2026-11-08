// Explicit disposable-only auth rehearsal, no API listener or bot.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function run({env=process.env,argv=process.argv.slice(2),driverFactory=()=>require('mysql2/promise')}={}){
 if(argv.length!==1||argv[0]!=='--run-auth-disposable')throw Error('Auth rehearsal disabled');
 const guard=require('../../ops/mysql/disposable-guard');const options=guard.config(env,['--run-disposable']);const pool=driverFactory().createPool(options);
 try{
 const c=await pool.getConnection();try{await guard.verifyTarget(c,options.database);const sql=fs.readFileSync(path.resolve(__dirname,'../../database/manual/007_hdwork2_auth.sql'),'utf8').replace(/^\s*--.*$/gm,'');const statements=sql.split(';').map(s=>s.trim()).filter(Boolean);assert.equal(statements.shift(),'USE hdwork2');for(const statement of statements){assert.match(statement,/^(CREATE TABLE (users|hd2_[a-z_]+)|ALTER TABLE users MODIFY COLUMN role|INSERT INTO hd2_auth_guard)/);await c.query(statement);}}finally{c.release();}
 const service=require('../../src/access/service').createService(require('../../src/access/store').createStore(pool),'synthetic-auth-test-secret-000000000');
 const input={name:'Synthetic Admin',username:'synthetic.admin',password:'synthetic-password-123'};await service.bootstrap(input);
 assert.equal(await service.login('unknown',input.password),null);assert.equal(await service.login(input.username,'wrong'),null);
 const a=await service.login(input.username,input.password),b=await service.login(input.username,input.password);assert.notEqual(a.token,b.token);await service.logout(a.token);await assert.rejects(service.me(a.token));assert.equal((await service.me(b.token)).role,'SUPER_ADMIN');
 const admin=(await service.me(b.token)).id;
 const viewer=await service.manage(admin,null,{name:'Viewer',username:'viewer',password:input.password,role:'SHOW_ONLY',modules:['REQ'],is_active:true});
 const v=await service.login('viewer',input.password);assert.deepEqual((await service.me(v.token)).modules,['REQ']);await assert.rejects(service.manage(viewer,null,{...input,username:'evil'}));
 await service.manage(admin,viewer,{},'REVOKE');await assert.rejects(service.me(v.token));
 await service.manage(admin,viewer,{name:'Viewer',role:'HD',modules:['TIAL','LOGIC_MO'],is_active:true});assert.deepEqual((await service.me((await service.login('viewer',input.password)).token)).modules,['LOGIC_MO','TIAL']);
 await service.manage(admin,viewer,{password:'replacement-password-123'},'RESET');assert.equal(await service.login('viewer',input.password),null);
 await service.manage(admin,viewer,{name:'Viewer',role:'HD',modules:['TIAL'],is_active:false});assert.equal(await service.login('viewer','replacement-password-123'),null);
 await assert.rejects(service.manage(admin,admin,{name:'Admin',role:'HD',modules:[],is_active:false}),{statusCode:409});
 const second=await service.manage(admin,null,{name:'Second',username:'second.admin',password:input.password,role:'SUPER_ADMIN',modules:[],is_active:true});
 const changes=await Promise.allSettled([service.manage(admin,admin,{name:'A',role:'HD',modules:[],is_active:true}),service.manage(second,second,{name:'B',role:'HD',modules:[],is_active:true})]);assert.equal(changes.filter(r=>r.status==='fulfilled').length,1);
 const [[count]]=await pool.query("SELECT COUNT(*) AS n FROM users WHERE role='SUPER_ADMIN' AND is_active=TRUE");assert.equal(Number(count.n),1);
 const [sessions]=await pool.query('SELECT token_hash FROM hd2_sessions');assert.ok(sessions.every(s=>/^[a-f0-9]{64}$/.test(s.token_hash)&&s.token_hash!==a.token));
 const [audit]=await pool.query('SELECT action FROM hd2_security_audit');assert.ok(audit.some(r=>r.action==='LOGIN_FAILED'));assert.ok(audit.some(r=>r.action==='PASSWORD_RESET'));
 return {ok:true,checks:['ddl007','bcrypt-login','multi-device','logout','revoke','roles-modules','reset-disable','last-super-admin-concurrency','safe-audit']};
 }finally{await pool.end();}
}
if(require.main===module){if(process.argv.length===2)console.log('Auth disposable rehearsal disabled.');else run().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Auth disposable rehearsal rejected or failed.');process.exitCode=1;});}
module.exports={run};
