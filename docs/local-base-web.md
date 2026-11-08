# HD Work 2.0 — versi dasar lokal

Implementasi lokal memakai API-only, cookie V2, dan HTTPS satu origin. Tidak
memerlukan PM2, Vite dev server, bot aktif, perubahan schema, atau deployment.
`server.js` dan `/legacy` bukan jalur versi dasar ini.

## Konfigurasi privat

`npm.cmd run setup:local` membuat `.env` dan `frontend/.env.local` hanya jika belum
ada. File existing tidak ditimpa. JWT dibuat acak. DB_USER memakai hdwork_auth,
DB_PASSWORD tetap kosong pada disk dan DB_PASSWORD_DPAPI_FILE menunjuk file
terenkripsi privat. Gunakan private-runtime sesuai batch1-5-readiness.md; jangan
menaruh password plaintext di .env, chat, log atau argumen. Jangan gunakan root.
File konfigurasi dan `.local/` diabaikan Git. Abaikan Git bukan pengganti ACL:
simpan workspace hanya pada akun Windows tepercaya dan batasi akses file privat.

Environment frontend cocok dengan backend: cookie V2 dan operations aktif,
API base `https://localhost:8443` tanpa `/api`, FRONTEND_ORIGINS persis origin
tersebut tanpa slash akhir. `VITE_*` adalah konfigurasi publik. PORT/DB_PORT
ditetapkan eksplisit. Jika origin berubah, ubah kedua sisi dan build ulang.

`HDWORK2_LOCAL_READ_ONLY=true` memblokir POST termasuk login, logout dan mutasi
akun/order sebelum mencapai database. Ini default keselamatan, bukan mode web
operasional penuh. Menonaktifkannya pada database utama memerlukan persetujuan
penulisan produksi: login sukses/gagal menulis audit, login sukses membuat sesi,
logout mencabut sesi. Tidak ada migrasi/provisioning otomatis.

## Sertifikat lokal

`node scripts/setup-local-tls.js` memakai OpenSSL lokal (default executable Git
for Windows; override dengan HDWORK2_OPENSSL). Membuat CA dan sertifikat localhost
30 hari dalam `.local/tls/`, tanpa mengubah Windows trust store dan tanpa menimpa
material existing. Private key tidak boleh dibagikan. Jangan memakai sertifikat
ini untuk publikasi atau perangkat lain.

Setelah persetujuan perubahan trust store, operator dapat mempercayai **hanya**
`.local/tls/ca.crt` pada CurrentUser Root akun penguji Windows. Jangan mengimpor
private key atau mengganti trust sistem secara global. Periksa browser menerima
rantai sertifikat tanpa peringatan. Pengujian Node memakai CA eksplisit dan
verifikasi TLS tetap aktif. Browser otomatis memakai pin SPKI leaf khusus pada
profil sementara; hasil itu tidak membuktikan trust browser pengguna.

## Menjalankan setelah prasyarat disetujui

1. Siapkan file DPAPI privat dan periksa `npm.cmd run check:db:private`. Pemeriksaan hanya
   membaca DATABASE() dan metadata kolom, tanpa membaca akun/password maupun
   menjalankan DDL. Target harus hdwork2 dan schema sesuai baseline yang ada.
2. Build `npm.cmd --prefix frontend run build`.
3. Pastikan 3090/8443 bebas. Jalankan `npm.cmd run start:local` dari root proyek.
   Launcher mengecek konfigurasi, sertifikat, build, dan DB sebelum membuka API.
   Untuk DPAPI gunakan start:local:private; akun auth-only belum memenuhi metadata
   operasi lengkap, sehingga jalur HTTPS operasional belum siap diaktifkan.
4. Buka `https://localhost:8443`. HTTPS menyajikan build frontend dan meneruskan
   `/api/*`, `/health`, `/ready` ke API-only HTTP loopback. Tidak perlu port5173
   saat memakai build. `/health` mengecek proses; `/ready` mengecek DB/schema.
5. Setelah penulisan produksi diizinkan, tinjau mekanisme aktivasi tulis dan grants terlebih dahulu.
   Loader DPAPI saat ini menolak read-only=false; flag tidak boleh diganti sendiri. Masuk menggunakan SUPER_ADMIN existing.
   Tidak ada akun atau password default; tidak perlu provisioning ulang.
6. Ctrl+C menghentikan kedua listener lokal dan pool. Tidak menyentuh PM2/service.

## Alur dasar dan peran

