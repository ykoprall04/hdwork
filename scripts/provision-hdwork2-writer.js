// Explicit local administrator provisioning. Never imported by application startup.
const fs=require('node:fs'),path=require('node:path');
const {root,hash,fail,privatePath}=require('./lib/hdwork2-backup.cjs');
const {reviewOperationalGrants}=require('../src/config/operational-grants');
const {reviewGrants:reviewAuth}=require('../src/access/database-audit');
const writer='hdwork_ops_write',auth='hdwork_auth';
const secretFile='.local/database-secrets/ops-write-password.dpapi';
const q=(c,sql,values)=>c.query({sql,timeout:10000},values);
const authDelta=["GRANT INSERT, UPDATE ON hdwork2.users TO 'hdwork_auth'@'localhost'","GRANT SELECT ON hdwork2.hd2_security_audit TO 'hdwork_auth'@'localhost'","GRANT INSERT, DELETE ON hdwork2.hd2_user_modules TO 'hdwork_auth'@'localhost'","GRANT SELECT, UPDATE ON hdwork2.hd2_auth_guard TO 'hdwork_auth'@'localhost'"];
function review(text=fs.readFileSync(path.join(root,'ops/examples/hdwork2-batch-ab-runtime-grants.review.sql'),'utf8')){
 const sql=text.replace(/^--.*$/mg,'').split(';').map(s=>s.trim()).filter(Boolean),groups={[auth]:[],[writer]:[]};
 for(const statement of sql){const match=/^GRANT [A-Za-z_, ()]+ ON hdwork2\.[a-z0-9_]+ TO '(hdwork_auth|hdwork_ops_write)'@'localhost'$/.exec(statement);if(!match)throw fail('SQL_SCOPE_REJECTED');groups[match[1]].push(statement);}
 if(JSON.stringify(groups[auth])!==JSON.stringify(authDelta)||groups[writer].length!==10||!reviewOperationalGrants(groups[writer].map(grant=>({grant})),'write').ok)throw fail('SQL_POLICY_REJECTED');
 if(groups[writer].some(s=>/^GRANT .*INSERT.* ON hdwork2\.hd2_orders /.test(s)))throw fail('ORDER_INSERT_FORBIDDEN');
 return {groups,sqlSha256:hash(text),grantStatements:sql.length};
}
async function identity(c,user){const [[r]]=await q(c,'SELECT DATABASE() AS db,CURRENT_USER() AS account,@@port AS port,VERSION() AS version');if(r.db!=='hdwork2'||r.account!==user+'@localhost'||Number(r.port)!==3306||!/^8\.4\./.test(r.version))throw fail('DATABASE_IDENTITY_REJECTED');return {database:r.db,account:r.account,version:r.version};}
async function showGrants(c,user){if(![auth,writer].includes(user))throw fail('ACCOUNT_SCOPE_REJECTED');const [rows]=await q(c,"SHOW GRANTS FOR '"+user+"'@'localhost'");return rows;}
async function inspect(c,sql=review()){
 const target=await identity(c,'root');const [rows]=await c.execute({sql:"SELECT User,Host,account_locked FROM mysql.user WHERE Host='localhost' AND User IN (?,?)",timeout:10000},[auth,writer]);const found=new Map(rows.map(r=>[r.User,r]));
 const authGrants=found.has(auth)?await showGrants(c,auth):[];const authPolicy=reviewAuth(authGrants,{accountManagement:true});
 const authProjected=reviewAuth([...authGrants,...sql.groups[auth].map(grant=>({grant}))],{accountManagement:true});
 const writerPolicy=found.has(writer)?reviewOperationalGrants(await showGrants(c,writer),'write'):null;
 const [schema]=await q(c,"SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME='users' AND COLUMN_NAME='approval_status'");
 return {status:'INSPECTED_NO_WRITES',target,authExists:found.has(auth),authLocked:found.get(auth)?.account_locked!=='N',authPolicyPass:authPolicy.ok,authProjectedPolicyPass:authProjected.ok,authUnsafe:authPolicy.unsafeScopeOrPrivilege||authPolicy.unsupportedGrant,writerExists:found.has(writer),writerLocked:found.get(writer)?.account_locked!=='N',writerPolicyPass:writerPolicy?.ok||false,approvalColumnPresent:schema.length===1,sqlSha256:sql.sqlSha256,grantStatements:sql.grantStatements,writesPerformed:false,authGrants};
}
async function fingerprint(c){await q(c,"SET SESSION time_zone='+00:00'");const result={};for(const table of ['hd2_orders','users']){
 const [cols]=await c.execute({sql:"SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME=? ORDER BY ORDINAL_POSITION",timeout:10000},[table]);const names=cols.map(r=>r.COLUMN_NAME);if(!names.length||names.some(n=>!/^[a-z_]+$/.test(n)))throw fail('DATA_FINGERPRINT_SCOPE_REJECTED');
 const [rows]=await q(c,'SELECT SHA2(CAST(JSON_ARRAY('+names.map(n=>'`'+n+'`').join(',')+') AS CHAR CHARACTER SET utf8mb4),256) AS h FROM hdwork2.`'+table+'` ORDER BY id');result[table]={rows:rows.length,sha256:hash(rows.map(r=>r.h).join('\n'))};
 }return result;}
