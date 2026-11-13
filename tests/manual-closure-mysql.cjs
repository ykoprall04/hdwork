const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {start}=require('./helpers/temporary-courier-mysql.cjs');
const {record}=require('../src/courier/manual-closure-reconciliation');
const {validateAllowlist,hash}=require('../src/courier/administrative-closure');
async function main(){
 const parent=path.resolve(__dirname,'../.local');fs.mkdirSync(parent,{recursive:true});const f=await start(parent);let checks=0;
 try{
  await f.c.query('CREATE DATABASE hdwork2');await f.c.query('USE hdwork2');
  for(const sql of fs.readFileSync(path.resolve(__dirname,'../database/manual/004_hdwork2_courier.sql'),'utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await f.c.query(sql);
  await f.c.query('ALTER TABLE hd2_audit ADD COLUMN detail JSON NULL, MODIFY COLUMN inbox_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL');
  await f.c.query('ALTER TABLE hd2_courier_outbox ADD COLUMN administrative_closure JSON NULL');
  await f.c.query('CREATE TABLE hd2_courier_workers(bot_id VARCHAR(64) PRIMARY KEY,expires_ms BIGINT) ENGINE=InnoDB');
  const a={version:1,kind:'HDWORK2_ADMINISTRATIVE_CLOSURE_ALLOWLIST',decisionId:'DEC-20261113-01',operator:'Fixture',reason:'OPERATOR_NOT_PRIORITIZED',decisionReference:'isolated manual decision',botId:'fixture',cutoffCreatedAtUtc:'2026-01-11 00:00:00.000',queueCutoffCreatedAtUtc:'2026-01-09 00:00:00.000',expectedQueued:10,expectedDead:8,entries:Array.from({length:18},(_,i)=>({id:crypto.randomUUID(),createdAtUtc:'2026-01-09 00:00:00.000',state:i<10?'QUEUED':'DEAD',attempts:i<10?0:1,errorCode:i<10?null:'NETWORK',leaseUntilMs:null,leaseTokenPresent:false,routingDigest:'a'.repeat(64)}))};
  for(const e of a.entries)await f.c.execute("INSERT INTO hd2_courier_outbox(id,bot_id,idem_key,payload_hash,payload,state,attempts,last_error_code,due_ms,created_at) VALUES (?,'fixture',?,REPEAT('a',64),'{}','DEAD',?,?,0,?)",[e.id,e.id,e.attempts,e.errorCode,e.createdAtUtc]);
  await f.c.query("INSERT INTO hd2_courier_outbox(id,bot_id,idem_key,payload_hash,payload,state,due_ms) VALUES ('other','other-bot','other',REPEAT('a',64),'{}','QUEUED',0)");
  const snapshot=async()=>JSON.stringify((await f.c.query('SELECT * FROM hd2_courier_outbox ORDER BY id'))[0]);const before=await snapshot();
  const dry=await record(f.pool,{allowlist:a});assert.equal(await snapshot(),before);assert.equal(dry.recorded,0);checks++;
  await assert.rejects(record(f.pool,{allowlist:a,dryRun:false,expectedFingerprint:dry.fingerprint}),{code:'QUIESCENT_PAIRED_BACKUP_PROOF_REQUIRED'});checks++;
  const barrier={kind:'HDWORK2_CUTOVER_BARRIER',barrierId:crypto.randomUUID(),decisionId:a.decisionId,allowlistSha256:validateAllowlist(a),courierStopped:true,writersQuiesced:true,allOwnedPidsGone:true,backupPairVerified:true,backupReceiptSha256:'b'.repeat(64),observedAtUtc:new Date().toISOString()};
  const args={allowlist:a,dryRun:false,expectedFingerprint:dry.fingerprint,barrier};
  await assert.rejects(record(f.pool,{...args,expectedFingerprint:'c'.repeat(64)}),{code:'MANUAL_RECONCILIATION_PIN_REQUIRED'});checks++;
  await f.c.query("CREATE TRIGGER reject_audit BEFORE INSERT ON hd2_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture audit failure'");
  await assert.rejects(record(f.pool,args));assert.equal(await snapshot(),before);await f.c.query('DROP TRIGGER reject_audit');checks++;
  assert.equal((await record(f.pool,args)).recorded,18);const after=await snapshot();assert.equal((await record(f.pool,args)).duplicate,true);assert.equal(await snapshot(),after);checks++;
  const [[n]]=await f.c.query('SELECT COUNT(*) AS n FROM hd2_audit');assert.equal(n.n,18);checks++;
  const current=JSON.parse(after).map(r=>({...r,administrative_closure:null}));assert.equal(JSON.stringify(current),before);checks++;
  await f.c.execute("UPDATE hd2_courier_outbox SET attempts=attempts+1 WHERE id=?",[a.entries[0].id]);await assert.rejects(record(f.pool,args),{code:'MANUAL_METADATA_CHANGED'});checks++;
  const result={status:'ISOLATED_MYSQL_MANUAL_RECONCILIATION_PASS',checks,mysqlTcpDisabled:true,fixture:f.root,productionAccessed:false,telegramCalls:0};fs.writeFileSync(path.join(f.root,'manual-reconciliation-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await f.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
