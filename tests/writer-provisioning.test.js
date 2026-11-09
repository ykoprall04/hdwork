const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {review,provision}=require('../scripts/provision-hdwork2-writer');
const {reviewOperationalGrants}=require('../src/config/operational-grants');
function fixture({writerExists=false,authExists=true,rawLog='OFF',failGrant=false,dataChanged=false}={}){
 const state={writerExists,authExists,writerLocked:false,authGrants:["GRANT SELECT ON hdwork2.users TO 'hdwork_auth'@'localhost'","GRANT SELECT, INSERT, UPDATE ON hdwork2.hd2_sessions TO 'hdwork_auth'@'localhost'","GRANT INSERT ON hdwork2.hd2_security_audit TO 'hdwork_auth'@'localhost'","GRANT SELECT ON hdwork2.hd2_user_modules TO 'hdwork_auth'@'localhost'"],writerGrants:[],calls:[],secrets:[],connections:[]};
 function grants(user){return [{g:'GRANT USAGE ON *.* TO `'+user+'`@`localhost`'},...(user==='hdwork_auth'?state.authGrants:state.writerGrants).map(g=>({g}))];}
 function connection(user){return {
  async query(arg,p){const sql=typeof arg==='string'?arg:arg.sql;state.calls.push(sql);
   if(sql.startsWith('SELECT DATABASE()'))return [[{db:'hdwork2',account:user+'@localhost',port:3306,version:'8.4.13'}]];
   if(sql.startsWith('SHOW GRANTS'))return [grants(sql.includes("'hdwork_auth'")?'hdwork_auth':sql.includes("'hdwork_ops_write'")?'hdwork_ops_write':user)];
   if(sql.includes('COLUMN_NAME FROM information_schema.COLUMNS'))return [[{COLUMN_NAME:'approval_status'}]];
   if(sql.startsWith('SHOW GLOBAL VARIABLES'))return [[{Value:rawLog}]];
   if(sql.startsWith('SELECT GET_LOCK'))return [[{n:1}]];
   if(sql.startsWith('SELECT RELEASE_LOCK'))return [[{n:1}]];
   if(sql.startsWith('SET SESSION'))return [{}];
   if(sql.startsWith('SELECT SHA2'))return [[{h:(dataChanged&&state.writerExists?'b':'a').repeat(64)}]];
   if(sql.startsWith("CREATE USER 'hdwork_ops_write'")){assert.equal(state.writerExists,false);assert.match(p[0],/^Hd2![A-Za-z0-9_-]{43}$/);assert.ok(sql.endsWith('ACCOUNT LOCK'));state.writerExists=true;state.writerLocked=true;return [{}];}
   if(sql.startsWith('GRANT ')){if(failGrant)throw Object.assign(Error(),{code:'ER_TABLEACCESS_DENIED_ERROR'});assert.match(sql,/ ON hdwork2\./);if(sql.endsWith("TO 'hdwork_ops_write'@'localhost'"))state.writerGrants.push(sql);else if(sql.endsWith("TO 'hdwork_auth'@'localhost'"))state.authGrants.push(sql);else assert.fail('Unexpected account');return [{}];}
   if(sql==="ALTER USER 'hdwork_ops_write'@'localhost' ACCOUNT UNLOCK"){assert.equal(state.writerLocked,true);state.writerLocked=false;return [{}];}
   assert.fail('Unexpected SQL');
  },
  async execute(arg,p){const sql=arg.sql;state.calls.push(sql);if(sql.includes('FROM mysql.user')){assert.deepEqual(p,['hdwork_auth','hdwork_ops_write']);return [[...(state.authExists?[{User:'hdwork_auth',Host:'localhost',account_locked:'N'}]:[]),...(state.writerExists?[{User:'hdwork_ops_write',Host:'localhost',account_locked:state.writerLocked?'Y':'N'}]:[])]];}
   if(sql.includes('information_schema.COLUMNS'))return [[{COLUMN_NAME:'id'},{COLUMN_NAME:p[0]==='users'?'role':'status'}]];assert.fail('Unexpected execute');
  },async end(){}
 };}
 const createConnection=async options=>{assert.equal(options.host,'127.0.0.1');assert.equal(options.database,'hdwork2');assert.equal(options.multipleStatements,false);state.connections.push(options.user);if(options.user==='hdwork_ops_write'&&state.writerLocked)throw Error('Locked writer must not connect');return connection(options.user);};
 const readSecret=async file=>{state.secrets.push(file);return file.includes('ops-write')?'Hd2!'+'A'.repeat(43):'synthetic-auth-only';};
 return {state,createConnection,readSecret};
}
const rootInput=()=>({adminUser:'root',adminPassword:'synthetic-root-only'});
test('writer review grants no INSERT orders and rejects old broader or cross-scope SQL',()=>{
 const p=review();assert.equal(p.grantStatements,14);assert.equal(p.groups.hdwork_auth.length,4);assert.equal(p.groups.hdwork_ops_write.length,10);
 assert.equal(reviewOperationalGrants(p.groups.hdwork_ops_write.map(g=>({g})),'write').ok,true);
 const text=fs.readFileSync('ops/examples/hdwork2-batch-ab-runtime-grants.review.sql','utf8');
 assert.throws(()=>review(text.replace("GRANT SELECT ON hdwork2.hd2_orders TO 'hdwork_ops_write'","GRANT SELECT, INSERT ON hdwork2.hd2_orders TO 'hdwork_ops_write'")));
 assert.throws(()=>review(text+"\nGRANT ALL PRIVILEGES ON *.* TO 'hdwork_ops_write'@'localhost';"));
});
test('Inspect is metadata-only, checks both exact accounts, and reads no password files',async()=>{
 const f=fixture(),input=rootInput();const result=await provision({mode:'inspect',input,...f});assert.equal(result.authExists,true);assert.equal(result.writerExists,false);assert.equal(result.authProjectedPolicyPass,true);assert.equal(result.status,'INSPECTED_NO_WRITES');assert.equal(f.state.secrets.length,0);assert.ok(f.state.calls.every(sql=>/^(SELECT|SHOW)/.test(sql)));assert.equal(input.adminPassword,'');
});
test('confirmed Apply creates locked writer, grants minimum, preserves data and verifies non-root identities',async()=>{
 const f=fixture(),input=rootInput(),progress=[];const r=await provision({mode:'apply',confirmed:true,input,...f,onProgress:p=>progress.push(p)});
 assert.equal(r.status,'PASS');assert.equal(r.createdWriter,true);assert.equal(r.writerUnlocked,true);assert.equal(r.authGrantStatements,4);assert.equal(r.orderAndUserDataPreserved,true);assert.equal(r.writerConnection,'PASS');assert.equal(r.authConnection,'PASS');assert.equal(r.writerOrderInsertAllowed,false);
 assert.equal(f.state.writerGrants.length,10);assert.ok(f.state.connections.includes('hdwork_ops_write'));assert.ok(f.state.secrets.every(p=>p.endsWith('.dpapi')));assert.equal(input.adminPassword,'');
 const serialized=JSON.stringify([r,progress]);assert.ok(!serialized.includes('synthetic-root-only'));assert.ok(!serialized.includes('Hd2!'+'A'.repeat(43)));assert.ok(!f.state.calls.some(sql=>/^(INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/.test(sql)));
 assert.ok(f.state.calls.findIndex(s=>s.startsWith('CREATE USER'))<f.state.calls.findIndex(s=>s.startsWith('GRANT ')));assert.ok(f.state.calls.findIndex(s=>s.startsWith('GRANT '))<f.state.calls.findIndex(s=>s.includes('ACCOUNT UNLOCK')));
});
test('existing writer is never reset or granted automatically',async()=>{
 const f=fixture({writerExists:true});await assert.rejects(provision({mode:'apply',confirmed:true,input:rootInput(),...f}),{code:'EXISTING_WRITER_PRESERVED_USE_VERIFY'});assert.equal(f.state.secrets.length,0);assert.ok(f.state.calls.every(sql=>/^(SELECT|SHOW)/.test(sql)));
});
test('missing auth or raw logging blocks before account or grant changes',async()=>{
 for(const options of [{authExists:false},{rawLog:'ON'}]){const f=fixture(options);await assert.rejects(provision({mode:'apply',confirmed:true,input:rootInput(),...f}));assert.equal(f.state.writerExists,false);assert.equal(f.state.secrets.length,0);assert.ok(!f.state.calls.some(sql=>/^(CREATE|ALTER|GRANT)/.test(sql)));}
});
test('partial grant failure leaves new writer locked, reports partial outcome and never retries',async()=>{
 const f=fixture({failGrant:true});await assert.rejects(provision({mode:'apply',confirmed:true,input:rootInput(),...f}),e=>{assert.equal(e.safeReport.partialChangesPossible,true);assert.equal(e.safeReport.createdWriter,true);assert.equal(e.safeReport.automaticRetry,false);return true;});assert.equal(f.state.writerLocked,true);assert.ok(!f.state.calls.some(s=>s.includes('ACCOUNT UNLOCK')));
});
test('data drift stops before unlocking writer instead of claiming preservation',async()=>{
 const f=fixture({dataChanged:true});await assert.rejects(provision({mode:'apply',confirmed:true,input:rootInput(),...f}),{code:'ORDER_OR_USER_DATA_CHANGED_REQUIRES_REVIEW'});assert.equal(f.state.writerLocked,true);
});
test('Verify is read-only and validates existing DPAPI-backed non-root connections',async()=>{
 const f=fixture();await provision({mode:'apply',confirmed:true,input:rootInput(),...f});f.state.calls=[];const r=await provision({mode:'verify',input:rootInput(),...f});assert.equal(r.status,'VERIFIED_NO_WRITES');assert.equal(r.writerConnection,'PASS');assert.ok(f.state.calls.every(sql=>/^(SELECT|SHOW)/.test(sql)));
});
test('PowerShell protects both secret formats before provisioning and passes root through stdin only',()=>{
 const s=fs.readFileSync('scripts/provision-hdwork2-writer.ps1','utf8');assert.match(s,/Read-Host[^\n]+-AsSecureString/);assert.match(s,/FileMode\]::CreateNew/);assert.match(s,/Set-Acl -LiteralPath \$stagedFile/);assert.match(s,/\[IO.File\]::Move\(\$stagedFile,\$file\)/);assert.match(s,/ConvertFrom-SecureString/);assert.match(s,/DataProtectionScope\]::LocalMachine/);assert.match(s,/StandardInput.Write\(\$privateInput\)/);assert.match(s,/EnvironmentVariables.Clear/);assert.ok(s.indexOf('Write-PrivateNew $machineFile')<s.indexOf("Invoke-Writer '--apply-confirmed'"));assert.doesNotMatch(s,/Arguments=.*(?:adminPassword|writerPlain|privateInput)/i);
});
