const express=require('express'),h=require('../access/http'),p=require('./policy');
function createRoutes({system,enabled=()=>process.env.HDWORK2_SYSTEM_MONITORING_ENABLED==='true',http=h}={}){
 const router=express.Router();router.use(http.auth);router.use((req,res,next)=>{try{p.viewer(req.user);if(!enabled())throw p.fail(503);next();}catch(e){http.error(res,e);}});
 const service=()=>system||require('./store').createSystem({readPool:require('../config/operational-pools').getReadPool(),writePool:{getConnection:()=>require('../config/operational-pools').getWritePool().getConnection()}});
 const wrap=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch(e){if(e.code==='ER_DUP_ENTRY')e=p.fail(409,'Tujuan grup/topic sudah digunakan');http.error(res,e);}};
 router.get('/status',wrap(async(req,res)=>res.json({success:true,...await service().status(req.user)})));
 router.use((req,res,next)=>{try{p.admin(req.user);next();}catch(e){http.error(res,e);}});
 router.get('/mappings',wrap(async(req,res)=>res.json({success:true,...await service().mappings(req.user)})));
 router.get('/history',wrap(async(req,res)=>res.json({success:true,...await service().history(req.user)})));
 router.get('/backups',wrap(async(req,res)=>res.json({success:true,...await service().jobs(req.user)})));
 router.post('/mappings',wrap(async(req,res)=>{http.csrf(req,req.sessionToken);res.json(await service().saveMapping({...req.user,sessionToken:req.sessionToken},req.body));}));
 router.post('/alert-target',wrap(async(req,res)=>{http.csrf(req,req.sessionToken);res.json(await service().recipient({...req.user,sessionToken:req.sessionToken},req.body));}));
 router.post('/frontend-heartbeat',wrap(async(req,res)=>{http.csrf(req,req.sessionToken);await service().report('frontend','ONLINE','AUTHENTICATED_BROWSER_HEARTBEAT');res.json({success:true});}));
 return router;
}
module.exports={createRoutes};
