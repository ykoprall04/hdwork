# Persiapan E2E integrasi 18 fitur

Tanggal: 9 November 2026. Baseline HEAD tetap `66ceec4`; seluruh perubahan lokal.

**Status: runner sudah disesuaikan dan rehearsal lokal lulus. E2E MySQL/browser penuh dan Telegram nyata belum dijalankan. Satu E2E nyata siap direncanakan untuk persetujuan, tetapi belum mendapat GO operasional sampai prasyarat di bawah diverifikasi.**

## Perubahan runner

| Runner/helper | Perubahan dan cakupan yang dipertahankan |
|---|---|
| `tests/integration/mysql-auth.cjs` | Memuat schema approval 010 pada setup disposable yang opt-in; akun wajib gagal login saat PENDING, aktivasi lewat update/self-approval ditolak, lalu approval sah. Multi-device session, logout/revoke, role/module, reset/disable dan audit dipertahankan. Asumsi pembuatan SUPER_ADMIN via manage diganti pengujian penolakan sesuai kontrak; ganti password memverifikasi pencabutan sesi. |
| `tests/integration/mysql-operations.cjs` | Approval sebelum login; validasi race PICK 409, replay idempotent, takeover, canonical duplicate, alasan GAGAL, durasi/statistik, korelasi audit/request/outbox dan feedback ANTRE/GAGAL. Ekspor 550 baris, proteksi formula, pembatalan, slot, rollback dan scope modul tetap ada. |
| `tests/integration/mysql-courier-integration.cjs` | Setup sampai 010, approval, injeksi pool disposable eksplisit, web creation 403, race dua HD lewat HTTP, owner lama ditolak, audit/request/outbox, feedback ANTRE/TERKIRIM dan statistik berbobot. Python restart, lost ACK, SSE, FIFO, worker lock, nonce dan database recovery dipertahankan. Retry hanya RATE_LIMIT; NETWORK/expired lease harus DEAD tanpa resend. |
| `tests/integration/mysql-disposable.cjs` | Tes fondasi tetap dipertahankan; ekspektasi lease kedaluwarsa diubah menjadi DEAD/LEASE_EXPIRED, bukan pengiriman ulang. |
| `tests/integration/local-base-web.cjs` | Memakai runtime uji dengan env/pool eksplisit, tanpa require-cache injection atau credential runtime. Memverifikasi approval HTTP, cookie/CSRF/role, larangan web creation untuk semua role, Telegram-shaped ingestion empat workspace, PICK bersamaan, DONE/REOPEN/GAGAL, audit dan feedback. Durasi lintas hari ditetapkan hanya di schema disposable untuk assertion 35:15 = 126900 detik. TLS, Host boundary, logout, read-only gate dan browser opsional tetap ada. |
| `tests/helpers/local-browser-smoke.cjs` | UI membuka order yang sudah diterima lewat Telegram fixture; tidak lagi mengisi form Buat Order. PICK, DONE, reload, riwayat, feedback ANTRE, mobile, recap dan logout dipertahankan. |
| `scripts/test-isolated-mysql.js` | Menjalankan auth/operations/courier dalam proses terpisah agar flag, cached pool dan sesi tidak bocor antar-suite; setup base-web sampai 010. Proses anak menerima allowlist variabel OS dan nilai test eksplisit. Script ini **tidak dijalankan** karena menyalakan MySQL dan menjalankan SQL. |

Kontrak bersama ada di `tests/helpers/e2e-contracts.cjs`; fixture ingress ada di `tests/helpers/e2e-telegram-fixture.cjs`. Runtime uji memuat kode API/auth/operations asli melalui dependency injection khusus tes. Modul database/operational-pools/credential runtime ditolak bila tidak diinjeksi. Validasi produksi tidak diubah. Endpoint pembacaan legacy tidak dimuat oleh runtime uji ini.

## Hasil lokal yang benar-benar dijalankan

