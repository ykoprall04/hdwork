// Describes and checks the existing operational contracts; does not invent transitions.
const {categories}=require('../system/policy');
const {validateGroups}=require('../courier/groups');
const definitions=require('../../contracts/b2c-commands.json');
function contract(){return Object.entries(categories).map(([category,value])=>({category,profiles:value.profiles,commands:value.commands.map(command=>({command,module:{order:'TIAL',req:'REQ',config_psb:'LOGIC_PSB',mo:'LOGIC_MO'}[command],required:definitions[command]?.required||['request text'],optional:definitions[command]?.optional||[],businessDeduplication:command==='order'?'SC_IN_FULL_HISTORY':'MESSAGE_ID_ONLY'}))}));}
function coverage(checked){for(const group of checked){const category=Object.values(categories).find(c=>c.profiles.includes(group.profile));if(!category||group.commands.some(c=>!category.commands.includes(c)))throw Error('B2C_ROUTE_CONTRACT_REJECTED');}
 const data=contract().map(c=>{const permitted=new Set(checked.filter(g=>c.profiles.includes(g.profile)).flatMap(g=>g.commands));const missing=c.commands.map(c=>c.command).filter(c=>!permitted.has(c));return {...c,configured:missing.length===0,missingCommands:missing};});return {categories:data,configured:data.every(c=>c.configured),rulesNeedingConfirmation:['RECEK','OPERATIONAL_ESCALATION'],liveVerified:false};}
function routes(groups){return coverage(validateGroups(groups));}
async function snapshot({pool,writerAvailable=false,now=Date.now}){
 const [mappings]=await pool.execute('SELECT bot_id,category,profile,chat_id,thread_id FROM hd2_system_mappings WHERE enabled=TRUE AND verified=TRUE ORDER BY id');
 let result;if(mappings.length){const checked=[...new Set(mappings.map(r=>r.bot_id))].flatMap(bot=>validateGroups(mappings.filter(r=>r.bot_id===bot).map(r=>({chatId:r.chat_id,threadId:r.thread_id,threadMode:r.thread_id===null?'non_topic':'thread',profile:r.profile,commands:categories[r.category].commands}))));result=coverage(checked);}else result={categories:contract().map(c=>({...c,configured:false,missingCommands:c.commands.map(c=>c.command)})),configured:false,rulesNeedingConfirmation:['RECEK','OPERATIONAL_ESCALATION'],liveVerified:false};
 const [workers]=await pool.execute('SELECT bot_id,expires_ms FROM hd2_courier_workers');const bots=[...new Set(mappings.map(m=>m.bot_id))];const leases=bots.length>0&&bots.every(bot=>workers.some(w=>w.bot_id===bot&&Number(w.expires_ms)>now()));return {...result,writerAvailable,courierLeaseActive:leases,readyForControlledTest:result.configured&&writerAvailable&&leases,checkedAt:new Date(now()).toISOString(),telegramDeliveryVerified:false};
}
module.exports={contract,routes,snapshot};
