# Persiapan HD Work 2.0 online mandiri — audit dan rencana tahap pertama

Tanggal: 7 November 2026. Repository: `ykoprall04/hdwork`.
Kondisi lokal: branch `chore/remove-cacti-hdwork2`, HEAD `b254330`, ditambah
perubahan penghapusan Cacti yang belum di-commit. Laporan ini melengkapi
`hdwork2-independence-audit.md` dan `remove-cacti-audit.md`.

## Kesimpulan dan batas verifikasi

PC kantor Windows 11 dapat menjadi host API Express dan database MySQL HD Work
2.0, sementara Cloudflare Pages menyajikan frontend dan Cloudflare Tunnel
meneruskan HTTPS/WebSocket ke API lokal. Tidak perlu membuka MySQL atau port
router kantor ke internet. Ini rancangan, bukan konfigurasi yang sudah diterapkan.

Penghambat sebelum implementasi:

1. `server.js` masih otomatis memanggil `telegramService.startPolling()` setelah
   listen. Jangan menjalankan backend sekarang dengan token bot aktif: dapat
   menjadi konsumen update kedua dan mengganggu bot kantor.
2. Belum tersedia baseline skema SQL lengkap untuk database kosong.
3. Frontend `/preview/*` dan monitoring publik masih simulasi browser, bukan
   aplikasi operasional multiuser yang sudah terhubung MySQL.
4. Kode/kontrak bot PM2 kantor, isi database, kapasitas PC, kebijakan jaringan,
   kepemilikan DNS dan akun Cloudflare belum diperiksa. Tidak boleh diasumsikan
   bot kantor memiliki schema/API yang sama dengan backend repository ini.

Audit hanya membaca kode/dokumentasi lokal. Tidak menghubungi PC kantor,
server asal, MySQL, PM2, Telegram, Cloudflare atau website online. Tidak menjalankan
backend, agent, scheduler, collector atau polling; tidak mengubah kredensial.
Satu-satunya penambahan tugas ini adalah laporan; perubahan sebelumnya dipertahankan.

## 1. Independensi dari HD Work asal

| Area | Temuan | Keputusan rancangan |
| --- | --- | --- |
| Server/API asal | Tidak ditemukan domain server asal yang wajib dipanggil dalam kode aplikasi tersisa | Gunakan base API milik sendiri; periksa environment build/deploy saat implementasi |
| Frontend | Base terpusat di `frontend/src/config/api.ts`; preview/public terpisah dari internal routes | Pages menggunakan HTTPS API sendiri; preview tetap diberi label DEMO |
| Database | `src/config/database.js` mengambil `DB_*`; semua repository SQL memakai pool ini | Database dan user baru di MySQL lokal, bukan menunjuk schema bot/HD Work lama |
| Telegram | Token dari env; mapping chat/topic/group berasal dari database | Bot PM2 kantor tetap pemilik polling; adapter perlu kontrak baru |
| Network Tools | Local Agent + SSH dan target health VPN privat hardcoded | Opsional; jangan membawa target, token pairing, kredensial atau izin jaringan lama |
| File/upload | Filesystem lokal `uploads/results`, bukan storage remote asal | Direktori/volume sendiri, proteksi akses dan backup |
| Infrastruktur | Tidak ada provisioning Windows/Tunnel/Pages/DB lengkap yang terlacak | Buat setelah rancangan disetujui, di akun yang dikuasai pengguna |
| Hak kode fork | Metadata ISC tersedia tetapi LICENSE/NOTICE proyek tidak ditemukan; riwayat bermula import | Konfirmasi izin kode/aset/kontribusi; jangan menyamakan kendali GitHub dengan kepemilikan eksklusif |

React, Express, Vite, Tailwind, mysql2, Socket.IO dan Telegraf adalah dependensi
umum, bukan ketergantungan terhadap server teman. Telegram/Cloudflare tetap
layanan pihak ketiga normal dengan akun, akses dan recovery yang harus dikuasai
pengguna. Audit paket/lisensi rinci ada pada laporan independensi sebelumnya.

## 2. Status keamanan penghapusan Cacti

