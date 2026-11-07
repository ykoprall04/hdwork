# Audit independensi HD Work 2.0

Tanggal: 7 November 2026. Repository: `ykoprall04/hdwork`.
Basis pemeriksaan: branch lokal `chore/remove-cacti-hdwork2`, HEAD `b254330`,
termasuk perubahan penghapusan Cacti yang masih belum di-commit.

## Kesimpulan

HD Work 2.0 dapat dipisahkan secara teknis dari instalasi HD Work asal. Tidak
terlihat pemanggilan wajib ke domain/server HD Work asal di kode aplikasi yang
tersisa. Namun **kemandirian operasional dan hak kepemilikan belum terbukti**:
backend memerlukan skema/database operasional yang belum disediakan lengkap,
identitas bot/grup Telegram, secret autentikasi, penyimpanan lampiran, dan akses
jaringan perangkat yang dikuasai pengelola. Status akun infrastruktur dan izin
pemakaian kode asal harus dikonfirmasi dengan bukti di luar repository.

Preview yang berjalan mandiri bukan bukti backend produksi sudah mandiri.
Kendali atas repository juga bukan otomatis kepemilikan eksklusif kode fork.

## Metode dan batas audit

Pemeriksaan statis file terlacak dan konfigurasi lokal terkait: entry point,
seluruh kelompok controller/route/service/repository, frontend internal dan
preview, Local Agent, migrasi yang tersisa, tiga manifest/lockfile npm,
.gitignore, dokumentasi, dan riwayat Git lokal. Tidak menjalankan kode aplikasi,
backend utama, Local Agent, koneksi database, collector, scheduler, polling,
request ke API/domain/VPN, instalasi paket, atau pengujian jaringan.

File rahasia hanya diperiksa nama variabelnya; nilai tidak ditulis dalam laporan.
Audit ini tidak mencakup verifikasi konsol hosting/DNS/BotFather, tagihan, server
remote, pengaturan GitHub Actions/Pages/webhook, secret GitHub/Cloudflare, maupun
pemindaian forensik seluruh blob riwayat Git. Tidak ada klaim keamanan atau
kepemilikan layanan yang tidak diverifikasi. Satu-satunya file baru pada tugas
ini adalah laporan ini; perubahan penghapusan Cacti sebelumnya tidak diubah.

## Matriks temuan