B2C (TIAL/REQ dan LOGIC), ASSUREN, B2B, REPLACEMENT memiliki ringkasan,
antrean masuk/proses/selesai, pencarian, filter, pagination, form order manual,
detail dan riwayat. Status: WAITING → IN_PROGRESS → DONE/FAILED, dengan reopen
dan takeover. Riwayat dicatat dalam hd2_audit; event live memakai hd2_live_events.
Order manual memakai module yang tersedia di kolom VARCHAR schema existing,
command NULL dan sumber `web-local/web`, sehingga tidak membuat pesan Telegram.
Referensi manual tidak di-dedup otomatis: pengiriman ulang request yang sama
idempoten, tetapi dua input baru dengan referensi sama tetap dua order.

SUPER_ADMIN: seluruh modul, membuat order, mengelola pengguna/izin/audit. ADMIN:
membaca/membuat order pada modulnya. HD: membaca/membuat serta PICK/DONE/GAGAL,
takeover/reopen pada modulnya. SHOW_ONLY: membaca modulnya saja. Tidak mengubah
akun SUPER_ADMIN untuk memperoleh role HD. Buat akun HD hanya setelah izin
produksi, atau pakai akun sintetis pada tes. Super Admin aktif terakhir tetap
dilindungi. Izin baru ASSUREN/B2B/REPLACEMENT dapat diberikan melalui manajemen
pengguna tanpa DDL; akun existing tidak diperbarui otomatis.

Check-in ONLINE/SIBUK/OFFLINE tetap preferensi tab lokal, bukan absensi server
atau otorisasi PICK. Transfer paket, produktivitas, publik monitoring, chat,
lampiran, SLA, dan parser Telegram untuk modul non-B2C belum termasuk versi ini.
Menu fitur tambahan tersebut disembunyikan dari navigasi operasional dasar.

## Kurir Telegram

Kontrak HMAC, inbox/outbox, lease, ACK/retry, worker dan runtime Python existing
dipertahankan. Penerimaan B2C: /order, /req, /config_psb, /MO pada grup allowlist
non-topic. Tes integrasi memakai transport Telegram palsu; tidak ada Telegram
network, token asli atau grup asli. Aktivasi asli membutuhkan persetujuan serta
kredensial/akun DB kurir terpisah, grup yang diverifikasi, dan direktori jurnal/
lock privat di luar repo sesuai runtime_config.py. Jangan menyalin token bot lama.
COURIER_ENABLED/COURIER_ALLOW_NETWORK tetap false di konfigurasi lokal utama.

## Validasi aman

`npm.cmd test`: unit/regresi backend. `node --test frontend/tests/*.test.ts`: unit
frontend. Build seperti di atas. `node scripts/test-isolated-mysql.js
--private-instance-only`: membuat instance MySQL8.4 milik tes pada127.0.0.1:13316,
datadir acak `.local/mysql-test-*`, akun dan schema acak `hdwork2_test_*`.
Fixture baseline dibangun hanya pada schema kosong tersebut, bukan hdwork2 atau
hd_b2c. Environment produksi tidak dimuat. Proses, data uji, dan kredensial
sementara dibersihkan setelah tes. Tidak mengubah service MySQL utama.

Tambahkan `--browser` untuk Chrome headless dengan profil sementara. Peluncuran
GUI memerlukan izin lingkungan. Browser membaca kredensial uji melalui stdin,
bukan argumen. Uji login cookie, buat order/PICK/DONE/reload keempat kategori,
layout mobile, rekap dan logout. Screenshot sintetis: `.local/browser-smoke.png`.
Database dan akun tes tidak dapat dipakai untuk login pada database utama.

Diagnosis browser mencatat tahap, kode kegagalan, status HTTP endpoint auth yang
diizinkan, dan jumlah exception ke `.local/browser-test-*-diagnostic.json`.
Tidak mencatat password, cookie, token, header, body request/response atau URL
query. Profil Chrome dipertahankan untuk diagnosis; jangan hapus sebelum proses
pemakainya dipastikan berhenti. ERR_ASSERTION pembungkus helper diganti pelaporan
BROWSER_SMOKE_FAILED beserta tahap/kode aman. Penambahan diagnostik tidak berarti
browser sudah diuji ulang. Runner `--browser` existing tetap menjalankan suite
MySQL dan menyiapkan fixture: jangan gunakan untuk diagnosis browser saja atau
ketika pengulangan fixture/migrasi dilarang.