Pemeriksaan statis ulang:

- `src/`, `frontend/src/`, `local_agent/src/` tidak memiliki referensi Cacti,
  cacty, scheduler Cacti atau kategori alarm NODEB/DATIN.
- `server.js` dan `src/app.js` identik dengan HEAD saat ini: pelepasan startup
  scheduler dan route pengguna tetap utuh.
- 13 file khusus Cacti masih ditandai terhapus lokal; service/repository
  Telegram hanya dibersihkan dari alarm pada pekerjaan sebelumnya.
- Tiga migrasi yang tersisa adalah topic Telegram, hasil lokal tanpa Telegram,
  dan Local Agent. Tidak menjalankan migrasi atau menghapus tabel/data lama.
- Penghapusan masih belum di-commit; clone HEAD atau deployment dari remote
  belum otomatis memuat pembersihan penuh ini. Jangan mengaktifkan versi lama.

Tes sebelumnya: backend 23/23, frontend 37/37, build berhasil; lint 29 warning.
Hasil ini adalah hasil tugas sebelumnya, bukan pengujian ulang integrasi pada
PC kantor. Pada audit ini tidak menjalankan build, layanan atau tes runtime.

## 3. Arsitektur kode saat ini dan gap

### Backend, login dan realtime

`server.js` membuat HTTP/Socket.IO, memeriksa koneksi MySQL, lalu listen dan
memulai polling Telegraf. Default port API 3090, tetapi host bind belum dibuat
loopback eksplisit. `src/app.js` memasang auth, users, groups, agents, orders,
attendance, dashboard dan network; tidak memiliki API ingest bot terpisah.

Login internal menggunakan users/password_hash, bcrypt dan JWT 8 jam; JWT
secret harus baru. Middleware utama memverifikasi JWT; pemeriksaan status akun
aktif pada setiap operasi/sesi dan pencabutan token harus ditinjau konsisten,
bukan diasumsikan otomatis mengikuti penonaktifan akun. Registrasi/approval
preview belum merupakan alur registrasi produksi.

HTTP sekarang memakai `cors()` luas, sedangkan Socket.IO mempunyai origin
tersendiri dari `FRONTEND_ORIGIN`. Untuk online, kedua jalur perlu allowlist yang
sama sesuai kebutuhan; CORS bukan autentikasi. `realtime.service.js` memancarkan
`orders:changed` global; nanti gunakan lingkup user/role/city yang sesuai dan
hindari payload sensitif di broadcast. `/uploads` sekarang static publik;
akses lampiran harus ditinjau sebelum mengekspos API ke internet.

### Order, bot dan fitur preview

Ingest Telegram berada di dalam `telegram.service.js`: parsing `#req`, `#assign`,
`/config`, pemetaan grup dan insert melalui `createIncomingOrder`. Ini bukan API
untuk bot eksternal. Hasil/klaim/penyelesaian juga mengirim Telegram dari service
bersama controller order. Mematikan polling saja belum memisahkan seluruh
integrasi Telegram.

Insert order saat ini mengembalikan null pada `ER_DUP_ENTRY`; kebutuhan tampilan
semua kiriman DUPLICATE harus dirancang sebagai event penerimaan tersendiri,
bukan tertukar dengan retry update yang sama. Tabel order_types/orders juga
masih memakai point_value; jangan mengaktifkan formula skor baru yang belum
disepakati. Aturan bisnis preview dan backend harus dipetakan per endpoint
sebelum My Work, transfer, reopen dan kategori dianggap siap produksi.

Frontend internal memakai REST/JWT dan Socket.IO; `/preview/*` memakai storage
browser. Public Monitoring memakai `publicProjection` state demo, bukan API
publik nyata. Data demo tidak boleh diam-diam dipromosikan menjadi data produksi.

## 4. Rancangan proses terpisah dari bot PM2

```text
Bot PM2 kantor yang sudah aktif — tetap satu-satunya pemilik update Telegram
         | event order dari adapter (rencana, bukan koneksi saat ini)
         v
API Express HD Work 2.0 — proses baru dan konfigurasi sendiri
         |                       |
         v                       v
Database HD Work 2.0 baru     Outbox pesan/status
pada MySQL lokal              | adapter bot yang disepakati
                             v
                         Bot kantor → Telegram
```