| Komponen | Kategori | Bukti | Penilaian / kebutuhan |
| --- | --- | --- | --- |
| Preview HD Workspace, My Work, chat, check-in, admin | Sudah mandiri (simulasi) | `frontend/src/features/preview/`, `App.tsx` | State dan data DEMO lokal; tidak memerlukan server asal. Belum implementasi multiuser produksi. |
| Public Monitoring | Sudah mandiri (simulasi); perlu dibangun ulang untuk produksi | `PublicMonitoringPage.tsx`, `publicProjection`, `PreviewProvider` | Membaca proyeksi state demo; bukan API publik nyata atau sinkronisasi lintas perangkat. |
| React/TypeScript/Vite/Tailwind, UI dan tema | Sudah mandiri dari instalasi asal | `frontend/package.json` | Dependensi open source normal; lisensi/notice tetap wajib dipenuhi. |
| API internal dan realtime browser | Perlu konfigurasi baru | `frontend/src/config/api.ts`, service frontend, Socket.IO di Orders/NetworkTerminal | Semua diarahkan melalui `VITE_API_BASE_URL`. Target runtime/deployment di luar checkout belum diverifikasi. |
| MySQL dan data operasional | Masih bergantung pada skema/data yang sudah ada; perlu konfigurasi baru | `src/config/database.js`, seluruh repository SQL | Pemilik host/account/data belum terbukti. Wajib instance, akun, backup dan dataset yang sah di bawah kendali sendiri. |
| Login internal | Perlu konfigurasi baru | `auth.service.js`, `auth.repository.js`, `auth.middleware.js` | bcrypt/JWT lokal, tanpa SSO eksternal yang ditemukan; butuh tabel users, admin awal dan `JWT_SECRET` baru. |
| Telegram order | Masih bergantung pada layanan Telegram; perlu konfigurasi baru | `telegram.service.js`, `telegram.repository.js`, `server.js` | Telegraf + token bot + ID grup/topic dari DB. Tidak ada bukti bot/grup sekarang milik pengguna. |
| Network Tools / terminal / ZTE | Masih bergantung pada jaringan/perangkat; perlu konfigurasi baru | `network.service.js`, `zte-tools.service.js`, terminal services, `local_agent/` | Membutuhkan agent, SSH dan akses jaringan resmi. Tidak bergantung Cacti, tetapi tidak bisa mandiri dari perangkat yang memang diperiksa. |
| Target health VPN | Masih bergantung pada target privat lama; perlu konfigurasi baru | `src/config/network-tools.config.js:1` | Ada fallback IP privat hardcoded. Ganti nanti dengan target berizin milik sendiri atau jadikan fitur opsional; alamat tidak disalin dalam laporan. |
| Local Agent pairing dan known hosts | Perlu konfigurasi baru | `agent-config.js`, `agent.socket.js`, `ssh.service.js` | Pairing/account/kepercayaan host harus dibuat ulang; jangan membawa token atau known_hosts instalasi lain. |
| Lampiran order | Perlu konfigurasi baru | `upload.middleware.js`, `/uploads` di `src/app.js` | File lokal `uploads/results`, perlu volume, backup, retensi, pembatasan akses. Bukan penyimpanan eksternal hardcoded. |
| Cacti | Sudah dilepas di working tree; belum final di Git | diff lokal dan `docs/remove-cacti-audit.md` | Scheduler/collector/API/kode alarm dihapus lokal. HEAD dan riwayat masih memuat file lama; jangan menganggap clone HEAD sudah bersih. |
| Hosting/domain/TLS/deployment | Perlu konfigurasi baru; kepemilikan belum terverifikasi | Tidak ditemukan manifest infra/workflow deployment terlacak | Website online dan akun Cloudflare tidak diakses. Harus inventaris akun, DNS, zone, project, token dan billing sendiri. |
| Kode hasil fork dan branding | Risiko lisensi/kepemilikan | riwayat import, manifest, ketiadaan LICENSE/NOTICE | Diperlukan penelusuran asal dan izin tertulis; metadata ISC saja belum cukup memastikan seluruh kode sah dialihkan. |

Kategori dapat beririsan: kode yang tidak memanggil server asal tetap memerlukan
konfigurasi dan akun baru sebelum layak beroperasi mandiri.

## URL, IP, identitas, webhook, VPN dan konfigurasi

- Tidak ditemukan hardcoded domain HD Work asal atau domain website online
  `hdwork.yoloo.space` dalam kode aplikasi terlacak yang diperiksa. Ini tidak
  membuktikan DNS, deployment environment atau database bebas referensi lama.
- URL frontend internal dipusatkan di `frontend/src/config/api.ts`; aplikasi
  internal menolak berjalan jika `VITE_API_BASE_URL` tidak tersedia. File lokal
  `frontend/.env.local` berisi nama variabel `VITE_API_BASE_URL`, `VITE_DEV_PORT`;
  target diklasifikasikan loopback HTTP tanpa mencatat nilainya.
- URL fallback localhost/loopback di server, agent, PORTS.md dan tes merupakan
  konfigurasi pengembangan normal, bukan ketergantungan server teman.
- IP privat fallback `VPN_HEALTH_HOST` satu-satunya target jaringan operasional
  literal yang ditemukan. Kepemilikannya tidak dapat diketahui dari kode.
- SSH username/password/host diterima dari input; fallback username untuk
  verifikasi host bukan akun jaringan nyata hardcoded. Akun demo memiliki
  penanda demo dan bukan bukti identitas pemilik sistem.
- Tidak ditemukan konfigurasi tunnel Tailscale/WireGuard/OpenVPN atau launcher
  VPN. Kode hanya menguji keterjangkauan target melalui Local Agent. Akses VPN
  bisa tetap bergantung pada konfigurasi OS di luar repository.
- Tidak ditemukan endpoint Google Sheets, webhook eksternal khusus, SSO lama,
  atau SDK API privat HD Work asal pada kode tersisa. Telegram menggunakan
  polling Telegraf, bukan webhook yang didefinisikan aplikasi ini.
