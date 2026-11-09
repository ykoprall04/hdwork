// Offline review files only. Never calls SCM, Cloudflare APIs or a tunnel process.
const fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
function prepare(){
 const root=path.resolve(__dirname,'..'),folder=path.join(root,'.local','online-candidate-hdwork2-service-'+randomBytes(8).toString('hex'));
 const {officeEnvironment,officeIngress}=require('../src/config/office-web');
 fs.mkdirSync(folder,{recursive:true});const write=(name,text)=>fs.writeFileSync(path.join(folder,name),text,{flag:'wx',mode:0o600});
 const env=officeEnvironment({dist:path.join(folder,'dist'),publicOrigin:'https://hdwork2.yoloo.space'});
 write('backend.environment',Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n');
 write('ingress.review.yml',officeIngress({hostname:'hdwork2.yoloo.space'}));
 write('ingress.service.review.yml',officeIngress({hostname:'hdwork2.yoloo.space'}).replaceAll(path.join(root,'.local/tls/ca.crt').replace(/\\/g,'/'),'C:/ProgramData/HDWork2/cloudflared/origin-ca.crt'));
 write('service.plan.json',JSON.stringify({reviewOnly:true,installationApproved:false,tunnelIdentityVerified:false,tunnelName:'hdwork2',tunnelId:null,hostname:'hdwork2.yoloo.space',protectedTrialHostname:'hdwork.yoloo.space',windowsServiceName:'Cloudflared',startupType:'Disabled',startApproved:false,dnsApproved:false,publicRouteApproved:false,credentialProvisioningApproved:false,credentialStorageDecisionRequired:true,origin:'https://127.0.0.1:8443',originServerName:'localhost',noTLSVerify:false,cloudflareAccess:false,remoteIngressMustMatch:path.join(folder,'ingress.review.yml'),executable:'C:/Program Files (x86)/cloudflared/cloudflared.exe',plannedServiceFolder:'C:/ProgramData/HDWork2/cloudflared',secretsInCommandLine:false,secretsInReviewFiles:false},null,2)+'\n');
 return {folder,publicOrigin:env.HDWORK2_PUBLIC_ORIGIN,serviceRegistered:false,dnsChanged:false,tunnelStarted:false};
}
if(require.main===module){if(process.argv.length!==3||process.argv[2]!=='--prepare')throw Error('Only offline --prepare supported');console.log(JSON.stringify(prepare()));}
module.exports={prepare};
