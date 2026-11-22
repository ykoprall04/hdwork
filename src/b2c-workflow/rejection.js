// Share the exact rejection text; only static validation labels are included.
const {parseCommand}=require('./commands');
const prefix='\u274c Gagal! Format order salah. Alasan: ';
const commandReplyText='❌ Order harus dikirim sebagai pesan baru.';
function rejectionText(parsed){
 if(parsed.valid||!parsed.command||!Array.isArray(parsed.errors)||!parsed.errors.length||
  parsed.errors.some(x=>typeof x!=='string'||! /^[A-Za-z0-9 /().&_-]{1,100}$/.test(x)))return null;
 // Repeated required labels must not inflate the reply past Telegram's limit
 // and turn a normal validation rejection into a transactional enqueue error.
 const template=require('../../contracts/b2c-commands.json')[parsed.command]?.template;
 return prefix+[...new Set(parsed.errors)].join(', ')+(template?'\n\nTemplate:\n'+template.join('\n'):'');
}
function commandReplyRejection(parsed){
 return parsed.command?commandReplyText:null;
}
function matchesRejection(payload,event,{profile,botUsername,commands}={}){
 if(event.kind!=='message'||event.chat_id!==payload.chat_id||
  event.message_id!==payload.reply_to_message_id||event.telegram_thread_id!==payload.telegram_thread_id)return false;
 const parsed=parseCommand(event.text,profile,botUsername);
 const expected=event.reply_to_message_id===null?rejectionText(parsed):commandReplyRejection(parsed);
 return expected!==null&&(!commands||commands.includes(parsed.command))&&expected===payload.text;
}
module.exports={prefix,commandReplyText,rejectionText,commandReplyRejection,matchesRejection};
