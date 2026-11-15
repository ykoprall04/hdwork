# MySQL: struktur dan perubahan yang direncanakan

Audit: 2026-11-15 · branch `main` · HEAD saat audit `2d9c034f7da1a72a5de8777d23ae620b1bb41b88`.

## Batas bukti

Ini audit source dan SQL lokal, bukan inspeksi database runtime. File `AGENTS.md`, `CLAUDE.md`, dan `docs/DEPLOYMENT-STATUS.md` tidak tersedia di checkout ini. Jangan menyimpulkan skema produksi persis sama dengan SQL manual; cek DDL lokal dan konfigurasi database hanya melalui prosedur audit yang berizin. Perbarui bagian terdampak saat skema atau query berubah, catat commit/tanggal, serta pisahkan fakta, rencana, dan hal yang belum diverifikasi. Jangan menaruh kredensial atau data sensitif di dokumen.

## Tabel order dan relasi

SQL manual `database/manual/004_hdwork2_courier.sql` membuat `hd2_orders` dengan `id CHAR(36)` sebagai primary key, identitas sumber `(bot_id, chat_id, message_id)` unik, `thread_id`, modul, status, SC/IN, INET, tanggal bisnis, waktu, serta FK status dan `duplicate_of` ke order. `database/manual/006_hdwork2_commands.sql` menambah `command`, `duplicate_decision`, `command_fields`, `raw_text`, sender dan timestamp Telegram; `hd2_tial_keys` menyimpan deduplikasi dan mereferensikan order. `database/manual/008_hdwork2_operations.sql` menambah owner/final user, `version`, `completion_note`, generated `access_module`, FK ke `users`, indeks daftar kerja, `hd2_web_requests` dan `hd2_live_events`.

`hd2_audit` memiliki primary key `id`, FK nullable ke inbox/order setelah perubahan operasi, actor/user, aksi, status asal/tujuan, `detail` JSON (tambahan `database/manual/005_hdwork2_b2c_audit.sql`) dan waktu. Tabel ini adalah jejak audit, bukan tempat menyimpan catatan kerja bebas.

## Tabel chat

`database/manual/013_hdwork2_live_chat.sql` membuat `hd2_chat_messages`: `seq BIGINT UNSIGNED AUTO_INCREMENT` sebagai urutan stabil, `id` unik, `order_id` FK, bot/chat/topic Telegram, `telegram_message_id`, `reply_to_id`, `direction` (`IN`/`OUT`), sender/user, body, attachments JSON, outbox FK dan timestamp. Indeks `chat_order(order_id,seq)` mendukung riwayat per order; `chat_ingress` mencegah ingest Telegram ganda. `src/chat/service.js` menambahkan pesan masuk melalui `INSERT IGNORE`, menambahkan pesan balasan pengguna/outbox dalam transaksi, dan membaca halaman 25 pesan berdasarkan urutan `seq`. Pesan asli order juga dicatat sebagai `IN`, dengan `reply_to_id` null; balasan masuk yang terkait order memiliki `reply_to_id` terisi. Konfirmasi runtime schema/grant belum diverifikasi.

Courier inbox/outbox, daily keys, audit, workers/nonces, mapping dan lane didefinisikan dalam SQL manual `004`, `009`, `012`, `014`, dan `015`. Berkas berakhiran `.review.sql`, `.PLAN_ONLY.sql`, dan `readonly` adalah bahan review/diagnostik; keberadaannya bukan bukti telah dijalankan.

## Alur baca/tulis

- API workflow membaca `hd2_orders`, users, audit, web requests dan live events. `src/operations/read.js` membungkus sebagian pembacaan dalam transaksi read-only.
- Chat membaca `hd2_chat_messages` dan status outbox. `src/chat/service.js` mencatat chat masuk saat transaksi pemrosesan inbox Courier; menulis balasan Web, outbox, audit dan live event dalam transaksi backend.
- `src/config/operational-grants.js` mendefinisikan role terpisah. Role Courier tidak diberi SELECT ke audit; role chat/backend memiliki allowlist tersendiri. Penambahan tabel perlu kebijakan least-privilege baru untuk pool yang tepat; Courier tidak membutuhkan akses ke catatan HD.

## Catatan HD — hasil audit dan rencana aman

Tidak ditemukan tabel/kolom catatan HD pada SQL yang ditinjau. `hd2_orders.completion_note` dipakai `src/operations/policy.js` dan `src/operations/mutate.js` untuk hasil DONE/GAGAL/eskalasi dan perubahan status; memakai ulang kolom tersebut akan mencampur catatan bebas dengan hasil/status order.

**Rencana, belum diimplementasikan:** satu tabel tambahan, misalnya `hd2_order_notes`, dengan `order_id` sebagai PK/FK ke `hd2_orders`, isi catatan nullable (API membacanya sebagai string kosong), `updated_by` FK ke `users`, dan `updated_at`. UPSERT hanya pada tabel tersebut agar tidak mengubah `hd2_orders.version`, status, atau pesan Telegram. Berikan SELECT/INSERT/UPDATE hanya pada role backend yang melayani UI; Courier tetap tanpa grant. API memvalidasi identitas aktif, peran HD dan `access_module` dari order; audit perubahan dapat ditulis ke `hd2_audit` dalam transaksi bila kontrak grant mengizinkan. Catatan tidak masuk payload outbox, chat, atau Telegram.

**Kesimpulan migrasi:** ya, rancangan yang direkomendasikan memerlukan satu migrasi SQL manual aditif dan penyesuaian grant/pool terpisah. Backup, rehearsal restore, persetujuan operasional dan verifikasi privilege wajib mendahului aktivasi; belum dilakukan pada audit ini. Jangan menambahkan kolom ke tabel order atau mengubah grant produksi otomatis.

## Inventaris migrasi yang ditemukan

`database/manual/004`–`013` berisi baseline Courier, audit, command, auth, workflow, runtime, account approval, monitoring dan chat; `014`–`018` berisi review/rencana/readonly terkait grup, FIFO dan infrastruktur. Migrasi pada `database/migrations/20260907_*` dan `20260908_*` adalah untuk tabel lama `telegram_groups`, `order_results`, dan `local_agents`, bukan migrasi catatan HD. Semua SQL bersifat source lokal; status penerapan pada database mana pun belum diverifikasi.
