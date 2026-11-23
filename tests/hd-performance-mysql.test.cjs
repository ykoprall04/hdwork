const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { digest } = require('../src/access/service');
const { performance, saveWeights } = require('../src/operations/hd-performance');
const { policies, reviewOperationalGrants } = require('../src/config/operational-grants');

test('performance grants remain optional, exact, and Web-only', () => {
  const grants = role => Object.entries(policies[role]).flatMap(([table, privileges]) =>
    privileges.map(privilege => ({ grant: `GRANT ${privilege} ON hdwork2.${table} TO 'fixture'@'localhost'` }))
  );
  const extra = text => ({ grant: `GRANT ${text} ON hdwork2.hd2_performance_weights TO 'fixture'@'localhost'` });
  assert.equal(reviewOperationalGrants(grants('read'), 'read').ok, true);
  assert.equal(reviewOperationalGrants([...grants('read'), extra('SELECT')], 'read').ok, true);
  assert.equal(reviewOperationalGrants([...grants('write'), extra('SELECT,UPDATE (done_weight, failed_weight, version)')], 'write').ok, true);
  assert.equal(reviewOperationalGrants([...grants('write'), extra('UPDATE')], 'write').ok, false);
  assert.equal(reviewOperationalGrants([...grants('courier'), extra('SELECT')], 'courier').ok, false);
});

