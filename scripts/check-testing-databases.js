async function run(){
 if(process.argv.slice(2).join(' ')!=='--read-only')throw Error('Read-only mode required');
 await require('./check-courier-database').run();
 const env={HDWORK2_LOCAL_READ_ONLY:'true',OP_READ_ENABLED:'true',OP_READ_DB_USER:'hdwork_ops_read',OP_READ_DB_NAME:'hdwork2',OP_READ_DB_HOST:'127.0.0.1',OP_READ_DB_PORT:'3306',OP_READ_DB_PASSWORD_DPAPI_FILE:'.local/database-secrets/ops-read-password.dpapi'};
 const manager=require('../src/config/operational-pools').createManager({env});
 try{await manager.initialize();await require('../src/config/local-database-check').checkDatabase(manager.get('read'),{operationalReadOnly:true,authOnly:false});console.log(JSON.stringify({account:'hdwork_ops_read@localhost',connection:'PASS',grants:'PASS_READ_ONLY',schema:'PASS',writesPerformed:false,telegramStarted:false}));}
 finally{await manager.close();}
}
if(require.main===module)run().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'TESTING_DATABASE_CHECK_FAILED',writesPerformed:false,telegramStarted:false}));process.exitCode=1;});
module.exports={run};
