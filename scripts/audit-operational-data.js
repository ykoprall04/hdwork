const fs=require('node:fs'),path=require('node:path');
async function run(){
 const root=path.resolve(__dirname,'..');require('dotenv').config({path:path.join(root,'.env'),quiet:true});
 await require('../src/config/private-database-env').loadPrivatePassword();let connection;
 try{
  connection=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:3306,user:'hdwork_auth',password:process.env.DB_PASSWORD,database:'hdwork2',multipleStatements:false,connectTimeout:5000});
  delete process.env.DB_PASSWORD;
  const result=await require('../src/operations/data-inventory').inventory(connection);
  const folder=fs.mkdtempSync(path.join(root,'.local/data-inventory-'));fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({...result,report:path.relative(root,path.join(folder,'report.json'))}));if(result.status==='BLOCKED')process.exitCode=2;
 }finally{delete process.env.DB_PASSWORD;if(connection)await connection.end();}
}
if(require.main===module)run().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',code:typeof e.code==='string'&&/^[A-Z0-9_]+$/.test(e.code)?e.code:'INVENTORY_FAILED'}));process.exitCode=1;});
module.exports={run};
