// Serialized SQL fixture; no driver or external service.
const {randomUUID}=require('node:crypto');
function fixture(){
 const id=randomUUID();let state={order:{id,bot_id:'synthetic-four',chat_id:'-1007002',message_id:'102',thread_id:'11',command:'b2b',module:'B2B',status:'WAITING',version:0,telegram_timestamp:1700000000,owner_user_id:null,final_user_id:null,duplicate_of:null,duplicate_decision:null},requests:[],outbox:[],audit:[]},tail=Promise.resolve();
 const pool={async execute(sql,p){const c=await pool.getConnection();try{return await c.execute(sql,p);}finally{c.release();}},get state(){return state;},async getConnection(){const previous=tail;let unlock;tail=new Promise(r=>unlock=r);await previous;let saved;return {
  async query(){return [[]];},async beginTransaction(){saved=structuredClone(state);},async commit(){},async rollback(){state=saved;},release(){unlock();},
  async execute(sql,p=[]){
   if(sql.includes('JOIN hd2_courier_outbox')){
    const out=state.outbox.at(-1);return [out?[{order_id:state.order.id,id:out.id,state:out.state||'QUEUED',telegram_message_id:out.telegram_message_id,last_error_code:out.last_error_code}]:[]];
   }
   if(sql.includes('FROM hd2_orders o LEFT JOIN'))return [[{...state.order,started_at:state.order.started_at||null,finished_at:state.order.finished_at||null,owner_name:'Synthetic',final_name:state.order.final_user_id?'Synthetic':null}]];
   if(sql.includes('FROM hd2_audit'))return [state.audit.slice().reverse().map(p=>({id:p[0],action:p[2],from_status:p[4],to_status:p[5],detail:p[6],at:'2026-11-09T00:00:00Z'}))];

   if(sql.includes('FROM users'))return [[{id:p[0],name:'Synthetic',role:'HD',is_active:1}]];
   if(sql.includes('FROM hd2_user_modules'))return [[{module:'B2B'}]];
   if(sql.includes('FROM hd2_sessions'))return [[{token_hash:'synthetic'}]];
   if(sql.startsWith('SELECT * FROM hd2_orders'))return [[state.order]];
   if(sql.startsWith('INSERT INTO hd2_web_requests')){if(!state.requests.some(r=>r.user_id===p[0]&&r.request_id===p[1]))state.requests.push({user_id:p[0],request_id:p[1],payload_hash:p[3],result:null});return [{}];}
   if(sql.includes('FROM hd2_web_requests'))return [state.requests.filter(r=>r.user_id===p[0]&&r.request_id===p[1])];
   if(sql.startsWith('UPDATE hd2_web_requests')){state.requests.find(r=>r.user_id===p[1]&&r.request_id===p[2]).result=p[0];return [{}];}
   if(sql.startsWith('INSERT INTO hd2_courier_outbox')){state.outbox.push({id:p[0],bot_id:p[1],idem_key:p[2],payload_hash:p[3],payload:p[4],state:'QUEUED'});return [{}];}
   if(sql.includes('FROM hd2_courier_outbox'))return [state.outbox.filter(r=>r.bot_id===p[0]&&r.idem_key===p[1])];
   if(sql.startsWith('UPDATE hd2_orders')){Object.assign(state.order,{status:p[0],owner_user_id:p[1],final_user_id:p[2],duplicate_decision:p[3],completion_note:p[4],started_at:p[5]?'2026-11-01T00:00:00Z':state.order.started_at,finished_at:p[6]?'2026-11-02T11:15:00Z':p[7]?null:state.order.finished_at,version:state.order.version+1});return [{}];}
   if(sql.startsWith('INSERT INTO hd2_audit')){state.audit.push(p);return [{}];}
   if(sql.startsWith('INSERT INTO hd2_live_events'))return [{}];
   throw Error('Unexpected isolated SQL contract');
  }
 };}};return {pool,id};
}
module.exports={fixture};
