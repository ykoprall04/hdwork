# HANDOFF ONLINE — HD Work 2.0


Pembaruan deployment operasional 9 November 2026, 19:36 WIB: writer MySQL aktif, browser publik dan uji transaksi status PASS, 11 order terjaga, layanan legacy tetap berjalan. Produksi umum masih menunggu penetapan grup Telegram dan petugas permanen; integrasi existing hanya grup testing. Detail dan pemulihan: [operational-deployment-20261109.md](operational-deployment-20261109.md). Bukti terbaru .local/operational-deployment.json, operational-browser-result.json, operational-flow-result.json. Bagian berikut adalah riwayat sebelum deployment ini.

Snapshot dibuat 9 November 2026, Asia/Jakarta. Project: D:/HDWork2-New. Repository: ykoprall04/hdwork.

**ONLINE. Akun trial_yanto sekarang HD dengan guard testing aktif dan pemeriksaan API publik PASS. Uji nyata CEK -> DONE/reply Telegram masih menunggu satu pesan dummy dari pengguna; belum ada aksi order yang dicoba. DNS/Cloudflare tidak diubah pada aktivasi solver.**

## Solver trial HD aktif; E2E menunggu pesan manusia, 9 November 2026, 12:27 WIB

- Pengguna memberi izin baru untuk menambahkan guard server-side, menaikkan hanya `trial_yanto`, dan satu order nyata testing sampai DONE beserta reply Telegram. Tidak boleh mengubah produksi/DNS/Cloudflare/bot lama atau menimpa file Codex lain. Izin lama read-only akun trial digantikan **hanya** oleh scope testing ini.
- **Role sekarang HD**, lewat service administrasi resmi setelah guard aktif. Bukti `.local/solver-role-activation.json` PASS pada `2026-11-09T04:37:52Z`: akun lain/password tidak diubah, semua sesi lama trial dicabut. Gunakan password privat existing; tidak perlu reset atau input ulang.
- Grup/bot diverifikasi langsung via getMe/getChat/getChatMember. Bukti privat `.local/solver-testing-identity.json`: chat HD Work 2.0 Testing `-5436357946`, non-topic, bot HDWorkOpsBot, bot namespace `hdworkopsbot-testing`, trial userId2. Jangan menganggap nama grup saja cukup untuk mutasi.
- **Guard dan sender-only sudah diterapkan** pada snapshot `C:/ProgramData/HDWork2Solver-20261109T043516Z-0f1ee54a`. Bukti `.local/solver-deployment.json` PASS; manifest `.local/solver-release-manifest.json`; audit 9.117 item, kode readonly bagi LocalService. Task existing HDWork2-Web dialihkan hanya ke release baru; snapshot/task lama dipertahankan. `.local/protected-web-deployment.json` sudah menunjuk snapshot baru. Jangan ulang installer atau deployment yang sudah PASS.
- Global tetap HDWORK2_LOCAL_READ_ONLY=true, OP_WRITE_ENABLED=false, operational approval=false, COURIER_ENABLED=false. Jalur trial khusus tidak mengaktifkan pool tulis umum atau polling. API memeriksa username+ID akun aktif HD, scope terlindungi, identitas order dari DB (chat/bot/thread/pesan), modul/session/CSRF/versi/ownership. Hanya PICK, DONE, FAILED. Identitas kosong/beda ditolak sebelum write, termasuk idempotensi/outbox. Audit JSON baru actorUsername/requestId; reader menampilkan username, fallback history lama tidak diubah.
- **Lima tes baru pengamanan PASS** (`tests/testing-solver-security.test.js`): semua aksi salah grup/bot/topik/akun/expiry ditolak; jalur produksi rollback sebelum write; PICK scoped menyimpan username/reply asli; outbound anchor salah ditolak; create/export/admin tetap read-only. Tidak mengulang suite simulasi historis.
- **Tujuh pemeriksaan API publik baru PASS** `.local/solver-public-guards.json` pada `2026-11-09T04:39:57Z`: trial login sebagai HD, CSRF wajib, order tanpa identitas ditolak, create/export/admin tetap tertutup, akun lain tidak bisa memakai jalur trial. Tidak memodifikasi order atau mengirim Telegram pada pemeriksaan ini.
- Untuk runtime non-root, pengguna menyetujui lewat elevasi/input privat satu identitas baru **hdwork_trial_write@localhost** dengan delapan GRANT hdwork2 pada SQL review. Bukti `.local/solver-db-provision.json` PASS. Tidak ada schema migration, perubahan akun/grants existing atau data produksi. Password DB baru terenkripsi CurrentUser di `.local/trial-write-password.dpapi`, lalu dimasukkan ke bundle LocalMachine snapshot terlindungi. Password maintenance tidak disimpan. Bundle web kini lima key (auth/read/signing/testingWritePassword/testingTelegramToken), jangan menjalankan bootstrap tiga-key lama pada release baru.
- Gangguan helper sebelum switch (nama variabel HOME readonly dan trim newline ciphertext) diperbaiki; tidak ada role/promosi sebelum release PASS. Release parsial dipertahankan, tidak dihapus. Jangan meminta rotasi secret karena kegagalan helper historis tersebut.
- Codex lain memiliki courier receive-only READY di `.worktrees/telegram-trial`, port3091. Semua file/process/polling/journal/worker/task miliknya **tidak diubah**. Sender baru pada runtime web tidak melakukan getUpdates, tidak mengambil worker lease dan tidak memilih outbox pengguna/grup lain. Ia hanya memilih request web trial terikat order testing dan audit requestId resmi. Reply wajib ke message_id asli, tidak fallback tanpa reply; ambigu menjadi DEAD/tidak retry otomatis.
- `.local/solver-sender-readiness.json` membuktikan runtime READY/testingSenderOnly. Status BLOCKED_REVIEW_REQUIRED tersimpan bertimestamp `04:37:51Z` adalah sebelum role dinaikkan pada `04:37:52Z`; sender idle berikutnya tidak menimpa file receipt. Jangan menafsirkan laporan lama itu sebagai error berulang jika timestamp tidak maju.
- **Satu hambatan eksternal tersisa: belum ada pesan order manusia untuk referensi uji** `TRIAL-AO20261109YANTO1`. Template lengkap sudah dikirim via permintaan async kepada pengguna. Jangan mengirim pesan pengguna palsu, membuat order SQL langsung, mengambil polling kedua atau memakai order verifikasi Codex lain `TRIAL-AO20261109A` tanpa keputusan pengguna.
- `.local/solver-order-readiness.json` count0. Runner privat `.local/run-solver-e2e.ps1` sudah dicoba satu kali dan berhenti pada prasyarat, hasil `.local/solver-live-e2e.json` status **WAITING_FOR_HUMAN_TEST_ORDER** pada `2026-11-09T05:27:04Z`, actionsAttempted=[], tanpa login browser/mutasi/pengiriman. **CEK -> DONE dan reply Telegram belum terbukti live; jangan klaim PASS.**
- Setelah pengguna mengirim satu dummy tersebut, jalankan runner privat existing, bukan provisioning/deploy/role ulang. Runner hanya mengizinkan order testing fresh WAITING/version0/no-owner yang cocok, dua aksi UI PICK lalu DONE masing-masing satu attempt, memverifikasi SENT attempts1/reply asli dan audit username di API/web, lalu logout. Ledger `.local/solver-live-actions.json` baru dibuat ketika aksi benar-benar akan dikirim; jika sudah ada, lakukan rekonsiliasi, jangan hapus atau retry ambigu.
- Tidak ada order testing/produksi diubah dan tidak ada pesan Telegram dikirim oleh agent dalam sesi aktivasi ini sampai prasyarat dummy terpenuhi. Tidak ada commit/push/merge, perubahan DNS/Cloudflare/VPN atau bot lama. Dokumentasi guard umum ada di `docs/testing-solver-trial.md`.

