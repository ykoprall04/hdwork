'use strict';
// Secrets arrive through stdin; this check performs SELECT/SHOW only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function run(){
 const root=path.resolve(process.argv[2]||'.');
 const env=JSON.parse(fs.readFileSync(path.join(root,'service/environment.json'),'utf8'));
 require(path.join(root,'src/config/persistent-auth')).validatePersistentAuth(env);
 require(path.join(root,'src/operations/testing-solver-scope')).configuration(env);
 let input='';for await(const b of process.stdin)input+=b;
 const secrets=JSON.parse(input);input='';
 Object.assign(process.env,env);
 const mysql=require('mysql2/promise');let auth,reader,writer;
 try{
  const connect=(user,password)=>mysql.createConnection({host:'127.0.0.1',port:3306,database:'hdwork2',user,password,connectTimeout:5000,multipleStatements:false,supportBigNumbers:true,bigNumberStrings:true,dateStrings:true});
  auth=await connect('hdwork_auth',secrets.authPassword);
  reader=await connect('hdwork_ops_read',secrets.readPassword);
  writer=await connect('hdwork_ops_write',secrets.writePassword);
  await require(path.join(root,'src/config/local-database-check')).checkRuntimeDatabases({authPool:auth,readPool:reader,operations:true});
  const [[identity]]=await writer.query('SELECT CURRENT_USER() AS account,DATABASE() AS db');
  if(identity.account!=='hdwork_ops_write@localhost'||identity.db!=='hdwork2')throw Error('WRITER_IDENTITY_REJECTED');
  const [grants]=await writer.query('SHOW GRANTS FOR CURRENT_USER');
  if(!require(path.join(root,'src/config/operational-grants')).reviewOperationalGrants(grants,'write').ok)throw Error('WRITER_GRANTS_REJECTED');
  const [rows]=await reader.query('SELECT * FROM hd2_orders ORDER BY id');
  const [outbox]=await writer.query('SELECT bot_id,state,COUNT(*) AS total FROM hd2_courier_outbox GROUP BY bot_id,state');
  const [accounts]=await auth.query('SELECT id,username,role,is_active,approval_status FROM users ORDER BY id');
  const result={status:'PASS',writer:identity.account,orderCount:rows.length,orderHash:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'),accounts:accounts.map(u=>({id:u.id,role:u.role,active:!!u.is_active,approved:u.approval_status==='APPROVED',trial:u.username==='trial_yanto'})),outbox,writesPerformed:false,checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(root,'service/state/preflight.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 }finally{for(const c of [auth,reader,writer])if(c)await c.end();for(const k of Object.keys(secrets))secrets[k]='';}
}
if(require.main===module)run().catch(e=>{console.log(JSON.stringify({status:'BLOCKED',code:/^[A-Z0-9_]+$/.test(e.code||e.message)?e.code||e.message:'PREFLIGHT_FAILED'}));process.exitCode=1;});
module.exports={run};
