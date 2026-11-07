const express = require('express');
const auth = require('../middlewares/auth.middleware');
const { createRateLimit } = require('../middlewares/api-rate-limit');
const { createOrderReader, filters, uuid } = require('./orders');
const accountLimit = createRateLimit({limit:60,windowMs:60000,keyFor:req=>String(req.user.id)});
const router = express.Router();
router.use(auth);
router.use(async (req,res,next) => {
  res.set('Cache-Control','no-store');
  // No confirmed city/account ownership mapping exists in hd2_orders yet.
  if (req.user?.role !== 'SUPER_ADMIN') return res.status(403).json({success:false,message:'Akses order sementara terbatas untuk Super Admin'});
  const id = req.user?.id;
  if (!((typeof id === 'number' && Number.isSafeInteger(id) && id > 0) || (typeof id === 'string' && /^[1-9]\d{0,19}$/.test(id)))) return res.status(403).json({success:false,message:'Akses order tidak diizinkan'});
  if (process.env.B2C_WORKFLOW_READ_ENABLED !== 'true' || process.env.DB_NAME !== 'hdwork2') return res.status(503).json({success:false,message:'Pembacaan order hdwork2 belum tersedia'});
  try {
    const account = await require('../repositories/auth.repository').findAccessById(id);
    if (!account || account.role !== 'SUPER_ADMIN' || ![1,true].includes(account.is_active)) return res.status(403).json({success:false,message:'Akses order tidak diizinkan'});
    return accountLimit(req,res,next);
  } catch { return res.status(503).json({success:false,message:'Layanan order sementara tidak tersedia'}); }
});
function endpoint(kind) {
  return async (req,res) => {
    try {
      // Reject invalid input before acquiring an orders connection.
      if (kind === 'list') filters(req.query);
      else { uuid(req.params.id); if (kind === 'history') filters(req.query,true); else if (Object.keys(req.query).length) throw Object.assign(Error(),{statusCode:400}); }
      const reader = createOrderReader(require('../config/database'));
      const result = kind === 'list' ? await reader.list(req.query) : kind === 'detail' ? await reader.detail(req.params.id) : await reader.history(req.params.id,req.query);
      return res.json({success:true,...result});
    } catch (error) {
      const status = [400,404].includes(error.statusCode) ? error.statusCode : 503;
      return res.status(status).json({success:false,message: status===400 ? 'Filter atau identifier order tidak valid' : status===404 ? 'Order tidak ditemukan' : 'Layanan order sementara tidak tersedia'});
    }
  };
}
router.get('/',endpoint('list'));
router.get('/:id/history',endpoint('history'));
router.get('/:id',endpoint('detail'));
module.exports = router;