Pembaruan di bawah yang menyebut role SHOW_ONLY atau guard belum tersedia adalah riwayat sebelum implementasi ini. Jangan menurunkan atau membuat ulang akun berdasarkan snapshot lama.

## Permintaan solver testing: diblokir pembatasan grup belum tersedia, 9 November 2026, 11:08 WIB

- Pengguna mengizinkan perubahan `trial_yanto` ke role petugas existing dan satu uji order grup HD Work 2.0 Testing sampai DONE, termasuk balasan Telegram testing jika terintegrasi. Pengguna secara eksplisit memerintahkan **jangan membuka hak perubahan produksi dan laporkan blocker bila pembatasan grup testing belum tersedia**.
- Role petugas existing adalah **HD**; PICK -> IN_PROGRESS (CEK), DONE/FAILED memerlukan kepemilikan order. Tidak perlu role baru atau SUPER_ADMIN.
- **Gate gagal, tidak ada mutasi dilakukan.** `src/operations/mutate.js` memeriksa role HD, modul akun, session dan versi/kepemilikan order, tetapi tidak memeriksa izin grup per akun / allowlist bot_id+chat_id sebelum perubahan status dan enqueue balasan. `src/access/service.js` hanya menerima name/username/password/role/modules/is_active; tidak tersedia izin grup testing pada administrasi akun. Hak modul bukan batas grup dan dapat mencakup order produksi dari modul yang sama.
- Pembatasan `.local`/`src/courier/single-order-window.js` yang pernah digunakan adalah gate ingress satu order lama; **bukan** pembatasan hak mutasi web `trial_yanto`. Jangan memakai izin/target/order/message historis atau helper override SUPER_ADMIN untuk memenuhi uji solver HD ini.
- Source jalur mutate/policy/read/service/persistent-auth ditinjau dan hash-nya **identik dengan snapshot runtime aktif**; bukti `.local/testing-solver-runtime-review.json`. Runtime tetap localReadOnly=true, OP_WRITE_ENABLED=false, operational write approval=false, courier/network=false. Task tetap Running; tidak diubah/restart.
- Read-only account check `.local/trial-solver-account-review.json`: `trial_yanto` aktif dengan role **SHOW_ONLY**, writesPerformed=false. Role belum dinaikkan; akun lain/password/order/grants tidak diubah. Izin uji baru ini **belum dipakai**; tidak ada pesan Telegram dikirim atau order testing baru dibuat/diubah.
- Tambahan gap: audit status menyimpan user_id dan actorName (nama tampilan), belum snapshot username petugas sebagaimana permintaan terbaru. Outbox mutasi mempunyai reply_to_message_id order asli, tetapi tidak ada pembatasan grup per akun di jalur enqueue tersebut dan courier aktif saat ini false. Jangan mengaktifkan sender umum untuk mengatasi hal ini.
- Agar aman sebelum promosi role/enable write: perlu guard server-side per akun yang menolak bot_id/chat_id/thread di luar testing pada jalur mutasi dan outbound, mempertahankan pembatasan request/login/CSRF, serta audit username. Setelah guard tersedia dan scope satu order baru terverifikasi, baru administrasi resmi boleh mengganti role ke HD dan uji CEK -> DONE nyata. Jangan hanya memfilter UI atau menonaktifkan mode read-only global.
- Hasil akhir permintaan ini: **role baru belum diterapkan; uji CEK -> DONE belum dijalankan karena gate pembatasan grup belum tersedia**, sesuai fallback pengguna. Tidak mengulang simulasi PASS lama.

## Akun trial pribadi siap, 9 November 2026, 11:04 WIB

- Pengguna mengizinkan tepat satu akun aplikasi baru `trial_yanto`, role terendah cukup untuk dashboard/order, password acak hanya melalui mekanisme privat server, tanpa perubahan/reset akun existing. Tidak ada izin membuat akun MySQL atau mengubah schema/grants.
- **Akun baru dibuat:** `trial_yanto`, nama Yanto Trial, role **SHOW_ONLY**, aktif, akses baca ketujuh modul existing. Username diperiksa kosong sebelum create; helper memeriksanya lagi sebelum menulis. Jangan membuat ulang atau reset password. Bila permintaan serupa muncul, gunakan bukti existing ini dan pertahankan password.
- Pembuatan menggunakan implementasi resmi yang sama dengan admin aplikasi: `src/access/service.js` → `createService.manage`, dengan actor SUPER_ADMIN existing yang diautentikasi secara resmi. Akun database runtime tetap tanpa izin create user. Koneksi maintenance privat dipakai hanya pada proses one-shot; kredensialnya tidak disimpan/env/argv/log.
- Guard query tambahan membatasi transaksi pada INSERT satu username/role target, modul milik ID baru, dan tiga audit resmi target baru. UPDATE akun existing/SQL operasional/DDL ditolak. Guard diuji melalui service resmi dengan fixture sintetis dan PASS. Endpoint admin publik tidak dibuka.
- Percobaan awal gagal sebelum create karena store memerlukan pool transaksi, bukan single connection. Diperbaiki ke pool; autentikasi SUPER_ADMIN preflight aktual kemudian PASS. Percobaan pertama creationAttempted=false/creationCommitted=false; password acak DPAPI yang belum terpakai dipertahankan dan digunakan untuk create yang berhasil. Tidak ada reset atau create ganda.
- Bukti create dan API publik: `.local/trial-account-result.json`, status `CREATED_AND_PUBLIC_API_VERIFIED`, checkedAt `2026-11-09T04:01:26Z`. Login/password trial valid melalui HTTPS publik, cookie aman, /me/dashboard/orders200, perubahan order ditolak, admin/internal404, CSRF enforced, logout dan revokasi PASS. Tidak ada write database operasional; write hanya akun auth baru/modulnya/audit resmi dan sesi login/logout testing.
- Password dibuat acak kuat (24 byte CSPRNG), hanya ditampilkan via dialog privat di PC server. Delivery PASS di `.local/trial-private-delivery.json`. Salinan pemulihan tetap encrypted CurrentUser DPAPI di `.local/trial-yanto-login.private.clixml`; jangan print/decrypt ke chat, screenshot, clipboard otomatis atau log. Kredensial maintenance tidak disimpan.
- **Browser publik nyata PASS:** `.local/trial-browser-result.json` checkedAt `2026-11-09T04:04:08Z`: login UI → check-in lokal → jobs, daftar order read-only, tanpa tombol mutasi/link admin, session reload, logout. Dashboard Rekap render PASS dari run browser sebelumnya dipertahankan di `.local/trial-browser-dashboard.evidence.json`. Timeout uji antrean kosong adalah selector pengujian yang menyamakan role=status empty state dengan loading; selector diperbaiki dan hanya tahap order/reload/logout yang diselesaikan, tanpa perubahan aplikasi/build.
- Tidak ada screenshot, cookie export, password/hash/token dicetak. Browser pengujian terpisah ditutup dan sesi pengujian logout. Tidak mengubah akun existing, MySQL schema/grants, Telegram, VPN, layanan lama, hostname trial atau Git.
- **Expiry akun 7 hari tidak didukung** oleh mekanisme akun resmi saat ini (tidak ada field account expiry; session 8 jam berbeda dengan masa berlaku akun). Akun **tidak otomatis mati** pada 16 November 2026. Pengguna perlu menonaktifkannya melalui administrasi resmi lokal pada **16 November 2026, sekitar 11:01 WIB**: ubah `is_active` menjadi false melalui operasi update `createService.manage` akun `trial_yanto`, pertahankan nama/role/modul; service otomatis mencabut seluruh sesi. Jangan membuka admin publik atau mengubah SQL langsung demi penonaktifan. Proses ini memerlukan SUPER_ADMIN sah dan koneksi maintenance privat seperti provisioning tadi; belum dijalankan karena masa trial baru dimulai.
- Route aktif connector version 2 memakai `https://localhost:8443`, Origin Server Name localhost, CA Pool ProgramData yang benar, noTLSVerify=false, HTTP Host Header target. URL localhost tidak perlu dipaksa 127.0.0.1 karena origin saat ini terbukti dapat dicapai melalui route tersebut. Bukti `.local/route-502-fix.verification.json`: PUBLIC_LOGIN_200. Tidak ada perubahan route/DNS oleh agent untuk perbaikan ini.

