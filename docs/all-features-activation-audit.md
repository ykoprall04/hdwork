# Audit dan persiapan aktivasi seluruh fitur HD Work 2.0

Revisi keamanan berikutnya: [safe-frontend-only-deployment.md](safe-frontend-only-deployment.md).
Boundary tanpa modul kini menolak mounting konten; uraian halaman terbuka di audit
historis ini bukan izin untuk merender konten terlindungi.

Branch `chore/remove-cacti-hdwork2`, dasar `bdcf73c`. Audit dilakukan di checkout
cloud, bukan pada folder Windows `D:\HDWork2-New`. Checkout cloud bersih sebelum
sinkronisasi fast-forward dari `752dd50`; commit baru hanya memperbaiki preservasi
state skrip deployment. Tidak ada perubahan lokal yang dibuang.

**Status: implementasi dan pengujian MOCK siap untuk lingkup di bawah; belum
merupakan aktivasi runtime kantor atau LIVE VERIFIED.** Tidak mengakses database,
Telegram, secrets, layanan kantor, atau website online. Tidak menjalankan skrip
deployment, migrasi, Docker/MySQL, backup, restart, maupun konfigurasi runtime.

## Temuan yang diperbaiki

- Navigasi umum HD hilang pada `/jobs`; kini tersedia setelah check-in untuk
  seluruh role yang diizinkan. Monitoring Sistem dan Live Chat terlihat untuk
  HD/ADMIN/SUPER_ADMIN. Menu akun pengguna tetap ADMIN/SUPER_ADMIN.
- Pemilihan kategori dan submenu TIAL/LOGIC sebelumnya menyembunyikan halaman
  berdasarkan modul. Semua halaman kategori kini dapat dibuka. Tanpa penugasan
  ada penjelasan; query backend tetap scope modul dan menghasilkan data kosong.
  Tidak ada pemberian modul, akses data, atau mutasi otomatis kepada admin.
- Monitoring Sistem menolak HD. HD sekarang hanya GET status dengan kesehatan,
  metadata antrean dan insiden. Identitas worker tidak disertakan; mapping,
  audit konfigurasi, backup dan semua POST tetap ditolak. UI HD tidak meminta
  endpoint administratif dan tidak menulis frontend heartbeat.
- Balasan Live Chat sebelumnya menolak ADMIN/SUPER_ADMIN meskipun masih pemilik
  order setelah perubahan role. Ketiga role sekarang dapat membalas **hanya**
  jika pemilik terkini IN_PROGRESS, aktif, sesi valid, modul cocok dan mapping
  bot/grup/topic aktif terverifikasi. Tidak memberi hak PICK/TAKEOVER kepada
  admin; kebijakan aksi order HD existing tetap berlaku. Tanpa kepemilikan,
  role administratif hanya membaca sesuai modul.
- Tombol Ganti Password tidak memiliki `type="submit"` pada Base UI sehingga
  klik tidak mengirim form. Diperbaiki dan diuji dengan klik browser nyata untuk
  setiap role; CSRF dan validasi backend tetap berlaku.
- Route LOGIC pada build workflow nonaktif menggunakan halaman TIAL lama.
  Kini menampilkan LOGIC belum tersedia; tidak menyajikan daftar TIAL sebagai LOGIC.
- Build operasional lama dapat melewatkan `VITE_HDWORK2_LIVE_CHAT`. Perintah
  `build:operational` menyertakan ketiga flag frontend secara eksplisit tanpa
  mengaktifkan backend, sender, worker, atau melakukan deployment.

## Inventaris frontend → API → database

Semua API di bawah berawalan `/api`; menu tersedia setelah sesi dan check-in.
Kesiapan kode tidak membuktikan schema/grant/flag pada runtime yang belum diperiksa.