async function nonRoot(createConnection,readSecret,user){let password=await readSecret(user===writer?secretFile:'.local/hdwork-auth.password.dpapi'),c;
 try{c=await createConnection({host:'127.0.0.1',port:3306,database:'hdwork2',user,password,connectTimeout:5000,multipleStatements:false});password='';await identity(c,user);const [rows]=await q(c,'SHOW GRANTS FOR CURRENT_USER');return user===writer?reviewOperationalGrants(rows,'write').ok:reviewAuth(rows,{accountManagement:true}).ok;}
 finally{password='';if(c)await c.end();}}
async function provision({mode,confirmed=false,input,createConnection,readSecret,onProgress=()=>{}}){
 if(!['inspect','apply','verify'].includes(mode)||mode==='apply'&&!confirmed)throw fail('EXPLICIT_PROVISION_CONFIRMATION_REQUIRED');
 const sql=review();let c,password='',locked=false;const result={status:'RUNNING',stage:'CONNECT',createdWriter:false,writerUnlocked:false,authGrantStatements:0,applicationRowsWritten:false,passwordLogged:false,passwordStoredPlaintext:false,writesAttempted:false};const progress=stage=>{result.stage=stage;onProgress({...result});};
 try{
  if(input.adminUser!=='root'||typeof input.adminPassword!=='string'||!input.adminPassword)throw fail('ROOT_INPUT_REQUIRED');
  c=await createConnection({host:'127.0.0.1',port:3306,database:'hdwork2',user:'root',password:input.adminPassword,connectTimeout:5000,multipleStatements:false});input.adminPassword='';
  progress('INSPECT_ACCOUNTS');let initial=await inspect(c,sql);
  if(mode==='inspect'){const {authGrants,...safe}=initial;return safe;}
  if(!initial.authExists||initial.authLocked||initial.authUnsafe||!initial.approvalColumnPresent)throw fail('AUTH_OR_APPROVAL_REQUIRES_REVIEW');
  if(mode==='verify'){
   if(!initial.writerExists||initial.writerLocked||!initial.writerPolicyPass||!initial.authPolicyPass)throw fail('PROVISIONING_NOT_COMPLETE');
   if(!await nonRoot(createConnection,readSecret,writer)||!await nonRoot(createConnection,readSecret,auth))throw fail('NON_ROOT_POLICY_REJECTED');
   return {status:'VERIFIED_NO_WRITES',writerConnection:'PASS',authConnection:'PASS',writerPolicyPass:true,authPolicyPass:true,writesPerformed:false};
  }
  if(initial.writerExists)throw fail('EXISTING_WRITER_PRESERVED_USE_VERIFY');
  if(!initial.authProjectedPolicyPass)throw fail('AUTH_DELTA_INSUFFICIENT_OR_UNSAFE');
  const [rawLog]=await q(c,"SHOW GLOBAL VARIABLES LIKE 'log_raw'");if(rawLog.length!==1||!['OFF','0'].includes(String(rawLog[0].Value).toUpperCase()))throw fail('RAW_LOGGING_REQUIRES_REVIEW');
  progress('READ_ENCRYPTED_WRITER_PASSWORD');password=await readSecret(secretFile);if(typeof password!=='string'||! /^Hd2![A-Za-z0-9_-]{43}$/.test(password))throw fail('WRITER_SECRET_FORMAT_REJECTED');
  // Authenticate existing auth credential before changing any privileges. No password reset.
  await nonRoot(createConnection,readSecret,auth);
  const [[lock]]=await q(c,"SELECT GET_LOCK('hdwork2-writer-provision',0) AS n");if(Number(lock.n)!==1)throw fail('PROVISIONING_ALREADY_RUNNING');locked=true;
  initial=await inspect(c,sql);if(initial.writerExists||!initial.authExists||initial.authLocked||initial.authUnsafe||!initial.authProjectedPolicyPass)throw fail('ACCOUNT_STATE_CHANGED');
  const before=await fingerprint(c);result.beforeData=before;progress('CREATE_LOCKED_WRITER');result.writesAttempted=true;onProgress({...result});
  await q(c,"CREATE USER 'hdwork_ops_write'@'localhost' IDENTIFIED WITH caching_sha2_password BY ? ACCOUNT LOCK",[password]);result.createdWriter=true;password='';
  progress('GRANT_WRITER_MINIMUM');for(const statement of sql.groups[writer])await q(c,statement);
  if(!reviewOperationalGrants(await showGrants(c,writer),'write').ok)throw fail('WRITER_GRANTS_POSTCHECK_FAILED');
  progress('GRANT_AUTH_DELTA');for(const statement of sql.groups[auth]){
   const match=/^GRANT (.+) ON hdwork2\.([a-z0-9_]+) TO /.exec(statement),permissions=match[1].split(', '),current=reviewAuth(await showGrants(c,auth),{accountManagement:true});
   if(permissions.every(p=>current.tables[match[2]].present.includes(p)))continue;await q(c,statement);result.authGrantStatements++;
  }
  if(!reviewAuth(await showGrants(c,auth),{accountManagement:true}).ok)throw fail('AUTH_GRANTS_POSTCHECK_FAILED');
  progress('VERIFY_EXISTING_DATA');const after=await fingerprint(c);if(JSON.stringify(before)!==JSON.stringify(after))throw fail('ORDER_OR_USER_DATA_CHANGED_REQUIRES_REVIEW');result.orderAndUserDataPreserved=true;
  progress('UNLOCK_NEW_WRITER');await q(c,"ALTER USER 'hdwork_ops_write'@'localhost' ACCOUNT UNLOCK");result.writerUnlocked=true;
  progress('VERIFY_NON_ROOT_CONNECTIONS');if(!await nonRoot(createConnection,readSecret,writer)||!await nonRoot(createConnection,readSecret,auth))throw fail('NON_ROOT_CONNECTION_OR_POLICY_FAILED');
  const final=await inspect(c,sql);if(!final.writerExists||final.writerLocked||!final.writerPolicyPass||!final.authPolicyPass)throw fail('FINAL_ACCOUNT_POSTCHECK_FAILED');
  return {...result,status:'PASS',stage:'COMPLETE',writerConnection:'PASS',authConnection:'PASS',writerPolicyPass:true,authPolicyPass:true,writerOrderInsertAllowed:false,writerDpapiFile:secretFile,sqlSha256:sql.sqlSha256};
 }catch(e){throw Object.assign(fail(/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'WRITER_PROVISIONING_FAILED'),{safeReport:{...result,status:'BLOCKED',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'WRITER_PROVISIONING_FAILED',partialChangesPossible:result.writesAttempted,automaticRetry:false}});}
 finally{password='';if(input)input.adminPassword='';if(c){if(locked)await q(c,"SELECT RELEASE_LOCK('hdwork2-writer-provision')").catch(()=>{});await c.end();}}
}
async function main(){const args=process.argv.slice(2).join(' ');if(args==='--review'){const p=review();console.log(JSON.stringify({status:'REVIEW_PASS',grantStatements:p.grantStatements,sqlSha256:p.sqlSha256,writerOrderInsertAllowed:false,sqlExecuted:false}));return;}
 const mode={'--inspect':'inspect','--apply-confirmed':'apply','--verify':'verify'}[args];if(!mode)throw fail('EXPLICIT_MODE_REQUIRED');
 const input=await require('./provision-testing-accounts').adminInput();const dir=privatePath(input.reportDirectory);if(!/^writer-provision-[a-f0-9]{32}$/.test(path.basename(dir)))throw fail('REPORT_DIRECTORY_REJECTED');
 const reportFile=path.join(dir,'report.json'),save=r=>fs.writeFileSync(reportFile,JSON.stringify(r,null,2)+'\n');
 try{const r=await provision({mode,confirmed:mode==='apply',input,createConnection:opts=>require('mysql2/promise').createConnection(opts),readSecret:file=>require('../src/config/private-database-env').readPrivateDpapi(file),onProgress:save});save(r);console.log(JSON.stringify({...r,report:path.relative(root,reportFile)}));}
 catch(e){const safe=e.safeReport||{status:'BLOCKED',code:e.code||'WRITER_PROVISIONING_FAILED'};save(safe);console.log(JSON.stringify({...safe,report:path.relative(root,reportFile)}));process.exitCode=1;}
}
if(require.main===module)main().catch(e=>{console.log(JSON.stringify({status:'BLOCKED',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'PROVISIONING_PREFLIGHT_FAILED',passwordLogged:false}));process.exitCode=1;});
module.exports={review,inspect,provision,fingerprint};
