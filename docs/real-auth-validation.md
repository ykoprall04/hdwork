# Batch 6 — persiapan validasi autentikasi nyata

Tahap A selesai dengan mock. Pelaksanaan pertama disetujui pengguna dan **PASS
pada Batch9**, lihat batch9-real-auth.md. Window tersebut sudah ditutup. Jangan
menjalankan window baru tanpa persetujuan eksplisit berikutnya. Konfigurasi privat
existing tetap read-only, HDWORK2_AUTH_WRITE_ENABLED tidak aktif, tanpa perubahan
akun/grants/schema.

## Batas penulisan

Alur V2 membaca users, hd2_sessions, dan (untuk non-SUPER_ADMIN) hd2_user_modules.
Login sukses INSERT hd2_sessions dan INSERT hd2_security_audit; login gagal juga
dapat INSERT audit. Logout UPDATE hd2_sessions.revoked dan INSERT audit. /me hanya
membaca; tidak memperpanjang sesi. Tidak ada UPDATE/INSERT users, perubahan role,
password, assignment modul atau provisioning dalam alur ini. Token mentah tidak
disimpan di DB; sesi menyimpan SHA-256 token. Tidak menghapus audit/sesi otomatis.

Gate baru di src/config/auth-write-policy.js mempertahankan
HDWORK2_LOCAL_READ_ONLY=true dan hanya memberi pengecualian untuk tepat:

- POST /api/auth/login
- POST /api/auth/logout

Auth-only hanya membuka GET/HEAD/OPTIONS health, ready dan /api/auth/me selain dua
POST tersebut. Route admin, order dan seluruh API operasional diblokir dan tidak
dipasang pada app auth-only. Startup menolak root, target selain loopback3306/
hdwork2/hdwork_auth, V2 nonaktif, operations/staging/courier aktif, approval tidak
tepat, atau deadline kedaluwarsa/lebih15menit. Deadline diperiksa kembali pada
setiap mutasi; habis waktu membuat POST ditolak. Grant DB adalah pertahanan kedua.

Launcher private-runtime hanya menerima auth-write pada mode auth-validation.
Mode audit/api/local/startup-check menolak auth-write aktif. Loader DPAPI tetap
mewajibkan read-only=true, tidak perlu password plaintext atau perubahan env file.
Sebelum membuka HTTPS, launcher mengaudit ulang koneksi/grants secara read-only.
Readiness auth-only hanya mensyaratkan empat tabel auth; bukan schema operasional.

## Cookie, CSRF dan expiry

Cookie __Host-hdwork2-session: HttpOnly; Secure; SameSite=None; Path=/; tanpa Domain,
umur8jam. JWT HS256 dan expiry diverifikasi bersama hash sesi DB, revoked/expiry,
status aktif dan role terkini. /me mengembalikan CSRF HMAC yang disimpan frontend
hanya di memori. Logout memerlukan Origin persis FRONTEND_ORIGINS dan CSRF valid.
Login memeriksa Origin; tidak membutuhkan CSRF sesi yang belum ada. Rate limit
login10/15menit. Tidak ada endpoint refresh token/sliding expiry; reload hanya
memulihkan sesi melalui /me. Origin lokal harus https://localhost:8443 tanpa slash.

## Prosedur untuk setiap window baru setelah persetujuan eksplisit

1. Pemilik menyetujui dampak terbatas: INSERT/UPDATE sesi dan INSERT audit pada
   hdwork2. Konfirmasi satu SUPER_ADMIN aktif existing dan jangan menjalankan
   bootstrap/reset/update akun. Jangan meminta password SUPER_ADMIN di chat.
2. Pastikan kredensial DPAPI dapat dibuka pada akun Windows pemilik, grants aktual
   masih persis auth-only, build tersedia, sertifikat/trust HTTPS benar, port3090
   dan8443 bebas. Audit ulang harus lulus sebelum backend dibuka.
3. Tentukan jendela uji maksimal10menit. Setelah approval, set tiga variabel hanya
   pada terminal PowerShell lokal penguji (jangan dalam .env permanen):

   ```powershell
   $env:HDWORK2_AUTH_WRITE_ENABLED = 'true'
   $env:HDWORK2_AUTH_WRITE_APPROVAL = 'APPROVED_AUTH_SESSION_AUDIT_ONLY'
   $env:HDWORK2_AUTH_WRITE_UNTIL = [DateTime]::UtcNow.AddMinutes(10).ToString('o')
   node scripts/private-runtime.js auth-validation
   ```

   Mode ini menetapkan auth-only dan menonaktifkan operations/read/staging/courier
   hanya pada proses. Read-only tetap true. Tidak ada nilai ini diaktifkan sekarang.
4. Buka HTTPS pada browser yang mempercayai sertifikat. Pin sertifikat profil QA
   tidak menggantikan persetujuan pemasangan trust CA pada browser pengguna.
   Isi username/password SUPER_ADMIN langsung di browser lokal, bukan tool/chat,
   argumen, rekaman atau screenshot. Jangan mencoba password lain bila gagal.
5. Satu login sukses, /me dan reload; periksa role SUPER_ADMIN tetap sama, sesi
   tervalidasi dan cookie flags melalui indikator saja. Jangan menyalin nilai
   cookie, CSRF, token, hash atau password ke laporan. Jangan menjalankan tindakan
   admin/order. Salah CSRF/Origin diuji dengan mock, bukan serangan ke DB utama.
6. Logout sebelum deadline, lalu /me harus401. Logout mencabut sesi yang baru dibuat
   dan menghapus cookie. Jangan delete audit/sesi. Konfirmasi akun/password/role
   SUPER_ADMIN tidak berubah, tanpa membaca/menampilkan hash.
7. Ctrl+C menutup proses milik uji saja, lalu hapus tiga approval env dari terminal.
   Jangan restart/stop PM2. Pastikan port3090/8443 bebas kembali dan read-only pada
   .env tetap true. Laporan hanya status/count dan kode aman.

Jika jendela habis sebelum logout, gate sengaja menolak semua POST termasuk logout.
Jangan menonaktifkan gate atau mereset akun untuk membersihkan sesi. Minta approval
baru yang terbatas untuk logout/revocation sesi uji; sesi tetap memiliki expiry8jam.
Jika ada scope/grant/config tidak sesuai, hentikan sebelum login. Aktivasi nyata
dan pembuktian login/password SUPER_ADMIN masih merupakan langkah terpisah.