Bagian 502 dan hambatan token di bawah adalah riwayat; akun trial dan akses publik di atas adalah bukti terbaru. Runtime persisten/LocalService/autostart yang sudah PASS tidak diinstal ulang atau direstart saat provisioning akun.

## Diagnosis publik 502, 9 November 2026, 09:51 WIB

- Pengguna melaporkan DNS dan Published Application Route sudah dibuat di Dashboard. Status sebelumnya yang menyebut belum ada route adalah riwayat. Permintaan HTTPS publik `/login` saat diagnosis menghasilkan **502**; jangan klaim ONLINE.
- **Penyebab spesifik:** konfigurasi origin aktif connector dibaca melalui endpoint diagnostik loopback `/config` (bukan asumsi berdasarkan template). Version 1 hanya memuat target rule `https://localhost:8443`, `caPool=''`, `originServerName=''`, `noTLSVerify=false`, HTTP Host Header kosong. Global caPool/SNI juga kosong. Ini tidak memasok CA privat origin.
- Bukti `.local/active-origin-route.json`, `.local/route-502-fix.verification.json`. Tidak memeriksa ulang koneksi edge/Healthy.
- Pemeriksaan terarah `.local/origin-502.diagnosis.json`: task web Running sebagai LocalService; PID 19300 memegang listener 127.0.0.1:8443 dan 3090; CA ProgramData ada dan identik dengan CA proyek. Supervisor exitCode -1 di laporan historis adalah bekas uji recovery, bukan status proses baru yang masih READY.
- Reproduksi TLS `.local/origin-502.tls-comparison.json`: request HTTPS origin dengan SNI localhost, Host hostname uji dan CA proyek -> **200**, HTML login cocok, TLS authorized. Request yang sama tanpa CA privat -> `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Tidak ada disable TLS atau perubahan trust global.
- **Perubahan Dashboard yang diperlukan, hanya route hdwork2.yoloo.space:** Service Type HTTPS, URL `127.0.0.1:8443` (Service URL penuh `https://127.0.0.1:8443`); TLS Origin Server Name `localhost`; CA Pool `C:/ProgramData/HDWork2/cloudflared/origin-ca.crt`; No TLS Verify OFF; HTTP Host Header `hdwork2.yoloo.space`. Biarkan DNS/trial tetap.
- Akses API management belum tersedia, jadi agent tidak mengubah remote route. Nilai persis di atas sudah dikirim lewat pertanyaan async kepada pengguna. Tunggu pengguna menyimpan; jangan menganggap pertanyaan atau waktu berlalu sebagai bukti route sudah berubah.
- Setelah konfirmasi, gunakan `.local/check-route-public.js` untuk membaca konfigurasi aktif yang sudah berubah dan menguji public login200 (port diagnostik 53014 berlaku untuk proses connector saat diagnosis; bila proses berubah, temukan ulang port loopback milik service, jangan scan sembarang port). Setelah PUBLIC_LOGIN_200, jalankan `.local/run-online-validation.ps1 -Mode public` di luar sandbox agar DPAPI terbaca. Gunakan input testing privat existing; jangan minta ulang password, jangan log cookie/token/hasil data operasional. Jangan menjalankan helper publikasi awal yang mensyaratkan DNS/route kosong karena route kini sudah dibuat pengguna.
- Runtime/source/ACL/startup yang sudah PASS tidak diubah saat diagnosis ini. Tidak ada perubahan database, Telegram, VPN, Git, hostname trial, DNS, global TLS trust atau restart service/PC.

## Runtime terlindungi dan validasi aktual, 9 November 2026, 09:35 WIB

