const express=require('express'),h=require('../access/http');
function createRoutes({chat,http=h,enabled=()=>process.env.HDWORK2_LIVE_CHAT_ENABLED==='true'}={}){
 const router=express.Router();router.use(http.auth);router.use(require('../middlewares/api-rate-limit').createRateLimit({limit:60,windowMs:60000,keyFor:req=>String(req.user.id)}));
 router.use((req,res,next)=>req.user.username==='trial_yanto'?res.status(403).json({success:false,message:'Akun trial tidak memiliki akses Live Chat'}):enabled()?next():res.status(503).json({success:false,message:'Live Chat belum diaktifkan'}));
 const service=()=>chat||require('./service').createChat({readPool:require('../config/operational-pools').getReadPool(),writePool:{getConnection:()=>require('../config/operational-pools').getWritePool().getConnection()}});
 const reject=(e,req,res)=>{
  require('../observability/raw-log').logger().emit('CHAT_HTTP_FAILURE',{orderId:req.params.id,status:'ERROR'},e);
  const code=e.type==='entity.too.large'?413:e.type==='entity.parse.failed'?400:[400,401,403,404,409,429,507].includes(e.statusCode)?e.statusCode:503;
  res.status(code).json({success:false,message:e.publicMessage||({400:'Pesan/parameter tidak valid',401:'Sesi berakhir',403:'Akses percakapan ditolak',404:'Percakapan tidak ditemukan dalam modul Anda',409:'Order berubah. Muat ulang data.',413:'Gunakan foto JPG atau PNG maksimal 5 MB.',503:'Layanan percakapan belum tersedia',507:'Penyimpanan lampiran belum tersedia'}[code])});
 };
 const wrap=fn=>async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{await fn(req,res);}catch(error){reject(error,req,res);}
 };
 router.get('/conversations',wrap(async(req,res)=>res.json({success:true,...await service().conversations(req.query,req.user)})));
 router.get('/incoming-summary',wrap(async(req,res)=>res.json({success:true,...await service().incomingSummary(req.query,req.user)})));
 router.get('/:id/messages',wrap(async(req,res)=>res.json({success:true,...await service().messages(req.params.id,req.query,req.user)})));
 router.get('/:id/messages/:messageId/photo',wrap(async(req,res)=>{
  const photo=await service().photo(req.params.id,req.params.messageId,req.user,{thumbnail:req.query.variant==='thumb'});
  if(!photo)return res.status(202).json({success:true});
  const {type,bytes}=photo;
  res.set('X-Content-Type-Options','nosniff').type(type).send(bytes);
 }));
 router.post('/:id/messages/:messageId/photo',wrap(async(req,res)=>{
  http.csrf(req,req.sessionToken);
  const photo=await service().photo(req.params.id,req.params.messageId,req.user,{requestDownload:true});
  res.status(photo?200:202).json({success:true});
 }));
 router.post('/:id/photos',(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try{http.csrf(req,req.sessionToken);next();}catch(error){reject(error,req,res);}
 },express.json({limit:'7mb'}),wrap(async(req,res)=>{
  if(typeof req.body?.photo!=='string')return res.status(400).json({success:false,message:'Pilih foto JPG atau PNG'});
  res.json(await service().send(req.params.id,req.sessionToken,req.user.id,req.body));
 }));
 router.use((error,req,res,_next)=>reject(error,req,res));
 router.post('/:id/messages',wrap(async(req,res)=>{http.csrf(req,req.sessionToken);if(req.body?.photo!==undefined)return res.status(400).json({success:false,message:'Gunakan endpoint foto'});res.json(await service().send(req.params.id,req.sessionToken,req.user.id,req.body));}));
 return router;
}
module.exports={createRoutes};
