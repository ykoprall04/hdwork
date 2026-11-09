// Build only: no runtime, credentials, database, Courier or deployment imports.
const path=require('node:path');
function environment(source){
 if(typeof source.VITE_API_BASE_URL!=='string'||!source.VITE_API_BASE_URL.trim())throw Error('VITE_API_BASE_URL is required; set an explicitly verified HTTPS API origin before building');
 let origin;try{origin=new URL(source.VITE_API_BASE_URL);}catch{throw Error('VITE_API_BASE_URL must be a valid HTTPS origin');}
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw Error('VITE_API_BASE_URL must be an HTTPS origin');
 return {...source,VITE_API_BASE_URL:origin.origin,VITE_HDWORK2_AUTH_COOKIE:'true',VITE_HDWORK2_OPERATIONS:'true',VITE_HDWORK2_LIVE_CHAT:'true'};
}
function build({env=process.env,argv=process.argv.slice(2),spawn=require('node:child_process').spawnSync,verifyBuild=require('./frontend-only-release').attest}={}){
 if(argv.length!==1||argv[0]!=='--build')throw Error('Only --build is supported');
 const prepared=environment(env),cli=process.env.npm_execpath;
 // npm supplies its CLI path on Windows and Linux; direct Node execution uses npm.
 const result=cli?spawn(process.execPath,[cli,'run','build','--prefix','frontend'],{cwd:path.resolve(__dirname,'..'),env:prepared,stdio:'inherit'}):spawn(process.platform==='win32'?'npm.cmd':'npm',['run','build','--prefix','frontend'],{cwd:path.resolve(__dirname,'..'),env:prepared,stdio:'inherit',shell:process.platform==='win32'});
 if(result.error)throw result.error;if(result.status!==0)throw Error('Operational frontend build failed');
 return verifyBuild(path.resolve(__dirname,'../frontend/dist'),prepared.VITE_API_BASE_URL,{authCookie:true,operations:true,liveChat:true}).then(hash=>{console.log('FRONTEND_MANIFEST_SHA256='+hash);return hash;});
}
if(require.main===module)Promise.resolve().then(()=>build()).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={environment,build};
