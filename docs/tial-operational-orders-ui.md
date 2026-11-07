# TIAL operasional: Daftar order TIAL, bukan halaman diagnostik

Branch chore/remove-cacti-hdwork2. Perubahan lokal frontend, tes dan dokumentasi.
Tidak mengubah backend/kontrak API, Preview DEMO, database, bot, Sheets, env atau
Cloudflare. Tidak commit/push/merge/deploy atau memanggil Telegram.

## Audit sumber desain dan route

Acuan: features/preview/CategoryWorkspace.tsx untuk /preview/work/B2C/TIAL.
Strukturnya header, status kerja, empat tab, filter empat kolom, kartu statistik,
Section daftar, tabel enam kolom dan pagination. Halaman diagnostik lama tidak
memiliki susunan itu dan bukan desain akhir.

Menu TIAL dan tombol Buka order TIAL kini menuju /work/B2C/TIAL dengan
TialOrdersPage, bukan redirect ke /b2c/staging. Halaman /b2c/staging tetap utuh
sebagai alat diagnostik, ditautkan di bawah daftar utama. Shell/login/check-in
Preview-based yang sudah ada tidak diganti atau memakai layout legacy.

Halaman baru menggunakan Metric, Section, Empty, Button dan Badge yang sama
seperti Preview, termasuk ukuran grid/tab/filter/tabel/pagination. OrderTable
Preview bertipe DemoOrder dan mengasumsikan waktu order, HD, status terpetakan
serta action callback. Data staging tidak dikonversi menjadi DemoOrder dengan
field palsu: renderer read-only mempertahankan struktur tabel dan menampilkan
Belum tersedia untuk field yang API belum menyediakan. Tidak mengubah komponen
atau alur Preview DEMO untuk memaksakan kontrak tersebut.

## Data, filter dan keterbatasan API

- GET /api/b2c-staging/orders dengan Bearer JWT dan module=TIAL. Tidak ada request
  mutasi atau penyimpanan order di reducer/localStorage DEMO.
- Tab MENUNGGU, PROSES CEK, SELESAI, DUPLICATE tetap terlihat namun nonaktif,
  dengan label Belum tersedia. Mapping status sumber belum disetujui dan endpoint
  hanya mendukung satu status exact; SELESAI tidak diasumsikan DONE OR GAGAL.
  Menampilkan semua sumber di bawah label tab tertentu akan menyesatkan, sehingga
  tidak dilakukan. Aktivasi tab memerlukan mapping yang dibuktikan dan dukungan
  query yang memadai, terpisah dari pekerjaan ini.
- Filter Status sumber berupa input, tidak mengarang daftar enum. Dikirim sesuai
  teks sumber setelah trim; warna Badge netral, bukan pemetaan status operasional.
- Tanggal default hari ini Asia/Jakarta; secara eksplisit **tanggal impor** dari
  created_at, bukan tanggal order asli. Kosongkan untuk seluruh tanggal. Tidak
  menghitung waktu tunggu/kerja dari timestamp impor.
- STO hanya aktif bila metadata API stoFilterAvailable === true. Sebelum metadata
  tersedia atau jika mapping belum tersedia, kontrol disabled dan query tidak
  membawa filter STO. Nilai STO baris ditampilkan apa adanya atau Belum tersedia.
- Pencarian hanya SC/IN atau INET, sesuai kontrak API; tidak mengklaim pencarian
  HD/kode yang tidak didukung endpoint.
- Filter didebounce 350ms, membatalkan request lama dan kembali ke halaman 1.
  Pagination memakai page/hasMore server, tanpa jumlah halaman/total yang direka.
- Refresh sekitar 60 detik setelah request selesai, tetap pada filter/halaman
  aktif, tidak menumpuk request. Cleanup saat unmount/pergantian token/filter.
- Error awal/query baru tidak menggunakan fallback DEMO. Refresh query sama
  mempertahankan data terakhir dengan peringatan bila 503/network; 401/403
  menghapus hasil. Data lama tidak ditampilkan sebagai data baru. Lihat
  frontend-refresh-optimization.md untuk detail pembaruan.
- Seluruh kartu agregat dan hitungan tab memakai Belum tersedia: tidak memakai
  panjang halaman, 0 palsu atau menghitung global dari sampel.

ID baris staging HMAC, SC/IN/INET sumber, tanggal impor, kategori dan status
sumber ditampilkan. Petugas/waktu tunggu/pengerjaan belum tersedia dari API.
ID bukan monitoring identifier publik permanen. Kiriman dengan SC/IN sama tetap
baris berbeda menurut ID staging; tidak ada group/dedup di frontend. Tidak ada
PICK/CEK/RECEK/DONE/GAGAL atau link detail yang mengklaim API detail tersedia.

## Validasi

Unit query baru: hari Jakarta melintasi UTC, filter mentah tidak dipetakan
secara spekulatif, page, dan STO yang belum diizinkan tidak dikirim.
Browser API mock: JWT, request/filter, dua order dengan SC/IN sama, pagination,
refresh dengan fake clock 60 detik, filter kembali page 1, 503/disabled/error,
retry, empty, mapping STO tidak tersedia, diagnostik terpisah dan tidak ada
request selain GET. Preview tetap diuji regresi tanpa koneksi API.

Screenshot pada viewport sama: 1440x1000 desktop dan 390x844 HP, di
/tmp/hdwork-tial-orders/{desktop,mobile}-{preview,operational}.png.
Semua baris pada screenshot adalah mock sintetis untuk tes, bukan seed aplikasi.
Implementasi runtime tidak memiliki data fallback tersebut.

Perbedaan visual yang disengaja: peringatan read-only dan tanggal impor,
empat tab disabled, status sumber berupa input, STO bergantung capability,
statistik placeholder, Badge netral, identifier staging tanpa action, dan kolom
HD/durasi belum tersedia. Tinggi halaman berbeda karena keterangan akurasi dan
placeholder. Membuatnya identik pada bagian data akan memerlukan informasi yang
belum disediakan API, sehingga tidak diarang.

Tes login/me dan TIAL menggunakan endpoint yang dimock; tidak membuktikan koneksi
kantor diuji ulang. Sebelum memakai data kantor, lakukan smoke test oleh pengguna
pada API lokal yang sudah disetujui. Tidak diperlukan perubahan schema/kontrak
backend untuk membuka daftar ini; agregasi/status grouping adalah fase berikutnya.

## File

- features/tial/TialOrdersPage.tsx, query.ts: halaman utama dan query murni.
- InternalRoutes.tsx, features/operational/Shell.tsx: tujuan route/menu TIAL.
- features/b2c-staging/api.ts: metadata opsional yang memang sudah dikirim API
  dan tipe STO nullable. Kontrak server tidak berubah.
- tests/tial-orders.test.ts, tial-orders.browser.cjs; pembaruan regresi
  operational-migration.browser.cjs agar memeriksa halaman utama dan diagnostik.
- Dokumen ini. Preview, B2cStagingPage dan file backend tidak diubah.
