const {parseCommand}=require('../b2c-workflow/commands');
const {fail}=require('./contract');
function singleOrderWindow(base,{reference,notBefore,until}){
 if(!/^LIVE-AO\d{14}$/.test(reference)||!Number.isSafeInteger(notBefore)||!Number.isFinite(until)||until<=Date.now()||base.groups.length!==1||base.groups[0].chatId!=='-5436357946'||base.groups[0].threadId!==null||base.groups[0].profile!=='TIAL1'||base.groups[0].commands.join(',')!=='order')throw fail(503);
 let selected;
 return {...base,ingress(body){
  if(Date.now()>=until)throw fail(503);const value=base.ingress(body),e=value.event;
  const parsed=parseCommand(e.text,'TIAL1','HDWorkOpsBot');
  if(e.timestamp<notBefore||parsed.sc_in!==reference||parsed.command!=='order')throw fail(403);
  const identity=value.update_id+':'+e.message_id;if(selected&&selected!==identity)throw fail(409);selected=identity;return value;
 }};
}
module.exports={singleOrderWindow};
