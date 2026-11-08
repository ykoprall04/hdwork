# Batch 7 — audit SQL 004/005 dan kesiapan uji MySQL

Tanggal: 8 November 2026 (Asia/Jakarta). Acuan: `38da8216b8097e4d7cda554c7b7706b344a4b60c`. Audit statis; tidak ada koneksi PC kantor/MySQL/Telegram/VPN, migrasi atau aktivasi worker. SQL 004/005, adapter, workflow, Preview dan database lama tidak diubah.

## Hasil audit

| Bagian | Temuan dan keputusan |
|---|---|
| Versi/engine | Memerlukan MySQL **8.0.13+**, InnoDB: expression default `(UTC_TIMESTAMP(3))` dan SKIP LOCKED. Header 004 menyebut 8.0+ secara umum; batas minimum sebenarnya 8.0.13. MariaDB/5.7 tidak dianggap kompatibel. Tetap perlu rehearsal, bukan klaim SQL telah berjalan. |
| DDL | 004 membuat enam tabel baru hd2_* dan seed lima status; 005 menambah audit.detail JSON. `USE hdwork2` eksplisit. Tidak ada CREATE DATABASE, DROP, perubahan users/tabel legacy, trigger atau auto-migrator. Tidak idempotent; berhenti saat struktur sudah ada. Jangan menjalankan file asli pada database disposable karena USE-nya tetap menunjuk hdwork2. Harness hanya menghapus directive USE yang persis cocok, lalu menjalankan DDL pada koneksi disposable terjaga. |
| Foreign key | Kolom UUID/status FK sama panjang dan ascii_bin. Urutan status → inbox/outbox → orders (self duplicate_of) → daily keys/audit benar. FK default RESTRICT; tidak ada cascade penghapusan riwayat. MySQL membuat indeks FK pendukung bila diperlukan. Rehearsal harus membuktikan FK aktif, bukan hanya memeriksa teks SQL. |
| Idempotency | Unique inbox(bot_id,update_id), outbox(bot_id,idem_key), order(bot_id,chat_id,message_id), daily key(bot,module,day,HMAC) membedakan update, pengiriman, pesan asli dan duplikasi bisnis. Angka Telegram disimpan string. Mengubah key/policy dedup memerlukan rencana data; jangan dilakukan sambil berjalan. |
| Indeks antrean | inbox_pending dan outbox_pending/expired mengikuti bot,state,due/lease,id. Pengurutan stabil dengan id. SKIP LOCKED menghindari row yang sedang dipegang tetapi bukan jaminan FIFO/fairness, tidak menghilangkan metadata/gap lock. |
| Indeks web | order_day diawali bot_id, sedangkan API web memfilter module/day tanpa bot. Tidak mengasumsikan indeks ini cukup: berpotensi scan/filesort. Usulan review EXPLAIN pada disposable: (module,created_at,id), (module,business_day,created_at,id), dan bila dibuktikan perlu varian status. Jangan menambah semua indeks tanpa ukur write cost. Pencarian `%term%` pada SC/INET tetap sulit memakai B-tree. Limit hasil/offset bukan batas biaya scan. Tidak menambahkan indeks/migrasi dalam batch ini. |
| Indeks audit | audit_order(order_id,created_at) membantu pembacaan riwayat. PK id menjadi bagian indeks sekunder InnoDB, membantu tie-break; tetap verifikasi EXPLAIN. |
| Transaksi | Perubahan order, daily reservation, audit, outbox dan penandaan inbox berada dalam satu transaksi. Handler tidak boleh memanggil Telegram/HTTP. Reader web menggunakan transaksi READ ONLY. Kegagalan handler rollback lalu pencatatan retry dalam transaksi terpisah; crash di antara keduanya dapat menyebabkan retry lebih awal, bukan exactly-once eksternal. |
| Lock/deadlock | Unique insert/upsert, gap locks pada REPEATABLE READ, daily reservation dan lock order dapat deadlock (1213) atau timeout (1205). Inbox mencoba ulang secara terbatas melalui due/attempts; claim/enqueue memerlukan caller retry. Jangan menonaktifkan deadlock detector, memperbesar timeout global atau mencoba ulang potongan transaksi secara terpisah. Kegagalan transaksi retry-record sendiri tetap harus dimonitor. |
| Timestamp/replication | DATETIME default UTC, business_day dari timestamp Telegram/WIB. UTC_TIMESTAMP adalah nondeterministik untuk statement-based replication; bila memakai replication/binlog, review format ROW dan versi sebelum migrasi. Mesin dan NTP harus benar. Tidak mengubah timezone/setting server. |
| Privasi/retensi | Inbox/outbox/audit.detail dapat memuat teks sensitif. DTO web aman bukan perlindungan backup/database. ACL, retention, kapasitas disk, backup terenkripsi dan audit akses wajib sebelum aktivasi. Tidak ada purge/redrive otomatis. |

