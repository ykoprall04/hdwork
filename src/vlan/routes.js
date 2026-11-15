const express=require('express');
function createRoutes({http,readPool,writePool}){
 const router=express.Router(),service=()=>require('./service').createService({readPool:readPool(),writePool:{getConnection:()=>writePool().getConnection()}});
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){const code=[400,401,403,404,409].includes(e.statusCode)?e.statusCode:503;res.status(code).json({success:false,message:e.publicMessage||'Referensi VLAN belum tersedia; periksa schema/izin database'});}};
 router.get('/',wrap(async(req,res)=>res.json({success:true,...await service().list(req.query,req.user)})));
 router.post('/',wrap(async(req,res)=>{http.csrf(req,req.sessionToken);res.status(201).json(await service().mutate('add',null,req.body,req.user,req.sessionToken));}));
 for(const action of ['update','delete'])router.post('/:id/'+action,wrap(async(req,res)=>{http.csrf(req,req.sessionToken);res.json(await service().mutate(action,req.params.id,req.body,req.user,req.sessionToken));}));
 return router;
}
function formatHandler({readOrder,readPool}){return async(req,res)=>{
 res.set('Cache-Control','no-store');const detail=await readOrder(req.params.id,req.user);
 res.json({success:true,...await require('./format').formatOrder(detail,readPool())});
};}
module.exports={createRoutes,formatHandler};
