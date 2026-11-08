// Pure preparation; never changes env, DNS, TLS or tunnel configuration.
const net=require('node:net');
function webOrigin(env,port){
 const local=`https://localhost:${port}`,value=env.HDWORK2_PUBLIC_ORIGIN||local;
 if(value!==local){
  let u;try{u=new URL(value);}catch{throw Error('Web origin rejected');}
  if(env.HDWORK2_PUBLIC_ORIGIN_APPROVED!=='true'||u.protocol!=='https:'||u.origin!==value||u.username||u.password||u.port||net.isIP(u.hostname)||! /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(u.hostname)||/(^|\.)(localhost|invalid|test|trycloudflare\.com)$/i.test(u.hostname))throw Error('Web origin rejected');
 }
 if(env.FRONTEND_ORIGINS!==value)throw Error('Web origin and CORS must match');
 const hosts=[new URL(value).host,`localhost:${port}`,`127.0.0.1:${port}`];
 if(env.HDWORK2_PUBLIC_API_ORIGIN){
  let api;try{api=new URL(env.HDWORK2_PUBLIC_API_ORIGIN);}catch{throw Error('API origin rejected');}
  const frontend=new URL(value);
  if(value===local||env.HDWORK2_PUBLIC_API_ORIGIN_APPROVED!=='true'||api.protocol!=='https:'||api.origin!==env.HDWORK2_PUBLIC_API_ORIGIN||api.username||api.password||api.port||net.isIP(api.hostname)||!api.hostname.endsWith('.'+frontend.hostname)||! /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(api.hostname))throw Error('API origin rejected');
  hosts.push(api.host);
 }
 return {origin:value,allowedHosts:[...new Set(hosts)]};
}
module.exports={webOrigin};
