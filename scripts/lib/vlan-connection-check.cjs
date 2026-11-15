// One-shot, no HTTP listener, importer, state files or application startup.
async function check({env,stream,uuid,createAdapter=require('./vlan-import-session.cjs').adapter}){
 if(typeof uuid!=='string'||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(uuid))throw Error('VLAN_CHECK_REJECTED');
 const session=await createAdapter({env:{...env,VLAN_IMPORT_SERVER_UUID:uuid},stream}).create();
 try{
  const c=await session.pool.getConnection();
  try{const [[server]]=await c.query('SELECT @@hostname AS hostname,@@port AS port');
   if(String(server.hostname).toLowerCase()!=='woc'||Number(server.port)!==3306)throw Error('VLAN_CHECK_REJECTED');
  }finally{c.release();}
 }finally{await session.close();}
 return {status:'PASS',check:'VLAN_WRITER_CONNECTION',readOnly:true};
}
module.exports={check};
