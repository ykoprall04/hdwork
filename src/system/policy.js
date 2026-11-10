const {fail,uuid,hash}=require('../operations/policy');
const {id,messageId}=require('../courier/contract');
const categories={ALL:{profiles:['ALL'],commands:require('../courier/shared-group').commands},TIAL:{profiles:['TIAL1','TIAL2'],commands:['order','req']},LOGIC:{profiles:['SOLVER1'],commands:['config_psb','mo']}};
function admin(user,superOnly=false){if(!user||!(superOnly?['SUPER_ADMIN']:['SUPER_ADMIN','ADMIN']).includes(user.role))throw fail(403);}
function viewer(user){if(!user||!['HD','ADMIN','SUPER_ADMIN'].includes(user.role))throw fail(403);}
function bot(value){if(typeof value!=='string'||! /^[a-z][a-z0-9_-]{1,63}$/.test(value))throw fail();return value;}
function destination(input){const chatId=id(input.chatId,true);if(!chatId.startsWith('-'))throw fail();return {chatId,threadId:messageId(input.threadId,true)};}
function mapping(input){
 if(!input||Object.keys(input).some(k=>!['requestId','id','version','botId','category','profile','chatId','threadId','enabled','verified','name'].includes(k)))throw fail();
 if(input.category==='ALL'&&(typeof input.name!=='string'||!input.name.trim()))throw fail();
 if(input.name!==undefined&&(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>100||/[\x00-\x1f]/.test(input.name)))throw fail();
 uuid(input.requestId);uuid(input.id);bot(input.botId);
 if(!Number.isSafeInteger(input.version)||input.version<0||!Object.hasOwn(categories,input.category)||!categories[input.category].profiles.includes(input.profile)||typeof input.enabled!=='boolean'||typeof input.verified!=='boolean'||input.enabled&&!input.verified)throw fail();
 return {...input,...destination(input)};
}
const fresh=(row,now=Date.now(),ttl=90000)=>row&&Number.isFinite(Date.parse(row.checkedAt))&&now-Date.parse(row.checkedAt)>=0&&now-Date.parse(row.checkedAt)<=ttl?row.status:'UNKNOWN';
module.exports={admin,viewer,bot,destination,mapping,categories,fresh,uuid,hash,fail};
