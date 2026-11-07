# Migrasi frontend Tahap 1 — desain Preview menjadi operasional

Branch: chore/remove-cacti-hdwork2. Lokal, belum commit/push/deploy.
Backend/API-only dan perubahan hardening yang sudah ada tidak diubah dalam tahap
migrasi frontend ini. Tidak mengakses MySQL, bot, Sheets, env atau Cloudflare.

## Routing

- `/login`: komposisi visual PreviewAuth dengan login API nyata, tanpa persona
  atau registrasi demo. POST /api/auth/login dipertahankan, password tidak disimpan.
- `/`, `/dashboard`: menuju `/jobs` setelah sesi lolos verifikasi.
- `/jobs`: empat kartu HD B2C, ASSUREN, B2B dan REPLACEMENT sesuai desain Preview.
- `/work/B2C`: akses TIAL read-only untuk Super Admin; statistik agregat tidak
  direka dari jumlah satu halaman. LOGIC ditandai belum tersedia.
- `/b2c/staging`: halaman/service/API TIAL sebelumnya tetap digunakan, di dalam
  shell baru. Filter, pagination, refresh dan error tetap terpisah dari DEMO.
- `/my-work`, `/transfers`, `/productivity`, `/admin`, kategori lain dan halaman
  belum didukung: placeholder Belum tersedia, tanpa order atau tindakan dummy.
- `/preview/*`: satu-satunya subtree yang memasang PreviewProvider. Login,
  check-in, chat, transfer dan semua aksi simulasi sebelumnya dipertahankan.
- `/preview/monitoring`: monitoring demo; alias lama `/monitoring` dan detailnya
  redirect ke subtree demo. Tidak ada API publik nyata yang baru dibuat.
- `/legacy/*`: router lama dipertahankan dalam BrowserRouter basename=/legacy,
  diakses dengan URL langsung/full navigation. `/legacy/login` dan
  `/legacy/dashboard` menjadi jalan rollback. Session/komponen legacy tetap
  terpisah; bukan tujuan login atau nav operasional. Menyeberang antara legacy
  dan aplikasi utama sebaiknya lewat address bar/full reload, bukan SPA link.

## Desain dan pemisahan data

Shell baru mengambil komposisi PreviewApp: brand HD, header fleksibel,
WorkspacePicker, Light/Dark, nav kartu dan ruang kerja max-width 1600. Desktop
mempunyai sidebar, HP nav horizontal. Halaman login mengikuti komposisi dua kolom
PreviewAuth dengan teks dan form operasional, bukan login legacy.

Komponen operasional tidak mengimpor usePreview, reducer/store/persistence DEMO,
DemoUser/DemoOrder atau seed data. Workspace categories didefinisikan sebagai
konstanta produk terpisah, bukan mengambil array dari demo-data. Kontrol belum
tersedia tidak memanggil endpoint legacy atau memodifikasi data.

AuthContext inti dipindahkan ke contexts/auth-context.ts agar komponen staging
yang sudah ada bisa membaca interface token/user/login/logout yang sama.
Provider legacy tetap memakai perilaku lama, tetapi provider baru tidak
mengeksekusinya atau memanggil logout terminal. Tidak ada intercept global
window.fetch dalam provider operasional.

## Sesi operasional

Token disimpan hanya pada `hdwork:operational:auth:v1`, terpisah dari token/user
legacy dan semua hdwork:workspace/session/account DEMO. Login lama tidak diam-diam
dimigrasikan; pengguna login ulang di UI baru. Profil cached tidak menjadi bukti
akses. Sebelum protected route tampil, GET /api/auth/me harus berhasil dan
memenuhi bentuk profil yang diharapkan. Pengguna/role ditentukan server, bukan
persona demo. Refresh browser mengambil token tersebut dan memverifikasi ulang.

Login berhasil diarahkan ke /jobs dengan guard loading sampai /me selesai.
401/403 menghapus sesi operasional. Gangguan network/503/429 memblokir halaman
terlindungi dan menampilkan retry, tidak fallback ke user cached/demo. Verifikasi
ulang sekitar 60 detik memperbarui role/status; bukan revokasi JWT real-time.
Request dibatalkan saat token/route provider berganti. Logout menghapus token
operasional saja tanpa request terminal, bot, PM2 atau database.

Token di localStorage tetap berisiko terhadap XSS. Migrasi cookie/session atau
kebijakan token berbeda memerlukan desain backend/security terpisah. Backend
staging tetap menjadi otoritas akses, walau UI menyembunyikan link untuk non-Super
Admin. Browser tidak memverifikasi tanda tangan JWT sendiri sebagai pengganti API.

## Validasi dan bukti

- 40 tes frontend unit lulus, termasuk kontrak me, error sesi, refresh serta
  seluruh reducer/navigation/demo tests yang sudah ada.
- 70 tes backend terisolasi lulus sebagai regresi; tidak ada DB/network operasional.
- Chromium desktop 1440px dan HP 390px dengan semua API dimock: POST login,
  GET me, guard, refresh browser, TIAL, placeholder, mobile tanpa overflow,
  logout tanpa terminal, me gagal/revoked, DEMO tanpa panggilan API dan redirect
  monitoring lulus tanpa browser error.
- Regresi browser Preview navigation-v3 lulus: empat kategori, check-in,
  navigasi/PICK/inbox demo, desktop/mobile/chat header, Dark Mode dan admin,
  tanpa panggilan API operasional.
- Build frontend berhasil; warning chunk >500kB terdapat pada bundle legacy
  yang lazy, bukan shell operasional utama. Lint tetap 29 warning sebelumnya.
- Screenshot sintetis tersimpan sementara di /tmp/hdwork-operational-desktop.png
  dan /tmp/hdwork-operational-mobile.png; tidak berisi data pelanggan nyata.

Tidak mengklaim login Super Admin kantor atau MySQL hdwork2 sudah diuji langsung
pada tahap ini. Browser menggunakan mock kontrak API yang sama; perlu smoke test
pengguna di lingkungan lokal yang disetujui sebelum commit/deploy diputuskan.

## Langkah aman berikutnya

Review desain/screenshot, lalu uji akun nyata sendiri pada API lokal dengan env
frontend yang sudah disiapkan (tanpa membagikan password). Periksa /login → /jobs
→ B2C → TIAL, refresh, logout dan akun nonaktif/role berubah. Pastikan DEMO
terpisah di /preview/login dan rollback legacy lewat /legacy/login. Data TIAL
read-only tetap tidak boleh dipromosikan ke model order operasional atau tindakan
PICK/CEK/RECEK/DONE/GAGAL tanpa fase backend yang disetujui. Tidak ada deployment,
Cloudflare, commit atau push dalam tahap ini.
