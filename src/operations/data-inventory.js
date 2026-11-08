const tables=['hd2_order_statuses','hd2_courier_inbox','hd2_courier_outbox','hd2_orders','hd2_daily_keys','hd2_audit','hd2_tial_keys','hd2_web_requests','hd2_live_events','hd2_courier_workers','hd2_courier_nonces'];
const required={hd2_orders:['id','bot_id','module','access_module','command','status','business_day','telegram_timestamp','owner_user_id','final_user_id','version','duplicate_of','duplicate_decision','sc_in','inet','raw_text','command_fields'],hd2_audit:['id','order_id','action','user_id','detail','created_at']};
function selectAllowed(grants,table){
 return grants.some(row=>{const m=/^GRANT (.+) ON (.+) TO /i.exec(String(Object.values(row)[0]));if(!m)return false;const scope=m[2].replace(/`/g,'').replace(/\\_/g,'_');return ['hdwork2.'+table,'hdwork2.*'].includes(scope)&&m[1].split(', ').includes('SELECT');});
}
async function inventory(connection){
 const [[target]]=await connection.query('SELECT DATABASE() AS db,CURRENT_USER() AS account');
 if(target.db!=='hdwork2'||target.account!=='hdwork_auth@localhost')throw Error('Inventory target rejected');
 const [grants]=await connection.query('SHOW GRANTS FOR CURRENT_USER');
 const [columns]=await connection.query("SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME IN ("+tables.map(()=>'?').join(',')+')',tables);
 const info=Object.fromEntries(tables.map(table=>{const names=columns.filter(c=>c.TABLE_NAME===table).map(c=>c.COLUMN_NAME);return [table,{visible:names.length>0,select:selectAllowed(grants,table),columns:names,missingRequired:names.length?(required[table]||[]).filter(n=>!names.includes(n)):null}];}));
 let aggregates=null;
 if(info.hd2_orders.select&&info.hd2_orders.missingRequired?.length===0){
  // Aggregates only: no subscriber references, raw messages or employee names.
  const [rows]=await connection.query('SELECT access_module AS module,status,COUNT(*) AS total,COUNT(owner_user_id) AS assigned,COUNT(duplicate_of) AS duplicates,MIN(business_day) AS firstDay,MAX(business_day) AS lastDay FROM hdwork2.hd2_orders GROUP BY access_module,status');
  aggregates=rows.map(r=>({...r,total:Number(r.total),assigned:Number(r.assigned),duplicates:Number(r.duplicates)}));
 }
 const groups=require('./modules').areas;
 const modules=Object.fromEntries(['B2C','ASSUREN','B2B','REPLACEMENT'].map(workspace=>[workspace,{status:aggregates===null?'BLOCKED_NO_OPERATIONAL_SELECT':aggregates.some(r=>groups[workspace].includes(r.module)&&r.total>0)?'ROWS_PRESENT_SOURCE_NOT_ATTESTED':'NO_ROWS',rows:aggregates===null?null:aggregates.filter(r=>groups[workspace].includes(r.module)).reduce((n,r)=>n+r.total,0)}]));
 return {status:aggregates===null?'BLOCKED':'INVENTORIED',database:'hdwork2',readOnly:true,tables:info,aggregates,modules,realSourceConnected:false,ingestionActive:'UNVERIFIED',note:'Metadata invisible without privileges does not prove table absence; rows alone do not prove a production source.'};
}
module.exports={inventory,selectAllowed,tables};
