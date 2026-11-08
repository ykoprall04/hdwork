// Manual opt-in only, never called by startup or migration. No dotenv loading.
async function provision(env=process.env,args=process.argv.slice(2)) {
 if(args.length!==1||args[0]!=='--provision-first-super-admin'||env.HDWORK2_PROVISION_APPROVED!=='true'||env.DB_NAME!=='hdwork2'||env.DB_HOST!=='127.0.0.1')throw Error('Provisioning rejected');
 const pool=require('mysql2/promise').createPool({host:'127.0.0.1',port:Number(env.DB_PORT||3306),database:'hdwork2',user:env.DB_USER,password:env.DB_PASSWORD,connectionLimit:1,multipleStatements:false});
 try{await require('../src/access/service').createService(require('../src/access/store').createStore(pool),env.JWT_SECRET).bootstrap({name:env.HDWORK2_FIRST_ADMIN_NAME,username:env.HDWORK2_FIRST_ADMIN_USERNAME,password:env.HDWORK2_FIRST_ADMIN_PASSWORD});}finally{await pool.end();}
}
if(require.main===module)provision().then(()=>console.log('First administrator provisioned.')).catch(()=>{console.error('Provisioning rejected or failed.');process.exitCode=1;});
module.exports={provision};
