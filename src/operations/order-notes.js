const {fail,uuid}=require('./policy');
const {digest}=require('../access/service');

function authorize(user){
 if(user.role!=='HD'||user.username==='trial_yanto')throw fail(403,'Catatan HD hanya untuk akun HD berizin');
}
function input(body){
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>k!=='text')||typeof body.text!=='string'||body.text.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body.text))throw fail(400,'Catatan maksimal 2000 karakter');
 return body.text.trim();
}
function createNotes({readPool,writePool}){return {
 async list(ids,user){
  authorize(user);
  if(typeof ids!=='string')throw fail();
  const keys=[...new Set(ids.split(','))];if(!keys.length||keys.length>100)throw fail();keys.forEach(uuid);
  const modules=user.modules||[];
  const [rows]=await readPool.execute(`SELECT o.id,COALESCE(n.body,'') AS text,n.updated_by AS updatedBy,DATE_FORMAT(n.updated_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS updatedAt FROM hd2_orders o LEFT JOIN hd2_order_notes n ON n.order_id=o.id WHERE o.id IN (${keys.map(()=>'?').join(',')}) AND o.access_module IN (${modules.map(()=>'?').join(',')||"''"})`,[...keys,...modules]);
  return {data:rows};
 },
 async save(id,token,user,body){
  authorize(user);uuid(id);const text=input(body),c=await writePool.getConnection();let limits;
  try{
   [[limits]]=await c.query('SELECT @@SESSION.lock_wait_timeout AS metadataTimeout,@@SESSION.innodb_lock_wait_timeout AS rowTimeout');
   await c.query('SET SESSION lock_wait_timeout=5, innodb_lock_wait_timeout=5');
   await c.beginTransaction();
   const [[actor]]=await c.execute('SELECT id,role,is_active FROM users WHERE id=? FOR SHARE',[user.id]);
   if(!actor||actor.role!=='HD'||![1,true].includes(actor.is_active))throw fail(403);
   const [[session]]=await c.execute('SELECT token_hash FROM hd2_sessions WHERE token_hash=? AND user_id=? AND revoked=FALSE AND expires_at>UTC_TIMESTAMP(3) FOR SHARE',[digest(token),user.id]);if(!session)throw fail(401);
   const [grants]=await c.execute('SELECT module FROM hd2_user_modules WHERE user_id=? FOR SHARE',[user.id]);
   const [[order]]=await c.execute('SELECT access_module,status,owner_user_id FROM hd2_orders WHERE id=? FOR SHARE',[id]);
   if(!order||!grants.some(g=>g.module===order.access_module))throw fail(404);
   if(order.status!=='IN_PROGRESS'||String(order.owner_user_id)!==String(user.id))throw fail(403,'Catatan hanya bisa diedit oleh HD yang sedang menangani order.');
   // One shared note per order. Concurrent saves are atomic; last committed save wins.
   await c.execute('INSERT INTO hd2_order_notes(order_id,body,updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE body=?,updated_by=?,updated_at=UTC_TIMESTAMP(3)',[id,text,user.id,text,user.id]);
   await c.execute("INSERT INTO hd2_live_events(module,kind) VALUES (?,'change')",[order.access_module]);
   await c.commit();return {success:true,text};
  }catch(e){await c.rollback();throw e;}finally{
   let reusable=true;
   if(limits)try{await c.query('SET SESSION lock_wait_timeout=?, innodb_lock_wait_timeout=?',[limits.metadataTimeout,limits.rowTimeout]);}catch{reusable=false;c.destroy();}
   if(reusable)c.release();
  }
 }
};}
module.exports={createNotes,input,authorize};
