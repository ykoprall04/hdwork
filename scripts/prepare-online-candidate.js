// Offline only: no runtime imports, DPAPI decryption, database or network calls.
const fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
const {environment,ingress,validateEnvironment,origin}=require('../src/config/online-candidate');
function prepare(){
  const root=path.resolve(__dirname,'..');
  const folder=path.join(root,'.local','online-candidate-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(4).toString('hex'));
  const env={...environment(),LOCAL_WEB_DIST:path.join(folder,'dist')};validateEnvironment(env);fs.mkdirSync(folder,{recursive:true});
  const write=(name,value)=>fs.writeFileSync(path.join(folder,name),value,{flag:'wx',mode:0o600});
  write('backend.environment',Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n');
  write('frontend.environment','VITE_API_BASE_URL='+origin+'\nVITE_HDWORK2_AUTH_COOKIE=true\nVITE_HDWORK2_OPERATIONS=true\n');
  write('ingress.review.yml',ingress());
  write('tunnel.plan.review.json',JSON.stringify({hostname:new URL(origin).hostname,tunnelId:null,origin:'https://127.0.0.1:8443',originServerName:'localhost',noTLSVerify:false,access:{required:true,teamName:'',audTag:[]},checks:Object.fromEntries(require('../src/config/tunnel-plan').checks.map(key=>[key,false])),publicStartApproved:false,approvalUntil:null,tokenDpapiFile:'.local/cloudflare/token.dpapi',maxRestarts:2},null,2)+'\n');
  write('access.review.json',JSON.stringify({reviewOnly:true,activationApproved:false,hostname:new URL(origin).hostname,protectEntireHostname:true,defaultDeny:true,allowedIdentities:[],mfaRequired:true,teamName:null,audience:null,sessionDuration:'8h',serviceTokenInFrontend:false},null,2)+'\n');
  write('activation.review.json',JSON.stringify({runtimeApproved:false,publicStartApproved:false,dnsChangeApproved:false,productionCutoverApproved:false,databaseConnectionsStarted:false,courierEnabled:false,readPoolConfiguredOnly:true,buildDirectory:path.join(folder,'dist'),pending:['owned Cloudflare account and domain verification','tunnel ID and DPAPI token','Access identities/team/audience','existing session-signing secret preserved in DPAPI and verified privately','actual auth/read grants and network security verification under separate approval','public-origin cookie/CSRF and Access validation before cutover']},null,2)+'\n');
  return {folder,buildDirectory:path.join(folder,'dist'),...validateEnvironment(env)};
}
if(require.main===module){if(process.argv.length!==3||process.argv[2]!=='--prepare')throw Error('Only offline --prepare supported');console.log(JSON.stringify(prepare()));}
module.exports={prepare};
