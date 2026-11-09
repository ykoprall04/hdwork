const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const checks=['domainOwnershipConfirmed','cloudflareAccountConfirmed','accessPolicyVerified','remoteIngressVerified','mysqlFirewallVerified','realDataSourceVerified','operationalReadGrantsVerified','persistentAuthReviewed','productionBuildVerified','originSecurityVerified'];
function blockers(plan,now=Date.now()){
 const reasons=[];
 if(!plan||typeof plan!=='object')return ['PLAN_MISSING'];
 if(typeof plan.hostname!=='string'||! /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(plan.hostname)||/\.(invalid|localhost|trycloudflare\.com)$/i.test(plan.hostname))reasons.push('OWNED_HOSTNAME_REQUIRED');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(plan.tunnelId||''))reasons.push('TUNNEL_ID_REQUIRED');
 if(plan.origin!=='https://127.0.0.1:8443'||plan.originServerName!=='localhost'||plan.noTLSVerify!==false)reasons.push('ORIGIN_TLS_REJECTED');
 const appOnly=plan.securityMode==='application-session'&&plan.access?.required===false;
 if(appOnly){
  if(plan.tunnelName!=='hdwork2'||plan.applicationAuth?.sessionV2!==true||plan.applicationAuth?.operationalReadOnly!==true||['endpointAllowlistVerified','loginRateLimitVerified','proxyBoundaryVerified','liveSessionVerified'].some(key=>plan.applicationAuth?.[key]!==true))reasons.push('APPLICATION_AUTH_REVIEW_REQUIRED');
 }else if(!plan.access?.required||! /^[a-z0-9-]+$/i.test(plan.access.teamName||'')||!Array.isArray(plan.access.audTag)||!plan.access.audTag.length||plan.access.audTag.some(v=>! /^[a-f0-9]{64}$/i.test(v)))reasons.push('CLOUDFLARE_ACCESS_REQUIRED');
 for(const check of checks)if(!(appOnly&&check==='accessPolicyVerified')&&plan.checks?.[check]!==true)reasons.push(check.toUpperCase());
 if(plan.publicStartApproved!==true||!Number.isFinite(Date.parse(plan.approvalUntil||''))||Date.parse(plan.approvalUntil)<=now||Date.parse(plan.approvalUntil)-now>24*3600000)reasons.push('EXPLICIT_PUBLIC_APPROVAL_REQUIRED');
 const secret=path.resolve(root,plan.tokenDpapiFile||'');
 if(!secret.startsWith(path.join(root,'.local')+path.sep)||!secret.endsWith('.dpapi'))reasons.push('ENCRYPTED_TUNNEL_TOKEN_REQUIRED');
 return reasons;
}
function renderIngress(plan){
 if(plan.securityMode==='application-session'&&plan.access?.required===false){
  if(!['hdwork.yoloo.space','hdwork2.yoloo.space'].includes(plan.hostname)||plan.tunnelName!=='hdwork2')throw Error('Application-session ingress scope rejected');
  const text=require('./office-web').officeIngress({hostname:plan.hostname});
  return /^[a-f0-9-]{36}$/i.test(plan.tunnelId||'')?text.replace('tunnel: hdwork2','tunnel: '+plan.tunnelId):text;
 }
 const hostname=plan.hostname&&/^[a-z0-9.-]+$/i.test(plan.hostname)?plan.hostname:'hdwork.example.invalid';
 const tunnel=/^[a-f0-9-]{36}$/i.test(plan.tunnelId||'')?plan.tunnelId:'00000000-0000-4000-8000-000000000000';
 const team=plan.access?.teamName&&/^[a-z0-9-]+$/i.test(plan.access.teamName)?plan.access.teamName:'replace-with-owned-team';
 const aud=plan.access?.audTag?.filter(v=>/^[a-f0-9]{64}$/i.test(v))||[];
 return '# REVIEW/OFFLINE VALIDATION ONLY. Does not create a tunnel or DNS.\n'+
  'tunnel: '+tunnel+'\n'+'ingress:\n'+
  '  - hostname: '+hostname+'\n    path: "^/(ready|internal|legacy|preview|uploads|socket[.]io|json|devtools|metrics)(/|$)"\n    service: http_status:404\n'+
  '  - hostname: '+hostname+'\n    service: https://127.0.0.1:8443\n    originRequest:\n      originServerName: localhost\n      caPool: '+JSON.stringify(path.join(root,'.local/tls/ca.crt').replace(/\\/g,'/'))+'\n      noTLSVerify: false\n      access:\n        required: true\n        teamName: '+team+'\n        audTag:\n'+(aud.length?aud:['0'.repeat(64)]).map(v=>'          - '+v+'\n').join('')+
  '  - service: http_status:404\n';
}
module.exports={blockers,renderIngress,checks};
