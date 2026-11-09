// Separate, short-lived double-submit cookie. Never replaces an authenticated session.
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {reject}=require('./service');
const name='__Host-hdwork2-registration';
function registrationCsrf(h,{now=Date.now}={}){
 return {
  issue(req,res){
   if(req.headers.origin&&!h.allowedOrigin(req))throw reject();
   const unsigned=now()+'.'+randomBytes(32).toString('hex');
   const token=unsigned+'.'+h.service().csrf('registration:'+unsigned);
   res.set('Set-Cookie',`${name}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=900`);
   return token;
  },
  verify(req){
   if(!h.allowedOrigin(req)||!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw reject();
   const values=(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
   const token=req.headers['x-csrf-token'];
   if(values.length!==1||typeof token!=='string'||token.length>200||values[0]!==name+'='+token)throw reject();
   const [stamp,nonce,mac,...extra]=token.split('.');
   if(extra.length||!/^\d{13}$/.test(stamp)||! /^[a-f0-9]{64}$/.test(nonce||'')||! /^[a-f0-9]{64}$/.test(mac||'')||Number(stamp)>now()||now()-Number(stamp)>900000)throw reject();
   const expected=h.service().csrf('registration:'+stamp+'.'+nonce);
   if(!timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))throw reject();
  }
 };
}
module.exports={registrationCsrf};
