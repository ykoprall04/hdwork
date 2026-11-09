# Solver trial terbatas pada grup testing

Role resmi akun `trial_yanto` adalah `HD`. Password tidak direset dan akun lain tidak diubah. Sesi lama dicabut saat perubahan role, sehingga perlu login ulang.

Mode read-only umum tetap aktif, `OP_WRITE_ENABLED=false`, dan courier polling umum tetap nonaktif pada runtime web. Satu jalur tambahan mengizinkan hanya POST aksi order dengan sesi/CSRF sah untuk ID akun trial yang diverifikasi. Akun, username, role aktif, bot, chat, topik, dan pesan asal diperiksa lagi di transaksi sebelum penulisan idempotensi, order, audit, atau outbox.

Scope berasal dari konfigurasi snapshot terlindungi, bukan body/header permintaan. Grup Telegram diperiksa langsung menggunakan getChat/getChatMember dan identitas bot getMe. Identitas yang kosong/tidak cocok ditolak. Hanya PICK (CEK), DONE, FAILED diizinkan; kepemilikan, versi order, modul, dan alasan FAILED tetap mengikuti mekanisme transaksi resmi. Create order, export, admin dan aksi lain tetap ditolak pada jalur publik.

Implementasi utama:

- `src/operations/testing-solver-scope.js`: validasi scope dan pesan balasan.
- `src/config/testing-solver-runtime.js`: pool khusus `hdwork_trial_write`, tanpa mengaktifkan pool tulis umum.
- `src/courier/testing-solver-outbox.js`: sender-only, tanpa getUpdates/polling atau perubahan lease courier lain. Hanya antrean milik actor trial dengan request/audit resmi dan order grup testing yang dipilih. Balasan wajib merujuk pesan order asli; tidak ada fallback kirim tanpa reply. Pengiriman ambigu tidak dicoba ulang otomatis.
- `tests/testing-solver-security.test.js`: lima tes pengamanan baru, bukan pengulangan suite simulasi historis.
- `ops/examples/hdwork2-trial-solver-grants.review.sql`: delapan GRANT untuk satu identitas database baru, hanya `hdwork2`, tanpa hak admin/schema atau hak mengubah akun aplikasi.

Audit baru menyimpan `actorUsername` dan `requestId` pada JSON detail existing. Tampilan history mengutamakan username baru dan tetap menggunakan nama lama untuk history yang belum memiliki field tersebut. Tidak ada migrasi schema.

Deployment memakai release baru dengan ACL SYSTEM/Administrators dapat menulis dan LocalService hanya membaca kode/config/secret terenkripsi; hanya direktori status dapat ditulis LocalService. Tidak mengeksekusi source proyek broad-writable sebagai SYSTEM. File source diperiksa terhadap manifest hash sebelum salin/deploy agar perubahan bersamaan tidak ditimpa. Release sebelumnya dan task sebelumnya dipertahankan untuk rollback.

Courier receive-only di worktree `.worktrees/telegram-trial` tidak diubah, dihentikan, diambil alih polling-nya atau diberikan GRANT tambahan. Sender baru tidak memilih antrean pengguna/grup lain. DNS, Cloudflare, VPN, bot lama dan database produksi tidak disentuh.

Scope mutasi trial berhenti pada batas tujuh hari akun trial awal yang tersimpan di konfigurasi; ini tidak menambah fitur expiry akun pada schema. Login read-only setelah masa itu dan penonaktifan akun tetap mengikuti administrasi resmi.

## Uji nyata yang masih menunggu input manusia

Satu referensi yang disiapkan: `TRIAL-AO20261109YANTO1`. Pengguna perlu mengirimnya sekali dari akun Telegram manusia ke grup HD Work 2.0 Testing, karena bot tidak dapat membuat pesan pengguna untuk antrean getUpdates-nya sendiri. Jangan memakai order produksi atau order verifikasi Codex lain.

Runner privat `.local/run-solver-e2e.ps1` menolak sebelum mutasi jika order belum ada, ganda, duplikat, bukan WAITING versi0 atau sudah memiliki petugas. Setelah tersedia, runner menguji browser publik → CEK → bukti reply CEK → DONE → bukti reply DONE → username di history web → logout. Guard browser membatasi POST pada tepat order tersebut dan satu percobaan per aksi. Ledger tidak boleh dihapus untuk mengulang aksi ambigu.

Password/token/cookie tidak dicetak atau diekspor, tidak ada screenshot data order, tidak ada perubahan SQL order langsung oleh runner. Hasil live tidak boleh disebut PASS sebelum laporan E2E nyata selesai.
