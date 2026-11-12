const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{createChat}=require('../../src/chat/service');
function chatFixture(role,patch={}){
 const id=randomUUID(),actor={id:7,name:'Fixture',username:'fixture',role,is_active:1},order={id,access_module:'TIAL',module:'TIAL',command:'order',status:'IN_PROGRESS',owner_user_id:7,version:2,bot_id:'fixture-bot',chat_id:'-100123',thread_id:'42',message_id:'101'};
 let state={requests:[],outbox:[],messages:[],audit:[]};const options={actor,order,modules:['TIAL'],session:true,route:true,...patch};
 const pool={async getConnection(){let snapshot;return {async beginTransaction(){snapshot=structuredClone(state);},async commit(){},async rollback(){state=snapshot;},release(){},async execute(sql,p=[]){
  if(sql.includes('FROM users'))return [[options.actor]];
  if(sql.includes('FROM hd2_user_modules'))return [options.modules.map(module=>({module}))];
  if(sql.includes('FROM hd2_sessions'))return [options.session?[{token_hash:'fixture'}]:[]];
  if(sql.startsWith('SELECT * FROM hd2_orders'))return [[options.order]];
  if(sql.startsWith('INSERT INTO hd2_web_requests')){if(!state.requests.some(r=>r.requestId===p[1]))state.requests.push({requestId:p[1],payload_hash:p[3],result:null});return [{}];}
  if(sql.includes('FROM hd2_web_requests'))return [state.requests.filter(r=>r.requestId===p[1])];
  if(sql.startsWith('UPDATE hd2_web_requests')){state.requests.find(r=>r.requestId===p[2]).result=p[0];return [{}];}
  if(sql.includes('FROM hd2_system_mappings')){assert.deepEqual(p.slice(0,3),['fixture-bot','-100123','42']);const category=options.routeCategory||'TIAL';if(sql.includes("category IN ('TIAL','LOGIC','ALL')")){if(!['TIAL','LOGIC','ALL'].includes(category))return [[]];}else if(![p[3],'ALL'].includes(category))return [[]];return [options.route?[{id:'fixture-route'}]:[]];}
  if(sql.startsWith('INSERT INTO hd2_courier_outbox')){state.outbox.push({id:p[0],bot_id:p[1],idem_key:p[2],payload_hash:p[3],payload:JSON.parse(p[4])});return [{}];}
  if(sql.includes('FROM hd2_courier_outbox'))return [state.outbox.filter(r=>r.bot_id===p[0]&&r.idem_key===p[1])];
  if(sql.startsWith('INSERT INTO hd2_chat_messages')){state.messages.push(p);return [{}];}
  if(sql.startsWith('INSERT INTO hd2_audit')){state.audit.push(p);return [{}];}
  if(sql.startsWith('INSERT INTO hd2_live_events'))return [{}];
  throw Error('Unexpected chat fixture SQL: '+sql);
 }};}};return {id,options,get state(){return state;},chat:createChat({readPool:pool,writePool:pool,sharedGroups:!!options.sharedGroups})};
}
module.exports={chatFixture};