- **33/33 tes lulus** pada suite terarah: e2e-preparation, access, workspace-status-concurrency, windows-mysql-preparation, operational-enhancements, operational-pool-routing dan courier-mysql.
- Suite baru menjalankan Express/API/auth/transition/read/feedback asli, approval HTTP dan service, dua HD PICK bersamaan, idempotent replay, DONE lalu REOPEN/GAGAL, audit-outbox correlation, status feedback dan password/session revocation. Policy/inbox/processor Telegram memakai adapter SQL memori dan data sintetis; settlement feedback memakai metadata palsu tanpa transport.
- Pengujian guard menolak konfigurasi default/produksi sebelum driver dibuat. SQL migrasi hanya dibaca dan di-parse sebagai teks, **tidak dieksekusi**.
- Pemeriksaan syntax Node lulus untuk 15 file runner/helper terkait; `git diff --check` lulus.
- Log: `.local/integration/e2e-preparation-tests.log`.
- Pemeriksaan akhir setelah menutup jalur `/ready` pada runtime injeksi: 2/2 tes E2E-preparation kembali lulus; driver mysql2/promise tetap tidak dimuat. Log: `.local/integration/e2e-isolation-final.log`. Ini pengulangan terarah, bukan dua tes unik tambahan.

Perintah aman untuk mengulang suite terarah bila diperlukan:

```powershell
npm.cmd run test:e2e:offline
```

Alias ini menunjuk perintah Node yang sama dengan validasi di atas. Tidak perlu mengulang seluruh 366 tes atau build frontend karena source produk/frontend tidak berubah dalam pekerjaan persiapan ini.

Tidak ada listener layanan existing, database live, Telegram nyata, .env/DPAPI produksi atau kredensial produksi yang digunakan. Listener HTTP rehearsal dibuat sendiri pada port loopback acak dan ditutup setelah tes. Native MySQL, Chrome smoke penuh, migrasi, grant dan E2E grup testing belum dijalankan; hasil offline tidak membuktikan perilaku MySQL/browser/Telegram nyata.

## Prasyarat satu E2E nyata dengan grup Telegram testing

1. **Persetujuan eksplisit** untuk target, waktu dan tindakan: satu grup/topic testing, akun uji, jumlah order/pesan, perubahan status yang diizinkan, serta siapa yang menghentikan pengujian. Persetujuan ini belum diberikan. Otorisasi migrasi/grant terpisah jika lingkungan uji belum siap.
2. Lingkungan HD Work 2.0 testing terisolasi yang telah disiapkan operator; bukan database live atau sistem legacy. Konfirmasikan schema 004–010 yang relevan, termasuk approval_status. Pekerjaan ini tidak menginstal schema apa pun.
3. Grant auth writable dan dedicated read/write/courier telah ditinjau; read feedback memiliki SELECT metadata request/outbox sesuai template. Profil session-audit-only/read-only yang existing tidak cukup untuk approval dan aksi order. Jangan mengganti credential read dengan write untuk melewati startup check.
4. Build testing menggunakan `VITE_HDWORK2_AUTH_COOKIE=true` dan `VITE_HDWORK2_OPERATIONS=true`; backend auth/operations serta profil writable disetujui di lingkungan testing. Gunakan URL HTTPS/CORS/cookie yang sudah benar. Tidak perlu mengubah Cloudflare, Windows Service, DNS atau VPN untuk rehearsal ini; jika lingkungan belum tersedia, hentikan persiapan aktivasi di situ.
5. Bot khusus testing, identitas bot dan pemiliknya terverifikasi. Catat chat ID, topic/thread ID atau non_topic, command profile dan allowlist tepat. Bot tidak boleh tersambung grup produksi atau webhook/poller lain yang bersaing. Token disuplai lewat mekanisme rahasia testing yang disepakati, bukan .env produksi, log atau dokumen ini.
6. Satu approver ADMIN/SUPER_ADMIN yang sesuai hierarki, dua HD dengan izin modul yang sama, dan satu View Only; gunakan akun sintetis. Akun baru harus PENDING sampai approver menyetujui. Tidak perlu membuat SUPER_ADMIN tambahan lewat API.
7. Browser yang mendukung SSE dan audio; suara diaktifkan melalui klik pengguna. Siapkan pencatatan hasil tersanitasi dan penanda unik seperti `E2E-<waktu>-AOi001`; jangan memasukkan data pelanggan.

