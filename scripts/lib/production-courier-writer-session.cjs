// Real existing Courier DB identity, used only on explicit operator invocation.
// Only the existing DB password is decrypted. No Telegram token or service key is read.
const fs=require('node:fs'),path=require('node:path');
async function create({runtimeConfigFile,runtimeConfigSha256}={}){
 if(process.platform!=='win32'||!path.isAbsolute(runtimeConfigFile||''))throw Error('PINNED_WINDOWS_RUNTIME_REQUIRED');
 const cfg=require('../courier-task-runner').configuration(runtimeConfigFile,runtimeConfigSha256);
 const plan=require('../../src/config/production-courier').validate(JSON.parse(fs.readFileSync(cfg.productionPlan,'utf8')));
 if(plan.botId!=='hdworkopsbot-testing'||cfg.botId!==plan.botId||cfg.telegramBotId!==plan.telegramBotId)throw Error('PRODUCTION_WRITER_BOT_SCOPE_REJECTED');
 let password=await require('../../src/config/private-database-env').readPrivateDpapi(path.resolve(plan.secretRoot,plan.dbPasswordDpapiFile),{allowedRoot:plan.secretRoot});
 const pool=require('mysql2/promise').createPool({host:'127.0.0.1',port:3306,user:'hdwork_courier',password,database:'hdwork2',timezone:'Z',dateStrings:true,supportBigNumbers:true,bigNumberStrings:true,multipleStatements:false,connectionLimit:2,connectTimeout:5000});password=null;
 try{
  const [[identity]]=await pool.query('SELECT CURRENT_USER() AS account,DATABASE() AS db');
  if(identity.account!=='hdwork_courier@localhost'||identity.db!=='hdwork2')throw Error('PRODUCTION_WRITER_DATABASE_IDENTITY_REJECTED');
  const [grants]=await pool.query('SHOW GRANTS FOR CURRENT_USER');
  if(!require('../../src/config/operational-grants').reviewOperationalGrants(grants,'courierSendChatFifo').ok)throw Error('PRODUCTION_WRITER_GRANTS_REJECTED');
  return {pool,botId:plan.botId,async close(){await pool.end();}};
 }catch(e){await pool.end();throw e;}
}
module.exports={create};