| Fitur / halaman | Frontend dan backend/API | Persistensi dan batas aktivasi |
|---|---|---|
| Dashboard utama `/dashboard`, `/recap` | Recap → operations/recap, people, events | hd2_orders, users, hd2_user_modules, live_events; scoped modul, termasuk ADMIN/SUPER_ADMIN |
| Dashboard B2C `/work/B2C` | WorkHome → operations/overview | Agregasi order TIAL/REQ/LOGIC dalam transaksi baca |
| TIAL dan REQ `/work/B2C/TIAL`, `/work/B2C/REQ` | WorkList → operations/orders, recap, actions | Order, audit, web_requests, outbox; parser /order dan /req existing, /REQ tetap alias daftar TIAL/REQ |
| LOGIC-SOLVER `/work/B2C/LOGIC` | WorkList; command filter /config_psb dan /MO | access_module LOGIC_PSB/LOGIC_MO, kontrak B2C existing; tidak ada kategori LOGIN |
| ASSUREN, B2B, REPLACEMENT `/work/:category` | WorkList → list/detail/recap/actions | Module/command masing-masing; pipeline command dan schema existing, bukan mock UI |
| Detail dan aktivitas `/orders/:id` | WorkDetail → operations/orders/:id | Detail riil, owner/finisher, audit berhalaman; tanpa modul 404 |
| Monitoring order, pencarian, filter, timer | WorkList, WorkspaceCounts, OperationalStatus | Query parameterized, tanggal WIB, timestamp server; tidak reset order harian |
| Rekap dan export Excel | Recap, ExportButton → recap, exports/status/download/cancel | Read pool scoped, tiket terikat sesi; SHOW_ONLY tidak export |
| Notifikasi dan refresh | OrderNotifications, live/hook → operations/events | hd2_live_events, arrival normal saja; opt-in audio, dedup event, fallback polling |
| Telegram Live Chat `/chat`, `/chat/:id` | LiveChat → operations/chat/conversations, :id/messages | hd2_chat_messages + outbox/request/audit; **teks B2C TIAL/REQ/LOGIC**, bukan chat semua kategori atau pengiriman lampiran |
| Monitoring Sistem `/admin/system` | SystemMonitoring → operations/system/status | system_state/incidents, workers, inbox/outbox metadata; UNKNOWN tanpa evidence, HD read-only |
| Mapping dan riwayat sistem | UI administratif → system/mappings, history, backups; b2c/readiness | system_mappings/requests/jobs, audit; ADMIN/SUPER, alert-target hanya SUPER |
| Manajemen pengguna `/admin/users` | UserManagement → admin/users/create/update/approve/reject/reset/revoke/audit | users, modules, sessions, security_audit; hierarki existing, HD ditolak, public approval hanya SUPER |
| Registrasi `/register` dan autentikasi `/login` | Register/Login → auth/registration-token/register/login/me/logout | PENDING/inaktif/no modules; signed registration challenge, bcrypt, cookie dan CSRF |
| Akun/password `/change-password` | ChangePassword → auth/change-password | Validasi password lama, pencabutan sesi; semua role aktif |
| Check-in/status lokal | OperationalCheckIn, WorkspaceHeader | Hanya sessionStorage; **bukan absensi/presensi server**, tidak mengubah kepemilikan |
| Staging `/b2c/staging` | B2cStagingPage, API staging existing | Alat integrasi read-only SUPER, flag staging terpisah; bukan menu operasional yang perlu dibuka ke HD |

Delapan belas fitur existing tetap dipertahankan: #1 DONE/GAGAL, #2 pembuatan
order hanya Telegram, #3 detail nyata, #4 label SC/IN, #5 durasi HH:mm, #6 duplikat
canonical-safe, #7 manajemen pengguna, #8 approval/password, #9 auto-refresh,
#10 notifikasi, #11 pencarian, #12 filter, #13 Double CEK, #14 timer server,
#15 aktivitas/audit, #16 alasan GAGAL, #17 feedback delivery, #18 statistik.
Bukti regresi berada pada suite account/operations/courier/enhancements/workflow;
LANJUT CEK/TOLAK DUPLIKAT dan transaksi locking/idempotency tidak dilonggarkan.

## Fitur yang belum siap atau belum teruji pada runtime

- `/my-work`, `/transfers`, `/productivity`, `/monitoring` dan dashboard admin
  generik masih placeholder operasional/Preview. Tidak ada kontrak API lengkap
  untuk alur tersebut; tidak ditampilkan sebagai fitur aktif. Filter ORDER SAYA,
  TAKEOVER existing dan statistik rekap tetap tersedia melalui daftar pekerjaan;
  itu tidak mengimplementasikan workflow transfer atau formula produktivitas baru.
- Chat operasional mendukung teks B2C saja. Tidak mengklaim dukungan chat
  ASSUREN/B2B/REPLACEMENT, upload/download media atau backfill riwayat lama.