Runner MySQL di atas **hanya untuk schema disposable kosong** pada loopback non-3306 dan akun `hdwork2_test_*`. Runner tersebut melakukan setup SQL setelah opt-in dan tidak boleh diarahkan ke database testing berisi data, database operasional, atau kredensial produksi. Mereka selalu memakai Telegram palsu. Untuk grup Telegram nyata, gunakan prosedur terkontrol berikut pada aplikasi testing yang sudah siap, bukan menjalankan setup runner disposable terhadap aplikasi tersebut.

## Skenario satu sesi E2E nyata setelah disetujui

1. Catat baseline statistik/antrean dan waktu mulai; verifikasi login akun PENDING ditolak. Approver menyetujui akun HD, lalu kedua HD login/check-in; View Only hanya membaca. Uji negatif CSRF/role tetap memakai request khusus testing yang disetujui.
2. Operator mengirim **satu command order valid** lewat grup/topic testing dengan label unik dan data sintetis. Pastikan tepat satu order WAITING muncul melalui SSE tanpa reload; label mengikuti SC/IN → INET tersamar → command dan link tetap memakai UUID internal. Catat chat/message/topic untuk membandingkan anchor feedback.
3. Periksa pencarian SC/IN, INET/TELP/STO, command, tanggal WIB dan filter petugas/status. Pada halaman lanjutan pastikan kedatangan tidak memindahkan pagination. Aktifkan suara lewat interaksi pengguna; snapshot/reload awal tidak boleh berbunyi sebagai order baru.
4. Kedua HD mencoba PICK terhadap version yang sama. Tepat satu sukses, yang lain 409; owner tunggal, status IN_PROGRESS/PROSES CEK, timer HH:mm berjalan. Replay request sukses tidak menambah audit/outbox. Jika mengambil alih, owner lama tidak boleh menyelesaikan order.
5. Selesaikan DONE; timer membeku pada finishedAt, audit memuat actor/from/to/time/requestId/outboxId dan feedback ANTRE menjadi TERKIRIM hanya setelah Telegram message ID tersimpan. Balasan harus ke message/topic asli. Bandingkan perubahan statistik dan rata-rata dengan timestamp aktual, bukan rata-rata antar-workspace.
6. Dengan konfirmasi, REOPEN order yang sama dan uji GAGAL: alasan kosong ditolak, alasan valid disimpan terpangkas dan masuk audit serta pesan feedback. Statistik/durasi harus mencerminkan penyelesaian terbaru. REOPEN sendiri tidak mengirim feedback tambahan.
7. Jika duplikat termasuk dalam batas pesan yang disetujui, kirim satu order tambahan dengan business key sama; CONTINUE/REJECT hanya boleh mengubah duplikat dan canonical tetap utuh. Tanpa izin pesan tambahan, tandai pemeriksaan ini sebagai belum dilakukan, bukan PASS.
8. Reload detail, bandingkan history/statistik/filter, lalu logout/ganti password akun uji untuk membuktikan pencabutan sesi. Simpan hasil tersanitasi dan akhiri sesi. Jangan hapus data atau resend delivery tidak pasti; TIDAK_PASTI/GAGAL membutuhkan review, bukan retry otomatis.

Kriteria stop: target/grup/topic tidak cocok, akses role meluas, double owner, order/pesan duplikat akibat replay, audit hilang, angka statistik salah, atau feedback tidak pasti. Jangan mengatasi kegagalan dengan membuka grant, mematikan CSRF/locking, atau mengaktifkan retry jaringan.

## Risiko yang masih harus dibuktikan

- SQL/grant nyata, locking MySQL, latency SSE, izin audio dan Telegram bot/privacy/topic belum diuji pada sesi ini. Runtime test injection bukan bukti konfigurasi deployment testing.
- Pengurutan feedback ketika dua aksi memiliki created_at pada milidetik yang sama masih mengikuti timestamp lalu UUID; perlu dicatat saat verifikasi MySQL, tanpa menganggap UUID sebagai urutan waktu.
- Volume/performa pencarian dan query feedback belum diukur; chunk LegacyRoutes >500 kB merupakan peringatan existing dari build integrasi sebelumnya.

Tidak ada commit, push, merge, deploy, migrasi, perubahan layanan/infrastruktur, atau pengiriman Telegram nyata. Laporan ini memperbarui blocker runner yang dicatat pada laporan integrasi sebelumnya; prasyarat lingkungan dan persetujuan tetap berlaku.
