const specs=require('../../contracts/workspace-commands.json');
function parseWorkspaceCommand(text,profile,botUsername){
 const bad=()=>({valid:false,errors:['format atau profil workspace']});
 if(typeof text!=='string'||text.length>16384||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))return bad();
 const head=/^\s*\/(assuren|b2b|replacement)(?:@([A-Za-z0-9_]{5,32}))?(?=\s|$)/i.exec(text);
 if(!head||head[2]&&head[2].toLowerCase()!==botUsername?.toLowerCase())return bad();
 const command=head[1].toLowerCase(),spec=specs[command];if(spec.module!==profile)return bad();
 const fields={};
 for(const line of text.slice(head[0].length).split(/\r?\n/)){
  const colon=line.indexOf(':');if(colon<0)continue;
  let label=line.slice(0,colon).trim().replace(/\s+/g,' ').toUpperCase().replace(/\s*\/\s*/g,'/');
  if(['NO INET','NO INTERNET','INET','TELP'].includes(label))label='NO INET/TELP';
  if(label==='TIPE TRANSAKSI')label='TRANSAKSI';
  if(![...spec.required,...spec.optional].includes(label))continue;
  if(Object.hasOwn(fields,label))return bad();
  fields[label]=line.slice(colon+1).trim();
 }
 if(spec.required.some(k=>!fields[k]||fields[k]==='-'))return bad();
 if(!/^[A-Za-z0-9][A-Za-z0-9/_-]{0,99}$/.test(fields['SC/IN'])||!/^\+?[0-9][0-9 -]{2,98}$/.test(fields['NO INET/TELP'])||! /^[A-Za-z0-9_-]{2,20}$/.test(fields.STO)||fields.TRANSAKSI.length>100||(fields.KETERANGAN||'').length>2000)return bad();
 for(const k of spec.optional)fields[k]||=null;
 return {valid:true,command,sc_in:fields['SC/IN'].toUpperCase(),fields,original:text};
}
module.exports={parseWorkspaceCommand,specs};