test('MySQL 8.4: verified final actor, WIB boundaries, weighted totals and atomic audit', {
  skip: process.env.HD_PERFORMANCE_DISPOSABLE_DOCKER !== 'true', timeout: 120000
}, async () => {
  // This test creates its own container and port. It accepts no DB URL or credentials.
  const container = 'hdwork-performance-' + randomUUID();
  const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const sql = statement => execFileSync('docker', ['exec','-i',container,'mysql','-uroot','--batch','--skip-column-names','hdwork2'],
    { input: statement, encoding: 'utf8' }).trim();
  const pools = [];
  try {
    docker('run','-d','--rm','--name',container,'-e','MYSQL_ALLOW_EMPTY_PASSWORD=yes','-e','MYSQL_DATABASE=hdwork2','-p','127.0.0.1::3306','mysql:8.4');
    for (let attempt = 0; ; attempt++) {
      try {
        execFileSync('docker',['exec',container,'mysql','--protocol=TCP','-h127.0.0.1','-uroot','-e','SELECT 1','hdwork2'],{stdio:'ignore'});
        break;
      } catch (error) {
        if (attempt >= 45) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    const manual = name => readFileSync(path.resolve(__dirname,'../database/manual',name),'utf8');
    sql(manual('004_hdwork2_courier.sql') + manual('005_hdwork2_b2c_audit.sql') + manual('006_hdwork2_commands.sql') + manual('007_hdwork2_auth.sql') + manual('008_hdwork2_operations.sql'));
    sql(`CREATE USER 'hdwork_ops_read'@'localhost', 'hdwork_ops_write'@'localhost';
         CREATE USER 'perf_reader'@'%' IDENTIFIED BY 'fixture-read', 'perf_writer'@'%' IDENTIFIED BY 'fixture-write';`);
    const migration = manual('022_hdwork2_performance_weights.sql');
    sql(migration);
    // TCP fixture identities receive only the relevant exact privileges.
    sql(`
      GRANT SELECT ON hdwork2.hd2_performance_weights TO 'perf_reader'@'%';
      GRANT SELECT (id, name, role, is_active) ON hdwork2.users TO 'perf_reader'@'%';
      GRANT SELECT ON hdwork2.hd2_orders TO 'perf_reader'@'%';
      GRANT SELECT ON hdwork2.hd2_audit TO 'perf_reader'@'%';
      GRANT SELECT, UPDATE (done_weight, failed_weight, version) ON hdwork2.hd2_performance_weights TO 'perf_writer'@'%';
      GRANT SELECT (id, name, role, is_active) ON hdwork2.users TO 'perf_writer'@'%';
      GRANT SELECT ON hdwork2.hd2_sessions TO 'perf_writer'@'%';
      GRANT INSERT ON hdwork2.hd2_audit TO 'perf_writer'@'%';
      INSERT INTO users(id,username,name,password_hash,role,is_active) VALUES
        (1,'ami','Ami','fixture','HD',1),(2,'budi','Budi','fixture','HD',1),
        (3,'adminfixture','Admin Fixture','fixture','SUPER_ADMIN',1),
        (4,'zack','Zack','fixture','HD',1),(5,'inactive','Inactive','fixture','HD',0);
      INSERT INTO hd2_sessions(token_hash,user_id,expires_at) VALUES ('${digest('fixture-token')}',3,'2099-01-01');
    `);
    const port = Number(docker('port',container,'3306').trim().split(':').at(-1));
    const makePool = (user,password) => {
      const pool = mysql.createPool({host:'127.0.0.1',port,user,password,database:'hdwork2',timezone:'Z',connectionLimit:1});
      pools.push(pool);
      return pool;
    };
    const reader = makePool('perf_reader','fixture-read'), writer = makePool('perf_writer','fixture-write');
    const hd = { id:1, role:'HD', modules:['TIAL','REQ','LOGIC_MO','LOGIC_PSB'] };
    const admin = { ...hd, id:3, role:'SUPER_ADMIN' };
    function order({ command='order', status='DONE', actor=1, finish='2026-11-21 17:00:00', audit=true, auditActor=actor, auditTime=finish, repeats=1, id=randomUUID() } = {}) {
      const module={order:'TIAL',req:'TIAL',mo:'LOGIC_MO',config_psb:'LOGIC_PSB',assuren:'ASSUREN'}[command];
      let statement = `INSERT INTO hd2_orders(id,bot_id,module,business_day,chat_id,message_id,status,command,final_user_id,finished_at)
        VALUES ('${id}','fixture','${module}','2025-01-01','-1001','${id.slice(0,18)}','${status}','${command}',${actor ?? 'NULL'},'${finish}');`;
      if (audit) for (let index=0; index<repeats; index++) statement += `INSERT INTO hd2_audit(id,order_id,action,user_id,from_status,to_status,created_at)
        VALUES ('${randomUUID()}','${id}','${status}',${auditActor ?? 'NULL'},'IN_PROGRESS','${status}','${auditTime}');`;
      return statement;
    }
    const reopenedId = randomUUID();
    sql([
      order({ repeats:2, id:reopenedId }),
      order({ command:'config_psb',status:'FAILED',actor:2,finish:'2026-11-22 16:59:59.999' }),
      order({ command:'mo',finish:'2026-11-22 17:00:00' }),
      order({ command:'req',finish:'2026-11-21 16:59:59.999' }),
      order({ finish:'2025-03-01 12:00:00' }),
      order({ command:'assuren' }), order({ status:'IN_PROGRESS' }), order({ actor:5 }),
      order({ actor:null }), order({ audit:false }), order({ auditActor:2 }),
      order({ auditTime:'2026-11-21 16:59:59.999' })
    ].join('\n'));
    const query = { date:'2026-11-22',period:'daily',area:'ALL' };
    const data = await performance(reader,query,hd);
    assert.deepEqual(data.people.map(person=>person.name),['Ami','Budi','Zack']);
    assert.deepEqual(data.years,[2026,2025]);
    assert.deepEqual(data.totals,{ done:1,failed:1,points:2,active:3,average:2/3 });
    assert.deepEqual(data.people[0].commands.order,{ done:1,failed:0,points:1 });
    assert.deepEqual(data.people[1].commands.config_psb,{ done:0,failed:1,points:1 });
    assert.equal(data.people[2].points,0);
    const weekly = await performance(reader,{...query,period:'weekly'},hd);
    assert.deepEqual([weekly.from,weekly.to,weekly.totals.done],['2026-11-16','2026-11-22',2]);
    const monthly = await performance(reader,{...query,period:'monthly'},hd);
    assert.deepEqual([monthly.from,monthly.to,monthly.totals.done],['2026-11-01','2026-11-30',3]);
    assert.equal((await performance(reader,{...query,area:'TIAL'},hd)).totals.failed,0);
    assert.equal((await performance(reader,{...query,area:'LOGIC'},hd)).totals.done,0);
    assert.equal((await performance(reader,query,{...hd,modules:['TIAL']})).totals.points,1);
    await assert.rejects(performance(reader,query,{...hd,role:'SHOW_ONLY'}),{statusCode:403});
    await assert.rejects(performance(reader,{...query,date:'2026-02-30'},hd),{statusCode:400});
    const change={version:data.version,weights:{...data.weights,order:{done:2.5,failed:5},config_psb:{done:1,failed:0.75}}};
    await assert.rejects(saveWeights(writer,hd,'fixture-token',change),{statusCode:403});
    await assert.rejects(saveWeights(writer,admin,'wrong-token',change),{statusCode:401});
    await assert.rejects(saveWeights(writer,admin,'fixture-token',{...change,weights:{...change.weights,mo:{done:-1,failed:1}}}),{statusCode:400});
    sql("UPDATE users SET is_active=0 WHERE id=3;");
    await assert.rejects(saveWeights(writer,admin,'fixture-token',change),{statusCode:403});
    sql("UPDATE users SET is_active=1 WHERE id=3;");
    sql("CREATE TRIGGER fixture_audit_error BEFORE INSERT ON hd2_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture audit error';");
    await assert.rejects(saveWeights(writer,admin,'fixture-token',change),/fixture audit error/);
    assert.equal((await performance(reader,query,hd)).totals.points,2);
    sql('DROP TRIGGER fixture_audit_error;');
    const saved = await saveWeights(writer,admin,'fixture-token',change);
    assert.notEqual(saved.version,data.version);
    assert.equal((await performance(reader,query,hd)).totals.points,3.25);
    const previousYear = await performance(reader,{...query,date:'2025-03-01'},hd);
    assert.equal(previousYear.totals.points,2.5);
    await assert.rejects(saveWeights(writer,admin,'fixture-token',change),{statusCode:409});
    await saveWeights(writer,admin,'fixture-token',saved);
    const audit = sql("SELECT user_id,detail,created_at IS NOT NULL FROM hd2_audit WHERE action='HD_PERFORMANCE_WEIGHTS_CHANGED';").split('\t');
    assert.equal(audit[0],'3');
    assert.deepEqual(JSON.parse(audit[1]),{before:data.weights,after:change.weights});
    assert.equal(audit[2],'1');
    sql(migration);
    assert.equal((await performance(reader,query,hd)).totals.points,3.25);
    sql(`UPDATE hd2_orders SET status='IN_PROGRESS',final_user_id=NULL,finished_at=NULL WHERE id='${reopenedId}';`);
    assert.equal((await performance(reader,query,hd)).totals.done,0);
    sql(`UPDATE hd2_orders SET status='DONE',final_user_id=2,finished_at='2026-11-22 17:10:00' WHERE id='${reopenedId}';
      INSERT INTO hd2_audit(id,order_id,action,user_id,from_status,to_status,created_at)
      VALUES ('${randomUUID()}','${reopenedId}','DONE',2,'IN_PROGRESS','DONE','2026-11-22 17:10:00');`);
    assert.equal((await performance(reader,query,hd)).totals.done,0);
    const nextDay = await performance(reader,{...query,date:'2026-11-23'},hd);
    assert.equal(nextDay.people.find(person=>person.id==='2').commands.order.done,1);
    assert.equal(nextDay.totals.done,2);
    sql("UPDATE users SET is_active=0 WHERE role='HD';");
    assert.deepEqual((await performance(reader,query,hd)).totals,{done:0,failed:0,points:0,active:0,average:0});
  } finally {
    await Promise.all(pools.map(pool=>pool.end()));
    try { docker('stop',container); } catch {}
  }
});