- Pengguna secara eksplisit mengizinkan snapshot runtime baru/akun berhak minimum, ACL hanya pada runtime baru, startup persisten, dan publikasi khusus `hdwork2.yoloo.space` sesudah keamanan PASS. Jangan meminta ulang persetujuan publikasi yang sama; akses pengelolaan Cloudflare tetap diperlukan.
- **Blocker ACL diselesaikan:** snapshot baru di `C:/ProgramData/HDWork2Runtime-20261109T021331Z-7c3ff7e8`; kode/config/build/TLS/secrets terenkripsi hanya SYSTEM/Administrators yang dapat menulis. Task `HDWork2-Web` menjalankan supervisor/Node sebagai **LocalService (S-1-5-19), bukan SYSTEM**. Hanya subfolder `service/state` yang dapat ditulis LocalService. ACL proyek `D:/HDWork2-New` dan deployment lama tidak diubah.
- Registrasi snapshot mengaudit 9.113 item. Bukti `.local/protected-web-deployment.json`, `.local/protected-web-start.json`. Jangan menjalankan ulang installer: task sudah ada dan helper sengaja menolak overwrite.
- Audit akhir sesudah pembaruan supervisor/backup **PASS** pada `2026-11-09T02:35:41Z`: 9.116 item di luar folder status, owner non-admin=0, izin tulis kode non-admin=0, binary Node tidak broad-writable, proses hidup sebagai LocalService. Bukti `.local/protected-runtime-final-audit.json`; jangan ulang audit tanpa perubahan snapshot yang relevan.
- Pergantian runtime hanya menghentikan PID lokal lama setelah working directory `D:/HDWork2-New` dan entry `scripts/office-web.js --start-local --approved` diverifikasi melalui metadata proses. Tidak menghentikan semua Node/PM2 atau hostname trial.
- **Validasi origin/login nyata PASS** pada `2026-11-09T02:21:32.525Z`, menggunakan akun pengujian sah yang diinput privat. Bukti `.local/origin-security.validation.json`: TLS CA/SNI localhost dengan Host/Origin hostname uji, HTML/aset frontend, cookie Secure/HttpOnly/Lax, session/reload, CSRF hilang/salah dan Origin asing ditolak, logout/revokasi, anonymous/forged edge headers ditolak, operational read PASS dan POST order diblokir sebelum write. Internal/admin/legacy/courier/health/ready/metrics/.env ditutup pada HTTPS; API internal/admin diblokir langsung juga.
- Perubahan source HTTPS baru menambahkan `/health` dan `/ready` pada deny boundary application-session sebelum proxy. Tidak ada perubahan database/schema/grants/users/order; hanya session/audit login/logout yang memang diperlukan untuk validasi sesuai izin.
- **Recovery web PASS** pada `2026-11-09T02:28:45Z`: child dihentikan sekali, supervisor memulihkan otomatis (PID berubah), owner LocalService dan dua listener loopback diverifikasi. Task hidup terpisah dari terminal. Bukti `.local/protected-web-recovery.json`.
- Uji awal menemukan retry Task Scheduler pada task yang dimulai manual belum memulihkan child. Supervisor diperbaiki menjadi loop pemulihan 5 detik; backup script dipertahankan dalam snapshot, ACL perubahan diverifikasi. Hanya probe recovery yang gagal diulang sesudah perbaikan. Helper uji lama yang menunggu konfirmasi Stop-Process dihentikan secara terarah; helper kini memakai `-Force` untuk PID proyek terverifikasi dan dijalankan noninteraktif.
- **Autostart PASS konfigurasi** pada `2026-11-09T02:33:57Z`: task web/broker AtStartup + retry; connector existing Automatic Delayed Start + recovery restart. Bukti `.local/online-autostart.json`. Tidak restart service Cloudflared atau PC; boot sesudah reboot nyata **belum diuji**. Backup konfigurasi hanya milik HDWork2 disimpan di snapshot `service/startup-backup`. Jangan ulang helper autostart karena backup existing sengaja dipertahankan.
- Source baru: `scripts/install-protected-web.ps1`, `scripts/protected-web-service.js`, `scripts/run-protected-web.ps1`. Snapshot memakai source/dependencies/build existing yang disalin, tidak memuat `.env` asli atau Telegram runtime. Perubahan source berikutnya tidak otomatis mengubah snapshot.
- **Hambatan publikasi saat ini: token API pengelolaan Cloudflare belum tersedia.** Pencarian plugin Cloudflare tidak menemukan integrasi. Token connector existing tidak memberi hak DNS/management. Dialog input privat API token dilewati; `.local/online-private-input.json` menunjukkan `cloudflareInputAvailable=false`. Jangan mencetak, meminta token di chat, atau merotasi token connector yang sudah Healthy.
- Izin minimum API token yang diminta: Account Cloudflare Tunnel Edit untuk akun existing hdwork2, Zone DNS Edit + Zone Read hanya `yoloo.space`. Akun login pengujian sudah tersedia dalam penyimpanan DPAPI CurrentUser privat; tidak perlu diminta ulang.
- **Belum dijalankan:** `.local/publish-hdwork2.ps1`. Helper menunggu bukti keamanan/recovery/audit terbaru PASS dan token management privat. Ia memverifikasi existing tunnel/account/zone dan DNS/ingress target kosong, membackup remote config, menerapkan hanya hostname uji dengan HTTPS 8443 + originServerName localhost + CA ProgramData + noTLSVerify=false, membuat CNAME proxied, lalu validasi HTTPS publik/login/session/deny endpoints. Jika gagal, hapus hanya DNS baru miliknya dan restore config hanya bila version masih sama; tunnel/trial tidak dihentikan/diubah.
- Jangan mengklaim ONLINE sampai `.local/publication-result.json` berstatus ONLINE dan `.local/public-security.validation.json` PASS. Jika bukti keamanan origin kedaluwarsa karena menunggu credential, helper menolak dan minta validasi relevan; jangan memalsukan timestamp.

Semua bagian di bawah adalah riwayat; blocker ACL dan halt sebelumnya sudah digantikan pembaruan runtime ini.

## Permintaan online dan penghentian karena keamanan, 9 November 2026

- Pengguna menyetujui publikasi khusus `hdwork2.yoloo.space` **setelah validasi keamanan berhasil**, termasuk runtime/startup, login sah, dan TLS/CSRF/endpoint. Tidak perlu meminta ulang izin publikasi yang sama apabila seluruh syarat tersebut terpenuhi. Larangan hostname trial, DB operasional, Telegram, VPN, sistem lama, reboot tanpa izin, commit/push tetap berlaku.
- Pengguna juga memerintahkan berhenti dan melaporkan jika ada risiko keamanan serius. Pemeriksaan ACL aktual menemukan `Authenticated Users` (`S-1-5-11`) masih memiliki inherited `Modify` pada root proyek, scripts, `scripts/office-web-service.js`, src dan node_modules.
- Ini risiko eskalasi hak akses: startup yang direncanakan menjalankan Node sebagai SYSTEM dari source/dependencies yang dapat diubah pengguna non-admin. Guard tidak dibypass, task web tidak didaftarkan/dijalankan, dan publikasi tidak diterapkan. Aktivasi dihentikan sesuai instruksi risiko serius pengguna.
- Perbaikan yang diperlukan sebelum melanjutkan: runtime pada snapshot aplikasi/dependencies yang terlindungi dengan audit ACL efektif, atau akun runtime berhak minimum; jangan menerapkan perubahan ACL menyeluruh pada sistem lama. Login pengujian pada origin baru dan startup otomatis belum tervalidasi. Tidak ada kredensial pengujian yang diminta/dibaca pada langkah ini.
- Cloudflare connector Healthy dari bukti sebelumnya tidak diuji ulang. DNS/Published Application Route tidak diubah; URL target belum dinyatakan online.

## Pembaruan connector 9 November 2026, 09:04 WIB

- Pengguna mengonfirmasi langsung dari Cloudflare Dashboard: Published Application Routes, CIDR routes, dan Hostname routes pada existing tunnel `hdwork2` semuanya kosong. Pengguna mengizinkan start Windows Service hingga Healthy, tetap melarang perubahan DNS/pembukaan route publik tanpa persetujuan berikutnya.
- Evidence operator dicatat di `.local/connector-route-review.approved.json`, berlaku terbatas untuk aktivasi ini. Ini konfirmasi pengguna, bukan pemeriksaan Dashboard oleh agent.
- Helper existing `scripts/start-existing-hdwork2-connector.ps1 -ApprovedConnectorStart` dijalankan melalui UAC Administrator dan selesai. Tidak membuat tunnel baru atau menginstal ulang service.
- **PASS:** `.local/connector-health.json`, checkedAt `2026-11-09T02:04:12.8476351Z`, status `HEALTHY_LOCAL_CONNECTOR_METRICS`, `activeEdgeConnections=3`, `serviceRunning=true`. Pemeriksaan sesudah helper selesai juga menunjukkan `Cloudflared Running / Manual`. Healthy dibuktikan koneksi edge, bukan status Windows saja; Dashboard belum diperiksa agent.
- `dnsChanged=false`, `publicRouteCreated=false`. Tidak ada perubahan database, Telegram, VPN, atau sistem lama. Tidak ada konfigurasi Automatic/recovery atau reboot yang dilakukan.
- **Jangan ulang start/probe yang sudah PASS.** Connector sekarang berjalan; jangan menggunakan asumsi Stopped/Disabled dari snapshot historis di bawah.
- Langkah tersisa sebelum meminta izin publikasi `hdwork2.yoloo.space`: selesaikan runtime startup aman (guard ACL belum diselesaikan), terapkan profil origin baru hanya pada runtime proyek yang terverifikasi, validasi login/keamanan aktual sesuai scope. Persetujuan DNS + Published Application Route tetap belum diberikan. Jangan mengaktifkan route publik hanya karena connector Healthy.