Tidak ditemukan alasan untuk mengubah SQL operasional sekarang. **Aktivasi tetap tertahan** sampai DDL, hak akses, EXPLAIN dan kontensi diuji pada disposable, serta konfigurasi/pemetaan bisnis disetujui. Tidak ditemukan blocker yang mengharuskan penghentian pekerjaan persiapan lokal.

## Tes nyata yang disiapkan, belum dijalankan

`tests/integration/mysql-disposable.cjs` hanya dijalankan nanti dengan flag `--run-disposable` dan opt-in `HDWORK2_MYSQL_TEST_ENABLE=DISPOSABLE_ONLY`. Tanpa argumen CLI tidak membuka koneksi. Import modul inert.

Guard sebelum driver: host persis 127.0.0.1, port eksplisit selain 3306, nama persis pola `hdwork2_test_<16 hex lowercase>`, akun pola `hdwork2_test_*`, berbeda dari akun main/staging/courier, password test dari environment privat. Tidak membaca .env atau mengambil fallback credential DB utama. hdwork2, hd_b2c, database sistem dan nama legacy lain tidak lolos pola.

Guard setelah koneksi, sebelum DDL: DATABASE() harus persis target, versi MySQL 8.0.13+, SHOW GRANTS hanya USAGE global dan hak pada schema test persis, tidak ada role/global privilege/database lain/GRANT OPTION, serta schema benar-benar kosong termasuk views. Guard membaca partial_revokes: ketika OFF/tidak tersedia, underscore pada grant schema harus di-escape agar tidak menjadi wildcard; ketika ON, nama schema diperlakukan literal. Grant tidak diperluas atau diperbaiki otomatis. Akun harus dibuat DBA secara scoped pada instance disposable sendiri, bukan root/server operasional. Tidak ada CREATE/DROP database, cleanup otomatis, startup API/bot, atau akses Telegram dalam harness.

Harness menyiapkan pengujian DDL 004/005, penolakan FK invalid, persistensi/idempotency, kontensi dedup harian, workflow/audit/web reader, lease-expiry/retry/dead-letter, rollback, SKIP LOCKED dua sesi dan deadlock/lock timeout. Semua data sintetis. Output hanya nama check dan ok; error mentah, ID, pesan dan credential tidak dicetak. Jika gagal, DDL/data test mungkin tersisa: simpan bukti secara privat dan buang schema disposable hanya setelah review manual. Jangan mengulang pada schema berisi.

## Validasi lokal Batch 7

Tes mock memeriksa opt-in/guard sebelum import driver, grant/database/version/empty-schema guards, penutupan pool saat ditolak, transformasi DDL terbatas, konfigurasi proses inert, dan batas skrip preflight. Regresi Node/Python sebelumnya tetap diuji. Hasil akhir: 123 tes Node dan 9 tes Python lulus; pemeriksaan sintaks JS, XML disabled dan git diff --check lulus. Tidak menjalankan integration harness nyata.

PowerShell dan Task Scheduler tidak tersedia sebagai runtime Windows di cloud ini. Skrip diperiksa secara statis, XML diparse, konfigurasi PM2 dimuat dengan environment palsu; **belum diuji secara native di Windows 11**. Rehearsal native menjadi langkah manual pertama; tidak menyatakan PC kantor siap hanya dari tes mock.