- RECEK dan ESKALASI operasional belum memiliki kontrak yang disahkan. Tetap
  membutuhkan definisi actor, status asal/tujuan dan tujuan balasan. REOPEN existing
  tidak diganti atau dianggap setara.
- Pemeriksaan MySQL/Courier/Tunnel aktual, schema/grant kantor, backup/restore,
  DPAPI/Windows, pengiriman Telegram, suara speaker kantor dan deployment belum
  diuji dalam pekerjaan ini. Probe yang tidak memiliki bukti tetap UNKNOWN.
- Launcher private lama tetap receive-only, tanpa sender atau propagasi flag chat.
  Skrip deployment lama bukan prosedur aktivasi seluruh fitur; jangan menjadikannya
  bukti bahwa backend siap. Tidak ada konfigurasi/secrets aktif yang diubah.

## Flag dan prasyarat aktivasi yang harus ditinjau operator

1. Build saja: `VITE_API_BASE_URL=https://<origin-yang-disetujui> npm run build:operational`.
   Di PowerShell set `$env:VITE_API_BASE_URL` dahulu. Perintah hanya mengompilasi;
   memerlukan origin HTTPS tanpa path/userinfo/query. Menyetel AUTH_COOKIE,
   OPERATIONS, LIVE_CHAT frontend true untuk proses build, tidak menulis file env.
2. Runtime backend harus memiliki AUTH_V2, OPERATIONS_ENABLED,
   SYSTEM_MONITORING_ENABLED, LIVE_CHAT_ENABLED dan command schema readiness
   sesuai kontrak existing. Chat memerlukan system monitoring. Untuk write,
   profil operational-write serta OP_WRITE dan persetujuan write existing tetap
   wajib; sesi read-only tidak berubah menjadi writable karena build frontend.
3. Migrasi manual 006–013 yang relevan serta grant auth/ops/system/chat perlu
   dicocokkan operator terhadap schema aktual. Tidak ada migrasi atau perubahan
   database baru yang diperlukan oleh perbaikan role ini. Jangan menjalankan
   ulang migration existing secara buta atau mengganti read credential dengan writer.
4. Mapping verified/enabled dan tujuan reply/topic berasal dari database, bukan
   browser. Database routing/chat Courier membutuhkan profil grant dan flag
   tersendiri. Sender nyata tetap nonaktif dalam pengujian dan pekerjaan ini.
5. Worker monitoring dan backup terpisah memerlukan konfigurasi/persetujuan
   existing; menu yang terlihat tidak menyalakan worker. Tidak ada target default,
   secret di frontend, atau fallback ke data demo.

## Verifikasi pekerjaan ini

- Backend: 324 test Node PASS; mencakup mock HTTP, transaksi memory,
  hierarki akun, CSRF, scope modul, duplicate/Double CEK, antrean/idempotency/retry.
- Frontend: 71 test PASS; Python Courier: 34 test PASS. Syntax backend yang berubah
  dan lint frontend PASS. Build operasional TypeScript/Vite PASS. Peringatan
  ukuran chunk Legacy existing tetap ada; source Preview/Legacy tidak berubah.
- Chromium: 90 pemeriksaan route PASS, menggunakan built React + respons API fixture saja, jaringan selain
  static loopback dan API fixture ditolak. Ketiga role diuji terpisah: navigasi,
  seluruh kategori, TIAL/REQ/LOGIC, rekap/detail, chat/history/reply, HD monitoring
  read-only tanpa request konfigurasi, UNKNOWN saat gagal, hierarki pilihan role,
  penolakan non-owner/no-module, klik simpan password + CSRF, serta redirect
  protected routes ketika anonim. Database dan Telegram tidak dimuat/dipanggil.
- Reproduksi: `npm test`; `node --test frontend/tests/*.test.ts`;
  `PYTHONPATH=courier_bot python -B -m unittest discover -s courier_bot/tests`;
  build operasional; lalu
  `HDWORK2_PLAYWRIGHT_MODULE=/absolute/path/to/playwright node tests/browser/role-activation.cjs --mock-only`.
  Runner browser membutuhkan Chromium terpasang; executable dapat ditentukan
  melalui HDWORK2_CHROMIUM. Fixture API build harus `https://localhost:8443`.
  Jangan menggunakan runner MySQL native untuk rehearsal mock ini.
