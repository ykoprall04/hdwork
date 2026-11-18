const {fail}=require('./policy');
const commands=Object.freeze(['order','req','config_psb','mo']);
function validate(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['command','enabled','version','requestId'].includes(k))||!commands.includes(input.command)||typeof input.enabled!=='boolean'||!Number.isSafeInteger(input.version)||input.version<0)throw fail(400);
 require('./policy').uuid(input.requestId);
 return {...input};
}
async function read(pool){
 const [rows]=await pool.execute('SELECT command,enabled,version FROM hd2_global_commands ORDER BY command');
 if(rows.length!==commands.length||commands.some(command=>rows.filter(r=>r.command===command).length!==1)||rows.some(r=>![0,1,false,true].includes(r.enabled)||!Number.isSafeInteger(Number(r.version))||Number(r.version)<0))throw fail(503);
 return {commands:Object.fromEntries(rows.map(r=>[r.command,{enabled:!!r.enabled,version:Number(r.version)}]))};
}
async function save(c,user,input){
 const [[old]]=await c.execute('SELECT enabled,version FROM hd2_global_commands WHERE command=? FOR UPDATE',[input.command]);
 if(!old)throw fail(503);
 if(Number(old.version)!==input.version)throw fail(409,'Pengaturan telah berubah. Muat ulang sebelum mencoba kembali.');
 const previous=!!old.enabled;
 if(!!old.enabled===input.enabled)return {success:true,command:input.command,enabled:input.enabled,version:input.version};
 await c.execute('UPDATE hd2_global_commands SET enabled=?,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE command=?',[input.enabled,input.command]);
 await c.execute('INSERT INTO hd2_audit(id,order_id,action,user_id,detail) VALUES (?,NULL,?,?,?)',[require('node:crypto').randomUUID(),'GLOBAL_COMMAND_CHANGED',user.id,JSON.stringify({command:input.command,before:previous,after:input.enabled,requestId:input.requestId})]);
 return {success:true,command:input.command,enabled:input.enabled,version:input.version+1};
}
module.exports={commands,validate,read,save};
