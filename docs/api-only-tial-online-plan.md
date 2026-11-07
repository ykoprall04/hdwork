# API-only TIAL — audit, Windows dan rencana Tunnel

Status: implementasi lokal; belum dipublikasikan.
Laporan ini untuk HD Work 2.0 di branch `chore/remove-cacti-hdwork2`.
Tidak ada perubahan bot, MySQL, Sheets, sync-hdwork, env atau Cloudflare.

## Hasil audit dan entrypoint yang dipilih

`server.js` sebelumnya sudah tidak memanggil startPolling, tetapi memuat
`src/app.js` → route/controller order → `telegram.service.js` → konstruktor
Telegraf ketika token tersedia. Tes startup lama memock app secara penuh,
sehingga tidak membuktikan pemisahan graph dependency tersebut.

Entrypoint baru **`api-only-server.js`** terpisah secara struktural:

- Hanya HTTP, CORS, login/me dan route staging; bind tetap `127.0.0.1`.
- Tidak mengimpor legacy app, controller order operasional, Telegraf, Socket.IO,
  gateway agent, terminal, worker, collector, scheduler atau proses sinkronisasi.
- Tidak perlu token Telegram. Memasang token/flag polling di environment tidak
  mengubah graph ini atau mengaktifkan polling. Import entrypoint tidak memulai
  listener. Startup hanya eksplisit dari CLI atau fungsi yang diekspor.
- `GET /health` adalah liveness (bukan bukti koneksi database), tanpa identitas
  sistem/kredensial. Tidak ada query DB pada health atau startup HTTP.
- Route yang tersedia: POST `/api/auth/login`, GET `/api/auth/me`,
  GET `/api/b2c-staging/orders`, health dan preflight CORS. Route operasional
  PICK/CEK/DONE, upload, dashboard lama dan agent tidak dipasang pada proses ini.
  Request ke route lain menerima 404. Implementasi legacy tetap dipertahankan.

Jangan memakai `node server.js`/root npm start atau menjalankan Local Agent
untuk rencana staging online ini. Gunakan entrypoint baru secara eksplisit
setelah konfigurasi disetujui. Belum mengubah default script package lama agar
workflow lain tidak beralih diam-diam.

## Autentikasi dan DTO

Staging tetap memakai JWT internal, role SUPER_ADMIN, gate
`B2C_STAGING_ENABLED === 'true'` dan Cache-Control no-store. Tanpa token atau
token invalid ditolak 401, HD/ADMIN 403, Super Admin saat nonaktif 503 tanpa
memuat pool staging. Login demo bukan autentikasi API ini.

Penting: login internal tetap membutuhkan tabel users/password_hash pada database
autentikasi yang ditentukan DB_*. Akun hdwork_reader hanya untuk staging SELECT,
bukan akun bootstrap admin dan tidak cukup untuk login bila tidak bisa membaca
users. Database/admin baru harus disiapkan lewat tahap yang disetujui terpisah;
tidak ada schema/data/user dibuat sekarang. JWT_SECRET harus rahasia sendiri.

DTO browser sekarang allowlist: ID HMAC, modul, tanggal, status, STO, SC/IN,
INET, flag validitas/kelengkapan/verifikasi, pagination dan metadata sumber.
Tidak meneruskan source_bot, Chat ID, Message ID, thread ID, reference_issues,
raw payload, source_key, token atau konfigurasi. Reader dan diagnostic server
masih dapat memakai referensi internal, tanpa mengirimkannya ke frontend.
SC/IN/INET adalah informasi operasional internal untuk Super Admin, bukan untuk
public monitoring. State DEMO/localStorage tidak menjadi penyimpanan staging.

IdentityScope tetap staging_row dan belum permanen, tanggal tetap impor Jakarta,
thread tidak diketahui, verified tetap false. Mapping STO belum dikonfirmasi;
permintaan filter STO tanpa mapping tetap gagal aman. Tidak ada tindakan order
atau pengiriman Telegram diaktifkan oleh hasil pembacaan ini.

## CORS dan konfigurasi

`FRONTEND_ORIGINS` menerima daftar origin dipisahkan koma. Jika tidak tersedia,
`FRONTEND_ORIGIN` tunggal juga didukung. Contoh non-secret untuk target saat ini:

```text
FRONTEND_ORIGINS=https://hdwork.yoloo.space
```

Nilai harus origin exact dengan scheme dan tanpa path/trailing slash/credential;
wildcard, konfigurasi kosong dan nilai malformed ditolak saat startup. Daftar
localhost harus eksplisit jika memang diperlukan pengembangan. Origin asing
mendapat 403; jangan mengandalkan CORS sebagai autentikasi. Klien tanpa Origin
seperti CLI masih diterima layer CORS dan tetap wajib autentikasi endpoint.
Tidak mengaktifkan cookie credentials; browser mengirim Authorization Bearer.

