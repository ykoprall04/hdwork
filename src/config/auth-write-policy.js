// Approval is process-scoped and time-bounded. No file/env is changed here.
const mutationPaths=new Set(['/api/auth/login','/api/auth/logout']);
const readPaths=new Set(['/health','/ready','/api/auth/me']);
function validateAuthWriteScope(env=process.env,now=Date.now()){
 if(require('./persistent-auth').validatePersistentAuth(env))return Infinity;
 if(env.HDWORK2_AUTH_WRITE_ENABLED!==undefined&&!['true','false'].includes(env.HDWORK2_AUTH_WRITE_ENABLED))throw Error('Invalid auth write flag');
 if(env.HDWORK2_AUTH_ONLY!==undefined&&!['true','false'].includes(env.HDWORK2_AUTH_ONLY))throw Error('Invalid auth-only flag');
 if(env.HDWORK2_AUTH_ONLY==='true'&&(env.HDWORK2_LOCAL_READ_ONLY!=='true'||env.HDWORK2_AUTH_V2!=='true'))throw Error('Auth-only mode requires read-only and V2');
 if(env.HDWORK2_AUTH_WRITE_ENABLED!=='true')return null;
 const dashboard=env.HDWORK2_AUTH_READ_DASHBOARD==='true';
 const exact={HDWORK2_AUTH_ONLY:dashboard?'false':'true',HDWORK2_LOCAL_READ_ONLY:'true',HDWORK2_AUTH_V2:'true',DB_USER:'hdwork_auth',DB_NAME:'hdwork2',DB_HOST:'127.0.0.1',DB_PORT:'3306',HDWORK2_OPERATIONS_ENABLED:dashboard?'true':'false',B2C_WORKFLOW_READ_ENABLED:'false',B2C_STAGING_ENABLED:'false',COURIER_ENABLED:'false',COURIER_ALLOW_NETWORK:'false',HDWORK2_AUTH_WRITE_APPROVAL:dashboard?'APPROVED_AUTH_WITH_READ_ONLY_DASHBOARD':'APPROVED_AUTH_SESSION_AUDIT_ONLY'};
 if(dashboard&&(env.OP_WRITE_ENABLED!=='false'||env.OP_READ_DB_USER!=='hdwork_ops_read'||env.OP_READ_ENABLED!=='true'||env.HDWORK2_OPERATIONAL_WRITE_APPROVED==='true'))throw Error('Read-only dashboard scope rejected');
 if(Object.entries(exact).some(([key,value])=>env[key]!==value))throw Error('Auth-only scope rejected');
 const until=Date.parse(env.HDWORK2_AUTH_WRITE_UNTIL||'');
 if(!Number.isFinite(until)||until<=now||until-now>15*60*1000)throw Error('Auth approval expired or exceeds 15 minutes');
 return until;
}
function authWritePolicy(env=process.env,{now=Date.now}={}){
 const until=validateAuthWriteScope(env,now());
 return (req,res,next)=>{
  const read=['GET','HEAD','OPTIONS'].includes(req.method),authMutation=req.method==='POST'&&mutationPaths.has(req.path);
  const reject=()=>res.status(503).json({success:false,message:'Operasi tidak diizinkan pada mode validasi autentikasi/read-only'});
  if(env.HDWORK2_AUTH_ONLY==='true'&&!((read&&readPaths.has(req.path))||authMutation))return reject();
  if(env.HDWORK2_AUTH_READ_DASHBOARD==='true'&&read&&!readPaths.has(req.path)&&!req.path.startsWith('/api/operations/'))return reject();
  const serviceActive=until!==Infinity||env.HDWORK2_SERVICE_AUTH_APPROVED==='true';
  const scopedTestingMutation=env.HDWORK2_TESTING_SOLVER_ENABLED==='true'&&require('../operations/testing-solver-scope').mutationPath(req.method,req.path)&&require('../operations/testing-solver-scope').configuration(env);
  if(scopedTestingMutation)return next(); // Auth + immutable user/group checks follow in the route and transaction.
  if(!read&&env.HDWORK2_LOCAL_READ_ONLY==='true'&&!(authMutation&&serviceActive&&until!==null&&now()<until))return reject();
  next();
 };
}
module.exports={validateAuthWriteScope,authWritePolicy};