## Pembaruan resume 9 November 2026, 09:01 WIB

- Probe broker final **PASS** pada 2026-11-09T02:01:26Z: `credentialPipeReady=true`, `pipeMatchesEncryptedToken=true`, `serviceUsesPrivatePipe=true`, `networkConnectionOpened=false`. Bukti: `.local/broker-credential.verification.json` dan `.local/resume-broker-probe.json`. Kegagalan BINDING/penulisan laporan di snapshot bawah sudah tersalip; jangan ulang probe tanpa perubahan relevan.
- Helper administrator memeriksa task `HDWork2-BrokerProbe` sebelum probe; tidak ada task probe existing yang menghalangi. Probe sementara selesai. Broker teramati Running dengan satu proses milik broker.
- Sesudah probe, Cloudflared tetap **Stopped/Disabled**. Connector belum dicoba start; DNS/route tidak berubah. Database, Telegram, VPN dan sistem lama tidak diubah.
- **Gate yang masih menunggu pengguna:** konfirmasi aktual Dashboard bahwa Published Application Routes DAN private/VPN routes pada existing tunnel `hdwork2` kosong. Pertanyaan telah dikirim saat resume. Belum ada bukti remote dan jangan membuat marker `connector-route-review.approved.json` sebelum jawaban tersebut.
- Pengguna mengizinkan melanjutkan fokus connector sampai Healthy, tetapi DNS dan pembukaan akses publik tetap memerlukan persetujuan terpisah. Permintaan halt pada snapshot historis bagian 9 sudah digantikan oleh permintaan resume ini.
- Kandidat ingress service sudah ditinjau ulang secara offline: hanya hostname `hdwork2.yoloo.space`, HTTPS origin lokal dengan SNI localhost/CA proyek dan TLS verification aktif; deny endpoint internal dan catch-all 404. Ini belum bukti konfigurasi remote diterapkan.
- Sesudah gate route terpenuhi, lanjut bagian 7 untuk start existing connector dan buktikan koneksi edge positif. Untuk publikasi masih diperlukan runtime aman (guard source broad-writable belum diselesaikan), profil origin baru, login/keamanan aktual PASS, lalu persetujuan DNS + Published Application Route khusus hostname uji. Jangan ulang build/migrasi/suite historis yang sudah PASS.

Bagian berikut adalah snapshot historis sebelum resume kecuali dinyatakan lain di atas.

Target: https://hdwork2.yoloo.space, tunnel EXISTING hdwork2. Hostname trial https://hdwork.yoloo.space wajib dipertahankan. Cloudflare Access TIDAK digunakan.

Handoff ini menggantikan snapshot lama. Salinan versi sebelumnya dipertahankan di .local/handoff-history/, privat dan diabaikan Git. Jangan memakai status Git, blocker credential atau hostname dari snapshot lama sebagai kondisi terkini.

## 1. Progres berdasarkan bukti nyata

| Komponen | Status | Bukti dan batas |
| --- | --- | --- |
| Express API-only dan React | SELESAI untuk fungsi dasar lokal | Browser/API pernah membaca order nyata; bukan bukti seluruh fitur produksi selesai. |
| HTTPS lokal8443 | SELESAI lokal | Sertifikat proyek cocok localhost/127.0.0.1; TLS chain proyek dan GET /login200 pernah PASS. Saat handoff listener127.0.0.1:3090 dan8443 masih ada;3091 tidak teramati. Tidak mengirim login/HTTP baru saat handoff. |
| MySQL hdwork2 | SELESAI untuk koneksi/schema yang telah diuji | MySQL84 dan migrasi004–009 sebelumnya PASS; tidak ada query DB pada handoff. Auth hdwork_auth, reader hdwork_ops_read, courier hdwork_courier; bukan root. |
| Read-only operasional | SELESAI pada profil | OP_WRITE_ENABLED=false; pengecualian tulis hanya login/logout session/audit pada runtime yang diizinkan. Tidak ada izin UPDATE order umum. |
| Auth/session/CSRF | SEBAGIAN untuk profil online baru | Auth nyata lokal historis PASS. Policy berkelanjutan dan cookie Lax lulus unit test; login nyata pada origin hdwork2.yoloo.space BELUM divalidasi. |
| Empat modul | SEBAGIAN untuk data nyata | B2C, ASSUREN, B2B, REPLACEMENT lulus routing/fixture. Live E2E historis hanya satu order B2C testing. |
| Courier | SEBAGIAN, NONAKTIF | Fondasi tersedia. Tidak diaktifkan dalam persiapan online. Izin status/reply one-shot historis sudah terpakai. |
| cloudflared2026.10.7 | SELESAI | Binary existing C:/Program Files (x86)/cloudflared/cloudflared.exe. Jangan instal ulang. |
| Windows Service Cloudflared | SELESAI terdaftar | DisplayName HD Work 2.0 Cloudflare hdwork2; handoff memastikan Stopped/Disabled. Bukan connector aktif. |
| Token baru hasil rotasi | SELESAI tersimpan; SEBAGIAN validasi koneksi | Pengguna merotasi di Dashboard dan input privat. DPAPI LocalMachine + ACL SYSTEM/Administrators. Belum terbukti diterima edge Cloudflare. |
| Broker token | SEBAGIAN | Task HDWork2-TunnelTokenBroker terdaftar AtStartup, pernah Running/WAITING. Byte pipe terbukti identik dengan token DPAPI. Final probe belum PASS, lihat bagian3. |
| Profil/build hostname uji | SELESAI offline | Build baru hdwork2.yoloo.space PASS, tidak menimpa build/trial lama. Belum diterapkan pada runtime aktif. |
| DNS/Published Application Route | BELUM dibuat oleh agent | Tidak ada perubahan DNS/route oleh agent. Kondisi existing di akun Cloudflare BELUM dikonfirmasi; jangan diasumsikan kosong. |
| Connector Healthy | BELUM | Service tetap Stopped/Disabled dan connector-health.json belum ada. Helper start connector belum dijalankan. |
| HTTPS publik | BELUM diverifikasi | Tidak ada bukti akses internet/login publik PASS. URL target belum boleh dilaporkan sudah online. |
| Startup web sesudah reboot | SEBAGIAN | Source dan mock tersedia; task web BELUM terdaftar/diuji. Guard menemukan source broad-writable, tidak aman dijalankan sebagai SYSTEM. |

## 2. Arsitektur dan konfigurasi

Jalur target: browser HTTPS publik -> tunnel existing hdwork2 -> HTTPS127.0.0.1:8443 -> React + proxy /api -> Express127.0.0.1:3090 -> hdwork2. Origin TLS memakai SNI localhost, CA proyek dan noTLSVerify=false. Courier internal3091 terpisah/nonaktif. MySQL3306, DevTools dan VPN tidak dipublikasikan.

Listener aktif masih lokal. Tidak ada penggantian profil runtime ke hostname uji yang dilakukan. Jangan menganggap target origin sudah aktif hanya karena8443 listening. Browser login lokal pernah dibuka dengan profil khusus dan pin SPKI; trust Windows/global TLS tidak diubah.

Kandidat hostname uji yang sudah dibuat:

- .local/online-candidate-hdwork2-service-9f638a40c09cf902/backend.environment
- Folder yang sama: dist/, ingress.review.yml, ingress.service.review.yml, service.plan.json, service.registration.approved.json, preparation.json.
- ingress.review.yml memakai CA proyek untuk offline; ingress.service.review.yml merujuk CA ProgramData untuk service.
- .local/office-web/local.environment adalah profil lokal sebelumnya. public.environment di folder itu LAMA dan menunjuk hdwork.yoloo.space; jangan gunakan --start-public-origin profil lama untuk hostname uji.
- .local/online-candidate-2026-11-08T17-33-44-729Z-5828b605 adalah kandidat sebelumnya. Jangan menimpa build/bukti lama.

Kredensial privat, hanya lokasi tanpa isi:

- .local/hdwork-auth.password.dpapi
- .local/database-secrets/ops-read-password.dpapi
- .local/web-secrets/session-signing.dpapi: nilai signing existing, tidak dirotasi.
- .local/tls/: CA, sertifikat dan private key proyek; jangan print atau commit private key.
- C:/ProgramData/HDWork2/cloudflared/tunnel-token.dpapi: token baru hasil rotasi, DPAPI LocalMachine.
- C:/ProgramData/HDWork2/web/secrets.dpapi: salinan terenkripsi auth/read/signing existing, tanpa membuat password baru.
- ProgramData cloudflared/web dibatasi SYSTEM/Administrators; penolakan akses non-elevated memang diharapkan. Jangan melonggarkan ACL untuk membaca laporan.
- .env asli dan frontend/.env.local dipertahankan privat. Jangan print atau source sembarangan; jangan menganggap semua konfigurasi lama sudah dikonversi ke DPAPI.

Service existing telah diubah melalui Windows CIM Change untuk membaca --token-file dari named pipe lokal HDWork2TunnelToken. Token/UUID tidak ada pada argumen SCM. Broker SYSTEM-only mendekripsi di memori dan memasok pipe, tanpa file token plaintext. Service tetap Disabled. Jangan jalankan cloudflared service install: installer native dapat langsung start dan menggunakan penyimpanan token berbeda.

## 3. Titik terakhir dan diagnosis

Perbaikan yang sudah terbukti:

- Launcher Chrome dahulu menutupi ECONNREFUSED ketika8443 mati. scripts/open-local-login.js sekarang memberi kode/stage spesifik dan mendeteksi early exit. Runtime pernah dipulihkan, Chrome dibuka dan GET /login TLS200 PASS.
- Helper credential sempat gagal APPLICATION_SECRET_COPY: berkas ciphertext auth memiliki newline, sedangkan helper baru belum .Trim(). Read-UserSecret sudah diperbaiki; tiga secret existing berhasil dibaca privat. Token dan bundle kemudian berhasil tersimpan.
- sc.exe config gagal karena quoting ImagePath. install-office-startup.ps1 kini memakai Invoke-CimMethod Change; konfigurasi service dan registrasi Broker PASS.
- Input token kini hanya Read-Host -AsSecureString. Tidak ada field konfirmasi teks biasa sebelum token. Rotasi dilakukan pengguna, bukan agent.

### Probe broker belum final

.local/broker-credential.verification.json terakhir masih credentialPipeReady=false, stage BINDING, pipeMatchesEncryptedToken=true, serviceUsesPrivatePipe=true. Byte delivery sudah identik dengan DPAPI dan decode telah mencapai tahap BINDING. Jangan menganggap token salah atau meminta rotasi hanya berdasarkan flag false ini.

Penyebab diagnostik: path laporan SUKSES pada .local/verify-broker-start.ps1 salah escape dan WriteAllText menghasilkan ArgumentException sesudah decode/validasi envelope. Path sudah diperbaiki ke C:/ProgramData/HDWork2/cloudflared/broker-probe.json. Helper juga memakai nama hasil unik per probe agar tidak membaca laporan gagal lama.

**Perintah ulang sesudah fix diinterupsi pengguna sebelum ada laporan PASS baru.** Pemeriksaan read-only saat handoff masih menemukan laporan lama. Source yang sudah benar tidak boleh dianggap bukti final PASS atau Healthy.

Perintah terinterupsi mungkin sempat memulai elevated helper/probe task. Sebelum mengulang, periksa hanya HDWork2-BrokerProbe dan proses helper milik proyek. Jangan menghapus task/proses yang tidak dipastikan milik probe, atau profil/laporan lama. Probe hanya pipe lokal sebagai SYSTEM, tanpa koneksi tunnel.

### Risiko startup web SYSTEM

Read-only ACL check menemukan hak tulis broad/unprivileged groups pada root proyek, scripts, src dan node_modules. Source ini tidak aman dijalankan sebagai SYSTEM. Guard instalasi Target Web/All akan menolak kondisi tersebut; jangan bypass.

Pilih hardening ACL khusus proyek dengan backup, snapshot aplikasi terlindung, atau akun runtime berhak minimum. Periksa efektif permission source/dependencies, jangan hanya menandai bool verified. Jangan mengubah sistem/ACL legacy, firewall atau VPN. Task web BELUM terdaftar; kode bootstrap belum merupakan deployment yang disahkan.

## 4. Laporan privat dan cara membacanya

- .local/office-tunnel-token.ready.json: ready=true, existing tunnel/operator-confirmed, exposure resolved; noPublishedOrPrivateRoutesConfirmed=false.
- .local/office-service-secrets.ready.json: token dan bundle selesai, tidak ada rotasi agent.
- .local/office-service-secrets.blocked.json: kegagalan newline historis; sudah tersalip ready=true.
- .local/service-secret-copy.verification.json: tiga secret terbaca, tidak ada nilai dicetak/query DB.
- .local/office-startup-Broker.ready.json: registrasi selesai. tasksStarted=false hanya snapshot instalasi; broker kemudian pernah dijalankan.
- .local/office-startup-Broker.blocked.json: kegagalan SERVICE_CONFIG sebelum perbaikan CIM, bukan status terakhir.
- .local/broker-task.diagnosis.json: snapshot Running, satu broker, LastTaskResult267009 (sedang berjalan).
- .local/broker-runtime.diagnosis.json: snapshot WAITING pada LOCAL_PIPE, bukan heartbeat terkini.
- .local/broker-credential.verification.json: probe terakhir belum PASS karena penulisan laporan.
- connector-route-review.approved.json, connector-health.json, office-startup-Web.ready.json, office-startup-All.ready.json belum ada di .local saat handoff.
- Query task non-elevated pada handoff tidak memberi objek. Periksa elevated read-only sebelum menyimpulkan status task terkini.
- .local/browser-recovery-a1a12171611245179101f4488bcf68b5/: log runtime yang pernah dipulihkan. Jangan start runtime kedua pada port terpakai.

## 5. Hasil PASS yang tidak perlu diulang tanpa perubahan relevan

| Cakupan | Bukti |
| --- | --- |
| Batch lama MySQL/operations/courier/Chrome/HTTPS | PASS historis; gunakan laporan sebelumnya, jangan ulang suite penuh. |
| Auth nyata lokal historis | SUPER_ADMIN login, /me, refresh/logout/revocation PASS; bukan validasi origin uji terbaru. |
| E2E Telegram testing historis | Satu B2C tepat sekali, tampil di browser/API, satu status/reply DONE berizin. Izin itu sudah terpakai. |
| Online single-host | 9 tes baru PASS, build origin sebelumnya PASS, 11 routing offline PASS. |
| Office tanpa Access | 8 tes baru PASS: header edge palsu bukan session, limiter tidak percaya proxy spoofing. |
| Launcher login | 2 tes pin/profile dan3 tes error/startup PASS; Chrome nyata lokal terbuka. |
| Hostname/service preparation | 2 tes persiapan dan1 tes registrasi Disabled PASS; build hdwork2.yoloo.space, ingress dan syntax PS PASS. |
| Windows Service existing | Registrasi Stopped/Disabled dan ACL SYSTEM/Administrators PASS. |
| Bootstrap startup baru | 3 tes office-startup-service PASS dengan mock; case instalasi diulang setelah perubahan CIM dan PASS. Bukan bukti task web/reboot nyata. |
| Connector gate | 2 tes connector-activation-gate PASS dan syntax helper PASS; bukan koneksi edge. |
| Pipe native | cloudflared membaca/menolak token sintetis via pipe PASS tanpa tunnel nyata. |
| Credential aktual | DPAPI tersimpan dan byte pipe identik. Final report/edge Healthy/public login BELUM PASS. |

