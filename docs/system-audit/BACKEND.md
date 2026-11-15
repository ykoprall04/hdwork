# Backend: API, akses, dan Catatan HD

Audit: 2026-11-15 · branch `main` · HEAD `2d9c034f7da1a72a5de8777d23ae620b1bb41b88`.

## Fakta yang diverifikasi dari source

Backend Node/Express berada di `src/`, dengan aplikasi utama di `src/app.js`, API-only di `src/api-only-app.js`, route/controller/repository/service dipisah menurut domain. Koneksi MySQL dan pemisahan read/write pool berada di `src/config/database.js` dan `src/config/operational-pools.js`. Workflow operasional didaftarkan oleh `src/operations/routes.js` pada `/api/operations`; live chat dipasang di `/api/operations/chat` melalui `src/chat/routes.js`.

Endpoint terkait:

| Endpoint | Fungsi |
|---|---|
| `GET /api/operations/orders` | Daftar order dengan filter area, command, tab/status, owner, tanggal, teks dan page. |
| `GET /api/operations/orders/:id` | Detail order dan riwayat audit sesuai modul/akses. |
| `POST /api/operations/orders/:id/actions` | Aksi workflow dengan CSRF, policy dan kontrol versi. |
| `GET /api/operations/events` | Server-Sent Events untuk perubahan/arrival workflow sesuai modul. |
| `GET /api/operations/chat/conversations` | Daftar percakapan per modul, paginasi 25. |
| `GET /api/operations/chat/:id/messages` | Riwayat chat order, paginasi 25. |
| `POST /api/operations/chat/:id/messages` | Menyimpan balasan Web ke transaksi + outbox, dengan request idempotency. |

Auth API menggunakan middleware session di `src/access/http.js`/layanan access dan rate limit per user. Workflow memeriksa fitur/konfigurasi aktif, modul yang diberikan ke user, role aktif, kepemilikan order dan version. Chat mengecualikan akun trial, mengecek role, modul, session, route Telegram terverifikasi, status `IN_PROGRESS` dan owner sebelum menerima balasan. Detail otorisasi perubahan order ada di `src/operations/policy.js`, `src/operations/mutate.js`, dan `src/operations/read.js`.

## Perubahan minimal Catatan HD

Belum ada endpoint catatan order khusus. `completion_note` adalah field hasil tindakan dan tidak boleh dipakai untuk catatan internal yang tidak mengubah status. Implementasi yang disarankan memisahkan repository/service catatan dan route di bawah operasi; membaca dan mengubah note perlu validasi akun HD aktif serta scope `access_module`. Tulis dengan UPSERT atomik pada tabel note; jangan menyentuh order, audit status, chat, atau outbox kecuali menulis audit administratif yang memang disetujui. Tambahkan validasi body, CSRF pada mutasi, rate limit, dan tes mock untuk akses lintas modul, update bersamaan, serta isolasi dari Telegram.

Perubahan memerlukan migrasi aditif dan role grant backend seperti dicatat di [MYSQL.md](MYSQL.md). Courier tidak perlu berubah. Belum ada migrasi/API yang dibuat atau dijalankan.

## Indikator pesan baru

Belum ada endpoint read cursor/unread state per user. `GET /chat/:id/messages` mengembalikan `sequence`, arah dan `replyTo`; UI hanya meminta riwayat untuk order yang dibuka. SSE `GET /events` mengabarkan `modules`, `changed` dan arrival count tanpa ID order/message. Dengan localStorage murni tidak ada keadaan baca awal lintas perangkat, dan fan-out frontend atas semua order berpotensi menjadi banyak request.

Pilihan teknis: tetap simpan cursor per `userId + orderId` di localStorage sesuai kebutuhan produk, tetapi sediakan endpoint ringkasan batched untuk order aktif milik pengguna yang hanya mengembalikan sequence pesan masuk terbaru per order dalam scope modul (tanpa teks). UI menggabungkan ringkasan itu dengan cursor lokal; update ringkasan dipicu SSE, lalu polling/fallback existing. Jika mensyaratkan status baca lintas perangkat, diperlukan penyimpanan server-side dan migrasi, yang berbeda dari spesifikasi localStorage. Detail kontrak harus diuji sebelum implementasi.

## Implementasi Batch 3 - 2026-11-15 (menggantikan rencana di atas)

- `GET /api/operations/chat/incoming-summary?area=...`: satu query order IN_PROGRESS milik akun, dibatasi modul, berisi id dan latest sequence IN dengan reply_to_id terisi. Tidak mengirim teks. Mengikuti gate/rate limit Live Chat existing.
- `GET /api/operations/order-notes?ids=<UUID,...>`: maksimal 100 order per batch, hanya HD non-trial dengan scope modul. Mengembalikan teks kosong bila catatan belum ada.
- `POST /api/operations/orders/:id/hd-note` dengan `{text}`: CSRF/rate limit existing; validasi maksimal 2.000 karakter. `src/operations/order-notes.js` memeriksa ulang akun aktif, sesi dan modul di transaksi, lalu UPSERT atomik ke tabel catatan dan menulis event change untuk refresh UI. Simpan bersamaan memakai aturan terakhir commit berlaku.

Mutasi catatan tidak mengubah order/version/status, audit workflow, chat ataupun outbox. Pool notes membaca dari reader dan menulis lewat writer operasional existing. Backend menerima grant notes yang tepat sebagai tambahan opsional, sehingga migrasi yang belum diterapkan tidak menggagalkan startup fitur existing. Tanpa tabel/grant, request notes mengembalikan 503 terkontrol; workflow tetap independen. Tidak ada perubahan Courier atau runtime.

Validasi: suite backend offline 560/560 PASS, termasuk validasi input, scope modul, pemeriksaan ulang sesi/akun, commit/rollback catatan, CSRF seluruh route mutasi, filter summary dan kompatibilitas grant. Suite dijalankan dengan izin pengguna Windows agar fixture symlink dan Git ownership berfungsi. Tidak ada pengujian database produksi atau pengiriman Telegram.