- `server.js` tetap memanggil `telegramService.startPolling()` sesudah koneksi
  database dan listen. Karena itu menjalankan backend dengan token aktif dapat
  memulai bot; perlu pemisahan lifecycle/flag eksplisit pada pengembangan nanti.
- Tidak ditemukan nama organisasi asal yang mengonfirmasi kepemilikan. Nama
  produk HD Work, istilah kota/segmen/STO dan workflow telekomunikasi merupakan
  branding/aturan domain yang perlu persetujuan penggunaan terpisah.

### Inventaris konfigurasi untuk dibuat ulang, tanpa nilai

| Lingkup | Nama variabel / konfigurasi |
| --- | --- |
| Backend | `PORT`, `FRONTEND_ORIGIN`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `TELEGRAM_BOT_TOKEN` |
| Network | `VPN_HEALTH_HOST`, `ZTE_DEFAULT_FRAME`, `SSH_RESUME_GRACE_SECONDS` |
| Frontend | `VITE_API_BASE_URL`, `VITE_DEV_PORT`, opsional `VITE_LONG_ORDER_MINUTES` |
| Local Agent | `HD_WORK_SERVER_URL`, `PORT`, `HD_WORK_AGENT_ID`, `HD_WORK_AGENT_TOKEN`, file pairing dan known hosts lokal |
| Non-env | city/segment/user/role, grup/chat/topic Telegram pada database, admin bootstrap, origin/socket, upload volume, backup, DNS/TLS, akun hosting |

Tidak ada `.env.example` aktif untuk backend/frontend/agent yang lengkap pada
working tree ini. Template collector sudah dihapus lokal pada tugas sebelumnya;
HEAD masih merekam template tersebut. `PORTS.md` hanya dokumentasi sebagian
variabel. Perlu menambahkan template aman dan validasi konfigurasi kemudian,
bukan menyalin `.env` atau kredensial instalasi lama. Semua `VITE_*` harus dianggap
publik karena dibundel ke browser. Root `.gitignore` dan ignore agent sudah
mengecualikan sejumlah secret/config lokal; pola root bukan perlindungan otomatis
untuk semua variasi `.env.production` dan lokasi baru. Jangan menganggap riwayat
Git bersih dari secret hanya karena ignore tersedia.

## Audit modul backend dan frontend

- **Auth dan users:** SQL users, cities, user_segments/segments; tidak membutuhkan
  layanan login asal. Membutuhkan akun sendiri, kebijakan role dan onboarding.
- **Dashboard, orders, attendance:** SQL langsung ke database yang dikonfigurasi.
  Ketergantungan pada struktur/aturan data, bukan HTTP API server teman yang
  tertanam. Data grup/order Telegram tersimpan pada database, sehingga audit
  file saja tidak bisa mengesahkan tujuan notifikasi atau kepemilikan dataset.
- **Groups dan Telegram:** mapping chat/topic/city/segment; parsing `#req`,
  `#assign`, `/config`; notifikasi claim/hasil/selesai. Harus bot dan grup uji
  sendiri. Jangan memakai token/grup lama untuk menguji pemisahan.
- **Agent/network/ZTE/terminal:** gateway Socket.IO, token pairing, akses SSH,
  parsing keluaran perangkat ZTE. Dapat dipertahankan bila kebutuhan dan izin
  akses jelas; jangan menganggap akses jaringan organisasi otomatis dimiliki
  pengguna hanya karena software dikuasai sendiri.
- **Internal frontend:** service auth/user/dashboard/order/attendance/group dan
  network menuju base API terpusat; Socket.IO memakai base yang sama. Seluruh
  fungsi ini perlu backend+data baru untuk uji integrasi mandiri.
- **Preview/public:** state lokal terpisah dari API internal melalui lazy route.
  Browser storage dan simulasi persetujuan/transfer/chat bukan autentikasi,
  otorisasi, event ledger atau realtime produksi. Jangan dihubungkan langsung
  ke data sensitif hanya dengan menyembunyikan kolom di UI.

### Kekurangan provisioning data

