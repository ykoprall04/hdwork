# Batch 6–8 — hasil dan readiness, 8 November 2026

Pembaruan berikutnya: login nyata lokal telah PASS pada Batch9 dan window telah
ditutup; lihat batch9-real-auth.md. Status di bawah merekam hasil Batch6–8.

Tidak ada login nyata, penulisan database, perubahan SUPER_ADMIN, grants,
migrasi, akses data legacy, perubahan PM2 atau aktivasi Telegram. Environment
privat tetap read-only tanpa approval auth-write. Working tree lama dipertahankan.

| Batch | Hasil |
| --- | --- |
| 6 Tahap A | PASS persiapan: gate auth-only, whitelist login/logout, approval eksplisit maksimal15menit, scope readiness auth dan prosedur real-auth tersedia. Login nyata tetap BLOCKED menunggu persetujuan berikutnya. |
| 7 | PASS browser mock:13 kasus; nol exception halaman/error cleanup, Chrome milik QA berhenti. Tidak memakai MySQL/DPAPI. |
| 8 | PASS review/checklist dan tes kesiapan auth-only; deployment tetap BLOCKED oleh prasyarat manual di bawah. Tidak ada layanan online dijalankan. |

Enam tes Node baru:3 auth-write-policy dan3 auth-only-readiness. Regresi HTTP auth
in-memory dijalankan karena middleware API berubah dan lulus. Tidak mengulang
suite MySQL/operations/courier/migrasi lama atau pengujian browser produksi.

## Perubahan file batch ini

- src/config/auth-write-policy.js (baru); src/api-only-app.js;
  src/config/api-only-startup.js; src/config/local-database-check.js;
  scripts/private-runtime.js.
- scripts/browser-qa-mock.js (baru); tests/helpers/browser-qa-api.js (baru);
  scripts/diagnose-browser.js (ekspor klien DevTools, GET/HEAD tetap default).
- tests/auth-write-policy.test.js dan tests/auth-only-readiness.test.js (baru).
- docs/real-auth-validation.md dan dokumen ini (baru).
- ops/examples/hdwork2-online.Caddyfile.example dan
  ops/examples/hdwork2-online.environment.example (baru, review-only).

Tidak ada file Preview atau desain frontend yang diubah pada batch6–8. Tidak ada
commit massal karena working tree berisi perubahan sebelumnya yang belum dipisah.

## QA browser

Runner: scripts/browser-qa-mock.js --run. Server HTTPS dan API fixture sepenuhnya
lokal/in-memory. Cookie Secure/HttpOnly digunakan oleh browser nyata pada profil
baru dengan pin SPKI sertifikat localhost; trust Windows tidak diubah. Request
halaman dibatasi origin localhost8443, GET/HEAD/POST, tanpa backend nyata.

Kasus lulus: login dan CSRF mock, respons /me401 lama tidak menghapus sesi baru,
dashboard rekap, navigasi B2C/TIAL/ASSUREN/B2B/REPLACEMENT, reload memulihkan sesi,
expiry mengarahkan login, direct URL dan API tanpa permission ditolak, SHOW_ONLY
tanpa create, logout tidak dibatalkan respons /me200 lama, Preview DEMO tetap
tersedia, serta mobile390px tanpa horizontal overflow.

Laporan sukses: .local/browser-qa-DotC8x/report.json. Screenshot Preview mobile:
.local/browser-qa-DotC8x/preview-mobile.png. Semua profil dan laporan dipertahankan.
Tidak merekam password/token/cookie/header/body. Screenshot hanya fixture DEMO.

Dua percobaan awal gagal dan juga dipertahankan:
- browser-qa-QOa0Ai: timeout skenario awal; runner belum mengaktifkan domain
  Runtime/Page/Network/Fetch sebelum navigasi. Diperbaiki sebelum percobaan kedua.
- browser-qa-e9uoI1: empat kasus awal lulus lalu DevTools timeout saat navigasi.
  Fixture SSE semula tidak dibatasi. Stream fixture kini diakhiri setelah reset
  agar tidak menahan koneksi HTTP/1 selama full navigation/reload; seluruh kasus
  kemudian lulus. Ini perbaikan determinisme fixture, bukan perubahan SSE produksi
  atau bukti pasti bahwa SSE produksi memiliki bug yang sama.

Bug/pengetatan lain: auth-only menolak read-only=false atau bearer fallback;
error CORS tetap403 dan body parsing tetap400/413 dengan error tersanitasi;
readiness menyebut scope auth vs operations agar tidak menyesatkan monitoring.
Tidak ada bug aplikasi baru yang teramati pada percobaan QA terakhir.

## HTTPS dan environment online — belum diaktifkan

