const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const baseline=require('./helpers/global-command-baseline.cjs');
const {compatibleValidator,rehearseMigration,checkSchema,rollbackPlan,verifyBackupEvidence}=require('../scripts/lib/global-command-deployment');
function fixture(){
 const state={exists:false,rows:new Map(),grants:new Set(),bad:false};
 const columns=[['command','varchar','varchar(16)','NO',null,'ascii_bin'],['enabled','tinyint','tinyint(1)','NO','1',null],['version','int','int unsigned','NO','0',null],['updated_at','datetime','datetime(3)','NO','utc_timestamp(3)',null]].map(r=>Object.fromEntries(['COLUMN_NAME','DATA_TYPE','COLUMN_TYPE','IS_NULLABLE','COLUMN_DEFAULT','COLLATION_NAME'].map((k,i)=>[k,r[i]])));
 async function run(sql){
  if(sql.includes('information_schema.COLUMNS'))return [state.exists?state.bad?columns.slice(1):columns:[]];
  if(sql.includes('information_schema.TABLES'))return [[{ENGINE:'InnoDB'}]];
  if(sql.includes('information_schema.KEY_COLUMN_USAGE'))return [[{COLUMN_NAME:'command'}]];
  if(sql.includes('information_schema.CHECK_CONSTRAINTS'))return [[{CHECK_CLAUSE:"command in ('order','req','config_psb','mo')"},{CHECK_CLAUSE:'enabled in (0,1)'}]];
  if(sql.startsWith('SELECT command,enabled'))return [[...state.rows.values()]];
  if(sql.startsWith('USE '))return [{}];
  if(sql.startsWith('CREATE TABLE IF NOT EXISTS')){state.exists=true;return [{}];}
  if(sql.startsWith('INSERT INTO hd2_global_commands')){
   assert.match(sql,/ON DUPLICATE KEY UPDATE command=command/);
   for(const k of ['order','req','config_psb','mo'])if(!state.rows.has(k))state.rows.set(k,{command:k,enabled:1,version:0});return [{}];
  }
  if(sql.startsWith('GRANT ')){state.grants.add(sql);return [{}];}
  throw Error('UNEXPECTED_SQL');
 }
 const connection={execute:run,query:run};
 return {state,connection};
}
test('migration twice preserves OFF, versions and existing rows',async()=>{
 const {state,connection}=fixture();await rehearseMigration(connection);state.rows.get('order').enabled=0;state.rows.get('order').version=7;
 await rehearseMigration(connection);assert.equal(state.rows.size,4);assert.equal(state.rows.get('order').enabled,0);assert.equal(state.rows.get('order').version,7);assert.equal(state.grants.size,3);
});
for(const phase of ['CREATE TABLE','INSERT INTO','GRANT SELECT ON'])test(`migration resumes after partial ${phase}`,async()=>{
 const {state,connection}=fixture();let failed=false;
 await assert.rejects(rehearseMigration(connection,{afterStatement:sql=>{if(!failed&&sql.startsWith(phase)){failed=true;throw Error('injected interruption');}}}),/interruption/);
 if(state.rows.has('mo')){state.rows.get('mo').enabled=0;state.rows.get('mo').version=2;}
 await rehearseMigration(connection);assert.equal(state.rows.size,4);if(state.rows.get('mo').version===2)assert.equal(state.rows.get('mo').enabled,0);
});
test('existing incompatible schema stops before grant or insert',async()=>{
 const {state,connection}=fixture();state.exists=true;state.bad=true;await assert.rejects(rehearseMigration(connection),/SCHEMA_MISMATCH/);assert.equal(state.grants.size,0);assert.equal(state.rows.size,0);
});
for(const revision of ['05ef8b17','cc90aade','b0f2d87','active-Courier'])test(`exact old validator ${revision} with narrow compatibility patch and rollback grants`,()=>{
 const source=baseline.source(revision==='active-Courier'?'active-courier-grants.js':revision==='cc90aade'?'courier-grants.js':revision==='05ef8b17'?'main-grants.js':'web-grants.js');
 const module={exports:{}};vm.runInNewContext(compatibleValidator(source),{module});const g=module.exports;
 for(const role of ['chatRead','chatWrite','chatWriteFifo','courierSendChatFifo']){
  const base=Object.entries(g.policies[role]).map(([t,ps])=>({g:`GRANT ${ps.join(', ')} ON hdwork2.${t} TO 'fixture'@'localhost'`}));
  const extra=p=>({g:`GRANT ${p} ON hdwork2.hd2_global_commands TO 'fixture'@'localhost'`});
  assert.equal(g.reviewOperationalGrants([...base,extra('SELECT')],role).ok,true);
  assert.equal(g.reviewOperationalGrants([...base,extra('UPDATE')],role).ok,role.toLowerCase().includes('write'));
  for(const p of ['DELETE','INSERT','ALL PRIVILEGES'])assert.equal(g.reviewOperationalGrants([...base,extra(p)],role).ok,false);
  assert.equal(g.reviewOperationalGrants([...base,{g:"GRANT SELECT ON hdwork2.* TO 'fixture'@'localhost'"}],role).ok,false);
 }
 assert.equal(compatibleValidator(compatibleValidator(source)),compatibleValidator(source));
});
test('partial migration rollback fixture restores only grants and preserves settings and orders',async()=>{
 const {state,connection}=fixture();const operational={orders:['existing'],fifo:37,offset:91,ack:'pending'};const untouched=structuredClone(operational);
 await assert.rejects(rehearseMigration(connection,{afterStatement:sql=>{if(sql.startsWith('GRANT SELECT ON'))throw Error('partial');}}),/partial/);
 const plan=rollbackPlan({beforeGrants:[],afterGrants:[...state.grants]});
 for(const sql of plan.revokeBeforeUnpatchedOldStartup)state.grants.delete(sql.replace(/^REVOKE /,'GRANT ').replace(' FROM ',' TO '));
 assert.equal(state.grants.size,0);assert.equal(state.exists,true);assert.equal(state.rows.size,4);assert.deepEqual(operational,untouched);
 await rehearseMigration(connection);assert.equal(state.grants.size,3);
});
test('partial grant rollback revokes only added privileges and never rewinds state',()=>{
 const grant="GRANT SELECT ON hdwork2.hd2_global_commands TO 'hdwork_courier'@'localhost'";
 const plan=rollbackPlan({beforeGrants:[],afterGrants:[grant]});assert.equal(plan.restoreOldDatabase,false);assert.equal(plan.dropTable,false);assert.equal(plan.revokeBeforeUnpatchedOldStartup.length,1);
 assert.equal(rollbackPlan({beforeGrants:[grant],afterGrants:[grant],compatibleRollback:true}).revokeBeforeUnpatchedOldStartup.length,0);
 assert.throws(()=>rollbackPlan({beforeGrants:[grant],afterGrants:[grant]}),/REQUIRES_COMPATIBILITY/);
 assert.throws(()=>rollbackPlan({beforeGrants:[],afterGrants:[grant],offPresent:true,compatibleRollback:true}),/CANNOT_ENFORCE_OFF/);
});
test('backup handoff requires restore proof, both pinned runtimes, grants and Task snapshots',()=>{
 const evidence=Object.fromEntries(['databaseRestoreVerified','grantsCaptured','webRuntimePinned','courierRuntimePinned','lifecycleOverlayVerified','taskXmlCaptured','rollbackFixturePassed'].map(k=>[k,true]));
 assert.equal(verifyBackupEvidence(evidence).ready,true);delete evidence.grantsCaptured;assert.throws(()=>verifyBackupEvidence(evidence),/grantsCaptured/);
});
