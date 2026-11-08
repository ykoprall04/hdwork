const fs=require('node:fs'),path=require('node:path');
function applyPrivatePoolPlan(env=process.env,plan){
 if(plan===undefined){const file=path.resolve(__dirname,'../../.local/database-pools.plan.json');if(!fs.existsSync(file))return;plan=JSON.parse(fs.readFileSync(file,'utf8'));}
 if(!plan||typeof plan!=='object')throw Error('Private pool plan rejected');
 for(const role of ['read','write']){
  const entry=plan[role],prefix=role==='read'?'OP_READ':'OP_WRITE';
  if(!entry||entry.enabled===false)continue;
  if(entry.enabled!==true||Object.hasOwn(entry,'password'))throw Error('Private pool plan rejected');
  for(const [key,value] of Object.entries({ENABLED:'true',DB_USER:entry.user,DB_HOST:entry.host,DB_PORT:String(entry.port),DB_NAME:entry.database,DB_PASSWORD_DPAPI_FILE:entry.passwordDpapiFile})){
   if(typeof value!=='string'||!value)throw Error('Private pool plan rejected');
   if(env[prefix+'_'+key]!==undefined&&env[prefix+'_'+key]!==value)throw Error('Conflicting pool configuration');
   env[prefix+'_'+key]=value;
  }
 }
}
module.exports={applyPrivatePoolPlan};
