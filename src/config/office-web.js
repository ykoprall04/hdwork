const fs=require('node:fs'),path=require('node:path');
const {environment,ingress,origin}=require('./online-candidate');
const {validatePersistentAuth}=require('./persistent-auth');
function officeEnvironment({local=false,dist,publicOrigin=origin}={}) {
  const env={...environment(),HDWORK2_EDGE_AUTH_MODE:'application-session'};
  if(!['https://hdwork.yoloo.space','https://hdwork2.yoloo.space'].includes(publicOrigin))throw Error('Office origin rejected');
  if(!local)env.HDWORK2_PUBLIC_ORIGIN=env.FRONTEND_ORIGINS=publicOrigin;
  if(local){env.HDWORK2_PUBLIC_ORIGIN=env.FRONTEND_ORIGINS='https://localhost:8443';env.HDWORK2_SERVICE_BINDING='loopback';env.HDWORK2_LOCAL_SERVICE_AUTH_APPROVED='true';}
  else {if(typeof dist!=='string')throw Error('Public candidate build required');env.LOCAL_WEB_DIST=dist;}
  return env;
}
function officeIngress({hostname='hdwork.yoloo.space'}={}) {
  if(!['hdwork.yoloo.space','hdwork2.yoloo.space'].includes(hostname))throw Error('Office ingress hostname rejected');
  // Named tunnel; deployment must later substitute its verified UUID.
  return ingress().replace(/hdwork\.yoloo\.space/g,hostname).replace(/tunnel: [^\n]+/,'tunnel: hdwork2').replace(/      access:\n        required: true\n        teamName: [^\n]+\n        audTag:\n          - [^\n]+\n/g,'').replace('No actual tunnel ID, Access audience or credentials.','Application sessions only; no Cloudflare Access. Not activated.').replace('(ready|internal|','(health|ready|internal|');
}
function checkFiles(env,{root=path.resolve(__dirname,'../..')}={}) {
  validatePersistentAuth({...env,HDWORK2_SERVICE_AUTH_APPROVED:'true'});
  const dist=require('./web-build').webBuild(root,env);
  const required=[path.join(dist,'index.html'),'.local/tls/ca.crt','.local/tls/localhost.crt','.local/tls/localhost.key',env.DB_PASSWORD_DPAPI_FILE,env.OP_READ_DB_PASSWORD_DPAPI_FILE,env.JWT_SECRET_DPAPI_FILE];
  const missing=required.filter(file=>!fs.existsSync(path.resolve(root,file))).map(file=>path.relative(root,path.resolve(root,file))),problems=[];
  if(!missing.length){
    try{
      const cert=fs.readFileSync(path.join(root,'.local/tls/localhost.crt')),key=fs.readFileSync(path.join(root,'.local/tls/localhost.key'));
      require('node:tls').createSecureContext({cert,key,minVersion:'TLSv1.2'});
      const x509=new (require('node:crypto').X509Certificate)(cert);
      if(Date.parse(x509.validTo)<=Date.now()||Date.parse(x509.validFrom)>Date.now()||!x509.checkHost('localhost'))throw Error('TLS validity rejected');
    }catch{problems.push('TLS_CERTIFICATE_OR_KEY_REJECTED');}
    try{
      const files=fs.readdirSync(path.join(dist,'assets')).filter(file=>file.endsWith('.js'));
      if(!files.some(file=>fs.readFileSync(path.join(dist,'assets',file),'utf8').includes(env.HDWORK2_PUBLIC_ORIGIN)))problems.push('BUILD_ORIGIN_MISMATCH');
    }catch{problems.push('BUILD_UNAVAILABLE');}
  }
  return {ok:!missing.length&&!problems.length,missing,problems,databaseConnected:false,courierEnabled:false};
}
module.exports={officeEnvironment,officeIngress,checkFiles,origin};
