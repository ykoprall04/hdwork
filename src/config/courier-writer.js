// Explicit bot scope; existing global FIFO settings retain their historical behavior.
function bots(env=process.env){
 const raw=env.HDWORK2_COURIER_WRITER_V2_BOTS_JSON;
 if(raw===undefined)return [];
 let list;try{list=JSON.parse(raw);}catch{throw Error('WRITER_V2_BOT_SCOPE_REJECTED');}
 if(!Array.isArray(list)||list.length>64||new Set(list).size!==list.length||list.some(x=>typeof x!=='string'||!/^[a-z][a-z0-9_-]{1,63}$/.test(x)))throw Error('WRITER_V2_BOT_SCOPE_REJECTED');
 return list;
}
module.exports={bots};