Migrasi aktif hanya perubahan topic Telegram, hasil lokal tanpa Telegram, dan
pembuatan `local_agents`. Tidak ditemukan baseline DDL lengkap atau seed untuk
instalasi database kosong. Repository SQL menggunakan setidaknya: `users`,
`cities`, `segments`, `user_segments`, `telegram_groups`, `order_types`, `orders`,
`order_assignments`, `order_events`, `order_notes`, `order_results`,
`order_result_files`, `attendance`, `attendance_breaks`, `local_agents`.

Ini penghambat utama pemasangan mandiri: siapkan baseline yang ditinjau,
constraint/index/charset/timezone yang benar, seed referensi dan bootstrap admin.
Jangan membuat dump produksi atau menyalin data pelanggan tanpa dasar izin.

## Package, lisensi, copyright dan asal fork

- Origin lokal menunjuk repository `ykoprall04/hdwork`; tidak ditemukan dependency
  npm beralamat Git/private repo asal. Semua entri `resolved` pada tiga lockfile
  yang memiliki URL menunjuk registry npm. Ini tidak menjamin artefak bebas
  kerentanan atau tidak melakukan unduhan lain saat instalasi.
- Commit tertua yang tersedia: `35aae09`, “Initial project import”, 11 September
  2026. Riwayat juga merekam merge dari namespace `mionoo/...`. Ini petunjuk
  asal kolaborasi, bukan bukti lisensi, kepemilikan, atau hak sublicensing.
  Import awal tidak menyediakan riwayat sebelum import. Status fork GitHub dan
  pemegang hak asli belum diverifikasi melalui layanan GitHub.
- Root dan Local Agent menyebut `license: ISC`, author kosong; frontend private
  tanpa deklarasi license. Tidak ditemukan berkas LICENSE/COPYING/NOTICE
  terlacak atau atribusi copyright proyek yang memadai. Tidak dapat menyimpulkan
  semua kode, aset, nama dan kontribusi telah diizinkan oleh pemegang hak.
- Jangan menghapus atribusi atau mengklaim kode fork sepenuhnya ciptaan sendiri.
  Minta izin/lisensi sumber asli dan kontribusi; verifikasi hak dari pekerjaan
  perusahaan/kontraktor bila relevan. Jika izin tidak tersedia, identifikasi
  bagian terdampak dan pertimbangkan penggantian independen yang terdokumentasi.
- Dependensi pihak ketiga normal: React, Express, MySQL driver, Telegraf,
  Socket.IO, Tailwind/Vite/TypeScript, bcrypt/JWT, ssh2, komponen UI dan font.
  Memakai ini tidak mengikat aplikasi pada server HD Work asal; lisensi dan
  ketentuan layanan tetap berlaku. MySQL server sendiri bukan paket dalam
  lockfile dan lisensi distribusi server perlu dinilai sesuai cara distribusi.

### Inventaris lisensi dari metadata lockfile

| Lockfile | Entri paket selain root | Temuan |
| --- | ---: | --- |
| Root | 176 | Mayoritas MIT/ISC; juga BSD, Apache-2.0, BlueOak; 3 metadata lisensi kosong |
| Frontend | 437 | Mayoritas MIT/ISC/BSD/Apache; 24 entri MPL-2.0 (termasuk varian platform), 1 OFL-1.1, 1 CC-BY-4.0, 1 Python-2.0, 1 metadata kosong |
| Local Agent | 110 | Mayoritas MIT/ISC/BSD; BlueOak/Unlicense; 4 metadata lisensi kosong |

Angka mencakup dependensi transitif/dev/opsional lintas platform; bukan jumlah
paket runtime unik dan tidak boleh dijumlahkan sebagai inventaris deduplikasi.

Perlu verifikasi teks lisensi terdistribusi untuk Lightning CSS (MPL-2.0), font
Geist (OFL-1.1), caniuse-lite (CC-BY-4.0), argparse (Python-2.0), serta notice
MIT/ISC/BSD/Apache yang relevan. MPL tidak otomatis mengubah seluruh aplikasi
menjadi MPL; kewajiban bergantung file/komponen dan bentuk distribusi/modifikasi.
Metadata kosong ditemukan pada busboy, streamsearch, xmlhttprequest-ssl,
buildcheck, cpu-features dan ssh2 (lintas lockfile); ini bukan bukti tanpa lisensi,
melainkan perlu memeriksa LICENSE paket sebenarnya. Audit legal final dan SBOM
produksi belum dilakukan; tidak ada download atau pemindaian vulnerability online.

