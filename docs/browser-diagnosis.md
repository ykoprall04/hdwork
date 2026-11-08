# Diagnosis browser tanpa database

Runner: `node scripts/diagnose-browser.js --run` dari root proyek.
Jalankan hanya setelah persetujuan peluncuran Chrome.

Prasyarat: Chrome terpasang; build frontend existing di frontend/dist; sertifikat
localhost.crt, localhost.key dan ca.crt existing di .local/tls; port8443 bebas.
Opsional: HDWORK2_TEST_CHROME menentukan executable Chrome alternatif. Runner
tidak membaca .env, tidak membuat sertifikat, tidak mengubah trust store, tidak
mem-build frontend dan tidak menginstal dependency.

Tahapan: executable → startup headless → koneksi DevTools → verifikasi TLS
localhost:8443 → navigasi /login dan pemeriksaan keberadaan field username dan
password. Tidak mengisi field, submit login, atau memeriksa nilai field/cookie.

Runner memuat hanya modul bawaan Node, tanpa mengimpor helper integrasi lama,
API-only, MySQL atau Telegram. Server HTTPS sementara menyajikan build frontend
existing, tanpa proxy. GET /api/auth/me dijawab401 sintetis; endpoint API lain
ditolak. Metode selain GET/HEAD ditolak. Intersepsi DevTools membatasi request
halaman ke origin https://localhost:8443 dan GET/HEAD. Port yang terpakai membuat
runner gagal; proses pemilik port tidak dihentikan/digunakan ulang.

HTTPS diverifikasi klien Node dengan CA eksplisit dan rejectUnauthorized=true.
Chrome memakai pin SPKI leaf lokal pada profil baru khusus diagnosis. Ini tidak
membuktikan trust sertifikat browser pengguna dan tidak mengubah trust Windows.

Profil baru dan report.json disimpan dalam .local/browser-diagnosis-*/. Report
hanya memuat status tahap, kode error, boolean, counter dan lokasi report relatif.
Tidak mencatat secret, token, password, cookie, isi halaman, header, body request
atau URL query. Raw stderr Chrome tidak dicetak. Profil lama tidak dibaca/diubah;
seluruh profil diagnosis dipertahankan. Hanya Chrome dan listener milik run ini
yang ditutup setelah selesai. Tidak menyentuh PM2 atau service sistem.

Runner ini menguji startup dan tampilan login, bukan login sukses, role, session,
operasi order, atau koneksi database. Tidak menjalankan test suite atau migrasi.

Operasi file diberi label tetap (misalnya devtools-active-port-read dan
report-write), tanpa nama path dari error OS. Hanya EBUSY yang diulang, maksimal
5 retry setelah percobaan awal, dengan jeda50/100/200/400/800ms. Error lain
langsung diteruskan. ENOENT saat menunggu pembuatan DevToolsActivePort dicatat
sebagai file belum tersedia; tidak berlaku untuk sertifikat atau file wajib.

Batas keseluruhan diagnosis45detik, ditambah teardown maksimal8detik. Abort
membatalkan penantian, fetch, probe HTTPS dan koneksi DevTools. Cleanup mencoba
Browser.close, menutup socket dan pending command/timer, lalu menghentikan hanya
proses Chrome yang diluncurkan runner bila masih hidup. Listener HTTPS milik
runner juga ditutup. Kegagalan cleanup dicatat dan membuat hasil gagal; tidak
menghapus profil/laporan. Bila report.json tidak dapat ditulis setelah retry,
ringkasan error operasi tetap dikirim lewat stdout sebagai fallback. Batas waktu
bergantung pada event loop Node; tidak dapat menjamin penghentian syscall OS yang
macet di luar kendalinya.
