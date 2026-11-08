// Prepared adapter for hdwork2 only. Never imports a DB driver or a legacy source.
const {reader,readTx}=require('./read');
function createRealDataAdapter(pool){
 const guarded={async getConnection(){
  const c=await pool.getConnection();
  try{const [[row]]=await c.query('SELECT DATABASE() AS name');if(row.name!=='hdwork2')throw Object.assign(Error('Operational target rejected'),{code:'OPERATIONAL_TARGET_REJECTED'});return c;}
  catch(error){c.release();throw error;}
 }};
 return Object.freeze({
  source:'hdwork2',readOnly:true,
  list:(query,user)=>readTx(guarded,c=>reader(c).list(query,user)),
  recap:(query,user)=>readTx(guarded,c=>reader(c).recap(query,user)),
  people:(user,page)=>readTx(guarded,c=>reader(c).people(user,page)),
  detail:(id,user,page)=>reader(guarded).detail(id,user,page),
 });
}
module.exports={createRealDataAdapter};
