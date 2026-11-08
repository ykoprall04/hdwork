const spec=require('../../contracts/b2c-commands.json');
function parseCommand(text,profile) {
  const reject=fields=>({valid:false,errors:fields});
  if(typeof text!=='string'||text.length>16384)return reject(['format']);
  const head=/^\s*\/(order|config_psb|mo|req)(?=\s|$)/i.exec(text);
  if(!head)return reject(['perintah']);
  const command=head[1].toLowerCase(),body=text.slice(head[0].length);
  if(!['TIAL1','TIAL2','SOLVER1'].includes(profile)||(profile==='SOLVER1'&&command==='order'))return reject(['perintah tidak diizinkan di grup ini']);
  if(command==='req')return body.trim()?{valid:true,command,sc_in:null,fields:{},request:body,original:text}:reject(['teks permintaan']);
  const rule=spec[command],fields={},errors=[];
  for(const line of body.split(/\r?\n/)){
    const colon=line.indexOf(':');if(colon<0)continue;
    let label=line.slice(0,colon).trim().replace(/\s+/g,' ').toUpperCase().replace(/\s*\/\s*/g,'/');
    if(label==='ORDER ID DSC')label='ORDER ID';
    if(![...rule.required,...rule.optional].includes(label))continue;
    if(Object.hasOwn(fields,label))errors.push(label+' berulang');
    const value=line.slice(colon+1).trim();fields[label]=value&&value!=='-'?value:null;
  }
  for(const name of rule.required)if(!fields[name])errors.push(name);
  if(fields.SERVICE && !['1P','2P','3P','1P-VOICE'].includes(fields.SERVICE.toUpperCase()))errors.push('SERVICE');
  let code=null;
  if(fields[rule.identity]){
    const matches=[...fields[rule.identity].split('_')[0].matchAll(/\b([A-Za-z0-9]+)-((?:PDA|AO|MO|DO)[A-Za-z0-9]*)(?=_|\s|$)/gi)];
    if(matches.length===1&&rule.codes.some(c=>matches[0][2].toUpperCase().startsWith(c)))code=command==='mo'?matches[0][2]:matches[0][1]+'-'+matches[0][2];
    if(!code||code.length>100)errors.push(rule.identity+' (kode transaksi)');
  }
  for(const name of rule.optional)if(!Object.hasOwn(fields,name))fields[name]=null;
  return errors.length?reject(errors):{valid:true,command,sc_in:code,fields,original:text};
}
module.exports={parseCommand};
