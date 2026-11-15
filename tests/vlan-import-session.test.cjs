const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const mysql=require('mysql2/promise');
const {adapter}=require('../scripts/lib/vlan-import-session.cjs');
const {workbookRows,importRows}=require('../src/vlan/import');
test('VLAN adapter uses Web writer; identity gate and actual import on owned TCP-disabled MySQL',async()=>{
 fs.mkdirSync('.local',{recursive:true});const fixture=await require('./helpers/temporary-courier-mysql.cjs').start(path.resolve('.local'));
 try{
  await fixture.c.query('CREATE DATABASE hdwork2');await fixture.c.query('USE hdwork2');
  const sql=fs.readFileSync('database/manual/020_hdwork2_vlan_reference.sql','utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(s=>/^CREATE TABLE/i.test(s));
  for(const s of sql)await fixture.c.query(s);
  await fixture.c.query("CREATE USER 'hdwork_ops_write'@'localhost' IDENTIFIED BY 'fixture-only-password'");
  await fixture.c.query('GRANT SELECT,INSERT,UPDATE,DELETE ON hdwork2.hd2_vlan_reference TO \'hdwork_ops_write\'@\'localhost\'');
  const [[identity]]=await fixture.c.query('SELECT @@server_uuid AS uuid');
  const env={OP_WRITE_ENABLED:'true',OP_WRITE_DB_USER:'hdwork_ops_write',OP_WRITE_DB_NAME:'hdwork2',OP_WRITE_DB_HOST:'127.0.0.1',OP_WRITE_DB_PORT:'3306',OP_WRITE_DB_PASSWORD_DPAPI_FILE:'fixture-not-a-production-secret',HDWORK2_LOCAL_READ_ONLY:'false',HDWORK2_OPERATIONAL_WRITE_APPROVED:'true',VLAN_IMPORT_SERVER_UUID:identity.uuid};
  let connections=0;const createPool=opts=>{connections++;assert.equal(opts.user,'hdwork_ops_write');return mysql.createPool({...opts,host:undefined,port:undefined,socketPath:fixture.socketPath,authPlugins:{caching_sha2_password:require('mysql2').authPlugins.caching_sha2_password({overrideIsSecure:false})}});};
  const create=(overrides={})=>adapter({env,readSecret:async()=> 'fixture-only-password',createPool,...overrides}).create();
  const session=await create();try{
   const rows=await workbookRows('D:/VLAN_GABUNGAN (2).xlsx');assert.equal(rows.length,426);
   await importRows(session.pool,rows);await importRows(session.pool,rows);
   const [stored]=await fixture.c.query('SELECT ip_olt,wilayah,vlan_inet,vlan_voip FROM hd2_vlan_reference');
   const sorted=rs=>rs.map(r=>JSON.stringify([r.ip_olt,r.wilayah,r.vlan_inet,r.vlan_voip])).sort();assert.deepEqual(sorted(stored),sorted(rows));
  }finally{await session.close();}
  await assert.rejects(create({env:{...env,VLAN_IMPORT_SERVER_UUID:'wrong-server'}}),/VLAN_IMPORT_CONNECTION_REJECTED/);
  await assert.rejects(create({createPool:opts=>mysql.createPool({...opts,database:'mysql',socketPath:fixture.socketPath,authPlugins:{caching_sha2_password:require('mysql2').authPlugins.caching_sha2_password({overrideIsSecure:false})}})}),/VLAN_IMPORT_CONNECTION_REJECTED/);
  await assert.rejects(create({createPool:opts=>mysql.createPool({...opts,user:'root',password:'',socketPath:fixture.socketPath,authPlugins:{caching_sha2_password:require('mysql2').authPlugins.caching_sha2_password({overrideIsSecure:false})}})}),/VLAN_IMPORT_CONNECTION_REJECTED/);
  const before=connections;await assert.rejects(create({env:{...env,OP_WRITE_DB_USER:'hdwork_courier'}}),/VLAN_IMPORT_CONNECTION_REJECTED/);assert.equal(connections,before);
  await assert.rejects(create({readSecret:async()=>{throw Error('SECRET_MARKER');}}),e=>!e.message.includes('SECRET_MARKER'));
 }finally{await fixture.stop();}
});
test('import CLI default is preview; session without apply rejected before loading adapter',()=>{
 const {spawnSync}=require('node:child_process'),file='D:/VLAN_GABUNGAN (2).xlsx';
 const preview=spawnSync(process.execPath,['scripts/import-vlan.js','--file',file],{encoding:'utf8'});assert.equal(preview.status,0);assert.equal(JSON.parse(preview.stdout).writes,0);
 const rejected=spawnSync(process.execPath,['scripts/import-vlan.js','--file',file,'--session',path.resolve('scripts/lib/vlan-import-session.cjs')],{encoding:'utf8'});assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/VLAN_FILE_AND_EXPLICIT_APPLY_SESSION_REQUIRED/);
});
