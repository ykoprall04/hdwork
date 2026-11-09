# Live end-to-end HD Work 2.0 — PASS

Tanggal 8 November 2026. Bukti memakai Telegram, MySQL, HTTPS dan browser nyata;
tidak mengulang batch simulasi atau suite mock lama.

| Tahap | Hasil nyata |
| --- | --- |
| Order | LIVE-AO20261108142737, ID 7790b19e-f9d4-4c79-ae43-2ad10cdbf405 |
| Telegram asal | @HDWorkOpsBot, grup testing -5436357946, message 6, tanpa topic |
| Penyimpanan | Pengujian ingestion sebelumnya membuktikan tepat satu order di hdwork2 |
| Backend/dashboard | HTTPS localhost:8443 + API loopback3090; auth hdwork_auth, reader hdwork_ops_read |
| Login browser | SUPER_ADMIN testing ID 1 terverifikasi melalui /me 200, tanpa membaca kredensial/cookie |
| Browser sebelum perubahan | Referensi/UUID terlihat; status WAITING, versi0, satu history |
| UPDATE | Setelah persetujuan khusus, transaksi administratif hanya row target: DONE, versi1, final_user_id1 |
| Audit | Tepat satu LIVE_TEST_DONE, WAITING→DONE; dua history total bersama ORDER_RECEIVED |
| Browser sesudah perubahan | DONE, versi1, dua history; screenshot aktual diperiksa visual |
| Reply | Setelah persetujuan SEND terpisah: satu sendMessage teks DONE, reply ke6, respons Telegram message7 |
| Pengiriman | CONFIRMED, attempts1, replyVerified=true; tidak ada retry otomatis/pengiriman grup lain |
| Logout | Melalui tombol UI; /me sesudah logout401 |
| Cleanup | Backend/Chrome pengujian ditutup; PID19496/3684/18652 tidak aktif, port3090/3091/8443 tidak listening |

SUPER_ADMIN tetap role monitoring pada workflow HD normal. Finalisasi dummy ini
adalah pengecualian administratif yang secara eksplisit disetujui pengguna, bukan
perubahan role atau pembukaan hak UPDATE umum pada runtime. Hanya row target,
audit LIVE_TEST_DONE dan event TIAL/change yang ditulis pada transaksi finalisasi.
Password admin dimasukkan pengguna lewat prompt PowerShell tersembunyi dan tidak
disimpan. Aplikasi tidak memakai root runtime. Tidak mengubah users/role/grants.

## Bukti privat

- .local/live-browser-xZiNxe/browser-verification.json — hasil browser DONE.
- .local/live-browser-xZiNxe/order-browser.png — screenshot halaman order, tanpa form password.
- .local/live-browser-xZiNxe/logout-verification.json — logout401.
- .local/live-browser-xZiNxe/report.json — startup/cleanup; databaseOrder adalah snapshot awal WAITING.
- .local/testing-done-*/report.json — transaksi status yang disetujui.
- .local/testing-done-reply.json — receipt Telegram message7, attempts1, CONFIRMED.
- .local/live-order-grVMxM/report.json — ingestion awal dan exactlyOnce.

Waktu balasan terkonfirmasi: 21:47:52 WIB. Logout: 21:48:53 WIB.
Token, password, hash kredensial dan cookie tidak dicetak atau dicatat oleh runner.
File profil/laporan sebelumnya dipertahankan; order dummy tidak dihapus.

## Pages + Tunnel: artifact siap review, belum online

Candidate frontend build nyata berhasil di
.local/pages-candidate-6da6383e62bd486baa9cbe8de3ec608f/dist. Bundle memuat
https://api.hdwork.yoloo.space dan tidak memuat API localhost:8443. Build lokal
frontend/dist yang dipakai pengujian browser tidak ditimpa. Warning chunk legacy
>500kB tetap ada, bukan kegagalan build.

Usulan frontend: hdwork.yoloo.space di Pages. Usulan backend:
api.hdwork.yoloo.space melalui tunnel Windows (hostname API masih perlu konfirmasi).
Kode web-origin sudah mendukung allowlist Host API terpisah dari Origin/CORS
frontend, dengan approval eksplisit. Guard offline dan cloudflared ingress validate
untuk YAML review PASS; tidak ada tunnel dijalankan atau DNS diubah.

Artifact: ops/examples/hdwork-pages-tunnel.review.json,
ops/examples/hdwork-pages-tunnel.ingress.review.yml,
docs/pages-tunnel-hdwork-plan.md. Cloudflare Access team/audience/allowlist dan
token tunnel privat belum diisi. Validasi lintas origin Pages/API di internet,
auth permanen, rate-limit proxy serta firewall/router masih menjadi gate online.
Window login 14 menit pada pengujian bukan mode layanan produksi 24 jam.

Production tidak diubah sesi ini: tidak ada upload Pages, deployment, perubahan
DNS/firewall, cutover, commit, push atau merge. hd_b2c dan PM2 legacy tidak disentuh.

## Perubahan source sesi ini

src/config/auth-write-policy.js: window auth plus read-only dashboard, hanya
login/logout mendapat pengecualian mutasi; operasi/admin POST tetap503.
src/config/web-origin.js: dukungan hostname API terpisah yang disetujui.
scripts/provision-testing-accounts.js: ekspor helper input admin tersembunyi,
tanpa menjalankan provisioning pada sesi ini.

Runner baru: live-order-browser.js, inspect-live-order-browser.js,
testing-order-done.js/.ps1, testing-done-reply.js. SQL review khusus:
ops/examples/live-testing-done.review.sql. Semua perubahan Git lama dipertahankan.

Langkah selanjutnya menuju online adalah konfirmasi hostname API dan penyediaan
konfigurasi Cloudflare privat/Access serta persetujuan kebijakan auth permanen.
Candidate harus diuji sebelum cutover Production yang disetujui terpisah.
