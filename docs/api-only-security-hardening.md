# Audit dan pengamanan API-only TIAL sebelum Tunnel

Branch `chore/remove-cacti-hdwork2`; implementasi lokal, belum commit/push/deploy.
Tidak menjalankan API produksi, polling, bot, PM2, SQL, Sheets atau sync-hdwork.
Tidak mengubah schema/data, env, secret, port publik atau konfigurasi Cloudflare.

## Hasil audit route

- Entrypoint api-only-server.js tetap bind loopback. Graph dependency tidak
  mengimpor Telegram/polling/socket/worker/sync. Tidak ada route mutasi order.
- Health hanya liveness, tanpa data sensitif dan bukan pemeriksaan MySQL.
- POST auth/login sebelumnya tanpa rate limit dan dapat mengembalikan raw error
  service/DB; diperbaiki menjadi error allowlist tanpa log exception mentah.
- GET auth/me kini memeriksa profil/status/role terkini dari database; lihat
  tunnel-client-security-decisions.md untuk pembaruan dan batasannya.
  Revokasi global seluruh endpoint legacy belum dibuat.
- GET b2c-staging/orders sebelumnya hanya mengecek role JWT. Kini cek akun
  terkini dari database autentikasi pada setiap request yang enabled, melalui
  SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1.
- Gate nonaktif tetap 503 sebelum query DB; akun JWT bukan Super Admin tetap
  ditolak awal. Akun yang dipromosikan perlu login ulang jika JWT lama belum
  memuat role Super Admin. Untuk request aktif yang lolos klaim awal, akun harus
  masih ada, is_active=1 dan role database SUPER_ADMIN. Tidak ada cache role.
- Error database gagal tertutup 503, tidak membaca staging ketika otorisasi gagal.
  Query validasi tidak menulis MySQL; tes menggunakan mock, bukan database nyata.
- CORS allowlist, no-store staging, pool SELECT dan DTO browser allowlist tetap.
  Referensi Telegram internal tidak diteruskan. Route lain tetap 404.

## Rate limiting

API-only memasang limiter sebelum handler:

- Login: 10 request per 15 menit per alamat socket; sebelum JSON parser agar
  payload malformed pun menggunakan anggaran login.
- Staging: 120 request per menit per alamat socket, ditambah 30/menit per akun
  yang diverifikasi DB; auth/me 120/menit per socket. Termasuk request tanpa JWT
  dan request ketika integrasi nonaktif.
- Respons 429, Retry-After dalam detik dan no-store; tidak mencetak alamat/token.
- Fixed window, in-memory per proses, maksimum 10.000 bucket; bucket expired
  dibersihkan pada request. Kapasitas penuh menolak key baru, tidak mengevict
  bucket aktif sehingga batas tidak mudah direset dengan pergantian key.
- Tidak mempercayai X-Forwarded-For/CF-Connecting-IP atau menyalakan trust proxy.
  Di balik cloudflared seluruh pengguna kemungkinan berbagi loopback dan kuota.
  Ini pilihan konservatif sementara, bukan identifikasi klien final.

Sebelum trafik publik, setujui policy trusted proxy yang tidak bisa dipalsukan
atau rate limit edge yang sesuai. Jangan mengubah trust proxy menjadi true
secara sembarang. Jangan menaikkan kuota tanpa menilai beban query JSON.
Proses restart mereset limiter; cluster memerlukan shared store. Fixed window
memungkinkan burst pada batas pergantian window. Rate limiting bukan WAF,
perlindungan volumetrik atau pengganti autentikasi.

## Error dan validasi

Staging tidak lagi mengirim error.message dari DB, schema atau konfigurasi.
Filter invalid mendapat 400 generik; gangguan DB/config mendapat 503 generik.
Login memetakan error kredensial ke pesan statis; kegagalan dependency 503 tanpa
raw SQL/host/password hash. Handler app memetakan CORS 403, JSON malformed 400,
payload >32kb 413, dan error lain 500 tanpa stack/detail internal.

## Pengujian terisolasi

Tes baru membuktikan rate limit/reset/Retry-After, bounded storage, header IP
palsu tidak mengubah key, limiter terpasang dengan anggaran yang benar, JWT lama
pada akun nonaktif/hilang/downgrade ditolak, status akun diperiksa setiap call,
DB gagal tidak melanjutkan baca staging, dan raw error login/staging tidak bocor.
Regresi graph API-only, autentikasi, disabled gate, CORS, DTO, TIAL, demo dan
refresh tetap dijalankan. Tidak ada server operasional/listener baru diperlukan.

## Risiko dan langkah berikutnya

Sebelum publikasi: uji sandbox dengan database autentikasi dan staging sendiri,
cek reader SELECT dan akun autentikasi punya hak SELECT users sesuai kebutuhan,
uji browser 401/403/429/503 dan retry, lalu review kuota untuk seluruh pengguna
Tunnel, endpoint login (MFA/password policy), revokasi JWT dan auth/me, recovery,
health/readiness dan observability yang meredaksi secret. Akses publik/Cloudflare
memerlukan persetujuan terpisah. Tidak ada fitur CEK/RECEK/DONE diaktifkan.
