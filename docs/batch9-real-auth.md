# Batch 9 — real auth lokal PASS

Pengujian disetujui pengguna untuk hdwork2 dan hdwork_auth, hanya INSERT/UPDATE
hd2_sessions dan INSERT hd2_security_audit. Pengguna memasukkan kredensial
SUPER_ADMIN langsung di browser lokal, bukan melalui agen/chat/argumen/log.

## Hasil

| Tahap | Bukti |
| --- | --- |
| Grants | Koneksi hdwork_auth@localhost, database hdwork2, MySQL8.4.13; hak persis empat tabel autentikasi |
| Gate | Auth-only14menit; global read-only tetap true; admin dan operations POST503 |
| HTTPS/frontend | Ready200 scope auth, frontend200; hanya loopback3090/8443 |
| Sebelum login | /me401; agen tidak mengirim login |
| Login pengguna | /me200, role SUPER_ADMIN, format CSRF valid |
| Refresh | /me200, identitas sama dan UI terautentikasi |
| Session | Tepat1sesi baru; expiry positif dalam rentang8jam |
| Logout | Melalui UI; /me401 dan UI login kembali |
| Revocation | Delta sesi revoked+1, sesi aktif kembali delta0; record tidak dihapus |
| Account | Role SUPER_ADMIN dan aktif; agen tidak mengubah users/password/role/grants |
| Cleanup | Window CLOSED, Chrome induk berhenti, port3090/8443/DevTools tidak listening |

Gate tidak disimpan dalam .env. Approval hanya berada pada proses uji dan dihapus
saat cleanup. .env tetap read-only, auth-write tidak aktif, approval tidak tersedia,
DB_PASSWORD tidak tersimpan plaintext. Semua profil/laporan lama dipertahankan.

Laporan aman:
- .local/real-auth-CtQRFq/report.json — startup, baseline agregat dan cleanup.
- .local/real-auth-CtQRFq/verification.json — /me, refresh, logout dan delta sesi.

Tidak membaca/menampilkan token atau hash sesi dalam query status. Pemeriksaan DB
status memakai agregat COUNT/SUM, user id internal untuk filter, serta role/aktif.
Tidak memakai Network/Cookie extraction, screenshot atau akses kolom kredensial
browser. Respons /me disaring di browser sebelum hasil diteruskan ke laporan:
tidak menyimpan CSRF, cookie atau token. Audit login/logout mengikuti transaksi
service existing; isi tabel security audit tidak dibaca (akun hanya punya INSERT).

## File batch ini

scripts/real-auth-window.js membuka window14menit dengan watchdog. Startup memakai
launcher auth-validation existing yang mengaudit ulang grants sebelum listen.
Browser terpisah terlihat agar pengguna dapat login sendiri; sertifikat lokal
dipin ke public key khusus proses, tanpa mengubah trust Windows.

scripts/verify-real-auth.js hanya dijalankan setelah pengguna mengonfirmasi login.
Script memeriksa ulang batas grants, memverifikasi /me/reload, menekan Logout,
memeriksa delta sesi dan menutup browser. Penutupan Chrome memicu penghentian
runtime/window. Password DPAPI hanya masuk memori, tidak dicetak/disimpan plaintext.

Satu tes baru windowFlags lulus: TTL14menit, scope auth dan penolakan expiry.
Pemeriksaan sintaks kedua skrip dan git diff --check lulus. Suite lama tidak
diulang. Tidak ada migrasi, perubahan grants/account, akses data legacy, perubahan
PM2, Telegram asli, push, merge atau deployment.

## Batas hasil

PASS ini membuktikan autentikasi nyata lokal dan revocation, bukan kesiapan
operasional/deployment online. Grants operations/admin dan konfigurasi online
belum diaktifkan. Setiap window auth-write berikutnya membutuhkan persetujuan
baru; jangan menghidupkan kembali window lama atau memakai gate sementara untuk
layanan login24/7. Deployment tetap memerlukan persetujuan dan checklist readiness.
