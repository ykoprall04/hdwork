const fs=require('fs'),path=require('path');
async function install(c){
 await c.query('CREATE DATABASE hdwork2');await c.query('USE hdwork2');
 for(const sql of require('../../ops/mysql/disposable-guard').migrationStatements())await c.query(sql);
 for(const sql of require('./e2e-contracts.cjs').schemaStatements(['007_hdwork2_auth.sql','008_hdwork2_operations.sql','009_hdwork2_courier_runtime.sql','010_hdwork2_account_approval.sql','011_hdwork2_registration_rejection.sql','012_hdwork2_system_monitoring.sql','013_hdwork2_live_chat.sql','014_hdwork2_shared_groups.review.sql']))await c.query(sql);
 for(const name of ['015_hdwork2_fifo_ack.review.sql','016_fifo_release.PLAN_ONLY.sql','017_administrative_closure.PLAN_ONLY.sql'])for(const sql of fs.readFileSync(path.join(__dirname,'../../database/manual',name),'utf8').replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await c.query(sql);
}
async function account(c,role,user,password){
 await c.query('CREATE USER ?@\'localhost\' IDENTIFIED BY ?',[user,password]);
 for(const [table,permissions] of Object.entries(require('../../src/config/operational-grants').policies[role]))await c.query('GRANT '+permissions.join(', ')+' ON hdwork2.`'+table+'` TO ?@\'localhost\'',[user]);
}
function options(f,user,password){return {socketPath:f.socketPath,user,password,database:'hdwork2',timezone:'Z',dateStrings:true,supportBigNumbers:true,bigNumberStrings:true,connectionLimit:3,authPlugins:{caching_sha2_password:require('mysql2').authPlugins.caching_sha2_password({overrideIsSecure:false})}};}
module.exports={install,account,options};
