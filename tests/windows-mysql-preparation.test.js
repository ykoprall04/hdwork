const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {config,validateGrants,migrationStatements,verifyTarget}=require('../ops/mysql/disposable-guard');
const {run}=require('./integration/mysql-disposable.cjs');
const db='hdwork2_test_0123456789abcdef';
const env=()=>({HDWORK2_MYSQL_TEST_ENABLE:'DISPOSABLE_ONLY',HDWORK2_MYSQL_TEST_HOST:'127.0.0.1',HDWORK2_MYSQL_TEST_PORT:'3307',HDWORK2_MYSQL_TEST_DATABASE:db,HDWORK2_MYSQL_TEST_USER:'hdwork2_test_runner',HDWORK2_MYSQL_TEST_PASSWORD:'synthetic-test-password-only'});
const grants=(literal=false)=>[{'Grants':"GRANT USAGE ON *.* TO `hdwork2_test_runner`@`localhost`"},{'Grants':`GRANT ALL PRIVILEGES ON \`${literal?db:db.replace(/_/g,'\\_')}\`.* TO \`hdwork2_test_runner\`@\`localhost\``}];
function connection({database=db,version='8.0.44',grant=grants(),tables=[],partialRevokes='OFF'}={}) {
 const calls=[];return {calls,async query(sql){calls.push(sql);if(sql.startsWith('SELECT DATABASE'))return [[{db:database,version}]];if(sql.startsWith('SHOW GRANTS'))return [grant];if(sql.startsWith('SHOW VARIABLES'))return [[{Value:partialRevokes}]];if(sql==='SHOW FULL TABLES')return [tables];throw Error('No write allowed in target verification mock');},release(){}};
}
test('no opt-in or unsafe database/host/port/account is rejected before driver load',async()=>{
 let loaded=0;const driverFactory=()=>{loaded++;throw Error('No connection permitted');};
 for(const args of [[],['--run-disposable','extra'],['--run']])await assert.rejects(run({env:env(),argv:args,driverFactory}));
 for(const database of ['hdwork2','hd_b2c','hdwork','legacy','mysql','information_schema','HDWORK2_TEST_0123456789abcdef','hdwork2_test_abc','hdwork2_test_0123456789abcdef;DROP DATABASE hdwork2'])await assert.rejects(run({env:{...env(),HDWORK2_MYSQL_TEST_DATABASE:database},argv:['--run-disposable'],driverFactory}));
 for(const change of [{HDWORK2_MYSQL_TEST_ENABLE:'true'},{HDWORK2_MYSQL_TEST_HOST:'localhost'},{HDWORK2_MYSQL_TEST_HOST:'192.0.2.1'},{HDWORK2_MYSQL_TEST_PORT:'3306'},{HDWORK2_MYSQL_TEST_PORT:'65536'},{HDWORK2_MYSQL_TEST_USER:'root'},{HDWORK2_MYSQL_TEST_PASSWORD:''},{DB_USER:'hdwork2_test_runner'}])await assert.rejects(run({env:{...env(),...change},argv:['--run-disposable'],driverFactory}));
 assert.equal(loaded,0);const valid=config(env(),['--run-disposable']);assert.equal(valid.database,db);assert.equal(valid.multipleStatements,false);assert.equal(valid.connectionLimit,3);
});
test('grant scope cannot include global grants, role grants, wildcards, other schemas or grant option',()=>{
 validateGrants(grants(),db);assert.throws(()=>validateGrants(grants(true),db));validateGrants(grants(true),db,true);
 for(const grant of [[],[{'g':'GRANT SELECT ON *.* TO `u`@`localhost`'}],[{'g':'GRANT `operator`@`%` TO `u`@`localhost`'}],[{'g':'GRANT ALL PRIVILEGES ON `hdwork2`.* TO `u`@`localhost`'}],[{'g':'GRANT ALL PRIVILEGES ON `hdwork2_test_%`.* TO `u`@`localhost`'}],[{'g':`GRANT ALL PRIVILEGES ON \`${db}\`.* TO \`u\`@\`localhost\` WITH GRANT OPTION`}],[{'g':'GRANT USAGE ON *.* TO `u`@`localhost`'}]])assert.throws(()=>validateGrants(grant,db));
});
test('server metadata must confirm MySQL 8.0.13+, exact database and no existing tables/views',async()=>{
 for(const change of [{database:'hdwork2'},{version:'5.7.44'},{version:'8.0.12'},{version:'10.11.0-MariaDB'},{version:'8.0.44-MariaDB'},{tables:[{table:'existing'}]}])await assert.rejects(verifyTarget(connection(change),db));
 const c=connection();await verifyTarget(c,db);assert.deepEqual(c.calls,['SELECT DATABASE() AS db, VERSION() AS version',"SHOW VARIABLES LIKE 'partial_revokes'",'SHOW GRANTS FOR CURRENT_USER','SHOW FULL TABLES']);
 await verifyTarget(connection({version:'8.4.3'}),db);await verifyTarget(connection({partialRevokes:'ON',grant:grants(true)}),db);
});
test('target mismatch or grants failure closes pool and executes no migration',async()=>{
 for(const change of [{database:'hd_b2c'},{grant:[{'g':'GRANT SELECT ON *.* TO `u`@`localhost`'}]},{tables:[{table:'legacy'}]}]){
  const c=connection(change);let closed=false;
  await assert.rejects(run({env:env(),argv:['--run-disposable'],driverFactory:()=>({createPool:()=>({async getConnection(){return c;},async end(){closed=true;}})})}));
  assert.equal(closed,true);assert.equal(c.calls.some(sql=>/CREATE|ALTER|INSERT|UPDATE|DROP|USE /.test(sql)),false);
 }
});
test('manual migrations are transformed only by removing the exact source USE directive',()=>{
 const statements=migrationStatements();assert.equal(statements.length,8);
 assert.equal(statements.filter(s=>s.startsWith('CREATE TABLE hd2_')).length,6);
 assert.match(statements.at(-1),/^ALTER TABLE hd2_audit ADD COLUMN detail JSON NULL$/);
 for(const sql of statements)assert.doesNotMatch(sql,/\bUSE\b|\bDROP\b|\bTRUNCATE\b|hd_b2c\.|hdwork2\./i);
 const root=fs.readFileSync('tests/integration/mysql-disposable.cjs','utf8');assert.doesNotMatch(root,/createDatabase|DROP DATABASE|process\.env\.DB_PASSWORD|require\(['"]dotenv/);
});
test('PM2 template is inert, API-only, limited and requires isolated home/log paths',()=>{
 const source=fs.readFileSync('ops/windows/ecosystem.hdwork2.config.cjs','utf8');
 function load(env){const module={exports:{}};vm.runInNewContext(source,{module,process:{env},__dirname:path.resolve('ops/windows'),require:name=>{assert.equal(name,'node:path');return path;}});return module.exports;}
 assert.throws(()=>load({}));assert.throws(()=>load({HDWORK2_LOG_DIR:'C:\\private\\logs',PM2_HOME:'C:\\Users\\old\\.pm2'}));
 const cfg=load({HDWORK2_LOG_DIR:'C:\\HDWork2Private\\logs',PM2_HOME:'C:\\HDWork2Private\\hdwork2-pm2'});assert.equal(cfg.apps.length,1);
 const app=cfg.apps[0];assert.equal(app.script,'api-only-server.js');assert.equal(app.instances,1);assert.equal(app.max_memory_restart,'256M');assert.equal(app.env.COURIER_ENABLED,'false');assert.equal(app.env.B2C_WORKFLOW_READ_ENABLED,'false');
 assert.equal(Object.keys(app.env).some(k=>/PASSWORD|SECRET|TOKEN/.test(k)),false);
});
test('preflight has no service mutation or environment reads and remote targets cannot be supplied',()=>{
 const ps=fs.readFileSync('ops/windows/preflight.ps1','utf8').replace(/^\s*#.*$/gm,'');
 assert.doesNotMatch(ps,/Start-Process|Start-Service|Stop-Service|Restart-Service|Register-ScheduledTask|Set-Content|Get-Content|\bpm2\s|\.env\s*['"]|Invoke-WebRequest/i);
 assert.match(ps,/\[switch\]\$CheckMySqlMetadata/);assert.match(ps,/SELECT VERSION\(\), DATABASE\(\)/);assert.match(ps,/--host=127\.0\.0\.1/);assert.match(ps,/--database=hdwork2/);assert.doesNotMatch(ps,/["']--password/);
 const task=fs.readFileSync('ops/windows/hdwork2-api.task.xml.example','utf8');assert.match(task,/<Enabled>false<\/Enabled>/);assert.match(task,/REPLACE_WITH_DEDICATED_LOCAL_ACCOUNT/);
 const start=fs.readFileSync('ops/windows/start-api-task.ps1','utf8');assert.match(start,/if \(-not \$ApprovedStart\)/);assert.doesNotMatch(start,/['"](?:\.\\)?server\.js['"]|--watch|polling/i);
});
