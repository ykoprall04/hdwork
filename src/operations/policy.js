const {createHash}=require('node:crypto');
const {modules,areas}=require('./modules');
const fail=(statusCode=400,message='Permintaan pekerjaan tidak valid')=>Object.assign(Error(message),{statusCode,...(message!=='Permintaan pekerjaan tidak valid'?{publicMessage:message}:{})});
const uuid=value=>{if(typeof value!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw fail();return value;};
const moduleOf=o=>({order:'TIAL',req:'REQ',config_psb:'LOGIC_PSB',mo:'LOGIC_MO'})[o.command]||o.module;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function transition(order,user,input){
 if(user.role!=='HD'||![1,true].includes(user.is_active)||!user.modules.includes(moduleOf(order)))throw fail(403,'Tindakan hanya untuk HD aktif dengan akses modul order');
 const action=input.action,owner=String(order.owner_user_id)===String(user.id),rejected=order.status==='DUPLICATE'&&order.duplicate_decision==='REJECT_DUPLICATE';
 const note=typeof input.note==='string'?input.note.trim():'';
 if(input.note!==undefined&&typeof input.note!=='string'||note.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(note))throw fail();
 const next={status:order.status,owner_user_id:order.owner_user_id,final_user_id:order.final_user_id,duplicate_decision:order.duplicate_decision,completion_note:order.completion_note,resetStart:false,finish:false,clearFinish:false};
 const name=user.name.replace(/[\r\n\x00-\x1f]/g,' ').trim();let text=null;
 const pick=()=>{next.status='IN_PROGRESS';next.owner_user_id=user.id;next.final_user_id=null;next.resetStart=true;next.clearFinish=true;next.completion_note=null;text=`🟡 Data di cek ${name}`;};
 switch(action){
 case 'PICK':if(order.status!=='WAITING'||order.duplicate_of)throw fail(409,'Order sudah diambil atau bukan antrean normal. Muat ulang data.');pick();break;
 case 'TAKEOVER':if(order.status!=='IN_PROGRESS'||owner)throw fail(409);pick();break;
 case 'CONTINUE_DUPLICATE':if(!order.duplicate_of||order.status!=='DUPLICATE'||order.duplicate_decision)throw fail(409,'LANJUT CEK hanya untuk duplikat yang belum diputuskan');next.duplicate_decision='CONTINUE_CHECK';pick();break;
 case 'REJECT_DUPLICATE':if(!order.duplicate_of||!((order.status==='DUPLICATE'&&!order.duplicate_decision)||(order.status==='IN_PROGRESS'&&owner)))throw fail(409,'TOLAK DUPLIKAT memerlukan duplikat belum diputuskan atau order duplikat yang Anda kerjakan');next.status='DUPLICATE';next.duplicate_decision='REJECT_DUPLICATE';next.final_user_id=user.id;next.finish=true;next.completion_note=null;text='❌ Duplikat Order';break;
 case 'DONE':case 'FAILED':if(order.status!=='IN_PROGRESS'||!owner)throw fail(409);if(action==='FAILED'&&!note)throw fail();next.status=action;next.final_user_id=user.id;next.finish=true;next.completion_note=note||null;text=action==='FAILED'?`❌ ${note}`:order.command==='order'?['✅ Done (ACTCOMP)',note,`Jgn lupa VALINS after PS. Salam, ${name}!`].filter(Boolean).join('\n'):['✅ Done',note].filter(Boolean).join('\n');break;
 case 'REOPEN':if(input.confirm!==true)throw fail();if(!['DONE','FAILED'].includes(order.status)&&!rejected)throw fail(409);next.final_user_id=null;next.completion_note=null;next.clearFinish=true;if(rejected){next.status='DUPLICATE';next.duplicate_decision=null;next.owner_user_id=null;}else{pick();text=null;}break;
 default:throw fail();
 }
 return {next,text,note};
}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw fail();return value;}
function filters(query,user,{recap=false}={}){
 if(!query||typeof query!=='object'||Array.isArray(query))throw fail();
 if(recap&&Object.keys(query).some(k=>!['area','from','to','hd'].includes(k)))throw fail();
 if(Object.keys(query).some(k=>!['area','command','tab','mine','from','to','hd','status','q','page'].includes(k)||typeof query[k]!=='string'))throw fail();
 const area=query.area||'ALL';if(!Object.hasOwn(areas,area))throw fail();
 const allowed=user.modules.filter(m=>modules.includes(m)&&areas[area].includes(m));
 const command=query.command||'';if(command&&!['order','req','config_psb','mo','assuren','b2b','replacement'].includes(command))throw fail();
 const tab=query.tab||'incoming';if(!['incoming','duplicates','process','finished'].includes(tab))throw fail();
 const from=query.from?date(query.from):'',to=query.to?date(query.to):'';if((from&&!to)||(!from&&to)||(from&&from>to))throw fail();
 if(query.mine&&!['true','false'].includes(query.mine))throw fail();
 const hd=query.hd||'';if(hd&&!/^[1-9]\d{0,14}$/.test(hd))throw fail();
 const status=query.status||'';if(status&&!['DONE','FAILED','DUPLICATE'].includes(status))throw fail();
 const q=(query.q||'').trim();if(q.length>100||/[\x00-\x1f]/.test(q))throw fail();
 const page=query.page?Number(query.page):1;if(!Number.isInteger(page)||page<1||page>10000||query.page&&!/^[1-9]\d{0,4}$/.test(query.page))throw fail();
 return {allowed,command,area,tab,from,to,hd,status,q,page,mine:!recap&&tab==='process'?(query.mine||'true')==='true':false};
}
function where(f,user,{recap=false}={}){
 const clauses=[`o.access_module IN (${f.allowed.map(()=>'?').join(',')||"''"})`,`(o.command IN ('order','req','config_psb','mo','assuren','b2b','replacement') OR (o.command IS NULL AND o.bot_id='web-local' AND o.chat_id='web'))`,'o.telegram_timestamp IS NOT NULL'],values=[...f.allowed];
 if(f.from){clauses.push('o.business_day BETWEEN ? AND ?');values.push(f.from,f.to);}
 if(!recap){clauses.push(f.tab==='incoming'?"o.status='WAITING'":f.tab==='duplicates'?"(o.status='DUPLICATE' AND o.duplicate_decision IS NULL)":f.tab==='process'?"o.status='IN_PROGRESS'":"(o.status IN ('DONE','FAILED') OR (o.status='DUPLICATE' AND o.duplicate_decision='REJECT_DUPLICATE'))");if(f.mine){clauses.push('o.owner_user_id=?');values.push(user.id);}if(f.hd){clauses.push(f.tab==='process'?'o.owner_user_id=?':'o.final_user_id=?');values.push(f.hd);}if(f.status){clauses.push('o.status=?');values.push(f.status);}}
 if(f.command){clauses.push('o.command=?');values.push(f.command);}
 if(f.q){clauses.push(`(LOWER(o.sc_in) LIKE ? ESCAPE '=' OR LOWER(o.inet) LIKE ? ESCAPE '=' OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(o.command_fields,'$.STO'))) LIKE ? ESCAPE '=' OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(o.command_fields,'$."NO INET/TELP"'))) LIKE ? ESCAPE '=' OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(o.command_fields,'$."NO VOICE"'))) LIKE ? ESCAPE '=')`);const q='%'+f.q.toLowerCase().replace(/[=%_]/g,'=$&')+'%';values.push(q,q,q,q,q);}
 return {sql:clauses.join(' AND '),values};
}
module.exports={modules,fail,uuid,moduleOf,hash,transition,filters,where};
