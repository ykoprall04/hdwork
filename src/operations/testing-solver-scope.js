// Pure policy: no secrets, database, Telegram client or mutable group defaults.
const username='trial_yanto';
const fail=()=>Object.assign(Error('Testing solver scope rejected'),{statusCode:403});
function validate(scope,now=Date.now()){
 if(!scope||scope.username!==username||!Number.isSafeInteger(scope.userId)||scope.userId<1||scope.chatId!=='-5436357946'||scope.botId!=='hdworkopsbot-testing'||scope.threadId!==null||scope.botUsername!=='HDWorkOpsBot'||scope.chatVerified!==true||!Number.isFinite(Date.parse(scope.expiresAt))||Date.parse(scope.expiresAt)<=now)throw fail();
 return scope;
}
function configuration(env=process.env){
 if(env.HDWORK2_TESTING_SOLVER_ENABLED===undefined||env.HDWORK2_TESTING_SOLVER_ENABLED==='false')return null;
 const operational=env.HDWORK2_SERVICE_AUTH_POLICY==='operational-write'&&require('../config/persistent-auth').validatePersistentAuth(env);
 if(env.HDWORK2_TESTING_SOLVER_ENABLED!=='true'||(!operational&&(env.HDWORK2_LOCAL_READ_ONLY!=='true'||env.OP_WRITE_ENABLED!=='false'||env.HDWORK2_OPERATIONAL_WRITE_APPROVED!=='false'))||env.HDWORK2_PUBLIC_ORIGIN!=='https://hdwork2.yoloo.space')throw fail();
 let scope;try{scope=JSON.parse(env.HDWORK2_TESTING_SOLVER_SCOPE);}catch{throw fail();}
 // An expired trial must never prevent the general operational service starting.
 // Validate its complete identity before disabling only the expired trial.
 if(operational&&Date.parse(scope?.expiresAt)<=Date.now()){validate(scope,Date.parse(scope.expiresAt)-1);return null;}
 return Object.freeze({...validate(scope)});
}
function actor(scope,user,now){validate(scope,now);if(!user||Number(user.id)!==scope.userId||user.username!==username||user.role!=='HD'||![true,1].includes(user.is_active??true))throw fail();}
function order(scope,row,now){validate(scope,now);if(!row||row.bot_id!==scope.botId||row.chat_id!==scope.chatId||row.thread_id!==scope.threadId||typeof row.message_id!=='string'||!/^[1-9]\d*$/.test(row.message_id)||row.command!=='order')throw fail();}
function action(scope,user,row,input,now){actor(scope,user,now);order(scope,row,now);if(!['PICK','DONE','FAILED'].includes(input?.action))throw fail();}
function outgoing(scope,row,payload,now){order(scope,row,now);if(!payload||payload.method!=='sendMessage'||payload.chat_id!==scope.chatId||payload.reply_to_message_id!==row.message_id||payload.telegram_thread_id!==null||payload.thread_mode!=='non_topic'||typeof payload.text!=='string'||!payload.text.trim())throw fail();return true;}
function mutationPath(method,path){return method==='POST'&&/^\/api\/operations\/orders\/[a-f0-9-]{36}\/actions$/.test(path);}
module.exports={username,validate,configuration,actor,order,action,outgoing,mutationPath};
