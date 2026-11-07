const authService = require("../services/auth.service");

async function login(req, res) {
  try {
    const {
      username,
      password,
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username dan password wajib diisi",
      });
    }

    const result = await authService.login(
      username,
      password,
    );

    return res.status(200).json({
      success: true,
      message: "Login berhasil",
      data: result,
    });
  } catch (error) {
    const status = [400, 401, 403].includes(error.statusCode) ? error.statusCode : 503;
    const message = status === 400 ? 'Permintaan login tidak valid' : status === 401 || status === 403 ? 'Login tidak diizinkan' : 'Layanan login sementara tidak tersedia';
    return res.status(status).json({ success: false, message });
  }
}

async function getMe(req, res) {
  res.set('Cache-Control', 'no-store');
  const id = req.user?.id;
  if (!(typeof id === 'number' && Number.isSafeInteger(id) && id > 0) && !(typeof id === 'string' && /^[1-9]\d{0,19}$/.test(id))) {
    return res.status(401).json({ success: false, message: 'Autentikasi tidak valid' });
  }
  try {
    const actor = await require('../repositories/auth.repository').findAccessById(id);
    if (!actor || ![1, true].includes(actor.is_active)) {
      return res.status(403).json({ success: false, message: 'Akun tidak diizinkan' });
    }
    // No JWT claims or password hash copied into the profile response.
    return res.status(200).json({ success: true, data: {
      id: actor.id, name: actor.name, username: actor.username,
      city_id: actor.city_id, role: actor.role,
    } });
  } catch {
    return res.status(503).json({ success: false, message: 'Layanan akun sementara tidak tersedia' });
  }
}

module.exports = {
  login,
  getMe,
};