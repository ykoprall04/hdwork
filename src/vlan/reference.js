const {isIP}=require('node:net');
const {fail}=require('../operations/policy');
const STO_AREA={
 SBU:['BBA','BBE','BDG','BPG','BWN','CRM','DDS','GSK','KBL','KDE','KJR','KLN','KNN','KPS','KRP','LKI','LMG','MGO','POG','PRK','SDD','SDY','TNS'],
 MDR:['ABT','AJA','ARB','BAB','BEA','BKL','KML','KPP','MSL','OMB','PME','PRG','SMP','SPD','SPG','SPK','TBU','WRP'],
 SBS:['DMO','GBG','IJK','JGR','MYR','RKT','TPO']
};
function regionForSto(sto){const key=String(sto||'').trim().toUpperCase();return Object.keys(STO_AREA).find(area=>STO_AREA[area].includes(key))||null;}
function vlan(value){
 if(typeof value!=='string'||!value.length||value.length>128||value!==value.trim()||!/^\d+(?:-\d+)?(?:[ ,;]+\d+(?:-\d+)?)*$/.test(value)||[...value.matchAll(/(\d+)-(\d+)/g)].some(m=>Number(m[1])>Number(m[2])))throw fail(400,'VLAN harus teks angka/rentang yang valid (maksimal 128 karakter)');
 return value;
}
function input(body){
 if(!body||Array.isArray(body)||Object.keys(body).sort().join(',')!=='ip_olt,vlan_inet,vlan_voip,wilayah'||typeof body.ip_olt!=='string'||isIP(body.ip_olt)!==4||!Object.hasOwn(STO_AREA,body.wilayah))throw fail(400,'IP OLT atau wilayah tidak valid');
 return {ip_olt:body.ip_olt,wilayah:body.wilayah,vlan_inet:vlan(body.vlan_inet),vlan_voip:vlan(body.vlan_voip)};
}
async function lookup(pool,ip,sto){
 const wilayah=regionForSto(sto);
 const manual=reason=>({status:'manual',reason,wilayah,text:'CEK VLAN MANUAL'});
 if(!wilayah)return manual('UNKNOWN_STO');
 if(typeof ip!=='string'||isIP(ip)!==4)return manual('MISSING_IP');
 const [rows]=await pool.execute('SELECT DISTINCT vlan_inet,vlan_voip FROM hd2_vlan_reference WHERE ip_olt=? AND wilayah=? LIMIT 2',[ip,wilayah]);
 if(!rows.length)return manual('NOT_FOUND');if(rows.length>1)return manual('AMBIGUOUS');
 return {status:'found',wilayah,vlan_inet:rows[0].vlan_inet,vlan_voip:rows[0].vlan_voip};
}
module.exports={STO_AREA,regionForSto,vlan,input,lookup};
