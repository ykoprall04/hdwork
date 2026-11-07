# Audit penghapusan Cacti — HD Work 2.0

Branch lokal: `chore/remove-cacti-hdwork2`, berdasarkan remote terbaru `b254330`.
Perubahan pengguna pada `server.js` dan `src/app.js` dipertahankan tanpa perubahan tambahan.

## Hubungan dan cakupan

Collector Python, endpoint ingest, autentikasi collector, formatter alarm, scheduler,
registrasi grup/subscriber alarm Telegram, serta antrean pengiriman alarm personal
hanya digunakan untuk Cacti. Tidak ditemukan konsumen lain pada repository.
Bagian tersebut dihapus. Pencarian kode aplikasi tersisa tidak menemukan referensi
Cacti, collector, kategori alarm NODEB/DATIN, maupun tabel subscriber alarm.

File dihapus:

- `collector_cacti/.env.example` (template, bukan `.env` aktual)
- `collector_cacti/README.md`
- `collector_cacti/cactydown.py`
- `collector_cacti/requirements.txt`
- `src/controllers/cacti.controller.js`
- `src/middlewares/cactiCollector.middleware.js`
- `src/routes/cacty.routes.js`
- `src/services/cacti-alarm.service.js`
- `src/services/cacti-scheduler.service.js`
- `tests/cacti-collector-auth.test.js`
- `database/migrations/20260911_add_alarm_telegram_groups.sql`
- `database/migrations/20260911_add_cacti_collector_health.sql`
- `database/migrations/20260913_add_telegram_alarm_subscribers.sql`

Service dan repository Telegram bersama dibersihkan hanya dari fitur alarm.
Command order `setgrup`, `help`, `config`, handler teks order, konfigurasi grup/topic,
notifikasi claim/result/completion dan pengiriman lampiran tetap dipertahankan.
Frontend, autentikasi, konfigurasi database dan entry point backend tidak diubah.

## Dependensi

Tidak ada dependensi npm eksklusif Cacti; package.json dan lockfile dipertahankan.
`mysql2` tetap diperlukan konfigurasi MySQL, `telegraf` untuk Telegram order,
`dotenv` untuk startup aplikasi, Express dan dependensi autentikasi/socket/upload
untuk fitur operasional. `nodemon` tetap untuk workflow pengembangan backend.
Daftar dependensi collector Python (`requests`, `beautifulsoup4`, `python-dotenv`)
dihapus bersama requirements collector; tidak melakukan uninstall paket lingkungan.

## Validasi aman

- Pemeriksaan sintaks `node --check`: 53 file JavaScript terlacak yang tersisa berhasil.
- `node --test --test-isolation=none --test-reporter=tap tests/*.test.js`: 23/23 lulus.
- Tes regresi baru menggunakan VM dan Telegraf mock: command/help order, reply/topic
  claim, hasil beserta gambar, serta penyelesaian tetap berfungsi. Tidak memuat
  kredensial asli, driver MySQL atau klien Telegram asli; polling dilarang oleh mock.
- Tes Socket.IO menggunakan loopback lokal; perlu izin keluar sandbox karena
  pembatasan listen EPERM. Tidak menjalankan server utama.
- Tes frontend: 37/37 lulus.
- `npm run build --prefix frontend`: berhasil, peringatan ukuran chunk >500 kB.
- `npm run lint --prefix frontend`: berhasil dengan warning frontend yang sudah ada.
- `git diff --check`: berhasil.

Tidak menjalankan backend utama, scheduler, collector, polling Telegram, SQL,
migrasi, deployment, commit, merge atau push. `.env` dan kredensial tidak diubah.
Tabel/data Cacti lama, jika ada pada database, sengaja dibiarkan; penghapusan kode
ini bukan penghapusan data. Integrasi nyata MySQL/Telegram tidak diuji karena
batasan tugas. Tampilan frontend tidak diubah.
