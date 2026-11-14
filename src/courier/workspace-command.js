const specs=require('../../contracts/workspace-commands.json');
function parseWorkspaceCommand(text,profile,botUsername){
 const bad=(errors=['format atau profil workspace'],command=null)=>({valid:false,errors,...(command?{command}:{})});
 if(typeof text!=='string')return bad();
 const head=/^\s*\/(assuren|b2b|replacement)(?:@([A-Za-z0-9_]{5,32}))?(?=\s|$)/i.exec(text);
 if(!head||head[2]&&head[2].toLowerCase()!==botUsername?.toLowerCase())return bad();
 const command=head[1].toLowerCase(),spec=specs[command];if(spec.module!==profile)return bad();
 if(text.length>16384||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))return bad(['format pesan'],command);
 const fields={},errors=[];
 for(const line of text.slice(head[0].length).split(/\r?\n/)){
  const colon=line.indexOf(':');if(colon<0)continue;
  let label=line.slice(0,colon).trim().replace(/\s+/g,' ').toUpperCase().replace(/\s*\/\s*/g,'/');
  if(['NO INET','NO INTERNET','INET','TELP'].includes(label))label='NO INET/TELP';
  if(label==='TIPE TRANSAKSI')label='TRANSAKSI';
  if(![...spec.required,...spec.optional].includes(label))continue;
  if(Object.hasOwn(fields,label)){errors.push(label+' berulang');continue;}
  fields[label]=line.slice(colon+1).trim();
 }
 for(const name of spec.required)if(!fields[name]||fields[name]==='-')errors.push(name);
 for(const [name,kind] of Object.entries(spec.formats||{})){
  const value=fields[name];if(value===undefined||value===null||value==='-')continue;
  if(!new RegExp(specs._formats[kind]).test(value))errors.push(name+' (format)');
 }
 if(errors.length)return bad(errors,command);
 for(const k of spec.optional)fields[k]||=null;
 return {valid:true,command,sc_in:fields['SC/IN'].toUpperCase(),fields,original:text};
}
module.exports={parseWorkspaceCommand,specs};
