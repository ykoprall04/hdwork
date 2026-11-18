const {commands}=require('./command-settings');
const protocol='global-commands-v1';
function validRows(rows){
 return rows&&typeof rows==='object'&&!Array.isArray(rows)&&Object.keys(rows).length===4&&commands.every(k=>rows[k]&&typeof rows[k].enabled==='boolean'&&Number.isSafeInteger(rows[k].version)&&rows[k].version>=0);
}
// Status contains technical settings only, never a lease token or message data.
function createReporter({runtime,botId,now=Date.now}){
 let latest=null;
 return {
  async applied(body){
   if(!body||body.protocol!==protocol||!validRows(body.commands))throw Object.assign(Error('COMMAND_REPORT_INVALID'),{statusCode:400});
   await runtime.assertWorker(body.worker);
   latest={worker:{...body.worker},commands:structuredClone(body.commands),at:now()};
  },
  async status(){
   if(!latest||now()-latest.at>6000)return {protocol,botId,ready:false};
   try{await runtime.assertWorker(latest.worker);}catch{return {protocol,botId,ready:false};}
   return {protocol,botId,ready:true,commands:latest.commands};
  }
 };
}
async function inspect(pool,{fetchStatus=async()=>{
 const port=Number(process.env.HDWORK2_COURIER_STATUS_PORT||3091);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('STATUS_PORT_INVALID');
 const response=await fetch(`http://127.0.0.1:${port}/internal/courier/v1/commands/status`,{signal:AbortSignal.timeout(1000),redirect:'error'});
 if(!response.ok)throw Error('STATUS_UNAVAILABLE');
 return response.json();
},now=Date.now}={}){
 try{
  const [workers]=await pool.execute('SELECT bot_id,expires_ms FROM hd2_courier_workers');
  const active=workers.filter(w=>Number(w.expires_ms)>now());
  if(active.length!==1)return {supported:false,ready:false,reason:'ACTIVE_WORKER_UNVERIFIED'};
  const status=await fetchStatus();
  if(status.protocol!==protocol||status.botId!==active[0].bot_id)return {supported:false,ready:false,reason:'COURIER_UNSUPPORTED'};
  if(status.ready!==true||!validRows(status.commands))return {supported:true,ready:false,reason:'CACHE_NOT_READY'};
  return {supported:true,ready:true,reason:'CACHE_REPORTED',commands:status.commands};
 }catch{return {supported:false,ready:false,reason:'COURIER_UNAVAILABLE'};}
}
function presentation(saved,status){
 return {capability:{supported:status.supported===true,ready:status.ready===true,reason:status.reason},effective:Object.fromEntries(commands.map(k=>{
  const row=status.ready&&status.commands?.[k];
  const matches=row&&row.enabled===saved[k].enabled&&row.version===saved[k].version;
  return [k,{state:matches?'EFFECTIVE':row?'PENDING':'UNAVAILABLE',enabled:row?row.enabled:null,version:row?row.version:null}];
 }))};
}
module.exports={protocol,validRows,createReporter,inspect,presentation};
