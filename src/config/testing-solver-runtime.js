// Separate pool: never enables the general operational write pool or courier polling.
const policy=require('../operations/testing-solver-scope');
let runtime;
async function initialize({env=process.env,password,telegramToken,stateDirectory,createPool=opts=>require('mysql2/promise').createPool(opts)}={}){
 const scope=policy.configuration(env);if(!scope)return false;
 if(runtime||typeof password!=='string'||!password||typeof telegramToken!=='string'||!telegramToken)throw Error('Testing solver secrets rejected');
 const pool=createPool({host:'127.0.0.1',port:3306,database:'hdwork2',user:'hdwork_trial_write',password,connectionLimit:2,queueLimit:20,waitForConnections:true,connectTimeout:5000,multipleStatements:false,supportBigNumbers:true,bigNumberStrings:true,timezone:'Z'});
 try{
  const [[target]]=await pool.query('SELECT DATABASE() AS db,CURRENT_USER() AS account');if(target.db!=='hdwork2'||target.account!=='hdwork_trial_write@localhost')throw Error('Testing write target rejected');
  const [grants]=await pool.query('SHOW GRANTS FOR CURRENT_USER');if(!require('./operational-grants').reviewOperationalGrants(grants,'trialWrite').ok)throw Error('Testing write grants rejected');
  const sender=require('../courier/testing-solver-outbox').start({pool,scope,token:telegramToken,stateDirectory});
  runtime={pool,scope,sender};return true;
 }catch(error){await pool.end();throw error;}
}
async function act(token,user,id,input){if(!runtime)throw Object.assign(Error('Testing solver unavailable'),{statusCode:503});policy.actor(runtime.scope,user);return require('../operations/mutate').act(runtime.pool,token,user.id,id,input,{testingScope:runtime.scope});}
async function close(){const value=runtime;runtime=undefined;if(value){await value.sender.close();await value.pool.end();}}
module.exports={initialize,act,close};
