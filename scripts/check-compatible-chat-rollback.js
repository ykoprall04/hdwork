// Native MySQL pool initialization only; no web listener, worker, DML or Telegram call.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {hash}=require('./apply-live-chat-web-overlay');
async function run({prepared,planSha256,input=process.stdin,connectPool,bootstrap=require('./office-web-service').bootstrap,report=value=>console.log(JSON.stringify(value,null,2))}={}){
 const raw=fs.readFileSync(path.join(prepared,'production-plan.review.json'));
 if(hash(raw)!==planSha256)throw Error('ROLLBACK_PLAN_CHANGED');
 const plan=JSON.parse(raw),rawEnv=fs.readFileSync(path.join(prepared,'backup/service/environment.json'));
 if(hash(fs.readFileSync(path.resolve(__dirname,'../src/config/operational-grants.js')))!==plan.rollback.grantPolicySha256)throw Error('ROLLBACK_GRANT_POLICY_CHANGED');
 if(hash(rawEnv)!==plan.environmentSha256)throw Error('ROLLBACK_ENV_CHANGED');
 const env=JSON.parse(rawEnv);require('../src/config/persistent-auth').validatePersistentAuth(env);
 const entry=plan.entries.find(e=>e.file==='src/config/operational-pools.js'),poolSource=fs.readFileSync(path.join(prepared,'backup',entry.file));
 if(hash(poolSource)!==entry.before||env.HDWORK2_TESTING_SOLVER_ENABLED!=='false'||env.OP_READ_DB_PASSWORD_DPAPI_FILE===env.OP_WRITE_DB_PASSWORD_DPAPI_FILE)throw Error('ROLLBACK_POOL_OR_TRIAL_CHANGED');
 const mod={exports:{}};
 vm.runInNewContext(poolSource.toString('utf8'),{module:mod,process:{env:{}},require:name=>{if(name==='./operational-grants')return require('../src/config/operational-grants');throw Error('UNREVIEWED_POOL_DEPENDENCY');}});
 const secrets=await bootstrap(input,{validate:v=>{if(!v||Object.keys(v).sort().join(',')!=='readPassword,writePassword'||!['readPassword','writePassword'].every(k=>typeof v[k]==='string'&&v[k]))throw Error('POOL_SECRET_SCOPE_REJECTED');return v;}});
 const allowed=new Set(['SELECT DATABASE() AS db,CURRENT_USER() AS account','SHOW GRANTS FOR CURRENT_USER','SELECT component,status,checked_at FROM hd2_system_state LIMIT 0','SELECT delivered_at FROM hd2_courier_outbox LIMIT 0','SELECT id,order_id FROM hd2_chat_messages LIMIT 0']);
 const create=connectPool||require('mysql2/promise').createPool;let manager;
 try{
  manager=mod.exports.createManager({env,readSecret:async file=>{if(file===env.OP_READ_DB_PASSWORD_DPAPI_FILE)return secrets.readPassword;if(file===env.OP_WRITE_DB_PASSWORD_DPAPI_FILE)return secrets.writePassword;throw Error('POOL_SECRET_REFERENCE_REJECTED');},createPool:opts=>{
   const raw=create(opts);const query=(method)=>(sql,params)=>{if(!allowed.has(sql))throw Error('READ_ONLY_POOL_STATEMENT_REJECTED');return raw[method]({sql,timeout:5000},params);};
   return {query:query('query'),execute:query('execute'),getConnection(){throw Error('TRANSACTIONS_DISABLED_IN_PROBE');},end:()=>raw.end()};
  }});
  await manager.initialize();const pools=manager.status();if(!pools.read||!pools.write)throw Error('ROLLBACK_POOLS_NOT_READY');
  const result={status:'ROLLBACK_POOLS_SCHEMA_GRANTS_PASS',profiles:{read:'chatRead',write:'chatWrite'},pools,sqlWrites:false,writesPerformed:false,orderRowsRead:false,runtimeChanged:false,webRestarted:false,telegramAccessed:false,fullWebBootVerified:false};report(result);return result;
 }finally{if(manager)await manager.close();secrets.readPassword='';secrets.writePassword='';}
}
module.exports={run};