Prinsip rancangan:

- Entry point API tidak memanggil launch/getUpdates/setWebhook. Tambahkan mode
  API-only yang menjadi default dan validasi startup fail-closed; jangan hanya
  mengandalkan token kosong. Telegraf sender/handler dibuat adapter terpisah.
- Bot yang sudah aktif tetap berjalan tanpa restart/modifikasi pada tahap ini.
  Backend baru tidak membutuhkan token bot bila pengiriman disalurkan melalui
  adapter bot. Tidak berbagi `.env`, working directory atau port proses bot.
- Nama proses usulan `hdwork2-api`, tanpa menyentuh nama/proses PM2 lama. PM2 atau
  Windows service untuk API dipilih nanti setelah memeriksa instalasi yang ada;
  mulai satu instance dahulu, karena state socket/pairing/session saat ini ada
  di memori. Cluster memerlukan desain shared state tambahan.
- API internal bot di loopback, misalnya kontrak usulan
  `POST /api/integrations/telegram/events`, dengan autentikasi service terpisah,
  batas ukuran, validasi schema, idempotency dan audit. Bukan endpoint yang sudah
  tersedia. Jangan memakai JWT akun HD atau membuka route ini ke Tunnel publik.
- Bedakan kunci retry `bot_id + update_id` dengan identitas pesan asal
  `chat_id + message_id` serta kiriman bisnis duplikat. Retry harus aman; setiap
  kiriman berbeda yang tergolong duplikat bisnis tetap dapat dicatat.
- Worker/adapter pengirim membaca outbox yang terkontrol, mempertahankan reply
  ke pesan asli, actor, waktu, retry/backoff dan status delivery. Efek samping
  jaringan tidak dicampur ke transaksi perubahan status order; cegah pengiriman
  ganda dan simpan gagal kirim untuk retry. Exactly-once Telegram tidak diasumsikan.
- Bot tidak diberi hak akses bebas ke semua tabel HD Work. API milik HD Work
  menjadi pemilik aturan order dan penulisan data operasionalnya.

Pilihan integrasi yang direkomendasikan: adapter bot → API loopback + outbox.
Jika bot belum boleh diubah, gunakan data sintetis dan tunda ingest nyata.
Read-only terhadap data bot hanya alternatif setelah schema, izin dan checkpoint
tersedia; jangan memilih polling tabel lama atau trigger lintas schema tanpa
persetujuan. Bahasa/framework bot kantor belum diketahui dari repository ini.

## 5. Frontend Pages → Tunnel → API Windows

```text
Browser pengguna
  ├── HTTPS → Cloudflare Pages (React static, domain milik sendiri)
  └── HTTPS / WebSocket → hostname API milik sendiri
                           → Cloudflare Tunnel outbound dari PC kantor
                           → http://127.0.0.1:<PORT_API>
                           → Express / Socket.IO
                           → MySQL lokal (tidak dipublikasikan)
```

- Gunakan hostname API baru di zone yang dikuasai pengguna; tidak menggunakan
  atau mengubah website `hdwork.yoloo.space`. Contoh domain nyata belum ditetapkan.
- `cloudflared` berjalan sebagai service terpisah pada Windows, bukan bagian
  bot PM2. Named tunnel dan token/certificate disimpan sebagai secret layanan.
  Tunnel membuat koneksi keluar; tidak perlu port forwarding router.
- Rute publik hanya API aplikasi yang dibutuhkan dan `/socket.io/*`. Tolak
  `/api/integrations/*`, namespace agent jika hanya lokal, endpoint administratif
  teknis dan rute lain yang tidak diperlukan melalui gateway/route policy yang
  benar. Path allowlist HTTP saja tidak memisahkan namespace Socket.IO: agent
  dan browser berbagi transport `/socket.io`; jika agent perlu lokal-only,
  gunakan listener/gateway terpisah atau autentikasi/policy namespace yang tepat.
