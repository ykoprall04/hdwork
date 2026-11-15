const {fail}=require('../operations/policy');
const {digest}=require('../access/service');
const {input}=require('./reference');
function admin(user){if(!user||!['ADMIN','SUPER_ADMIN'].includes(user.role))throw fail(403,'Manajemen VLAN hanya untuk ADMIN dan SUPER_ADMIN');}
function identifier(value){if(!/^[1-9]\d{0,19}$/.test(String(value)))throw fail();return String(value);}
function createService({readPool,writePool}){return {
 async list(query,user){
  admin(user);const q=query.q??'',page=Number(query.page||1);
  if(typeof q!=='string'||q.length>128||!Number.isInteger(page)||page<1||page>10000||Object.keys(query).some(k=>!['q','page'].includes(k)))throw fail();
  const term='%'+q+'%';
  const [rows]=await readPool.execute('SELECT id,ip_olt,wilayah,vlan_inet,vlan_voip FROM hd2_vlan_reference WHERE (?=\'\' OR ip_olt LIKE ? OR wilayah LIKE ? OR vlan_inet LIKE ? OR vlan_voip LIKE ?) ORDER BY wilayah,ip_olt,id LIMIT 51 OFFSET ?',[q,term,term,term,term,(page-1)*50]);
  return {data:rows.slice(0,50).map(r=>({...r,id:String(r.id)})),page,hasMore:rows.length>50};
 },
 async mutate(action,id,body,user,token){
  admin(user);if(!['add','update','delete'].includes(action))throw fail();
  const key=action==='add'?null:identifier(id),row=action==='delete'?null:input(body);
  if(typeof token!=='string'||!token)throw fail(401);
  const c=await writePool.getConnection();
  try{await c.beginTransaction();
   const [[actor]]=await c.execute('SELECT id,role,is_active FROM users WHERE id=? FOR SHARE',[user.id]);
   if(!actor||!['ADMIN','SUPER_ADMIN'].includes(actor.role)||![1,true].includes(actor.is_active))throw fail(403);
   const [[session]]=await c.execute('SELECT token_hash FROM hd2_sessions WHERE token_hash=? AND user_id=? AND revoked=FALSE AND expires_at>UTC_TIMESTAMP(3) FOR SHARE',[digest(token),user.id]);if(!session)throw fail(401);
   let result;
   if(action==='add'){
    const [r]=await c.execute('INSERT INTO hd2_vlan_reference(ip_olt,wilayah,vlan_inet,vlan_voip) VALUES (?,?,?,?)',[row.ip_olt,row.wilayah,row.vlan_inet,row.vlan_voip]);result=String(r.insertId);
   }else{
    const [[old]]=await c.execute('SELECT id FROM hd2_vlan_reference WHERE id=? FOR UPDATE',[key]);if(!old)throw fail(404,'Referensi VLAN tidak ditemukan');
    if(action==='delete')await c.execute('DELETE FROM hd2_vlan_reference WHERE id=?',[key]);
    else await c.execute('UPDATE hd2_vlan_reference SET ip_olt=?,wilayah=?,vlan_inet=?,vlan_voip=? WHERE id=?',[row.ip_olt,row.wilayah,row.vlan_inet,row.vlan_voip,key]);
    result=key;
   }
   await c.commit();return {success:true,id:result};
  }catch(e){await c.rollback();if(e.code==='ER_DUP_ENTRY')throw fail(409,'Referensi dengan nilai yang sama sudah ada');throw e;}finally{c.release();}
 }
};}
module.exports={admin,createService};