## Komponen yang perlu dibangun atau disempurnakan

1. Baseline database reproducible, bootstrap admin, seed referensi dan prosedur
   backup/restore milik sendiri; jangan mengganti seluruh backend tanpa alasan.
2. Adapter/kontrak API untuk fitur yang masih DEMO: registrasi/approval,
   check-in workspace, My Work/chat, transfer massal/persetujuan, reopen, eskalasi,
   audit dan sinkronisasi realtime. Cocokkan dengan backend yang sudah ada agar
   tidak menduplikasi fitur atau menerapkan aturan bisnis lama tanpa evaluasi.
3. Public API terpisah dengan identifier aman, allowlist field, sanitasi pesan,
   rate limiting dan pagination; jangan membuka endpoint internal. Saat ini
   public monitoring masih simulasi, belum pengamanan data operasional nyata.
4. Lifecycle bot terkendali dan channel pengujian sendiri; pemisahan start bot
   dari start HTTP agar pengoperasian aman dan tidak mengambil polling bot lama.
5. Konfigurasi network/VPN opsional, validasi config, template tanpa secret,
   rotasi token, secret manager, provisioning agent dan penyimpanan upload.
6. Infrastruktur milik sendiri: DNS/TLS, server/database, CI/CD dengan approval,
   observability dan recovery. Ini pekerjaan berikutnya, belum dilaksanakan.
7. Dokumentasi asal kode, izin, lisensi produk, third-party notices dan SBOM.
   Penggantian kode baru diperlukan bila izin atau kompatibilitas tidak cukup,
   bukan semata-mata karena kode berasal dari fork.

## Rekomendasi migrasi bertahap

**Tahap 0 — bukti kendali dan izin.** Inventaris pemilik GitHub/org, DNS registrar,
Cloudflare/hosting, database, BotFather, grup Telegram, VPN/perangkat, secret dan
backup. Catat pemilik, administrator, billing, MFA dan jalur recovery tanpa
menaruh secret dalam laporan. Selesaikan izin kode/aset/data.

**Tahap 1 — sandbox independen.** Siapkan instance database kosong, akun DB least
privilege, storage dan secret baru. Tulis baseline/seed yang disetujui. Gunakan
bot+grup khusus pengujian sendiri; nonaktifkan polling otomatis secara eksplisit
pada revisi berikutnya sebelum pengujian backend.

**Tahap 2 — konfigurasi dan kontrak.** Arahkan base URL/CORS/socket/agent ke
infrastruktur sendiri; hilangkan fallback VPN lama. Buat template aman. Petakan
fitur preview ke kontrak internal/publik dan tetapkan batas data pelanggan.

**Tahap 3 — implementasi dan validasi terisolasi.** Lengkapi fitur DEMO bertahap,
uji login/otorisasi/order/chat/transfer/reopen, public projection, delivery bot
sendiri, agent berizin, backup/restore dan kegagalan koneksi. Gunakan data
sintetis dahulu; verifikasi tidak ada trafik ke instalasi asal.

**Tahap 4 — rencana cutover untuk persetujuan.** Tentukan data yang boleh
berpindah, downtime/rollback, DNS/TLS dan pencabutan kredensial lama. Deployment,
transfer data atau perubahan website online hanya setelah izin terpisah.

### Kriteria selesai independensi

Instalasi bersih dari repo+baseline+template berhasil pada akun sendiri; seluruh
akun dan jalur recovery terdokumentasi; tidak memerlukan secret/DB/server/bot
asal; tujuan koneksi dapat diaudit; akses jaringan berizin; API publik aman;
backup/restore teruji; dan hak penggunaan/distribusi kode/aset jelas. Layanan
normal seperti Telegram atau registry npm boleh tetap dipakai dengan akun dan
ketentuan yang sesuai—mandiri berarti kendali pengoperasian, bukan tanpa pihak
ketiga sama sekali.
