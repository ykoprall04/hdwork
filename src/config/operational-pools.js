const {reviewOperationalGrants}=require('./operational-grants');
const roles={read:{prefix:'OP_READ',user:'hdwork_ops_read'},write:{prefix:'OP_WRITE',user:'hdwork_ops_write'}};
const rejected=()=>Object.assign(Error('Operational pool unavailable'),{code:'OPERATIONAL_POOL_REJECTED'});
function options(role,env){
 if(env.HDWORK2_SYSTEM_MONITORING_ENABLED!==undefined&&!['true','false'].includes(env.HDWORK2_SYSTEM_MONITORING_ENABLED))throw rejected();
 const spec=roles[role];if(!spec)throw rejected();const p=spec.prefix;
 if(env[p+'_ENABLED']!=='true'||env[p+'_DB_USER']!==spec.user||env[p+'_DB_NAME']!=='hdwork2'||env[p+'_DB_HOST']!=='127.0.0.1'||String(env[p+'_DB_PORT'])!=='3306'||env[p+'_DB_PASSWORD'])throw rejected();
 if(role==='write'&&(env.HDWORK2_LOCAL_READ_ONLY!=='false'||env.HDWORK2_OPERATIONAL_WRITE_APPROVED!=='true'))throw rejected();
 return {host:'127.0.0.1',port:3306,user:spec.user,database:'hdwork2',connectionLimit:2,queueLimit:20,waitForConnections:true,connectTimeout:5000,multipleStatements:false,supportBigNumbers:true,bigNumberStrings:true,timezone:'Z'};
}
function guardedRead(raw){
 const safe=sql=>{if(typeof sql!=='string'||!/^(SELECT\b|SET TRANSACTION READ ONLY$)/i.test(sql.trim())||/;|\bFOR UPDATE\b|\bINTO\s+(OUTFILE|DUMPFILE)\b/i.test(sql))throw rejected();};
 const wrap=c=>({query(sql,p){safe(sql);return c.query(sql,p);},execute(sql,p){safe(sql);return c.execute(sql,p);},beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release(),destroy:()=>c.destroy()});
 return {query(sql,p){safe(sql);return raw.query(sql,p);},execute(sql,p){safe(sql);return raw.execute(sql,p);},async getConnection(){return wrap(await raw.getConnection());}};
}
function createManager({env=process.env,readSecret=file=>require('./private-database-env').readPrivateDpapi(file),createPool=opts=>require('mysql2/promise').createPool(opts)}={}){
 const pools=new Map(),rawPools=new Map();let initializing;
 const writable=()=>env.HDWORK2_LOCAL_READ_ONLY==='false'&&env.HDWORK2_OPERATIONAL_WRITE_APPROVED==='true'&&env.OP_WRITE_ENABLED==='true';
 function get(role){if(role==='write'&&!writable())throw rejected();const p=pools.get(role);if(!p)throw rejected();return p;}
 const writeGuard=raw=>{
  const guard=fn=>(...args)=>{if(!writable())throw rejected();return fn(...args);};
  const wrap=c=>({query:guard(c.query.bind(c)),execute:guard(c.execute.bind(c)),beginTransaction:guard(c.beginTransaction.bind(c)),commit:guard(c.commit.bind(c)),rollback:()=>c.rollback(),release:()=>c.release(),destroy:()=>c.destroy()});
  return {query:guard(raw.query.bind(raw)),execute:guard(raw.execute.bind(raw)),getConnection:guard(async()=>wrap(await raw.getConnection()))};
 };
 async function close(){const raws=[...rawPools.values()];pools.clear();rawPools.clear();await Promise.allSettled(raws.map(p=>p.end()));}
 async function initialize(){
  if(initializing)return initializing;
  initializing=(async()=>{try{
   for(const role of ['read','write']){
    if(env[roles[role].prefix+'_ENABLED']!=='true')continue;
    const config=options(role,env);const file=env[roles[role].prefix+'_DB_PASSWORD_DPAPI_FILE'];
    if(typeof file!=='string'||!file)throw rejected();
    let secret=await readSecret(file);if(typeof secret!=='string'||!secret.length)throw rejected();
    const raw=createPool({...config,password:secret});secret='';rawPools.set(role,raw);
    const [[target]]=await raw.query('SELECT DATABASE() AS db,CURRENT_USER() AS account');
    if(target.db!=='hdwork2'||target.account!==config.user+'@localhost')throw rejected();
    const [grants]=await raw.query('SHOW GRANTS FOR CURRENT_USER');if(!reviewOperationalGrants(grants,env.HDWORK2_SYSTEM_MONITORING_ENABLED==='true'?(role==='read'?'systemRead':'systemWrite'):role).ok)throw rejected();
    pools.set(role,role==='read'?guardedRead(raw):writeGuard(raw));
   }
  }catch{await close();throw rejected();}})();
  return initializing;
 }
 return {initialize,get,close,status:()=>({read:pools.has('read'),write:pools.has('write')&&writable()})};
}
let manager;
function runtime(){return manager||=(createManager());}
module.exports={createManager,options,getReadPool:()=>runtime().get('read'),getWritePool:()=>runtime().get('write'),initialize:()=>runtime().initialize(),initializeWithSecrets:async readSecret=>{if(manager||typeof readSecret!=='function')throw rejected();manager=createManager({readSecret});await manager.initialize();},close:async()=>{if(manager){await manager.close();manager=undefined;}},status:()=>manager?.status()||{read:false,write:false}};
