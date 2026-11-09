const {timingSafeEqual}=require('node:crypto');
const {createService,reject}=require('./service');
const cookieName='__Host-hdwork2-session';
let instance;
function service(){if(process.env.DB_NAME!=='hdwork2'||process.env.HDWORK2_AUTH_V2!=='true')throw reject(503);return instance||=(createService(require('./store').createStore(require('../config/database')),process.env.JWT_SECRET));}
function cookie(req){const parts=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName+'='));if(parts.length!==1)throw reject(401);const token=parts[0].slice(cookieName.length+1);if(token.length>2048||! /^[A-Za-z0-9_.-]+$/.test(token))throw reject(401);return token;}
function allowedOrigin(req){return (process.env.FRONTEND_ORIGINS||'').split(',').map(s=>s.trim()).includes(req.headers.origin);}
function csrf(req,token){const value=req.headers['x-csrf-token'],expected=service().csrf(token);if(!allowedOrigin(req)||typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)||value.length!==expected.length||!timingSafeEqual(Buffer.from(value),Buffer.from(expected)))throw reject();}
function error(res,e){if(e.code==='ER_DUP_ENTRY')e.statusCode=409;return res.status([400,401,403,404,409].includes(e.statusCode)?e.statusCode:503).json({success:false,message:'Permintaan akun tidak dapat diproses'});}
async function auth(req,res,next){res.set('Cache-Control','no-store');try{req.sessionToken=cookie(req);req.user=await service().me(req.sessionToken);next();}catch(e){error(res,e);}}
function setCookie(res,token,clear=false){const sameSite=process.env.HDWORK2_SERVICE_AUTH_POLICY==='session-audit-only'?'Lax':'None';res.set('Set-Cookie',`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${clear?0:28800}`);}
module.exports={service,cookie,csrf,allowedOrigin,error,auth,setCookie};