HTTP port memakai PORT (default 3090), bind loopback tetap, bukan port MySQL.
Env lain tetap DB_*, JWT_SECRET, B2C_STAGING_DB_*, B2C_STAGING_IDENTITY_KEY,
B2C_TIAL_DATASET_ID, opsional key STO dan alias bot. Tidak ada secret VITE_*.
Gate staging tidak diaktifkan oleh perubahan kode ini.

## Refresh frontend

Buka `/b2c/staging` dengan login internal Super Admin. Setelah tombol Baca staging
ditekan, TIAL dibaca langsung lalu diulang sekitar 60 detik **setelah request
sebelumnya selesai**, sehingga request tidak menumpuk. Halaman pagination yang
sedang dipilih tetap dipakai saat refresh; submit filter kembali ke halaman 1.
Perubahan draft filter membatalkan request dan menghentikan refresh sampai
submit berikutnya. Pergantian token/role/unmount membatalkan request/timer.
PSB/MO tetap baca manual dan tidak diubah kontrak query-nya pada tahap ini.

Loading, empty dan error eksplisit; kegagalan mengosongkan hasil dan tidak
memakai DEMO atau baris lama sebagai hasil baru. Retry berikutnya tetap sekitar
60 detik selama view aktif; pengguna bisa submit ulang. Tidak ada cache browser
aplikasi untuk respons staging. Timer tab background dapat ditunda browser.
Tes helper timer tidak sama dengan pengujian browser E2E; tampilan dan koneksi
browser nyata masih harus diverifikasi di sandbox sebelum online.

## Windows / PM2 — panduan untuk nanti, belum dieksekusi

Prasyarat: checkout milik sendiri dan dependency tersedia, konfigurasi API sendiri
serta admin autentikasi/akses SELECT sudah disetujui, port 3090 tersedia, dan
origin valid. Jangan mewarisi secret atau working directory proses bot aktif.
Tidak memerlukan restart bot atau proses sync.

```powershell
Set-Location 'C:\Apps\hdwork2'
# Setelah konfigurasi disetujui/disiapkan sendiri:
pm2 list
pm2 start .\api-only-server.js --name hdwork2-tial-api --cwd 'C:\Apps\hdwork2' --time
pm2 describe hdwork2-tial-api
pm2 logs hdwork2-tial-api --lines 30 --nostream
```

Jangan menjalankan perintah di atas sekarang sebagai bagian pekerjaan cloud ini.
Periksa nama proses baru belum dipakai; jangan stop/restart all atau pm2 save
secara otomatis karena daftar PM2 memuat bot lain. Autostart Windows dan
shutdown/recovery proses harus ditetapkan pada tahap operasi berikutnya.

## Rencana Cloudflare Tunnel — belum dikonfigurasi

```text
Browser → HTTPS hdwork.yoloo.space (frontend)
Browser → HTTPS hostname API baru milik pengguna
        → Cloudflare Tunnel outbound pada PC kantor
        → http://127.0.0.1:3090 (api-only-server.js)
        → MySQL lokal dengan akun terpisah auth dan SELECT staging
```

Pilih hostname API yang dikendalikan pengguna, named tunnel serta service
cloudflared terpisah dari bot. Publikasikan hanya API HTTP baru; ingress fallback
404. Jangan meneruskan port MySQL/SSH/Local Agent, tidak perlu port forwarding
router. API khusus ini tidak memerlukan WebSocket. Semua konfigurasi Tunnel,
DNS, certificate/token, firewall dan Pages tetap belum disentuh.

Frontend build nanti memakai `VITE_API_BASE_URL=https://<hostname-api>` tanpa
suffix /api. Ini nilai publik; perubahan env Vite memerlukan rebuild/deploy
terpisah yang belum disetujui. Verifikasi preflight, login, role, disabled gate,
pagination, refresh, error dan SPA deep link di sandbox sebelum mengganti website
online. Jangan menganggap halaman saat ini sudah menerima data nyata dari PC.

## Pengujian dan risiko tersisa

Tes dependency graph mengevaluasi file entrypoint/app/router/controller/service
lokal sebenarnya, dengan external HTTP/Express/DB/JWT dimock dan semua import bot,
worker/socket yang tidak diizinkan ditolak. Tes lain memeriksa route auth,
role/disabled gate, CORS, DTO whitelist dan timer 60 detik tanpa listener/network.
Tidak memuat kredensial asli, menjalankan MySQL, Telegraf atau backend produksi.

Sebelum pembukaan online tetap perlu: verifikasi akun aktif/revokasi role saat
JWT masih berlaku (middleware saat ini memakai klaim token), rate limiting login
serta API di gateway/app, audit kebijakan password/log error login, uji SQL nyata
pada akun reader di sandbox/lingkungan yang disetujui, indeks/beban JSON query,
backup/recovery PC, lisensi kode asal, dan uji browser. CORS tidak menggantikan
hal tersebut. Jangan menilai liveness health sebagai readiness database.
