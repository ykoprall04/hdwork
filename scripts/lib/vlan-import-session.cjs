// Importer adapter only; loading this module never opens a database connection.
const {options}=require('../../src/config/operational-pools');
const reject=()=>Object.assign(Error('VLAN_IMPORT_CONNECTION_REJECTED'),{code:'VLAN_IMPORT_CONNECTION_REJECTED'});
function adapter({env=process.env,readSecret=file=>require('../../src/config/private-database-env').readPrivateDpapi(file),createPool=opts=>require('mysql2/promise').createPool(opts)}={}){
 return {async create(){
  let raw;
  try{
   const config=options('write',env),uuid=env.VLAN_IMPORT_SERVER_UUID;
   if(typeof uuid!=='string'||!uuid.trim()||typeof env.OP_WRITE_DB_PASSWORD_DPAPI_FILE!=='string'||!env.OP_WRITE_DB_PASSWORD_DPAPI_FILE)throw reject();
   let password=await readSecret(env.OP_WRITE_DB_PASSWORD_DPAPI_FILE);
   if(typeof password!=='string'||!password.length)throw reject();
   raw=createPool({...config,password});password=null;
   async function getConnection(){
    const c=await raw.getConnection();
    try{
     const [[identity]]=await c.query('SELECT DATABASE() AS db,CURRENT_USER() AS account,@@server_uuid AS server_uuid');
     if(identity.db!=='hdwork2'||identity.account!=='hdwork_ops_write@localhost'||identity.server_uuid!==uuid)throw reject();
     return c;
    }catch{c.release();throw reject();}
   }
   // Verify before exposing the session, and again for every import connection.
   const c=await getConnection();c.release();
   return {pool:{getConnection},async close(){await raw.end();}};
  }catch{if(raw)await raw.end().catch(()=>{});throw reject();}
 }};
}
module.exports={adapter,create:()=>adapter().create()};
