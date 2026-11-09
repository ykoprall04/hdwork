// Administrator-only one-shot tool; not imported by any application entrypoint.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {reviewOperationalGrants}=require('../src/config/operational-grants');
const root=path.resolve(__dirname,'..'),sqlFile=path.join(root,'ops/examples/hdworkopsbot-testing-accounts.review.sql');
const accounts=[{user:'hdwork_courier',role:'courier',file:'.local/courier-secrets/courier-db-password.dpapi'},{user:'hdwork_ops_read',role:'read',file:'.local/database-secrets/ops-read-password.dpapi'}];
const denied=code=>Object.assign(Error('Testing provisioning blocked'),{code});
const query=(c,sql,values)=>c.query({sql,timeout:5000},values);
function review(text=fs.readFileSync(sqlFile,'utf8')){
 const statements=text.replace(/^--.*$/mg,'').split(';').map(s=>s.trim()).filter(Boolean);
 const groups=Object.fromEntries(accounts.map(a=>[a.user,[]]));
 for(const sql of statements){const m=/^GRANT [A-Z_, ()a-z]+ ON hdwork2\.[a-z0-9_]+ TO '(hdwork_courier|hdwork_ops_read)'@'localhost'$/.exec(sql);if(!m)throw denied('SQL_REVIEW_REJECTED');groups[m[1]].push(sql);}
 for(const a of accounts){const result=reviewOperationalGrants(groups[a.user].map(grant=>({grant})),a.role);if(!result.ok)throw Object.assign(denied('SQL_GRANTS_REJECTED'),{account:a.user,role:a.role,missingPrivileges:result.missing,unsafePrivileges:result.unsafe});}
 return {groups,sha256:crypto.createHash('sha256').update(text).digest('hex'),statements:statements.length};
}
async function adminInput(){let chunks=[],size=0;for await(const b of process.stdin){size+=b.length;if(size>16384)throw denied('ADMIN_INPUT_REJECTED');chunks.push(b);}const bytes=Buffer.concat(chunks);try{const v=JSON.parse(bytes.toString('utf8'));if(!/^[A-Za-z0-9_]{1,64}$/.test(v.adminUser||'')||typeof v.adminPassword!=='string'||!v.adminPassword)throw denied('ADMIN_INPUT_REJECTED');return v;}finally{bytes.fill(0);for(const b of chunks)b.fill(0);}}
async function provision({mode,confirmed=false,input,createConnection,readSecret,sql=review()}={}){
 if(!['inspect','apply'].includes(mode)||mode==='apply'&&!confirmed)throw denied('EXPLICIT_PROVISION_CONFIRMATION_REQUIRED');
 let c,ddlAttempted=false;const created=[],verified=[];const passwords={};
 try{
  c=await createConnection({host:'127.0.0.1',port:3306,user:input.adminUser,password:input.adminPassword,database:'hdwork2',multipleStatements:false,connectTimeout:5000});input.adminPassword='';
  const [[target]]=await query(c,'SELECT DATABASE() AS db,@@port AS port,@@session.sql_mode AS sqlMode');if(target.db!=='hdwork2'||Number(target.port)!==3306)throw denied('ADMIN_TARGET_REJECTED');
  const [found]=await c.execute({sql:"SELECT User,Host,account_locked FROM mysql.user WHERE User IN (?,?) AND Host='localhost'",timeout:5000},accounts.map(a=>a.user));
  const existing=new Map(found.map(row=>[row.User,row]));
  // Preflight every existing account. No GRANT, unlock or password reset on it.
  const inspections=new Map();for(const a of accounts)if(existing.has(a.user)){
   const [rows]=await query(c,"SHOW GRANTS FOR '"+a.user+"'@'localhost'");const grants=reviewOperationalGrants(rows,a.role);const locked=existing.get(a.user).account_locked!=='N';inspections.set(a.user,{locked,grantsMatch:grants.ok,unsafePrivileges:grants.unsafe,missingPrivileges:grants.missing});if(mode==='apply'&&(!grants.ok||locked))throw denied('EXISTING_ACCOUNT_REQUIRES_REVIEW');
  }
  if(mode==='inspect')return {status:'INSPECTED_NO_WRITES',accounts:accounts.map(a=>({user:a.user,exists:existing.has(a.user),...inspections.get(a.user)})),sqlSha256:sql.sha256,writesPerformed:false};
  const [logging]=await query(c,"SHOW GLOBAL VARIABLES LIKE 'log_raw'");if(logging.length!==1||!['OFF','0'].includes(String(logging[0].Value).toUpperCase()))throw denied('SERVER_RAW_LOGGING_REVIEW_REQUIRED');
  for(const a of accounts){passwords[a.user]=await readSecret(a.file);if(typeof passwords[a.user]!=='string'||!passwords[a.user])throw denied('RUNTIME_PASSWORD_MISSING');}
  // Verify supplied passwords for existing identities before creating anything.
  for(const a of accounts)if(existing.has(a.user))await verify(a,passwords[a.user]);
  const mysql=require('mysql2');const noBackslash=String(target.sqlMode).split(',').includes('NO_BACKSLASH_ESCAPES');
  for(const a of accounts){if(existing.has(a.user)){verified.push(a.user);continue;}
   const value=noBackslash?"'"+passwords[a.user].replace(/'/g,"''")+"'":mysql.escape(passwords[a.user]);
   ddlAttempted=true;await query(c,"CREATE USER '"+a.user+"'@'localhost' IDENTIFIED WITH caching_sha2_password BY "+value+' ACCOUNT LOCK');created.push(a.user);
   for(const statement of sql.groups[a.user])await query(c,statement);
   const [rows]=await query(c,"SHOW GRANTS FOR '"+a.user+"'@'localhost'");if(!reviewOperationalGrants(rows,a.role).ok)throw denied('NEW_ACCOUNT_GRANTS_REJECTED');
   await query(c,"ALTER USER '"+a.user+"'@'localhost' ACCOUNT UNLOCK");await verify(a,passwords[a.user]);verified.push(a.user);
  }
  return {status:'PASS',created,verified,sqlSha256:sql.sha256,applicationDataWritten:false,telegramStarted:false};
  async function verify(a,password){let app;try{app=await createConnection({host:'127.0.0.1',port:3306,user:a.user,password,database:'hdwork2',multipleStatements:false,connectTimeout:5000});const [[id]]=await query(app,'SELECT DATABASE() AS db,CURRENT_USER() AS account');if(id.db!=='hdwork2'||id.account!==a.user+'@localhost')throw denied('RUNTIME_IDENTITY_REJECTED');const [rows]=await query(app,'SHOW GRANTS FOR CURRENT_USER');if(!reviewOperationalGrants(rows,a.role).ok)throw denied('RUNTIME_GRANTS_REJECTED');}finally{if(app)await app.end();}}
 }catch(e){throw Object.assign(denied(/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'PROVISIONING_FAILED'),{created,verified,partialChangesPossible:mode==='apply'&&ddlAttempted});}
 finally{if(input)input.adminPassword='';for(const k of Object.keys(passwords))passwords[k]='';if(c)await c.end();}
}
async function run(){const arg=process.argv.slice(2).join(' '),sql=review();if(arg==='--review'){console.log(JSON.stringify({status:'REVIEW_PASS',sqlSha256:sql.sha256,grantStatements:sql.statements,accounts:accounts.map(a=>a.user),database:'hdwork2',writesPerformed:false}));return;}
 const mode=arg==='--inspect'?'inspect':arg==='--apply --confirmed'?'apply':null;if(!mode)throw denied('EXPLICIT_PROVISION_CONFIRMATION_REQUIRED');
 const input=await adminInput();const result=await provision({mode,confirmed:mode==='apply',input,sql,createConnection:opts=>require('mysql2/promise').createConnection(opts),readSecret:file=>require('../src/config/private-database-env').readPrivateDpapi(file)});console.log(JSON.stringify(result));}
if(require.main===module)run().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'PROVISIONING_FAILED',...(e.code==='SQL_GRANTS_REJECTED'?{account:e.account,role:e.role,missingPrivileges:e.missingPrivileges,unsafePrivileges:e.unsafePrivileges}:{}),created:e.created||[],verified:e.verified||[],partialChangesPossible:!!e.partialChangesPossible}));process.exitCode=1;});
module.exports={review,provision,adminInput};
