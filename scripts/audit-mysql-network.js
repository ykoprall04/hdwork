// Read-only server binding check using auth identity. No application table reads.
async function run(){
 if(process.argv.slice(2).join(' ')!=='--read-only')throw Error('Explicit read-only mode required');
 require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env'),quiet:true});
 await require('../src/config/private-database-env').loadPrivatePassword();let c;
 try{
  c=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:3306,user:'hdwork_auth',password:process.env.DB_PASSWORD,database:'hdwork2',multipleStatements:false,connectTimeout:5000});delete process.env.DB_PASSWORD;
  const [[row]]=await c.query({sql:'SELECT DATABASE() AS db,CURRENT_USER() AS account,@@global.bind_address AS binding,@@port AS port',timeout:5000});
  if(row.db!=='hdwork2'||row.account!=='hdwork_auth@localhost'||Number(row.port)!==3306)throw Error('Network audit target rejected');
  const loopback=String(row.binding).split(',').every(a=>['127.0.0.1','::1','localhost'].includes(a.trim()));
  console.log(JSON.stringify({database:'hdwork2',account:'hdwork_auth@localhost',port:3306,bindLoopbackOnly:loopback,publicExposure:'UNVERIFIED_FIREWALL_AND_ROUTER_REQUIRED',writesPerformed:false}));
 }finally{delete process.env.DB_PASSWORD;if(c)await c.end();}
}
if(require.main===module)run().catch(()=>{console.error(JSON.stringify({status:'BLOCKED',code:'READ_ONLY_NETWORK_AUDIT_FAILED'}));process.exitCode=1;});
module.exports={run};