- API bind loopback, MySQL tetap lokal, firewall tidak membuka 3090/3306 ke
  internet. Tentukan port API bebas setelah inventaris PC; 3090 adalah kandidat,
  bukan asumsi bahwa port itu tersedia. SSH/local agent tidak dipublikasikan.
- `VITE_API_BASE_URL` di Pages adalah HTTPS origin API tanpa `/api`; aplikasi
  menambahkan `/api` sendiri. Perubahan env Vite memerlukan build baru. Jangan
  menaruh secret/token bot/JWT signing key/database di env frontend.
- Konfigurasikan SPA fallback untuk deep links dan verifikasi Socket.IO polling
  handshake, upgrade WebSocket, reconnect dan origin tanpa mixed content.
- JWT aplikasi tetap wajib. Cloudflare Access dapat menjadi proteksi tambahan
  workspace sesuai kebutuhan; rencanakan login/refresh WebSocket dengan benar.
  Jangan menaruh Access service token di bundle atau menjadikan Access pengganti
  otorisasi aplikasi. Monitoring publik nantinya perlu kebijakan terpisah.
- Rate limit login/API, proteksi upload, sanitasi pesan, TLS, log tanpa secret
  dan error aman perlu tersedia sebelum pembukaan trafik publik.
- PC harus tidak sleep saat layanan aktif, koneksi stabil, reboot/recovery
  teruji dan backup di luar PC. Ini host dengan satu titik kegagalan; uptime
  bergantung listrik dan jaringan kantor serta izin kebijakan TI.

## 6. Konfigurasi baru yang direncanakan

Tidak membuat/mengubah file `.env` pada tahap ini. Semua nilai dibuat baru dan
disimpan di direktori akun layanan sendiri.

| Lingkup | Konfigurasi | Status |
| --- | --- | --- |
| API | `PORT`, `FRONTEND_ORIGIN` | Sudah didukung; pilih port dan origin baru |
| API/database | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Sudah didukung; schema/user/password baru, akses lokal least privilege |
| Login | `JWT_SECRET` | Sudah didukung; generate secret baru, jangan salin lama |
| Pemisahan proses | `HOST`, `APP_MODE=api`, `TELEGRAM_POLLING_ENABLED=false` | Usulan, belum didukung kode; harus diimplementasikan dan diuji agar efektif |
| Adapter bot | service credential/HMAC key, identitas bot, inbox/outbox config | Usulan kontrak; pilih mekanisme dan nama final saat desain bot tersedia |
| Frontend Pages | `VITE_API_BASE_URL` | Sudah didukung, HTTPS API sendiri, non-secret |
| Frontend lokal | `VITE_DEV_PORT`; opsional `VITE_LONG_ORDER_MINUTES` | Sudah didukung, bukan konfigurasi backend |
| Network opsional | `VPN_HEALTH_HOST`, `ZTE_DEFAULT_FRAME`, `SSH_RESUME_GRACE_SECONDS` | Sudah didukung; target berizin atau fitur dinonaktifkan pada revisi nanti |
| Agent opsional | `HD_WORK_SERVER_URL`, pairing agent sendiri | Sudah didukung; jangan salin token/known hosts lama |
| Tunnel | credential/token tunnel dan ingress milik sendiri | Konfigurasi cloudflared, bukan Vite atau token bot |
| Operasional | upload path, logging, health/readiness, shutdown timeout | Perlu desain/implementasi; saat ini belum sepenuhnya configurable |

`TELEGRAM_BOT_TOKEN` ada pada kode lama tetapi **tidak diperlukan pada proses API
rancangan** jika bot/adapter memegang seluruh pengiriman. Memasang env usulan
saja tidak mematikan polling pada kode saat ini. Tidak ada template lengkap
backend/frontend/agent; buat template aman setelah daftar disetujui.

## 7. Kebutuhan database tanpa mengubah database saat ini

Usulan schema terpisah, misalnya `hdwork2`, pada instance MySQL lokal yang sama.
Nama ini hanya rencana. User aplikasi dibatasi schema baru; migrasi memakai
identitas terpisah pada saat disetujui. Tidak menyentuh database bot.

