# Batch 1–5 — validasi lokal 8 November 2026

Status ini membedakan pemeriksaan read-only pada hdwork2 dari pengujian auth/order
yang memakai mock. Tidak ada migrasi, penulisan database utama, aktivasi Telegram,
deployment, push atau merge pada batch ini. Perubahan Git sebelumnya dipertahankan.

| Batch | Status dan bukti |
| --- | --- |
| 1 | PASS: DPAPI dibuka oleh akun Windows pemilik di luar sandbox; koneksi hdwork_auth@localhost ke hdwork2 pada MySQL8.4.13. Grants aktual sesuai empat tabel auth; empat tabel terlihat; satu SUPER_ADMIN aktif. Empat tes konfigurasi/grants baru lulus. |
| 2 | PASS: delapan tes race sesi, satu tes HTTP API-only dengan store in-memory. Verifikasi /me, expiry, CSRF, logout dan read-only gate. TypeScript lulus. |
| 3 | PASS dalam cakupan mock: empat tes kontrak workspace/API. Kategori dan modul frontend cocok dengan scope backend; navigasi hanya modul berizin; create manual tidak membuat outbox. TypeScript lulus. |
| 4 | PASS dengan mock: dua tes gabungan parser/HMAC/replay/idempotency serta outbox/retry/ACK. Modul web baru tidak memperluas kontrak courier B2C. |
| 5 | PASS untuk build/startup read-only dan penyusunan readiness: build produksi frontend lulus; tes lifecycle runtime baru lulus; startup API-only 200 health,401 anonymous/me,503 login-blocked. Listener3090 berhenti setelah pemeriksaan. |

Jumlah tes baru terarah yang lulus:20. Suite lama tidak dijalankan ulang. Browser
diagnosis/HTTPS sebelumnya tetap menjadi bukti startup dan tampilan login, bukan
bukti login SUPER_ADMIN nyata atau pengujian browser penuh atas perubahan sesi.
Build masih memberi warning chunk legacy >500kB; jalur operasional terpisah.

## File pada pengerjaan batch ini

- Kredensial/runtime: `.env` privat (tanpa password plaintext), `.env.example`,
  `scripts/setup-local.js`, `scripts/read-dpapi-password.ps1`,
  `scripts/private-runtime.js`, `src/config/private-database-env.js`,
  `src/access/database-audit.js`, `package.json`.
- Sesi: `frontend/src/features/operational/cookie-session.ts` dan
  `frontend/src/features/operational/CookieSessionProvider.tsx`.
- Workspace: `frontend/src/features/workflow/workspace-access.ts`,
  `frontend/src/features/workflow/WorkspaceBoundary.tsx`,
  `frontend/src/features/workspace-ui/JobSelection.tsx`,
  `frontend/src/features/operational/Shell.tsx`,
  `frontend/src/features/operational/local-checkin.tsx`,
  `frontend/src/InternalRoutes.tsx`.
- Tes baru: `tests/private-database-env.test.js`,
  `tests/private-runtime-startup.test.js`, `tests/auth-v2-http-mock.test.js`,
  `tests/workspace-create-mock.test.js`,
  `tests/courier-workspace-boundary.test.js`,
  `frontend/tests/cookie-session-race.test.ts`,
  `frontend/tests/workspace-access.test.ts`.
- Dokumentasi: dokumen ini dan `docs/local-base-web.md`. Build memperbarui
  artefak frontend/dist yang diabaikan Git. Perubahan terdahulu pada file lain
  tidak dihapus maupun di-commit bersama batch ini.

## Kredensial privat dan runtime Windows

`.env` berisi DB_USER=hdwork_auth, DB_NAME=hdwork2 dan
DB_PASSWORD_DPAPI_FILE=.local/hdwork-auth.password.dpapi. DB_PASSWORD kosong pada
disk. HDWORK2_LOCAL_READ_ONLY tetap true. `.env`, `.local/` dan file DPAPI diabaikan
Git dan tidak tracked. Jangan menyimpan password plaintext atau mengubah akun DB.

`src/config/private-database-env.js` memvalidasi target loopback3306, akun khusus,
nama database dan read-only sebelum dekripsi. Helper PowerShell berjalan pada
akun Windows yang sama. DPAPI gagal unprotect di sandbox; akses pada konteks akun
Windows di luar sandbox berhasil. Bila terjadi lagi, jangan meminta password di
chat atau mengganti password; gunakan konteks pemilik file dan persetujuan alat.

