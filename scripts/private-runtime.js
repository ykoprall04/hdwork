const path=require('node:path');
async function run(){
  const mode=process.argv[2];if(!['audit','api','local','startup-check','auth-validation'].includes(mode)||process.argv.length!==3)throw Error('Invalid mode');
  require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
  if(mode==='auth-validation'){
    // Requires separately supplied explicit approval and expiry; never enables itself.
    Object.assign(process.env,{HDWORK2_AUTH_ONLY:'true',HDWORK2_LOCAL_READ_ONLY:'true',HDWORK2_OPERATIONS_ENABLED:'false',B2C_WORKFLOW_READ_ENABLED:'false',B2C_STAGING_ENABLED:'false',COURIER_ENABLED:'false',COURIER_ALLOW_NETWORK:'false'});
    if(process.env.HDWORK2_AUTH_WRITE_ENABLED!=='true')throw Error('Explicit auth write approval required');
    require('../src/config/auth-write-policy').validateAuthWriteScope();
  }else if(process.env.HDWORK2_AUTH_WRITE_ENABLED==='true')throw Error('Use reviewed auth-validation mode');
  await require('../src/config/private-database-env').loadPrivatePassword();
  let pool,started=false;
  try{
    require('../src/config/api-only-startup').validateApiOnlyConfig();
    if(mode==='audit')console.log(JSON.stringify(await require('../src/access/database-audit').audit()));
    else{
      // Capture the runtime credential before removing it from process.env. Routes
      // otherwise load this pool lazily, after the password has been removed.
      pool=require('../src/config/database');
      if(process.env.HDWORK2_OPERATIONS_ENABLED==='true'){
        require('../src/config/private-pool-plan').applyPrivatePoolPlan();
        await require('../src/config/operational-pools').initialize();
        require('../src/config/operational-pools').getReadPool();
      }
      if(mode==='startup-check'){
        const api=await require('../api-only-server').startApiOnly();
        try{console.log(JSON.stringify(await checkStartup(api)));}
        finally{api.closeAllConnections();await new Promise(r=>api.close(r));}
        return;
      }
      if(mode==='auth-validation'){
        const result=await require('../src/access/database-audit').audit();if(!result.ok)throw Error('Auth grants rejected');
      }
      const app=mode==='api'?await require('../api-only-server').startApiOnly():await require('../local-web-server').startLocalWeb();
      started=true;
      console.log(mode==='auth-validation'?'Validasi auth-only aktif pada loopback dengan batas waktu persetujuan.':'Private runtime aktif pada loopback; read-only.');
      let closing=false;const close=async()=>{if(closing)return;closing=true;try{if(mode==='local'||mode==='auth-validation')await app.close();else{app.closeAllConnections();await new Promise(r=>app.close(r));await pool.end();}}finally{await require('../src/config/operational-pools').close();}};
      process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
    }
  }finally{delete process.env.DB_PASSWORD;if(!started){await require('../src/config/operational-pools').close();if(pool)await pool.end();}}
}
async function checkStartup(api){
 const base='http://127.0.0.1:'+api.address().port;
 const health=await fetch(base+'/health',{signal:AbortSignal.timeout(5000)});
 const me=await fetch(base+'/api/auth/me',{signal:AbortSignal.timeout(5000)});
 // Read-only middleware rejects this before body parsing/auth/storage. No login.
 const denied=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});
 const result={ok:health.status===200&&me.status===401&&denied.status===503,mode:'api-only-read-only',health:health.status,anonymousMe:me.status,loginBlocked:denied.status,writesPerformed:false};
 if(!result.ok)process.exitCode=1;return result;
}
if(require.main===module)run().catch(error=>{console.error(JSON.stringify({ok:false,code:typeof error.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'PRIVATE_RUNTIME_FAILED'}));process.exitCode=1;});
module.exports={run,checkStartup};
