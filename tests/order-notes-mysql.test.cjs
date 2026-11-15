// Explicit isolated suite: fresh owned datadir + random named pipe, no TCP/production config.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {start}=require('./helpers/temporary-courier-mysql.cjs');
const {createNotes}=require('../src/operations/order-notes');
const {digest}=require('../src/access/service');
const migration=fs.readFileSync(path.join(__dirname,'../database/manual/019_hdwork2_order_notes.sql'),'utf8');
// Respect the actual mysql client DELIMITER directives, never split routine bodies on semicolons.
function statements(source){
 let delimiter=';',buffer='',result=[];
 for(const line of source.split(/\r?\n/)){
  if(/^\s*--/.test(line)||!line.trim())continue;
  const directive=/^DELIMITER (.+)$/.exec(line);if(directive){assert.equal(buffer.trim(),'');delimiter=directive[1];continue;}
  buffer+=line+'\n';if(buffer.trimEnd().endsWith(delimiter)){result.push(buffer.trimEnd().slice(0,-delimiter.length).trim());buffer='';}
 }
 assert.equal(buffer.trim(),'');return result;
}
const sql=statements(migration);
async function apply(c){for(const statement of sql)await c.query(statement);}
test('MySQL 8.4 isolated notes migration and backend, including real locks and grants',{timeout:180000},async t=>{
 const parent=path.resolve(__dirname,'../.local');fs.mkdirSync(parent,{recursive:true});
 const f=await start(parent),c=f.c,pool=f.pool,id=randomUUID(),user={id:1,role:'HD',username:'fixture',modules:['TIAL']},token='synthetic-notes-session';
 try{
  const [[server]]=await c.query('SELECT VERSION() AS version');assert.match(server.version,/^8\.4\./);
  t.diagnostic('Isolated MySQL '+server.version+'; TCP disabled, private named pipe');
  // Non-Unicode database default deliberately exercises explicit notes charset.
  await c.query('CREATE DATABASE hdwork2 CHARACTER SET latin1');await c.query('USE hdwork2');
  await c.query('CREATE TABLE users(id BIGINT UNSIGNED PRIMARY KEY,role VARCHAR(20),is_active BOOLEAN) ENGINE=InnoDB');
  await c.query("CREATE TABLE hd2_orders(id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,access_module VARCHAR(20),status VARCHAR(20),version BIGINT UNSIGNED) ENGINE=InnoDB");
  await c.query('CREATE TABLE hd2_sessions(token_hash CHAR(64) PRIMARY KEY,user_id BIGINT UNSIGNED,revoked BOOLEAN DEFAULT FALSE,expires_at DATETIME(3)) ENGINE=InnoDB');
  await c.query('CREATE TABLE hd2_user_modules(user_id BIGINT UNSIGNED,module VARCHAR(20),PRIMARY KEY(user_id,module)) ENGINE=InnoDB');
  await c.query('CREATE TABLE hd2_live_events(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,module VARCHAR(20),kind VARCHAR(20)) ENGINE=InnoDB');
  await c.query("INSERT INTO users VALUES(1,'HD',TRUE),(2,'HD',TRUE)");
  await c.execute("INSERT INTO hd2_orders VALUES(?,'TIAL','IN_PROGRESS',7)",[id]);
  await c.query("INSERT INTO hd2_user_modules VALUES(1,'TIAL'),(2,'TIAL')");
  for(const number of [1,2])await c.execute('INSERT INTO hd2_sessions(token_hash,user_id,expires_at) VALUES (?,?,TIMESTAMPADD(HOUR,1,UTC_TIMESTAMP(3)))',[digest(token+number),number]);
  await c.query("CREATE USER 'hdwork_ops_read'@'localhost'");
  const oldRows=JSON.stringify((await c.query('SELECT * FROM hd2_orders'))[0]);
  const limits=async connection=>(await connection.query('SELECT @@SESSION.lock_wait_timeout AS metadataTimeout,@@SESSION.innodb_lock_wait_timeout AS rowTimeout'))[0][0];
  const beforeLimits=await limits(c);
  await t.test('first attempt creates valid table; missing writer account fails GRANT after reader grant, no data loss',async()=>{
   await assert.rejects(apply(c),error=>error.errno===1410||error.errno===1133);
   assert.deepEqual(await limits(c),beforeLimits);
   const [columns]=await c.query("SELECT COLUMN_NAME,CHARACTER_SET_NAME,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME='hd2_order_notes'");
   assert.equal(columns.find(r=>r.COLUMN_NAME==='body').CHARACTER_SET_NAME,'utf8mb4');
   assert.equal(columns.find(r=>r.COLUMN_NAME==='order_id').COLLATION_NAME,'ascii_bin');
   const [grants]=await c.query("SHOW GRANTS FOR 'hdwork_ops_read'@'localhost'");assert.match(JSON.stringify(grants),/SELECT.*hd2_order_notes/);
   await c.execute('INSERT INTO hd2_order_notes(order_id,body,updated_by) VALUES (?,?,1)',[id,'partial run preserved']);
   assert.equal(JSON.stringify((await c.query('SELECT * FROM hd2_orders'))[0]),oldRows);
  });
  await t.test('retry resumes grants, preserves existing notes; another full run is idempotent and removes helper',async()=>{
   await c.query("CREATE USER 'hdwork_ops_write'@'localhost'");await apply(c);await apply(c);
   const [[row]]=await c.execute('SELECT body FROM hd2_order_notes WHERE order_id=?',[id]);assert.equal(row.body,'partial run preserved');
   const [grants]=await c.query("SHOW GRANTS FOR 'hdwork_ops_write'@'localhost'");assert.match(JSON.stringify(grants),/SELECT, INSERT, UPDATE.*hd2_order_notes/);
   const [[routine]]=await c.query("SELECT COUNT(*) AS n FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='hdwork2' AND ROUTINE_NAME='hd2_migrate_order_notes_019'");assert.equal(Number(routine.n),0);
   assert.deepEqual(await limits(c),beforeLimits);
  });
  const notes=createNotes({readPool:pool,writePool:pool});
  await t.test('backend round-trips Unicode/emoji, FK rejects orphans, transaction restores pooled session limits',async()=>{
   const text='Catatan \u65e5\u672c\u8a9e \ud83d\ude80 \ud83d\udc4d\ud83c\udffd';
   await notes.save(id,token+1,user,{text});assert.equal((await notes.list(id,user)).data[0].text,text);
   const session=await pool.getConnection();try{assert.deepEqual(await limits(session),beforeLimits);}finally{session.release();}
   await assert.rejects(c.execute('INSERT INTO hd2_order_notes(order_id,body,updated_by) VALUES (?,?,1)',[randomUUID(),'orphan']),{errno:1452});
   await assert.rejects(c.execute('UPDATE hd2_order_notes SET updated_by=999 WHERE order_id=?',[id]),{errno:1452});
  });
  await t.test('simultaneous backend saves serialize: one row, coherent text/author; last successful save persists',async()=>{
   const bodies=Array.from({length:8},(_,i)=>({actor:i%2+1,text:'Concurrent '+i+' \ud83d\ude80'}));
   await Promise.all(bodies.map(({actor,text})=>notes.save(id,token+actor,{...user,id:actor},{text})));
   const [rows]=await c.query('SELECT body,updated_by FROM hd2_order_notes');assert.equal(rows.length,1);
   assert.ok(bodies.some(body=>body.text===rows[0].body&&body.actor===Number(rows[0].updated_by)));
   await notes.save(id,token+1,user,{text:'final'});assert.equal((await notes.list(id,user)).data[0].text,'final');
   assert.equal(JSON.stringify((await c.query('SELECT * FROM hd2_orders'))[0]),oldRows);
  });
  await t.test('actual row contention times out, rolls back, and restores pooled settings without overwriting notes',async()=>{
   const blocker=await pool.getConnection();await blocker.beginTransaction();await blocker.execute('SELECT order_id FROM hd2_order_notes WHERE order_id=? FOR UPDATE',[id]);
   const began=Date.now();try{await assert.rejects(notes.save(id,token+1,user,{text:'must not persist'}),{errno:1205});assert.ok(Date.now()-began<12000);}finally{await blocker.rollback();blocker.release();}
   assert.equal((await notes.list(id,user)).data[0].text,'final');
   const session=await pool.getConnection();try{assert.deepEqual(await limits(session),beforeLimits);}finally{session.release();}
  });
  await t.test('existing schema drift is rejected before GRANT and without modifying notes',async()=>{
   await c.query("REVOKE SELECT ON hdwork2.hd2_order_notes FROM 'hdwork_ops_read'@'localhost'");
   await c.query('ALTER TABLE hd2_order_notes ADD unexpected INT');
   await assert.rejects(apply(c),/019: incompatible notes table/);
   const [grants]=await c.query("SHOW GRANTS FOR 'hdwork_ops_read'@'localhost'");assert.doesNotMatch(JSON.stringify(grants),/hd2_order_notes/);
   const [[row]]=await c.query('SELECT body FROM hd2_order_notes');assert.equal(row.body,'final');assert.deepEqual(await limits(c),beforeLimits);
   // Preserve the entire deliberately incompatible fixture, including all data.
   // A fresh target then exercises first creation with both Web accounts present.
   await c.query('RENAME TABLE hd2_order_notes TO hd2_order_notes_fixture_archive');
  });
  await t.test('metadata contention bounds first CREATE; retry succeeds fresh, with fixture data preserved',async()=>{
   const blocker=await pool.getConnection();await blocker.query('LOCK TABLES hd2_orders WRITE');
   const began=Date.now();try{await assert.rejects(apply(c),{errno:1205});assert.ok(Date.now()-began<12000);}finally{await blocker.query('UNLOCK TABLES');blocker.release();}
   assert.deepEqual(await limits(c),beforeLimits);await apply(c);await apply(c);
   assert.equal((await notes.list(id,user)).data[0].text,'');
   const [[archived]]=await c.query('SELECT body FROM hd2_order_notes_fixture_archive');assert.equal(archived.body,'final');
  });
  await t.test('compatible original table shape is accepted; non-utf8mb4 existing body is rejected before grants',async()=>{
   await c.query('RENAME TABLE hd2_order_notes TO hd2_order_notes_fresh_archive');
   // Same shape as 57574e2 on a utf8mb4 database: auto-created FK index,
   // a different utf8mb4 collation and no extra column/index requirements.
   await c.query(`CREATE TABLE hd2_order_notes (
    order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    body TEXT NOT NULL,updated_by BIGINT UNSIGNED NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
    FOREIGN KEY(order_id) REFERENCES hd2_orders(id),FOREIGN KEY(updated_by) REFERENCES users(id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
   await c.execute('INSERT INTO hd2_order_notes(order_id,body,updated_by) VALUES (?,?,1)',[id,'compatible data']);
   await apply(c);assert.equal((await notes.list(id,user)).data[0].text,'compatible data');
   // Intentional fixture drift, preserving its ASCII text; migration must refuse it.
   await c.query('ALTER TABLE hd2_order_notes MODIFY body TEXT CHARACTER SET latin1 NOT NULL');
   await c.query("REVOKE SELECT ON hdwork2.hd2_order_notes FROM 'hdwork_ops_read'@'localhost'");
   await assert.rejects(apply(c),/019: incompatible notes table/);
   const [grants]=await c.query("SHOW GRANTS FOR 'hdwork_ops_read'@'localhost'");assert.doesNotMatch(JSON.stringify(grants),/hd2_order_notes/);
   const [[preserved]]=await c.query('SELECT body FROM hd2_order_notes');assert.equal(preserved.body,'compatible data');
   assert.deepEqual(await limits(c),beforeLimits);
  });
 }finally{await f.stop();}
});
