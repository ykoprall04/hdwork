# Performansi HD

## Sumber data dan cakupan

Dashboard Rekap memuat tab ketiga secara lazy. Tab membaca dua endpoint pada
router operasional yang sudah memakai autentikasi sesi dan rate limit.

- `GET /api/operations/recap/performance?area=ALL&period=weekly&date=2026-11-23`
  mengembalikan roster aktif, periode WIB, jumlah per command dan status,
  tahun yang tersedia, bobot, dan ringkasan. Detail dan Grafik ALL HD memakai
  respons yang sama. Tabel ALL memuat 15 baris per halaman.
- `POST /api/operations/recap/performance/weights` menerima empat pasang bobot
  dan versi yang dibaca sebelumnya. Perubahan memerlukan CSRF serta sesi
  Admin atau Super Admin yang masih berlaku. Transaksi mengunci baris bobot, menolak versi
  lama, dan mencatat audit pelaku, waktu, bobot sebelum dan sesudah.

Audit kode menemukan identitas order pada `hd2_orders.id`, perintah pada
`command`, dan cakupan akses pada `access_module`. Alur Web menulis status,
`final_user_id`, dan `finished_at` bersama audit `hd2_audit`. Performansi
membutuhkan status saat ini DONE atau FAILED dan audit penyelesaian Web yang
cocok dengan pelaku serta status. Periode menggunakan `finished_at` dari
transaksi penyelesaian, dengan awal inklusif dan akhir eksklusif pada WIB.
Pemeriksaan audit memakai keberadaan baris sehingga audit berulang tidak
menggandakan order. Order yang dibuka kembali keluar dari hitungan hingga
selesai lagi, lalu dihitung pada tanggal dan pelaku final terbaru. Penolakan
duplikat berstatus DUPLICATE tidak dihitung sebagai GAGAL.

Roster hanya memuat akun dengan role HD dan `is_active=TRUE`. HD aktif tanpa
pekerjaan tetap nol. Jumlah order yang terlihat dibatasi akses modul sesi,
termasuk untuk akun admin. Role HD, Admin, dan Super Admin dapat melihat statistik. Pengaturan bobot hanya tampil dan dapat disimpan oleh Admin dan Super Admin.
Akun pengujian solver serta SHOW_ONLY tidak mendapat akses. Histori yang tidak
memiliki identitas, waktu, atau audit Web yang cocok dikecualikan. Jumlah
histori tak terverifikasi di produksi belum diperiksa. Perubahan bobot
menghitung ulang poin periode historis dengan bobot aktif dan mempertahankan
jumlah order asli.

## Preview dan pengujian terisolasi

Gunakan dependensi repo yang sudah tersedia. Jalankan preview loopback dengan
API fixture dari tes browser. Tes mencegat request API dan memblokir origin
eksternal. Screenshot memakai nama dan angka sintetis.

```sh
VITE_API_BASE_URL=http://127.0.0.1:5199 VITE_HDWORK2_AUTH_COOKIE=true VITE_HDWORK2_OPERATIONS=true npm --prefix frontend run build
cd frontend
npm run preview -- --host 127.0.0.1 --port 5199 --strictPort
```

Di terminal lain dari root repo:

```sh
mkdir -p /tmp/hdwork-performance-preview
HD_CHROMIUM_PATH=/usr/bin/chromium HD_PERFORMANCE_CAPTURE_DIR=/tmp/hdwork-performance-preview node frontend/tests/hd-performance.browser.cjs
HD_PREVIEW_URL=http://127.0.0.1:5199 HD_CHROMIUM_PATH=/usr/bin/chromium node frontend/tests/recap-chart.browser.cjs
HD_PERFORMANCE_DISPOSABLE_DOCKER=true node --test tests/hd-performance-mysql.test.cjs
node --test tests/operations.test.js tests/recap-chart.test.js tests/handbook-export.test.cjs
```

Pengujian MySQL membuat kontainer MySQL 8.4 dengan port loopback acak. Kontainer
menggunakan schema dan akun sintetis dan dibersihkan setelah pengujian.
Skrip tidak menerima URL atau kredensial database eksternal.

## Persiapan aktivasi dan rollback

Migrasi `022_hdwork2_performance_weights.sql` aditif. Isinya empat baris default
bobot 1, grant SELECT untuk akun Web read, dan SELECT plus UPDATE tiga kolom
untuk akun Web write. Audit memakai tabel yang sudah ada. Migrasi tidak
mengubah tabel order, tabel audit, atau grant Courier. Startup aplikasi tidak
menjalankan SQL migrasi.

1. Tinjau delta Web dari pin aktif kantor dan cadangkan rilis Web serta grant.
   Validator grant Web lama menolak grant tabel baru. Pasang dan verifikasi
   validator Web yang kompatibel melalui jalur provisioning yang ditinjau
   sebelum grant baru diberikan. Lakukan rehearsal dengan identitas runtime
   Web read/write yang sesuai. Tidak perlu mengubah kredensial.
2. Setelah persetujuan database terpisah, terapkan migrasi manual dan uji baca
   empat baris. Validasi bahwa validator lolos untuk kedua pool Web. Ukur
   EXPLAIN dan waktu baca untuk volume kantor sebelum aktivasi umum. Query
   periode memakai rentang `finished_at`; pemilihan tahun membaca cakupan
   histori yang diizinkan. Tidak ada indeks baru pada tabel order dalam rilis ini.
3. Setelah persetujuan deploy, aktivasi Web saja dan uji Super Admin, Admin, HD biasa,
   kedua tab lama, dan kedua unduhan Excel. Jangan menjalankan updater dengan
   flag review database sebelum prasyarat validator dan schema terverifikasi.
4. Jika kembali ke Web yang validatornya belum mengenali tabel baru, rencanakan
   pencabutan hanya grant Web tambahan tersebut sebelum Web lama dinyalakan,
   atau pertahankan validator yang kompatibel. Simpan tabel bobot dan audit.
   Lakukan rollback Web lewat paket rilis yang sah. Courier tetap berjalan.

Status produksi dan akses host belum diverifikasi untuk rilis ini. Tidak ada
deploy, restart, migration, atau perubahan konfigurasi produksi selama pengerjaan.
