# Live ingestion pertama — PASS

8 November 2026, selesai 21:29:19 WIB. Pengujian nyata:
Telegram @HDWorkOpsBot → courier Python → Express/HMAC → MySQL hdwork2 → API
baca terautentikasi yang menggunakan reader daftar/detail dashboard.

- Chat testing: -5436357946, tanpa topic; message ID: 6.
- Referensi: LIVE-AO20261108142737.
- Order ID: 7790b19e-f9d4-4c79-ae43-2ad10cdbf405.
- Status: WAITING.
- Baseline order bot testing: 0. Verifikasi referensi dan identitas pesan: tepat
  satu order, exactlyOnce=true. Tidak mengirim ulang order untuk membuat duplikat.
- API daftar dan detail melalui hdwork_ops_read: PASS; satu entri riwayat terbaca.
  API internal memakai autentikasi HMAC. Browser/frontend dan login cookie tidak
  diuji ulang; tidak mengklaim browser QA PASS pada sesi ini.
- send=false sepanjang pengujian; pesan Telegram terkirim: 0.

Bukti runtime: .local/live-order-grVMxM/report.json, beserta log tersanitasi di
.local/live-launch-74100b58b43e455f833d008e7dd8d9fe. Tidak menyimpan secret dalam
laporan atau log. Payload order adalah data dummy yang dikirim pengguna sendiri.

Cleanup supervisor melaporkan backend/Python selesai, tanpa forced termination.
Pemeriksaan OS setelahnya: PID 10364 dan 19128 tidak aktif; port 3091 tidak
listening. Gate courier enabled/ingestion/network=false, approvalUntil=null,
send=false; web global read-only=true. Tidak ada layanan testing yang ditinggal
aktif. File active supervisor dipertahankan sebagai penunjuk laporan, bukan
bukti proses masih berjalan; run berikutnya perlu review state sebelum start.

Tidak mengakses database legacy, mengubah PM2, firewall, DNS, deployment, akun
SUPER_ADMIN, melakukan migrasi, commit, push atau merge. Order testing sengaja
dipertahankan untuk audit; tidak ada penghapusan data setelah pengujian.
