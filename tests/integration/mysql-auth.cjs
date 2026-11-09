// Explicit disposable-only auth rehearsal, no API listener or bot.
const assert=require('node:assert/strict');
const {schemaStatements,approvedAccount}=require('../helpers/e2e-contracts.cjs');
async function run({env=process.env,argv=process.argv.slice(2),driverFactory=()=>require('mysql2/promise')}={}){
 if(argv.length!==1||argv[0]!=='--run-auth-disposable')throw Error('Auth rehearsal disabled');
 const guard=require('../../ops/mysql/disposable-guard');const options=guard.config(env,['--run-disposable']);const pool=driverFactory().createPool(options);
 try{
 const c=await pool.getConnection();try{await guard.verifyTarget(c,options.database);for(const sql of schemaStatements(['007_hdwork2_auth.sql','010_hdwork2_account_approval.sql']))await c.query(sql);}finally{c.release();}
 const service=require('../../src/access/service').createService(require('../../src/access/store').createStore(pool),'synthetic-auth-test-secret-000000000');
 const input={name:'Synthetic Admin',username:'synthetic.admin',password:'synthetic-password-123'};await service.bootstrap(input);
 assert.equal(await service.login('unknown',input.password),null);assert.equal(await service.login(input.username,'wrong'),null);
 const a=await service.login(input.username,input.password),b=await service.login(input.username,input.password);assert.notEqual(a.token,b.token);await service.logout(a.token);await assert.rejects(service.me(a.token));assert.equal((await service.me(b.token)).role,'SUPER_ADMIN');
 const admin=(await service.me(b.token)).id;
 const {id:viewer}=await approvedAccount(service,admin,{name:'Viewer',username:'viewer',password:input.password,role:'SHOW_ONLY',modules:['REQ'],is_active:true});
 const v=await service.login('viewer',input.password);assert.deepEqual((await service.me(v.token)).modules,['REQ']);await assert.rejects(service.manage(viewer,null,{...input,username:'evil'}));
 await service.manage(admin,viewer,{},'REVOKE');await assert.rejects(service.me(v.token));
 await service.manage(admin,viewer,{name:'Viewer',role:'HD',modules:['TIAL','LOGIC_MO'],is_active:true});assert.deepEqual((await service.me((await service.login('viewer',input.password)).token)).modules,['LOGIC_MO','TIAL']);
 await service.manage(admin,viewer,{password:'replacement-password-123'},'RESET');assert.equal(await service.login('viewer',input.password),null);
 await service.manage(admin,viewer,{name:'Viewer',role:'HD',modules:['TIAL'],is_active:false});assert.equal(await service.login('viewer','replacement-password-123'),null);
 await assert.rejects(service.manage(admin,admin,{name:'Admin',role:'HD',modules:[],is_active:false}),{statusCode:403});
 await assert.rejects(service.manage(admin,null,{name:'Second',username:'second.admin',password:input.password,role:'SUPER_ADMIN',modules:[],is_active:true}),{statusCode:403});
 const delegated=await approvedAccount(service,admin,{name:'Delegated',username:'delegated',password:input.password,role:'ADMIN',modules:[],is_active:true});
 await assert.rejects(service.manage(delegated.id,admin,{},'REVOKE'),{statusCode:403});
 await assert.rejects(service.manage(delegated.id,null,{name:'Other admin',username:'other.admin',password:input.password,role:'ADMIN',modules:[],is_active:true}),{statusCode:403});
 const [[count]]=await pool.query("SELECT COUNT(*) AS n FROM users WHERE role='SUPER_ADMIN' AND is_active=TRUE");assert.equal(Number(count.n),1);
 const old=await service.login('delegated',input.password);
 await service.changePassword(delegated.id,{currentPassword:input.password,password:'replacement-password-456'});await assert.rejects(service.me(old.token));
 assert.equal(await service.login('delegated',input.password),null);assert.ok(await service.login('delegated','replacement-password-456'));
 const [sessions]=await pool.query('SELECT token_hash FROM hd2_sessions');assert.ok(sessions.every(s=>/^[a-f0-9]{64}$/.test(s.token_hash)&&s.token_hash!==a.token));
 const [audit]=await pool.query('SELECT action FROM hd2_security_audit');assert.ok(audit.some(r=>r.action==='LOGIN_FAILED'));assert.ok(audit.some(r=>r.action==='PASSWORD_RESET'));
 return {ok:true,checks:['ddl007-010','bcrypt-login','multi-device','logout','revoke','roles-modules','reset-disable','super-admin-protected','pending-approval','password-session-revocation','safe-audit']};
 }finally{await pool.end();}
}
if(require.main===module){if(process.argv.length===2)console.log('Auth disposable rehearsal disabled.');else run().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Auth disposable rehearsal rejected or failed.');process.exitCode=1;});}
module.exports={run};
