// Only consecutive IP OLT / Slot / Port lines form an equipment group.
function parseNetwork(body) {
  const lines=body.split(/\r?\n/),odps=[],groups=[],valins=[];
  const read=(line,label)=>new RegExp('^\\s*'+label+'\\s*:\\s*(.*?)\\s*$','i').exec(line||'')?.[1];
  for(let i=0;i<lines.length;i++){
    const valin=read(lines[i],'Valins ID');if(valin&&valin!=='-')valins.push(valin);
    const odp=read(lines[i],'(?:Summary ODP|ODP)');
    if(odp&&odp!=='-')odps.push(odp.replace(/\/(\d)(?=\D|$)/g,'/0$1'));
    const ip=read(lines[i],'IP OLT');
    if(ip!==undefined){
      const slot=read(lines[i+1],'Slot'),port=slot!==undefined?read(lines[i+2],'Port'):undefined;
      groups.push({ip_olt:/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)&&ip.split('.').every(n=>Number(n)<=255)?ip:null,slot:/^\d+$/.test(slot||'')?slot:null,port:/^\d+$/.test(port||'')?port:null});
    }
  }
  return {odp:odps.length===1?odps[0]:null,valins_id:valins.length===1?valins[0]:null,...(groups.length===1?groups[0]:{ip_olt:null,slot:null,port:null})};
}
module.exports={parseNetwork};
