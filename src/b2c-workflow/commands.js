const spec=require('../../contracts/b2c-commands.json');
function parseCommand(text,profile,botUsername) {
  if(profile==='ALL'&&typeof text!=='string')return {valid:false,errors:['format']};
  if(profile==='ALL'){const head=/^\s*\/(assuren|b2b|replacement)(?:@|\s|$)/i.exec(text||'');if(head)return parseCommand(text,head[1].toUpperCase(),botUsername);profile='TIAL1';}
  if(['ASSUREN','B2B','REPLACEMENT'].includes(profile))return require('../courier/workspace-command').parseWorkspaceCommand(text,profile,botUsername);
  const reject=(fields,command=null)=>({valid:false,errors:fields,...(command?{command}:{})});
  if(typeof text!=='string'||text.length>16384)return reject(['format']);
  const head=/^\s*\/(order|config_psb|mo|req)(?:@([A-Za-z0-9_]{5,32}))?(?=\s|$)/i.exec(text);
  if(!head)return reject(['perintah']);
  if(head[2]&&(!botUsername||head[2].toLowerCase()!==botUsername.toLowerCase()))return reject(['perintah']);
  const command=head[1].toLowerCase(),body=text.slice(head[0].length);
  if(!['TIAL1','TIAL2','SOLVER1'].includes(profile)||(profile==='SOLVER1'&&command==='order'))return reject(['perintah tidak diizinkan di grup ini']);
  if(command==='req')return {valid:true,command,sc_in:null,fields:{},request:body,original:text};
  const rule=spec[command],fields={},errors=[];
  for(const line of body.split(/\r?\n/)){
    const colon=line.indexOf(':');if(colon<0)continue;
    let label=line.slice(0,colon).trim().replace(/\s+/g,' ').toUpperCase().replace(/\s*\/\s*/g,'/');
    if(label==='ODP')label='SUMMARY ODP';
    if(label==='TIPE ONT BARU')label='TIPE ONT';
    if(label==='TRANSAKSI'&&command==='mo')label='TIPE TRANSAKSI';
    if(label==='USEE TV')label='NO USEE';
    if(label==='ORDER ID DSC')label='ORDER ID';
    const combined=label==='NO INET/TELP';
    if(combined)label=[...rule.required,...rule.optional].includes('NO INET')?'NO INET':'NO INTERNET';
    label=rule.aliases?.[label]||label;
    if(![...rule.required,...rule.optional].includes(label))continue;
    const value=line.slice(colon+1).trim();
    const numbers=combined&&command==='mo'?value.split('/'):null;
    const entries=numbers?.length===2?[[label,numbers[0].trim()],['NO VOICE',numbers[1].trim()]]:[[label,value]];
    for(const [name,part] of entries){
      if(Object.hasOwn(fields,name))errors.push(name+' berulang');
      fields[name]=part&&(part!=='-'||name!==rule.identity)?part:null;
    }
  }
  for(const name of rule.required)if(!fields[name])errors.push(name);
  for(const [name,kind] of Object.entries(rule.formats||{})){
    const value=fields[name];if(value===undefined||value===null||value==='-')continue;
    const candidate=rule.optional.includes(name)&&kind!=='text'?value.replace(/^-/,''):value;
    if(kind==='service'? !spec._formats.service.includes(candidate.toUpperCase()) : !new RegExp(spec._formats[kind]).test(candidate))errors.push(name+' (format)');
  }
  let code=null;
  if(fields[rule.identity]){
    const matches=[...fields[rule.identity].split('_')[0].matchAll(/\b([A-Za-z0-9]+)-((?:PDA|AO|MO|DO)[A-Za-z0-9]*)(?=_|\s|$)/gi)];
    if(matches.length===1&&rule.codes.some(c=>matches[0][2].toUpperCase().startsWith(c)))code=command==='mo'?matches[0][2]:matches[0][1]+'-'+matches[0][2];
    if(command==='mo'&&!code&&/^(?:PDA|AO|MO|DO)[A-Za-z0-9]+$/i.test(fields[rule.identity].trim()))code=fields[rule.identity].trim();
    if(!code||code.length>100)errors.push(rule.identity+' (kode transaksi)');
  }
  if(code){fields[rule.identity]=code;if(command!=='config_psb')fields['TIPE TRANSAKSI']=/^(PDA|AO|MO|DO)/i.exec(code.split('-').pop())[1].toUpperCase();}
  if(['order','config_psb'].includes(command))Object.assign(fields,require('./order-network').parseNetwork(body));
  for(const name of rule.optional)if(!Object.hasOwn(fields,name))fields[name]=null;
  return errors.length?reject(errors,command):{valid:true,command,sc_in:code,fields,original:text};
}
module.exports={parseCommand};
