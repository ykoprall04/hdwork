const express=require('express'),h=require('../access/http');
function createRoutes({chat,http=h,enabled=()=>process.env.HDWORK2_LIVE_CHAT_ENABLED==='true'}={}){
 const router=express.Router();router.use(http.auth);router.use(require('../middlewares/api-rate-limit').createRateLimit({limit:60,windowMs:60000,keyFor:req=>String(req.user.id)}));
 router.use((req,res,next)=>req.user.username==='trial_yanto'?res.status(403).json({success:false,message:'Akun trial tidak memiliki akses Live Chat'}):enabled()?next():res.status(503).json({success:false,message:'Live Chat belum diaktifkan'}));
 const service=()=>chat||require('./service').createChat({readPool:require('../config/operational-pools').getReadPool(),writePool:{getConnection:()=>require('../config/operational-pools').getWritePool().getConnection()}});
 const wrap=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch(e){require('../observability/raw-log').logger().emit('CHAT_HTTP_FAILURE',{orderId:req.params.id,status:'ERROR'},e);const code=[400,401,403,404,409,429].includes(e.statusCode)?e.statusCode:503;res.status(code).json({success:false,message:e.publicMessage||({400:'Pesan/parameter tidak valid',401:'Sesi berakhir',403:'Akses percakapan ditolak',404:'Percakapan tidak ditemukan dalam modul Anda',409:'Order berubah. Muat ulang data.',503:'Layanan percakapan belum tersedia'}[code])});}};
 router.get('/conversations',wrap(async(req,res)=>res.json({success:true,...await service().conversations(req.query,req.user)})));
 router.get('/:id/messages',wrap(async(req,res)=>res.json({success:true,...await service().messages(req.params.id,req.query,req.user)})));
 router.post('/:id/messages',wrap(async(req,res)=>{http.csrf(req,req.sessionToken);res.json(await service().send(req.params.id,req.sessionToken,req.user.id,req.body));}));
 return router;
}
module.exports={createRoutes};
