// Read-only, loopback-only checks. No TLS bypass, redirects, cookies or credentials.
const http=require('http'),https=require('https'),fs=require('fs');
async function probe({apiPort,httpsPort,caFile,rounds=5,deadlineMs=5000}){
 if(![3090,3092,3093].includes(apiPort)||!({3090:8443,3092:8444,3093:8445}[apiPort]===httpsPort)||!Number.isInteger(rounds)||rounds<3||rounds>10)throw Error('HEALTH_SCOPE_REJECTED');
 const ca=fs.readFileSync(caFile),results=[];
 const get=(tls,path)=>new Promise((resolve,reject)=>{
  const start=Date.now(),request=(tls?https:http).request({host:'127.0.0.1',port:tls?httpsPort:apiPort,path,method:'GET',...(tls?{servername:'localhost',ca,rejectUnauthorized:true}:{})},response=>{let bytes=0,body='';response.on('data',b=>{bytes+=b.length;if(bytes>262144)request.destroy(Error('HEALTH_RESPONSE_TOO_LARGE'));else body+=b;});response.on('end',()=>resolve({status:response.statusCode,body,ms:Date.now()-start}));});
  const timer=setTimeout(()=>request.destroy(Error('HEALTH_DEADLINE')),deadlineMs);request.on('close',()=>clearTimeout(timer));request.on('error',reject);request.end();
 });
 for(let i=0;i<rounds;i++){
  const sample={};for(const [tls,path,expected] of [[false,'/health',200],[false,'/ready',200],[true,'/',200],[true,'/ready',404],[true,'/internal',404]]){const r=await get(tls,path);if(r.status!==expected||!tls&&JSON.parse(r.body).ok!==true)throw Error('HEALTH_OR_BOUNDARY_FAILED');sample[(tls?'https':'api')+path]={status:r.status,ms:r.ms};}results.push(sample);
  if(i+1<rounds)await new Promise(r=>setTimeout(r,1000));
 }
 return {kind:'HDWORK2_LOOPBACK_HEALTH',checkedAtUtc:new Date().toISOString(),apiPort,httpsPort,rounds:results,tlsVerified:true,productionChanged:false,publicIngressVerified:false};
}
if(require.main===module)(async()=>{const [api,tls,ca,output]=process.argv.slice(2);if(process.argv.length!==6)throw Error('USAGE_API_PORT_HTTPS_PORT_CA_NEW_RECEIPT');const r=await probe({apiPort:Number(api),httpsPort:Number(tls),caFile:ca});fs.writeFileSync(output,JSON.stringify(r,null,2),{flag:'wx'});console.log('LOOPBACK_HEALTH_PASS');})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
module.exports={probe};