Password hasil dekripsi lewat named pipe acak per proses, bukan stdout, argumen,
file atau log. Byte buffer dan BSTR dibersihkan. String/pool runtime tetap berada
di memori selama diperlukan. Koneksi pool dibuat sebelum environment password
dihapus, agar route lazy tidak kehilangan kredensial. Tidak ada named-pipe atau
PowerShell helper yang dipertahankan setelah pembacaan.

Perintah privat (dari root proyek, hanya setelah izin yang sesuai):

```text
npm.cmd run check:db:private
npm.cmd run check:startup:private
npm.cmd run start:api:private
```

Audit hanya SELECT/SHOW dan tidak mengeluarkan hash/token/password. Startup check
mengirim request kosong ke login hanya untuk memastikan read-only middleware
menolak sebelum handler login/storage; tidak membuat sesi/audit. Tidak ada
password SUPER_ADMIN yang digunakan dalam pemeriksaan ini.

`start:local:private` tersedia tetapi launcher HTTPS existing memeriksa metadata
tabel operasi lengkap. Akun auth yang dibatasi empat tabel tidak cukup untuk
memenuhi readiness operasi tersebut. Jangan menambahkan grants otomatis atau
menyatakan web operasional produksi siap. `start:api:private` tetap read-only;
`/ready` lengkap dapat memberi503 karena cakupan grant/metadata tersebut.

## Perubahan perilaku web

Controller cookie memakai generation ID dan abort untuk menolak respons /me atau
logout lama, termasuk fetch mock yang mengabaikan AbortSignal. Dashboard tidak
dibuka sebelum /me sukses. Logout menginvalidasi verifikasi aktif sebelum request
dikirim; expiry401/403 menghapus user/CSRF dan menghentikan polling. Error jaringan
menjadi layar error dengan retry, bukan dashboard berbekal data lama.

Daftar kategori operasional sesuai assignment modul; URL kategori tanpa izin
menampilkan penolakan. `/dashboard` menuju rekap. Check-in tetap preferensi tab,
bukan absensi server atau pengubah izin kerja. Preview mempertahankan default
empat kategori dan provider DEMO sendiri; tidak memakai controller cookie baru.

## Checklist sebelum web dipakai nyata / online

- [x] Koneksi dan batas grants akun autentikasi diverifikasi read-only.
- [x] Password encrypted at rest, tidak ada root runtime atau secret tracked.
- [x] Guard read-only, pembatasan Origin/CSRF dan verifikasi sesi diuji dengan mock.
- [x] Empat workspace dan isolasi courier diuji dengan mock.
- [x] Build dan startup API-only read-only lulus, proses milik tes ditutup.
- [ ] Persetujuan eksplisit untuk uji login nyata yang menulis sesi dan audit.
- [ ] Pemilik memasukkan kredensial aplikasi SUPER_ADMIN secara privat; jangan
      membuat ulang, reset atau menimpa akun existing.
- [ ] Mekanisme aktivasi tulis yang disetujui dan dibatasi auth. Loader DPAPI saat
      ini sengaja menolak read-only=false; mengganti flag saja tidak cukup.
- [ ] Uji login, reload, logout/revocation dan expiry pada browser HTTPS nyata.
- [ ] Keputusan cakupan akun runtime: auth-only vs operations/admin, serta review
      grants minimal tambahan dan readiness metadata. Tidak ada grants diubah.
- [ ] Verifikasi data nyata dan mapping untuk empat workspace sebelum digunakan;
      keberhasilan mock tidak menyatakan data eksternal sudah tersambung.
- [ ] Domain/reverse proxy same-origin, sertifikat publik/trust yang sesuai,
      firewall, backup/restore, retensi sesi/audit dan resource limit ditinjau.
- [ ] Strategi secret pada host deployment; DPAPI terikat Windows user/host dan
      bukan mekanisme portabel untuk Linux/hosting lain.
- [ ] Browser QA untuk perubahan baru, penanganan monitoring dan rollback aplikasi.
- [ ] Review perubahan Git serta commit terpisah; working tree masih berisi
      perubahan terdahulu, sehingga tidak di-commit massal otomatis.
- [ ] Persetujuan deployment. Tidak ada deployment dilakukan.

Aktivasi Telegram nyata tetap di luar cakupan: memerlukan persetujuan terpisah,
akun/identitas/grup yang diverifikasi dan prosedur operasional sendiri. Batch ini
hanya memakai transport palsu dan tidak memuat token/chat/session produksi.
