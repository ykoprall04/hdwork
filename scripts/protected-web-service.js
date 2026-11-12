// Runs only from an ACL-protected deployment snapshot as Windows LocalService.
const fs=require('node:fs'),path=require('node:path');
const home=path.resolve(__dirname,'../service');
async function run(){
 const env=JSON.parse(fs.readFileSync(path.join(home,'environment.json'),'utf8'));
 if(env.HDWORK2_PUBLIC_ORIGIN!=='https://hdwork2.yoloo.space'||env.HDWORK2_EDGE_AUTH_MODE!=='application-session')throw Error('Origin rejected');
 require('../src/config/persistent-auth').validatePersistentAuth(env);
 for(const k of Object.keys(process.env))if(/^(HDWORK2_|DB_|OP_READ_|OP_WRITE_|COURIER_|B2C_|JWT_SECRET|LOCAL_|FRONTEND_ORIGIN|NODE_OPTIONS|NODE_PATH)/.test(k))delete process.env[k];
 Object.assign(process.env,env);
 if(env.HDWORK2_RAW_LOG_ENABLED==='true'){const logging=require('../src/observability/raw-log');logging.captureOutput();logging.logger().emit('WEB_START',{status:'STARTING'});}
 const testingScope=require('../src/operations/testing-solver-scope').configuration(env);
 const {bootstrap,validateOperationalBundle}=require('./office-web-service');
 const secrets=await bootstrap(process.stdin,{validate:value=>require('../src/config/protected-service-bundle').validateProtectedBundle(value,env,{validateOperationalBundle})});
 let app,pool,closing=false,leaseEnded=false;
 const save=status=>fs.writeFileSync(path.join(home,'state/state.json'),JSON.stringify({status,pid:process.pid,origin:env.HDWORK2_PUBLIC_ORIGIN,readOnly:env.HDWORK2_LOCAL_READ_ONLY==='true',pools:require('../src/config/operational-pools').status(),courier:false,testingSolver:!!testingScope,testingSenderOnly:!!testingScope,updatedAt:new Date().toISOString()}));
 const close=async()=>{if(closing)return;closing=true;try{await require('../src/config/testing-solver-runtime').close();if(app)await app.close();else if(pool)await pool.end();await require('../src/config/operational-pools').close();}finally{save('STOPPED');process.stdin.destroy();}};
 process.stdin.once('end',()=>{leaseEnded=true;if(app)void close();});
 try{
  Object.assign(process.env,{DB_PASSWORD:secrets.authPassword,JWT_SECRET:secrets.signingSecret});
  require('../src/config/api-only-startup').validateApiOnlyConfig();
  pool=require('../src/config/database');require('../src/access/http').service();
  await require('../src/config/operational-pools').initializeWithSecrets(async file=>{if(file===env.OP_READ_DB_PASSWORD_DPAPI_FILE)return secrets.readPassword;if(env.HDWORK2_SERVICE_AUTH_POLICY==='operational-write'&&file===env.OP_WRITE_DB_PASSWORD_DPAPI_FILE&&file!==env.OP_READ_DB_PASSWORD_DPAPI_FILE)return secrets.writePassword;throw Error('Secret scope rejected');});
  if(testingScope)await require('../src/config/testing-solver-runtime').initialize({env,password:secrets.testingWritePassword,telegramToken:secrets.testingTelegramToken,stateDirectory:path.join(home,'state')});
  app=await require('../local-web-server').startLocalWeb();
  if(leaseEnded){await close();throw Error('Lease ended');}
  process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());save('READY');if(env.HDWORK2_RAW_LOG_ENABLED==='true')require('../src/observability/raw-log').logger().emit('WEB_READY',{status:'READY'});
 }catch(error){await close();throw error;}
 finally{delete process.env.DB_PASSWORD;delete process.env.JWT_SECRET;for(const k of Object.keys(secrets))secrets[k]='';}
}
if(require.main===module)run().catch(error=>{console.error(JSON.stringify({status:'FAILED',code:/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'PROTECTED_WEB_START_FAILED'}));process.exitCode=1;});
module.exports={run};
