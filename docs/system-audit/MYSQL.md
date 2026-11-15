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

## Implementasi Batch 3 - 2026-11-15 (menggantikan rencana di atas)

`database/manual/019_hdwork2_order_notes.sql` kini tersedia sebagai migrasi manual aditif: tabel hd2_order_notes (order_id PK/FK, body, updated_by FK, updated_at), grant SELECT untuk hdwork_ops_read dan SELECT/INSERT/UPDATE untuk hdwork_ops_write. Tidak ada grant Courier, perubahan tabel order, penghapusan data, atau eksekusi otomatis saat startup.

Validator operational-grants menerima tambahan notes secara opsional hanya pada role Web; profile/grant Courier tetap sama dan menolak akses notes. Query summary memakai indeks chat_order(order_id,seq) existing dan tidak membutuhkan migrasi cursor.

Pada commit awal `57574e2`, migrasi belum dijalankan pada database mana pun; uji backend memakai mock dan uji browser memakai API sintetis. Rehearsal MySQL terisolasi untuk perbaikan berikutnya dijelaskan di bawah. Tidak ada klaim verifikasi MySQL produksi atau aktivasi fitur catatan di produksi.

## Perbaikan migrasi Batch 3 - 2026-11-15

File `019_hdwork2_order_notes.sql` tetap dijalankan manual melalui client MySQL yang mendukung `DELIMITER` (batch atau `SOURCE`), dalam satu sesi DBA khusus dan tanpa `--force`. Jangan menjalankan dua penerapan migrasi ini bersamaan. Jangan memakai sesi dengan transaksi pekerjaan lain yang masih terbuka: DDL dan GRANT melakukan implicit commit, sehingga keseluruhan file bukan satu transaksi atomik.

Prosedur pembantu `hd2_migrate_order_notes_019` menggunakan `SQL SECURITY INVOKER`, dibersihkan setelah sukses, dan dibuat ulang pada percobaan berikutnya bila tertinggal akibat kegagalan. Sesi migrator memerlukan CREATE/ALTER ROUTINE, EXECUTE, CREATE tabel, REFERENCES pada induk, akses metadata yang memadai, serta wewenang GRANT untuk kedua akun Web existing. Tidak ada grant routine atau privilege baru kepada Courier maupun bot pribadi. `DROP PROCEDURE` hanya membersihkan helper migrasi tersebut; tidak ada DROP tabel, DELETE, TRUNCATE atau perbaikan otomatis terhadap data.

Sebelum GRANT, migrasi memvalidasi engine/tabel induk, tipe dan PK induk, jumlah/tipe/nullability/default kolom catatan, charset `order_id`, charset teks, PK, indeks FK, kedua relasi FK beserta aturan referensialnya, dan menolak constraint unik tambahan, CHECK atau trigger yang mengubah kontrak. `CREATE TABLE IF NOT EXISTS` hanya digunakan untuk membuat tabel yang belum ada, bukan sebagai bukti struktur existing sudah benar. Nama indeks/FK dan pilihan collation utf8mb4 existing boleh berbeda selama strukturnya kompatibel. Struktur tidak cocok menghasilkan error `019`, mempertahankan data dan tidak melanjutkan GRANT.

Tabel baru memakai `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`, dan `body` juga menetapkannya secara eksplisit. `order_id` tetap `CHAR(36) CHARACTER SET ascii COLLATE ascii_bin`, sedangkan `updated_by` tetap BIGINT UNSIGNED. Tabel existing yang body-nya bukan utf8mb4 ditolak untuk review; migrasi tidak mengonversi teks existing secara diam-diam.

Jika salah satu GRANT gagal, tabel/data dan GRANT yang sudah sukses tetap ada. Setelah prasyarat akun/wewenang diperbaiki, jalankan ulang seluruh file: validasi diulang dan GRANT yang sama dapat diterapkan kembali tanpa menghapus tabel atau catatan. Grant reader tetap SELECT; writer SELECT/INSERT/UPDATE, tanpa akses tambahan ke tabel lain. Validator startup Web sengaja tetap menerima grant notes sebagai tambahan opsional; keberhasilan startup bukan bukti schema/grant catatan siap.

Prosedur menetapkan `SESSION lock_wait_timeout=5` untuk metadata lock dan `SESSION innodb_lock_wait_timeout=5` untuk row lock selama pekerjaan tabel/grant di dalamnya, kemudian mengembalikan nilai sebelumnya pada sukses maupun error. Backend `order-notes.js` memakai batas yang sama selama transaksi simpan dan memulihkan sesi sebelum kembali ke pool; jika pemulihan sesi gagal, koneksi dibuang, bukan dipakai ulang. Batas berlaku per percobaan lock, bukan batas total durasi migrasi; metadata timeout juga tidak mencakup semua akses implisit tabel sistem GRANT. Helper DDL di luar CALL memakai pengaturan sesi pemanggil. Tidak ada jaminan zero downtime: FK melibatkan tabel induk bersama dan kontensi masih dapat menunda Web/Courier.

Rehearsal nyata: `node --test tests/order-notes-mysql.test.cjs`. Helper pengujian existing membuat datadir baru di `.local/owned-mysql-*`, memakai named pipe acak dengan `--skip-networking`, memverifikasi datadir dan TCP nonaktif, lalu menghentikan hanya instance milik tes. Tidak membaca kredensial/config produksi dan tidak terhubung ke port 3306. Artefak uji dipertahankan, tidak menghapus data atau file untracked existing.

Skenario uji meliputi pembuatan baru, kegagalan GRANT karena akun writer belum ada, melanjutkan partial failure, pengulangan sukses, preservasi catatan/order existing, round-trip Unicode/emoji pada database dengan default latin1, validasi FK, simpan backend bersamaan, timeout row lock serta rollback, timeout metadata lock saat CREATE dengan induk terkunci, penolakan schema drift/charset salah sebelum GRANT, dan penerimaan bentuk tabel awal yang kompatibel. Uji mock juga memeriksa pemulihan timeout pada jalur sukses/error dan pembuangan koneksi bila pemulihan sesi gagal.

Hasil validasi perbaikan: suite regresi backend `npm.cmd test` **561/561 PASS**; suite MySQL terisolasi **9/9 PASS** (delapan skenario dan satu suite induk), termasuk row/metadata lock timeout yang masing-masing teramati sekitar lima detik. `git diff --check` lulus. Hasil ini membuktikan perilaku pada fixture terisolasi, bukan karakteristik beban atau waktu henti produksi.

Kesiapan berikutnya: source migrasi dapat masuk tahap backup dan rencana penerapan terkontrol setelah seluruh uji lulus. Sebelum penerapan produksi yang kelak diizinkan, cocokkan DDL induk/notes dan kedua akun Web, siapkan backup serta bukti restore, periksa kontensi/transaksi lama, lalu verifikasi struktur aktual dan kedua GRANT sesudah penerapan. Bila gagal, perbaiki penyebab lalu ulangi; jangan menjatuhkan tabel untuk mengulang. **Migrasi produksi, backup produksi, push dan deployment belum dilakukan.**
