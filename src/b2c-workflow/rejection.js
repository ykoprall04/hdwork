// Share the exact rejection text; only static validation labels are included.
const {parseCommand,parseLegacyCommand}=require('./commands');
const prefix='\u274c Gagal! Format order salah. Alasan: ';
function rejectionText(parsed){
 if(parsed.valid||!parsed.command||!Array.isArray(parsed.errors)||!parsed.errors.length||
  parsed.errors.some(x=>typeof x!=='string'||! /^[A-Za-z0-9 /().&_-]{1,100}$/.test(x)))return null;
 // Repeated required labels must not inflate the reply past Telegram's limit
 // and turn a normal validation rejection into a transactional enqueue error.
 const template=require('../../contracts/b2c-commands.json')[parsed.command]?.template;
 return prefix+[...new Set(parsed.errors)].join(', ')+(template?'\n\nTemplate:\n'+template.join('\n'):'');
}
function matchesRejection(payload,event,{profile,botUsername,commands}={}){
 if(event.kind!=='message'||event.reply_to_message_id!==null||event.chat_id!==payload.chat_id||
  event.message_id!==payload.reply_to_message_id||event.telegram_thread_id!==payload.telegram_thread_id)return false;
 const parsed=parseCommand(event.text,profile,botUsername);
 const expected=rejectionText(parsed);
 return expected!==null&&(!commands||commands.includes(parsed.command))&&expected===payload.text;
}
function matchesLegacyRejection(payload,event,{profile,botUsername,commands}={}){
 if(event.kind!=='message'||event.reply_to_message_id!==null||event.chat_id!==payload.chat_id||
  event.message_id!==payload.reply_to_message_id||event.telegram_thread_id!==payload.telegram_thread_id)return false;
 const parsed=parseLegacyCommand(event.text,profile,botUsername);
 if(!['order','mo','config_psb'].includes(parsed.command)||commands&&!commands.includes(parsed.command))return false;
 const full=rejectionText(parsed);if(full===null)return false;
 // Historical rejection used the same safe reasons but no template suffix.
 const expected=prefix+[...new Set(parsed.errors)].join(', ');
 return expected===payload.text;
}
module.exports={prefix,rejectionText,matchesRejection,matchesLegacyRejection};
