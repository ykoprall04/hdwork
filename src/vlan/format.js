const {parseNetwork}=require('../b2c-workflow/order-network');
const {parseCommand}=require('../b2c-workflow/commands');
const {lookup,regionForSto}=require('./reference');
const {fail}=require('../operations/policy');
function rawField(raw,labels){
 const found=[];for(const line of raw.split(/\r?\n/)){const colon=line.indexOf(':');if(colon<0)continue;const key=line.slice(0,colon).trim().replace(/\s+/g,' ').toUpperCase().replace(/\s*\/\s*/g,'/');const value=line.slice(colon+1).trim();if(labels.includes(key)&&value&&value!=='-')found.push(value);}
 return found.length===1?found[0]:null;
}
async function formatOrder(detail,pool){
 if(!['order','config_psb'].includes(detail.data.command))throw fail(400,'FORMAT VLAN hanya untuk order dan config_psb');
 const raw=detail.originalMessage||'',parsed=parseCommand(raw,'ALL'),stored=detail.fields||{},fields=parsed.valid?parsed.fields:stored;
 const network=raw?parseNetwork(raw):stored;
 // Web-only updates intentionally leave Courier parser files in place. Older
 // network helpers expose the four original keys; Valins has a safe independent
 // label fallback, so Web and Courier can still be updated separately.
 const valins=network.valins_id??(raw?rawField(raw,['VALINS ID']):stored['VALINS ID']);
 const sto=fields.STO||rawField(raw,['STO']);
 const inet=parsed.valid?(fields['NO INET']||fields['NO INTERNET']):rawField(raw,['NO INET','NO INTERNET','NO INET/TELP']);
 const pots=parsed.valid?fields['NO VOICE']:rawField(raw,['NO VOICE']);
 let vlan;try{vlan=await lookup(pool,network.ip_olt,sto);}catch(e){if(e.code!=='ER_NO_SUCH_TABLE')throw e;vlan={status:'manual',reason:'REFERENCE_UNAVAILABLE',wilayah:regionForSto(sto),text:'CEK VLAN MANUAL'};}
 const value=v=>v??'-';
 const text=['#PELURUSAN #PSB',`INET / POTS : ${value(inet)} / ${value(pots)}`,`STO : ${value(sto)}`,`ODP : ${value(network.odp)}`,`IP OLT : ${value(network.ip_olt)}`,`SLOT / PORT : ${value(network.slot)} / ${value(network.port)}`,`ID VALINS : ${value(valins)}`,'PESAN : 1P INET',fields['SC/IN']||fields['ORDER ID']||detail.data.scIn||'-',`DATA VLAN INET ${vlan.status==='found'?vlan.vlan_inet:'CEK VLAN MANUAL'}`,`DATA VLAN VOIP ${vlan.status==='found'?vlan.vlan_voip:'CEK VLAN MANUAL'}`].join('\n');
 return {text,lookup:vlan};
}
module.exports={formatOrder,rawField};
