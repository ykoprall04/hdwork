// REVIEW TEMPLATE ONLY. Importing this file creates no daemon, process or files.
const path = require('node:path');
const logDir=process.env.HDWORK2_LOG_DIR;
const pm2Home=process.env.PM2_HOME;
if(!pm2Home || !path.win32.isAbsolute(pm2Home) || path.win32.basename(pm2Home).toLowerCase()!=='hdwork2-pm2')throw Error('Separate hdwork2-pm2 home required');
if(!logDir || !path.win32.isAbsolute(logDir))throw Error('Private absolute Windows log directory required');
module.exports={apps:[{
  name:'hdwork2-api',cwd:path.resolve(__dirname,'../..'),script:'api-only-server.js',
  instances:1,exec_mode:'fork',watch:false,autorestart:true,
  min_uptime:30000,max_restarts:5,exp_backoff_restart_delay:2000,
  max_memory_restart:'256M',node_args:'--max-old-space-size=192',
  out_file:path.win32.join(logDir,'api-out.log'),error_file:path.win32.join(logDir,'api-error.log'),time:true,
  env:{NODE_ENV:'production',PORT:'3090',B2C_WORKFLOW_READ_ENABLED:'false',B2C_STAGING_ENABLED:'false',COURIER_ENABLED:'false',COURIER_ALLOW_NETWORK:'false'}
}]};