Usulan: satu origin HTTPS publik untuk frontend dan /api, dengan proxy ke API
loopback3090. CORS origin harus tepat domain publik; cookie Secure/HttpOnly/
SameSite=None/Path=/ dipertahankan tanpa Domain. Jangan memakai sertifikat atau
pin localhost untuk publik. TLS publik memerlukan domain, DNS, challenge ACME,
akses port dan penyimpanan sertifikat yang disetujui. Caddy mendukung automatic
HTTPS dan proxy/streaming: [HTTPS](https://caddyserver.com/docs/automatic-https),
[reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

Template review-only: ops/examples/hdwork2-online.Caddyfile.example dan
hdwork2-online.environment.example. Domain .invalid sengaja tidak operasional;
tidak ada DNS, tunnel, firewall, sertifikat publik atau proxy dikonfigurasi.
Template Caddy belum divalidasi executable dan tidak boleh langsung dipakai.
Readiness/internal courier diblokir pada contoh proxy publik. Jangan mencatat
cookie, Authorization, CSRF, body login atau raw error database dalam access log.

Build frontend saat ini berisi URL localhost8443, sehingga tidak boleh langsung
dipublikasikan. Nilai VITE_* bersifat publik dan compile-time; domain production
harus diset sebelum build yang disetujui. Tidak ada secret pada VITE_*.

Password DPAPI terikat akun Windows dan host. Scheduled task/PM2 harus berjalan
pada identitas yang dapat membuka DPAPI, dengan ACL direktori privat yang ditinjau.
JWT production baru memerlukan penyediaan privat; jangan menggunakan secret
pengembangan. Loader JWT terenkripsi/secrets manager lintas-host belum disiapkan.
Jangan memindahkan DPAPI mentah ke Linux atau menaruh plaintext password dalam env
file/log/Git. Review template PM2 existing masih menunjuk api-only-server.js yang
tidak membaca DPAPI; jangan mengaktifkannya tanpa review entrypoint privat dan
shutdown. Tidak ada konfigurasi PM2 existing yang diubah.

## Review permissions operasional — tidak diterapkan

hdwork_auth tetap auth-only. Seluruh route saat ini memakai pool utama bersama;
akun/pool operasional dan admin belum dipisahkan. Jangan memperluas grants auth
secara massal untuk membuat dashboard nyata berfungsi.

| Area | Kebutuhan berdasarkan SQL sumber; perlu review sebelum grant |
| --- | --- |
| Baca order/rekap/export | SELECT hd2_orders, hd2_audit, users dan tabel scope auth |
| Create/aksi web | SELECT/INSERT/UPDATE hd2_orders dan hd2_web_requests; SELECT/INSERT hd2_audit dan hd2_live_events |
| Outbox notifikasi B2C | SELECT/INSERT/UPDATE hd2_courier_outbox; UPDATE juga diperlukan oleh ON DUPLICATE KEY UPDATE pada enqueue |
| Manajemen akun | INSERT/UPDATE users; SELECT/INSERT/DELETE hd2_user_modules; SELECT hd2_auth_guard; SELECT/INSERT security audit; UPDATE sessions |
| Courier worker | Akun terpisah untuk inbox/outbox/lease/dedupe/runtime sesuai SQL courier existing; tetap nonaktif dan di luar validasi auth |

Tidak ada kebutuhan DDL/ALL PRIVILEGES/GRANT OPTION untuk runtime. Matriks ini
bukan perintah GRANT atau verifikasi hak operasional pada DB utama. Parser/source
DB constraint tidak diubah; tidak ada migrasi dijalankan ulang.

## Health, startup dan shutdown

/health adalah liveness HTTP, bukan bukti DB siap. /ready membaca DATABASE() dan
metadata; scope auth hanya empat tabel auth, scope operations tetap memerlukan
metadata operasional lengkap. Endpoint readiness sebaiknya internal, bukan publik.
API tetap bind127.0.0.1. Batch5 membuktikan startup read-only serta port3090 ditutup;
batch ini menguji app auth-only, readiness dan shutdown dengan mock, bukan
menjalankan backend produksi lagi. Browser QA menutup listener8443 dan Chrome
miliknya. SIGINT/SIGTERM private runtime menutup listener dan pool; restart/service
online, crash recovery, DB failure dan shutdown SSE host produksi belum diuji.

## Checklist sebelum deployment / akses nyata

- [x] Gate auth-only dan batas TTL lulus tes, tanpa aktivasi nyata.
- [x] QA browser mock13kasus, Preview dan permission lulus.
- [x] Rencana real-auth terperinci: docs/real-auth-validation.md.
- [ ] Persetujuan eksplisit untuk INSERT/UPDATE sesi dan INSERT audit nyata.
- [ ] Validasi login SUPER_ADMIN, reload dan logout nyata tanpa perubahan akun.
- [ ] Trust sertifikat browser nyata yang disetujui; domain/HTTPS publik dipilih.
- [ ] Pisahkan/tinjau scope pool auth, operations, admin dan courier; grants baru
  hanya setelah persetujuan dan pengujian terpisah.
- [ ] Desain aktivasi tulis produksi permanen. Gate15menit dibuat untuk validasi
  lokal sementara, bukan login online24/7.
- [ ] Secret production, identitas Windows, ACL, backup dan pemulihan disetujui.
- [ ] Build production dengan URL/API/flags production dan verifikasi browser.
- [ ] Validasi sintaks proxy, keamanan header/CSP, logging redaction, rate limits,
  batas SSE, firewall, resource limit, monitoring dan rollback.
- [ ] Review Git/commit terpisah dan persetujuan deployment. Tidak ada push/merge/
  deployment dilakukan dalam pekerjaan ini.