Kelompok tabel yang sudah dipakai kode: users, cities, segments, user_segments,
telegram_groups, order_types, orders, order_assignments, order_events, order_notes,
order_results, order_result_files, attendance, attendance_breaks, local_agents.
Baseline lengkap belum tersedia; tipe/constraint harus disusun dari kontrak
kode dan kebutuhan produk, bukan hanya mengasumsikan tiga migrasi sudah cukup.

Tambahan konsep yang perlu disepakati: bot event inbox/deduplikasi transport,
outbox delivery, monitoring identifier aman, pesan dan public-safety approval,
transfer request+batch dan persetujuan, sesi reopen, audit actor, registry
registrasi HD/approval. Sebagian mungkin dapat memakai/memperluas tabel lama;
ini inventaris kebutuhan, bukan keputusan membuat setiap tabel baru.

Pastikan transaksi pemilik tunggal dan takeover konsisten; history tidak hilang;
status terakhir terpisah dari kredit historis; tidak menyalakan perhitungan poin
baru. Definisikan timezone penyimpanan konsisten (disarankan UTC), filter hari
Asia/Jakarta, utf8mb4, indeks, FK, versioning migrasi dan retensi. Data awal cukup
admin baru, referensi kota/segmen/kategori dan grup uji sendiri. Jangan menyalin
user/password hash, data pelanggan, token, grup atau order lama tanpa izin.

Karena MySQL dibagi dengan bot pada PC yang sama, nilai kapasitas koneksi,
ukuran buffer, disk, backup dan jadwal maintenance harus ditinjau agar aplikasi
baru tidak mengganggu bot. Audit kapasitas belum dilakukan.

## 8. Tahapan implementasi dan kriteria kelulusan

| Tahap | Pekerjaan setelah disetujui | Syarat sebelum lanjut |
| --- | --- | --- |
| 0. Inventaris | Identifikasi proses/port bot, bahasa/framework, jalur event, versi MySQL/Node, domain/akun, izin TI dan asal kode tanpa membocorkan secret | Tidak ada operasi yang mengganggu bot; kontrak dan pemilik tercatat |
| 1. Pisahkan lifecycle | API-only entry point, validasi mode, bot adapter boundary, bind loopback, graceful shutdown, health/readiness, konfigurasi/template | Tes membuktikan API tidak memanggil polling/webhook/collector sekalipun token tersedia |
| 2. Baseline data | Review schema/seed/migrasi untuk DB baru, hak akses dan backup | Rencana SQL disetujui, restore sandbox berhasil; DB lama tidak berubah |
| 3. Sandbox lokal | API dengan DB baru dan data sintetis; autentikasi, role, order, upload dan socket | Tes integrasi lokal; tidak ada koneksi ke instalasi/bot lama |
| 4. Adapter bot | Inbox/outbox, idempotency, reply ID, auth service dan audit pada bot/grup uji sendiri | Retry/duplikat/gagal kirim teruji, tidak ada konsumen update kedua |
| 5. Fitur operasional | Hubungkan preview bertahap; My Work, transfer/reopen, kategori; public API aman terpisah | Konsistensi actor/status, multiuser dan data publik teruji |
| 6. Rencana online | Review Pages build, Tunnel, DNS, route policy, CORS, firewall, services Windows dan backup | Persetujuan deployment terpisah; tidak mengubah website sekarang |
| 7. Uji online dan operasi | Setelah izin: deep link/login/upload/socket, restart PC, recovery, audit trafik dan rollback | Bot stabil; hanya tujuan berizin; rollback dan recovery terbukti |

Tidak menyiapkan script PM2/service, SQL, tunnel atau deploy aktif sekarang.
Sebelum implementasi adapter, bahan yang dibutuhkan adalah dokumentasi/kode bot
kantor yang sudah disanitasi, gambaran schema relevan tanpa data pelanggan,
dan pilihan domain/akun. Ini kebutuhan tahap berikutnya, bukan permintaan
kredensial. Tahap pertama selesai sebagai audit dan perencanaan saja.
