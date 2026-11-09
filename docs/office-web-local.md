# PC kantor — hdwork2, autentikasi aplikasi tanpa Access

Profil privat baru berada di `.local/office-web/`. Profil/kandidat sebelumnya
dipertahankan. Cloudflare Access tidak dipakai pada profil ini. Tunnel bernama
`hdwork2`, hostname `hdwork.yoloo.space`, origin HTTPS127.0.0.1:8443.
Tidak ada perubahan DNS, aktivasi Tunnel, startup backend, akses database atau
aktivasi courier saat persiapan.

## Web lokal

Dari D:\HDWork2-New, sebagai akun Windows pemilik DPAPI:

```powershell
node scripts/office-web.js --check
# Jalankan berikut hanya setelah pengujian auth/session nyata diizinkan:
node scripts/office-web.js --start-local --approved
```

Buka https://localhost:8443. Sertifikat lokal menggunakan CA privat yang sudah
ada; trust browser mungkin memerlukan prosedur browser terisolasi sebelumnya.
Launcher tidak memasang CA ke Windows, tidak membuka browser, dan tidak melewati
validasi sertifikat. Ctrl+C menghentikan hanya runtime yang dijalankan launcher.

Startup nyata akan memverifikasi identity/schema/grants auth/read sebelum web
siap, tanpa migrasi atau perubahan grants. Login/logout pengguna menulis session
dan audit existing; seluruh modul tetap read-only. Akun root tidak digunakan.
Port3090 dan8443 dipakai bersama oleh kedua mode; jalankan hanya satu mode.

## Origin publik, belum dijalankan

```powershell
node scripts/office-web.js --check-public
# Setelah persetujuan runtime berikutnya; ini tidak menjalankan Tunnel:
node scripts/office-web.js --start-public-origin --approved
```

Mode ini memakai build kandidat publik yang sudah tersedia. Tidak perlu build
ulang hanya untuk menghapus Access, karena yang berubah adalah edge/backend.
Environment aktif hanya untuk proses ini, tidak dipasang pada sistem/PM2.

## Batas keamanan

- Backend mempunyai allowlist auth login/logout/me dan operations. Admin, legacy,
  courier internal dan route auth tambahan ditolak sebelum handler.
- Operations tetap memakai session V2, role dan module permission existing.
  Header identitas Cloudflare atau X-Forwarded-For tidak menggantikan session.
- POST hanya dikecualikan untuk login/logout; CSRF/Origin existing tetap wajib.
  Cookie Secure/HttpOnly/host-only/SameSite=Lax; sesi tetap8jam.
- Proxy tidak dipercaya secara global. Rate limit login konservatif tetap memakai
  socket, sehingga klien Tunnel berbagi bucket10login/15menit. Jika banyak pengguna
  diperlukan, siapkan boundary proxy terverifikasi sebelum mengubah limiter.
- HTTPS origin memberi frame protection dan memblokir path internal sebelum proxy.
- Signing secret existing disalin ke DPAPI tanpa rotasi; `.env` asli tidak diubah.
  Nilai secret tidak berada pada profil, log atau Git.

## Aktivasi berikutnya memerlukan izin terpisah

Lengkapi UUID/token privat tunnel `hdwork2` dan ingress remote sesuai
`.local/office-web/ingress.review.yml`. Rencana lokal bukan bukti konfigurasi
Cloudflare remote sudah diterapkan. Gate tanpa Access memerlukan verifikasi auth
aplikasi, allowlist endpoint, limiter, proxy boundary dan sesi nyata, selain gate
jaringan/grants/build sebelumnya. Approval publik masih false.

Sesudah izin koneksi/pengujian nyata: validasi startup dan login/logout melalui
HTTPS, lalu siapkan verifikasi jaringan/ingress. DNS, Tunnel publik dan cutover
tetap tidak dijalankan sebelum persetujuan. MySQL3306, courier3091, readiness dan
DevTools tidak dipublikasikan; jangan ubah sistem legacy untuk meloloskan gate.
