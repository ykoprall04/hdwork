// Independent of Tunnel rules. No authentication/header supplied by the edge is trusted.
function applicationSessionBoundary(req,res,next) {
  const path=req.path,method=req.method;
  const auth=['/api/auth/login','/api/auth/logout','/api/auth/me','/api/auth/change-password','/api/auth/register','/api/auth/registration-token'].includes(path);
  const accounts=/^\/api\/admin\/users(?:\/|$)/.test(path);
  const operations=/^\/api\/operations(?:\/|$)/.test(path);
  const localHealth=['/health','/ready'].includes(path)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
  if(!(auth||accounts||operations||localHealth))return res.status(404).json({success:false,message:'Endpoint tidak tersedia'});
  res.set('Cache-Control','no-store');
  if(auth&&((['/api/auth/me','/api/auth/registration-token'].includes(path)&&!['GET','HEAD','OPTIONS'].includes(method))||(!['/api/auth/me','/api/auth/registration-token'].includes(path)&&!['POST','OPTIONS'].includes(method))))return res.status(405).json({success:false,message:'Metode tidak tersedia'});
  next();
}
module.exports={applicationSessionBoundary};
