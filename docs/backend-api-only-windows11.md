# Tahap 1 — backend API mandiri pada Windows 11

> Pembaruan untuk staging online: gunakan `api-only-server.js`, bukan entrypoint
> legacy server.js. Lihat `api-only-tial-online-plan.md`; graph baru tidak memuat
> service Telegram, Socket.IO atau worker. Panduan di bawah merekam tahap awal.


Status: implementasi lokal pada `chore/remove-cacti-hdwork2`; belum dijalankan
terhadap database, PM2, Telegram atau website online. Panduan ini untuk penggunaan
nanti setelah konfigurasi/database disetujui, bukan perintah yang telah dieksekusi.

## Perubahan lifecycle

`server.js` sekarang hanya menjalankan HTTP Express, Socket.IO, autentikasi
socket, realtime order, gateway agent dan terminal. Startup tetap memeriksa
koneksi MySQL sebelum listen. Tidak mengimpor service Telegram secara langsung
atau memanggil polling, collector maupun scheduler. Tidak ada flag environment
yang mengaktifkan polling dari entry point API ini.

Mengimpor `server.js` hanya mengekspor `startServer`; dotenv, dependensi aplikasi,
pool dan listener baru dipakai saat startup eksplisit. Jalur CLI memuat dotenv
kemudian memanggil startup. Integrasi Telegram masih dapat dimuat lewat controller
order, tetapi tidak meluncurkan polling hanya karena diimpor. Fungsi
`startPolling` dan handler/notifikasi order tetap tersedia dalam service untuk
pengembangan adapter berikutnya; belum dibuat entry point bot baru.

Semua route Express dipertahankan tanpa perubahan pada `src/app.js` maupun file
route. Tidak mengubah frontend, database, `.env`, package atau lockfile.

## Menjalankan nanti melalui PowerShell dan PM2

Prasyarat sebelum menjalankan: gunakan checkout HD Work 2.0 sendiri pada PC,
Node/npm dan PM2 tersedia, database HD Work 2.0 beserta schema dan user sendiri
sudah disetujui/disiapkan, port bebas, serta konfigurasi API terpisah dari bot.
Jangan mengarahkan `DB_*` ke database lama untuk mencoba startup. Jangan menyalin
`.env`, token atau password bot. Instalasi database kosong belum didukung baseline
lengkap pada fase ini.

Variabel backend yang sudah didukung: `PORT`, `FRONTEND_ORIGIN`, `DB_HOST`,
`DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`. Nilai dibuat baru dan
disiapkan melalui mekanisme secret/config sendiri pada tahap berikutnya.
`TELEGRAM_POLLING_ENABLED`, `APP_MODE` dan `HOST` yang diusulkan laporan sebelumnya
belum menjadi konfigurasi kode ini; tidak perlu mengandalkan flag tersebut.

Contoh perintah **untuk nanti**, dengan lokasi checkout disesuaikan:

```powershell
Set-Location 'C:\Apps\hdwork2'
# Tinjau daftar proses untuk memastikan nama API baru belum dipakai.
pm2 list
# Hanya buat proses API baru setelah konfigurasi dan database siap.
pm2 start .\server.js --name hdwork2-api --cwd 'C:\Apps\hdwork2' --time
pm2 describe hdwork2-api
pm2 logs hdwork2-api --lines 50 --nostream
```

Gunakan nama proses unik bila `hdwork2-api` sudah ada. Jangan menjalankan
`restart all`, `stop all`, `delete all`, atau mengubah konfigurasi bot aktif.
Jangan memakai env/global PM2 yang membawa token bot lama. Backend API tidak
memerlukan token Telegram untuk startup HTTP, tetapi masih memerlukan MySQL.
Jangan memanggil endpoint mutasi order dengan token bot aktif pada tahap ini.

Panduan ini sengaja tidak menjalankan `pm2 save` atau menyiapkan autostart Windows:
PM2 menyimpan daftar proses bersama, dan pemulihan setelah reboot harus dirancang
bersama pemilik bot agar tidak mengubah pengoperasian bot yang sudah berjalan.
PM2 interaktif saja tidak menjamin autostart Windows. Tidak ada Windows service,
Scheduled Task, Tunnel, firewall atau deployment yang dibuat dalam tahap ini.

## Validasi aman yang dilakukan

- Tes startup dengan VM dan dependency allowlist: import inert; startup eksplisit
  dan jalur CLI hanya memanggil mock HTTP/Socket/DB; token Telegram dummy dan flag
  polling true tidak mengaktifkan dependency bot/scheduler/collector.
- Kegagalan DB mock mencegah listen dan melewati jalur exit yang dimock.
- App/router aktual dievaluasi menggunakan mock Express, controller dan middleware:
  delapan mount API tetap ada, handler route terdaftar, serta tindakan order
  claim/reassign/escalate/results/complete dipertahankan. Ini bukan tes perilaku
  controller nyata atau integrasi database.
- Tes regresi notifikasi order, session manager dan recovery storage memakai mock.
  Tes socket loopback tidak dijalankan pada tahap ini agar tidak membuka listener.
- Pemeriksaan sintaks JS dan `git diff --check`; build frontend hanya kompilasi.

## Risiko tersisa dan batas tahap

- Notifikasi claim/result/completion masih dapat mengirim Telegram dari endpoint
  tindakan jika token aktif. Pemisahan sender/adapter belum diimplementasikan.
- API tetap membutuhkan schema MySQL yang sesuai; baseline lengkap dan migrasi
  database baru merupakan pekerjaan berikutnya. Tidak menguji koneksi nyata.
- Bind host, CORS HTTP, proteksi upload, pembatasan endpoint publik, rate limiting,
  scope realtime dan lifecycle shutdown belum diubah. API belum dinyatakan siap
  dipublikasikan melalui Tunnel. Port API tidak dibuka ke internet pada tahap ini.
- `startServer` dipanggil satu kali per proses; PM2 cluster/shared session belum
  didukung rancangan ini. Perilaku listen error/shutdown masih mengikuti batas
  implementasi sebelumnya dan perlu ditangani sebelum operasional online.
- Penghapusan Cacti dan laporan audit sebelumnya masih perubahan lokal yang belum
  di-commit. Tidak ada commit, push, merge atau deployment pada tahap ini.
