const express=require('express'),h=require('./http'),{reject}=require('./service');
const router=express.Router();
const wrap=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch(e){h.error(res,e);}};
router.post('/login',wrap(async(req,res)=>{if(!h.allowedOrigin(req))throw reject();const value=await h.service().login(req.body?.username,req.body?.password);if(!value)throw reject(401);h.setCookie(res,value.token);res.json({success:true,data:{user:value.user,csrf:h.service().csrf(value.token)}});}));
router.get('/me',h.auth,wrap(async(req,res)=>res.json({success:true,data:req.user,csrf:h.service().csrf(req.sessionToken)})));
router.post('/logout',h.auth,wrap(async(req,res)=>{h.csrf(req,req.sessionToken);await h.service().logout(req.sessionToken);h.setCookie(res,'',true);res.json({success:true});}));
router.post('/change-password',require('../middlewares/api-rate-limit').createRateLimit({limit:10,windowMs:15*60000}),h.auth,wrap(async(req,res)=>{h.csrf(req,req.sessionToken);await h.service().changePassword(req.user.id,req.body);h.setCookie(res,'',true);res.json({success:true});}));
module.exports=router;
