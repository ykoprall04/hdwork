// Explicit loopback disposable namespace only; no operational identity or database.
const assert=require('node:assert/strict');
async function run({env=process.env,argv=process.argv.slice(2)}={}){
 if(argv.join(' ')!=='--run-metadata-disposable')throw Error('METADATA_TEST_DISABLED');const guard=require('../../ops/mysql/disposable-guard'),options=guard.config(env,['--run-disposable']),c=await require('mysql2/promise').createConnection(options);
 try{
  await guard.verifyTarget(c,options.database);
  const first=require('../helpers/e2e-contracts.cjs').schemaStatements(['012_hdwork2_system_monitoring.sql'])[0];assert.match(first,/^CREATE TABLE hd2_system_mappings/);await c.query(first);
  const {metadataSql,migration}=require('../../scripts/backup-shared-group-metadata');
  await assert.rejects(c.query(metadataSql.columns.replace('AS `precision`','AS precision')),{code:'ER_PARSE_ERROR',errno:1064});
  const [columns]=await c.query(metadataSql.columns),[checks]=await c.query(metadataSql.checks);assert.equal(columns.length,11);assert.equal(checks.length,1);
  const candidate=migration(checks,columns.map(c=>c.name));assert.equal(candidate.status,'REQUIRED');
  const parts=candidate.sql.split(';').map(s=>s.trim()).filter(Boolean);assert.equal(parts.shift(),'USE hdwork2');assert.equal(parts.length,1);assert.match(parts[0],/^ALTER TABLE hd2_system_mappings/);await c.query(parts[0]);
  const [after]=await c.query(metadataSql.columns),[afterChecks]=await c.query(metadataSql.checks);assert.equal(migration(afterChecks,after.map(c=>c.name)).status,'ALREADY_PRESENT');
  const boundary=after.find(c=>c.name==='blocked_before');assert.equal(Number(boundary.precision),3);assert.equal(boundary.nullable,'YES');
  return {status:'MAPPING_METADATA_MYSQL84_PASS',original1064Reproduced:true,quotedAliasesPass:true,migration014ContractPass:true,productionAccessed:false,telegramAccessed:false};
 }finally{await c.end();}
}
if(require.main===module)run().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
module.exports={run};