## 6. Urutan melanjutkan sampai benar-benar online

1. OTOMATIS setelah permintaan resume: baca handoff dan periksa service/port serta probe terinterupsi secara terbatas. Jangan fetch/pull, migrasi, audit/test semua dari awal.
2. OTOMATIS dengan elevasi yang diizinkan: selesaikan HANYA probe broker gagal sesudah path fix. Token sudah tersimpan; jangan minta input/rotasi lagi kecuali ada bukti revoked/invalid/exposed. Service tetap Stopped/Disabled selama probe.
3. INPUT/BUKTI PENGGUNA: pastikan existing hdwork2 tidak memiliki Published Application Route atau private/VPN route yang akan ikut aktif. Pertanyaan ini BELUM dijawab. Tunnel token tidak otomatis memberi hak API DNS/management.
4. OTOMATIS setelah bukti routing dan izin connector diperbarui saat resume: simpan evidence yang benar dan jalankan helper existing-service start. Jangan memalsukan flag atau membuat tunnel baru/DNS. Healthy harus dibuktikan edge connections, bukan sekadar Windows Running. Helper fail-closed stop/Disabled jika gagal.
5. PERSETUJUAN ADMIN/PILIHAN KEAMANAN: selesaikan ACL/akun runtime, baru register/start startup web aman. Jangan jalankan Node SYSTEM pada source broad-writable. Broker tetap terpisah, tidak membuka jaringan.
6. OTOMATIS sesudah syarat aman: pindahkan hanya runtime HDWork2 ke backend.environment/build origin hdwork2.yoloo.space. Hindari konflik3090/8443. Stop hanya proses proyek dengan identitas terverifikasi, bukan semua Node/PM2.
7. INPUT LOGIN LOKAL: pengguna mengetik akun testing sah di browser; jangan membaca field password/cookie/token. Verifikasi /me, refresh, logout/expiry, CSRF/cookie/permission. Jangan membuat akun, mengubah role/password atau order. Gate15menit lama bukan service24jam.
8. OTOMATIS/read-only: buktikan origin TLS/readiness/grants auth-read, endpoint deny, proxy/rate limit dan keamanan port. Jangan mengubah shared MySQL/firewall/VPN. Bundle dan CORS/CSRF harus tepat hostname uji.
9. PERSETUJUAN PUBLIK EKSPLISIT: setelah keamanan/login nyata PASS, minta satu izin DNS + Published Application Route khusus hdwork2.yoloo.space. Izin ini BELUM diberikan. Izin Healthy tidak sama dengan izin publik.
10. OTOMATIS sesudah izin dan akses account tersedia: terapkan ingress ketat + DNS hanya hostname uji; jangan ubah trial/host lain. Uji internet login page, API tanpa sesi401, deny internal/admin/legacy/courier dan TLS. Jika gagal, rollback hanya route/DNS uji baru dan stop connector.
11. OTOMATIS sesuai izin: buktikan proses tetap hidup setelah terminal ditutup, konfigurasi recovery hanya milik proyek. Reboot nyata perlu maintenance window terpisah karena PC memuat layanan lama; jangan reboot untuk sekadar tes. Jangan klaim boot PASS dari konfigurasi saja.

## 7. Perintah konkret dari titik terakhir

Dokumentasi berikut TIDAK dijalankan saat handoff. Elevasi membutuhkan persetujuan Windows. Jangan menyertakan token/password/UUID pada argumen.

~~~powershell
Set-Location D:/HDWork2-New
Get-Service Cloudflared | Format-List Name,DisplayName,Status,StartType
# Elevated read-only jika diperlukan:
Get-ScheduledTask -TaskName 'HDWork2-*' | Select-Object TaskName,State
Get-Content .local/office-tunnel-token.ready.json
Get-Content .local/office-service-secrets.ready.json
Get-Content .local/broker-credential.verification.json
~~~

Sesudah memastikan probe lama tidak sedang digunakan, ulangi hanya probe yang gagal:

~~~powershell
# PowerShell Administrator; tidak start Cloudflared atau mengubah DNS.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File D:/HDWork2-New/.local/verify-broker-start.ps1
Get-Content .local/broker-credential.verification.json
~~~

Target: credentialPipeReady=true, pipeMatchesEncryptedToken=true, serviceUsesPrivatePipe=true. Jika false, perbaiki diagnosis sebelum start; bukan alasan langsung meminta token ulang. Helper membuat probe task sementara; cek task/proses sisa interupsi sebelumnya sebelum re-run.

Sesudah konfirmasi route yang nyata (JANGAN jalankan contoh flags ini sebelum kondisi benar):

~~~powershell
$routeReview=@{tunnelName='hdwork2';noPublishedApplicationRoutes=$true;noPrivateOrVpnRoutes=$true;publicActivationApproved=$false;reviewExpiresAt=[DateTime]::UtcNow.AddMinutes(30).ToString('o')}
$routeReview | ConvertTo-Json | Set-Content -LiteralPath .local/connector-route-review.approved.json
# Administrator, setelah izin connector/probe PASS:
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts/start-existing-hdwork2-connector.ps1 -ApprovedConnectorStart
Get-Content .local/connector-health.json
~~~

Helper start belum pernah dijalankan. Target HEALTHY_LOCAL_CONNECTOR_METRICS dengan koneksi edge positif; cocokkan Dashboard jika tersedia. StartupType awal Manual. Automatic/recovery connector belum dikonfigurasi/disahkan. Remote-route kosong tidak dapat dibuktikan hanya dari marker lokal.

Profil/build lokal bisa diperiksa tanpa DB bila diperlukan:

~~~powershell
node scripts/office-web.js --check
node scripts/open-local-login.js --check
~~~

Perintah kedua melakukan TLS handshake8443 tanpa login/query DB. Jangan mengulang PASS jika tidak diperlukan.

Profil uji baru, hanya setelah privilege/runtime aman dan izin restart aplikasi diberikan:

~~~powershell
# PowerShell khusus; port3090/8443 harus sudah dilepas oleh runtime proyek lama.
$env:DOTENV_CONFIG_PATH='D:/HDWork2-New/.local/online-candidate-hdwork2-service-9f638a40c09cf902/backend.environment'
$env:HDWORK2_SERVICE_AUTH_APPROVED='true'
$env:HDWORK2_ONLINE_RUNTIME_APPROVED='true'
node -r dotenv/config scripts/private-runtime.js local
~~~

Ini membuka koneksi auth/read dan listener, bukan pemeriksaan offline. Jangan sebagai SYSTEM pada source yang belum diamankan. Login pengguna nanti menulis session/audit sesuai scope, bukan order.

Instalasi Task Broker SUDAH selesai; jangan ulang Target Broker/All karena helper menolak task existing. Task Web belum ada; Target Web saat ini diblokir guard ACL. Jangan bypass. Jika token kelak benar-benar perlu diganti, helper mempertahankan ciphertext existing; jangan menganggap ia otomatis menggantinya dengan token rotasi berikutnya. Siapkan handover versi terenkripsi dengan backup, bukan overwrite buta.

## 8. Kondisi Git

- Branch: chore/remove-cacti-hdwork2.
- HEAD: 8fb833cc7fd3d69205dc917e4305cc21bd58adc6.
- Judul: chore(frontend): remove unused shadcn dependency.
- Snapshot: 14 tracked modified, 43 untracked; staging KOSONG.
- Tracking lokal ahead/behind0/0 terhadap origin branch pada pembacaan handoff; TIDAK melakukan fetch. Ini bukan klaim remote belum berubah sejak push.
- Tujuh commit yang sudah dipush: 2213ba3, d3d8c55, 2c769b1, bb6726b, 9ff7cfe, 039cc58, 8fb833c.
- Perubahan online/service setelah tujuh commit masih lokal. Tidak ada commit/push/merge baru dalam pekerjaan aktivasi/handoff.

Modified/untracked lengkap:

~~~text
 M courier-b2c-server.js
 M courier_bot/courier/__main__.py
 M courier_bot/courier/groups.py
 M local-web-server.js
 M scripts/private-runtime.js
 M src/access/http.js
 M src/api-only-app.js
 M src/config/api-only-startup.js
 M src/config/auth-write-policy.js
 M src/config/operational-pools.js
 M src/config/tunnel-plan.js
 M src/courier/integration-app.js
 M src/local-web.js
 M tests/courier-integration.test.js
?? docs/HANDOFF-ONLINE.md
?? docs/hdwork2-windows-service.md
?? docs/live-end-to-end-completed.md
?? docs/live-ingestion-first-order.md
?? docs/live-testing-hdworkopsbot.md
?? docs/office-online-runbook.md
?? docs/office-web-local.md
?? docs/online-single-host-candidate.md
?? docs/testing-accounts-provisioning.md
?? ops/examples/live-testing-done.review.sql
?? scripts/inspect-live-order-browser.js
?? scripts/install-office-startup.ps1
?? scripts/live-order-browser.js
?? scripts/live-single-order.js
?? scripts/office-web-service.js
?? scripts/office-web.js
?? scripts/open-local-login.js
?? scripts/prepare-cloudflared-service.js
?? scripts/prepare-online-candidate.js
?? scripts/protect-existing-web-secret.ps1
?? scripts/register-hdwork2-service.ps1
?? scripts/run-office-web-service.ps1
?? scripts/setup-office-service-secrets.ps1
?? scripts/start-existing-hdwork2-connector.ps1
?? scripts/testing-done-reply.js
?? scripts/testing-order-done.js
?? scripts/testing-order-done.ps1
?? scripts/tunnel-token-broker.ps1
?? scripts/verify-testing-bot.js
?? src/config/office-web.js
?? src/config/online-candidate.js
?? src/config/persistent-auth.js
?? src/config/private-web-env.js
?? src/config/web-build.js
?? src/courier/single-order-window.js
?? src/middlewares/application-session-boundary.js
?? tests/connector-activation-gate.test.js
?? tests/hdwork2-service-preparation.test.js
?? tests/local-login-browser-errors.test.js
?? tests/local-login-browser.test.js
?? tests/office-startup-service.test.js
?? tests/office-web.test.js
?? tests/online-candidate.test.js
~~~

Kode untuk review commit terpisah: persistent-auth/private loader, office profiles/endpoint boundary, browser launcher, disabled-registration/broker/startup/controller, tests dan dokumen generik. Jangan menganggap semua source ini sudah terverifikasi produksi atau otomatis aman untuk commit.

Wajib dikecualikan:

- Seluruh .local/, .env asli, frontend/.env.local, private key TLS/CA, DPAPI, profil Chrome/cookie/session, SQLite journal, screenshot/live reports dan dump/export data nyata.
- Seluruh C:/ProgramData/HDWork2/; di luar repository.
- 14 file live yang sebelumnya dikecualikan tetap lokal: docs/HANDOFF-ONLINE.md (review ulang setelah sanitasi), docs/live-end-to-end-completed.md, docs/live-ingestion-first-order.md, docs/live-testing-hdworkopsbot.md, docs/testing-accounts-provisioning.md, ops/examples/live-testing-done.review.sql, scripts/inspect-live-order-browser.js, scripts/live-order-browser.js, scripts/live-single-order.js, scripts/testing-done-reply.js, scripts/testing-order-done.js, scripts/verify-testing-bot.js, src/courier/single-order-window.js, scripts/testing-order-done.ps1.
- Lima tracked file mempertahankan hook/metadata live lokal sesudah commit sanitasi: courier-b2c-server.js, courier_bot/courier/__main__.py, courier_bot/courier/groups.py, src/courier/integration-app.js, tests/courier-integration.test.js. Review hunks/dependencies, jangan git add -A.
- Backup handoff lama di .local/handoff-history mungkin mengandung metadata live historis; jangan dipindahkan ke Git.

Risiko: pull/merge dapat konflik dengan banyak perubahan lokal; reset/checkout/clean dapat menghapus fitur, source untracked, profil/secret jika opsi ignored digunakan. Jangan pull, reset, clean, checkout atau menimpa working tree tanpa backup dan izin. Sanitasi commit sebelumnya sengaja berbeda dari hook testing lokal yang dipertahankan.

## 9. Aturan keamanan dan izin terakhir

- Pengguna terakhir meminta HALT AKTIVASI dan handoff. Tidak ada service start, DNS, route atau pekerjaan aktivasi dilanjutkan pada penulisan dokumen. Minta permintaan resume sebelum melanjutkan.
- Jangan mengakses hd_b2c, mengganggu PM2 sync-hdwork, bot atau HD Work lama.
- Jangan mengubah data operasional, users/role/password/grants, mengulang migrasi004–009, atau memakai root runtime.
- Jangan mengaktifkan courier/Telegram atau mengirim pesan asli. Izin one-shot lama sudah habis.
- Jangan mengubah VPN/firewall perusahaan atau membuka3306/3090/3091/DevTools.
- Jangan tampilkan token, password, UUID tunnel, hash kredensial, cookie/session atau isi secret. Tidak ada nilai tersebut dicantumkan di handoff.
- Jangan membuat tunnel baru, install ulang Cloudflared, mengubah trial hdwork.yoloo.space atau hostname lain.
- Tanpa Access: session/permission aplikasi dan allowlist backend/ingress wajib. Jangan percaya header Cloudflare/X-Forwarded-For sebagai session; jangan trust proxy=true sembarangan. Limiter socket konservatif berarti klien Tunnel berbagi bucket; review kapasitas sebelum produksi.
- Jangan menonaktifkan TLS global/trust Windows. Origin memakai SNI localhost dan CA privat; SPKI hanya profil Chrome development terisolasi.
- Jangan commit/push/merge/deploy tanpa izin. Jangan hapus perubahan lokal, backup, profil, journal atau bukti lama.
- Status akhir: BELUM ONLINE/BELUM DIVERIFIKASI PUBLIK. Satu izin publik eksplisit tetap wajib sesudah login/keamanan aktual PASS.
