# Batch 9 — kesiapan MySQL untuk bot baru

Acuan a1a3a28f1eae055a359116719cdb09f52abd7536. Keputusan Batch 9 menggantikan kebutuhan impor/backfill bot lama pada Batch 8: **bot baru BotFather saja**, data baru dalam hdwork2 saja. Tidak ada integrasi/impor hd_b2c, Google Sheets, atau bot lama. Tidak ada deployment, worker, layanan aplikasi, ataupun migrasi pada database aktif yang dilakukan.

## Hasil audit migrasi

| Migrasi | Hasil |
|---|---|
| 004 | Enam tabel InnoDB, seed lima status, FK status/self-reference/order/audit, unique inbox update/outbox key/pesan order. MySQL minimum 8.0.13 karena expression default UTC_TIMESTAMP; tidak kompatibel secara otomatis dengan 5.7/MariaDB. |
| 005 | Menambahkan audit.detail JSON secara additive; tidak menghapus/menimpa riwayat. |
| 006 | Menambah command, duplicate_decision nullable, field JSON, teks asli, sender dan timestamp; tabel reservasi hd2_tial_keys dengan FK order. Tidak ada unique SC/IN pada orders sehingga setiap kiriman valid dapat disimpan. Tidak ada data update/destructive DDL. Komentar diperjelas untuk scope bot baru; tidak mengubah struktur 006 dari Batch 8. |

Ketiga file berisi USE hdwork2 dan tidak idempotent. Instalasi baru memerlukan schema hdwork2 yang dibuat DBA, backup dan review struktur sebelum 004 → 005 → 006. **Jangan menjalankan file utuh kembali jika sebagian tabel sudah ada.** DDL MySQL melakukan implicit commit; atomic DDL hanya per statement. Backup-restore dan penanganan partial DDL tetap wajib meskipun rehearsal disposable lulus.

Riwayat /order dimulai dari reservasi baru dalam hdwork2. Lookup fallback ke baris command=NULL dihapus; tidak ada import/backfill bot lama. Reservasi SC/IN HMAC dibuat dalam transaksi bersama row order/audit/inbox. Scope tanpa tanggal/grup dan tanpa pemisahan alias bot: ini sengaja satu instalasi bot baru; jangan mencampur bot lama/instalasi lain atau mengganti key secara diam-diam. Kehilangan/reset tabel keys bukan cara memulai ulang: pulihkan konsisten dari backup, jangan membuat canonical kedua. Legacy mode non-command tetap ada untuk kompatibilitas tes, tidak diaktifkan untuk deployment bot baru.

Canonical pertama yang berhasil dicatat tetap referensi, termasuk bila DONE. Pengiriman bersamaan tidak menjamin urutan global waktu pesan Telegram; unique reservation menentukan pemenang transaksi. /config_psb, /MO dan /req tidak memakai reservasi bisnis. Idempotency bot/update dan bot/chat/message terpisah dari duplicate bisnis. Raw text dan JSON/NIK disimpan terbatas; DTO web tidak membocorkannya.

## Pengujian nyata yang dilakukan di Codex Cloud

MySQL **8.0.46**, image resmi mysql:8.0 dengan digest `sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b`. Container sementara khusus Batch 9, limit RAM 1 GiB/CPU 1, datadir tmpfs, port **127.0.0.1:33079**, schema acak pola hdwork2_test_<16 hex>, akun scoped baru dan credential sementara di luar repo. Tidak terhubung PC kantor/Telegram. Container/tmpfs serta file credential dihapus setelah tes.

Harness opt-in melewati semua guard, menjalankan 004–006 pada schema test (directive USE hdwork2 dihapus secara terjaga), kemudian berhasil menguji:

- DDL, FK invalid ditolak, indeks pesan asli unik dan tidak ada unique SC/IN.
- Keempat command, field JSON/raw text/sender/timestamp, pengiriman berulang config_psb/mo/req tersimpan masing-masing.
- /order lintas dua grup dan beberapa tanggal, canonical DONE tetap dirujuk; semua duplicate disimpan.
- Retry event tidak menciptakan row kedua; transaksi paralel, SKIP LOCKED dan lock conflict/deadlock/timeout.
- Error yang diinjeksi setelah penulisan order/reservasi menyebabkan rollback, lalu retry sukses tanpa data ganda.
- Reader web setelah 006: command types, pagination, detail/previous status dan history, DTO tanpa raw text/sender/field sensitif.
- Lease expiry, retry, dead-letter, ACK idempotency dan pemulihan store Batch 4–8.

Skenario command menghasilkan 11 order sintetis setelah pemulihan fault. Probe EXPLAIN + satu halaman read sekitar **3,59 ms** pada sampel sangat kecil, bukan SLA atau load test. Query daftar module/date memilih **ALL / tanpa key**, estimasi 14 row; lookup key yang tidak ada dieliminasi optimizer. Jangan menyebut hasil ini bukti performa skala produksi.

**Indeks/performa:** indeks antrean dan FK sesuai query/constraint, tetapi order_day berawalan bot_id tidak cocok untuk semua query web module/date. Sebelum volume besar, uji data sintetis representatif (misalnya puluhan ribu row) dan review EXPLAIN/latensi; pertimbangkan indeks (module,created_at,id) serta (module,business_day,created_at,id) melalui migrasi tambahan yang direview. Tidak menambahkan indeks spekulatif atau mengubah kontrak paging sekarang. Substring LIKE tetap dapat scan; pagination membatasi hasil, bukan biaya scan.

## Menjalankan ulang pada lingkungan uji aman

Gunakan instance disposable sendiri pada localhost port selain 3306, datadir baru dan schema **kosong**, bukan database aktif dan bukan hdwork2/hd_b2c. Guard Batch 7 tetap melarang nama operasional, akun root/akun runtime, host selain 127.0.0.1, global/role/other-schema grants serta schema berisi. Escaping underscore dalam grant bergantung partial_revokes dan diperiksa sebelum DDL. Akun test hanya punya hak schema test; jangan menggunakan credential operator produksi.

Isi environment privat: HDWORK2_MYSQL_TEST_ENABLE=DISPOSABLE_ONLY, HDWORK2_MYSQL_TEST_HOST=127.0.0.1, HDWORK2_MYSQL_TEST_PORT, HDWORK2_MYSQL_TEST_DATABASE (namespace di atas), HDWORK2_MYSQL_TEST_USER (prefix hdwork2_test_), HDWORK2_MYSQL_TEST_PASSWORD. Jangan menaruh password di perintah, Git atau transcript.

```powershell
node .\tests\integration\mysql-disposable.cjs --run-disposable
```

Perintah tersebut hanya untuk schema disposable yang baru. Harness tidak CREATE/DROP database, tidak menjalankan API/server, dan tidak mengakses Telegram. Ia meninggalkan data test untuk inspeksi; jika gagal, jangan rerun pada schema parsial. Buang schema/container test hanya setelah nama terverifikasi dan simpan bukti yang sudah disanitasi. Credential/hak test tidak boleh digunakan saat aplikasi diluncurkan.

## Konfigurasi bot baru dan PC/server nanti

Contoh **placeholder, bukan konfigurasi aktif**:

- `ops/examples/new-bot-groups.json`: tiga grup biasa TIAL1, TIAL2, SOLVER1, semua threadId=null dan threadMode=non_topic. Isi chat_id terverifikasi sendiri; tidak ada ID sungguhan/hardcode operasional.
- `ops/examples/new-bot-workflow.json`: mapping Node cocok dengan Python; enabled=false. Ketiga grup menggunakan workspace TIAL dengan command type terpisah. dedupeBy lama diperlukan untuk kompatibilitas config tetapi /order command selalu memakai global SC/IN, bukan aturan daily lama.

| Konfigurasi | Isi privat yang perlu disiapkan |
|---|---|
| Main API | DB_HOST/PORT/USER/PASSWORD baru, **DB_NAME=hdwork2**, JWT_SECRET baru, FRONTEND_ORIGINS allowlist, PORT=3090 loopback. |
| Read web | B2C_WORKFLOW_READ_ENABLED=false sampai disetujui; B2C_COMMAND_SCHEMA_READY=false sampai 006 diverifikasi. Setelah persetujuan read-only, keduanya dapat disetel sesuai kesiapan. B2C_STAGING_ENABLED=false untuk scope bot baru. |
| Courier Node | COURIER_STORE=mysql, COURIER_DB_NAME=hdwork2, host/port/user/password dedicated baru, COURIER_BOT_ID alias baru, COURIER_SERVICE_KEY baru (>=32 byte), port internal 3091 loopback. COURIER_ENABLED=false. |
| Courier Python | Token dari **bot baru BotFather** disuplai privat melalui COURIER_TELEGRAM_BOT_TOKEN; COURIER_SERVER_URL loopback, alias/service key cocok, COURIER_COMMAND_GROUPS_JSON diisi dari template. COURIER_ENABLED=false dan COURIER_ALLOW_NETWORK=false. |
| Rejection journal | COURIER_REJECTION_DB absolut, di luar repo, direktori privat dengan ACL/retensi; satu proses pemilik. Jangan commit SQLite. |
| Workflow Node | identityKey privat konsisten, pemetaan grup/profile/actor terverifikasi. Tidak ada worker composition root yang otomatis dimulai oleh API. |
| Windows | Akun aplikasi baru, direktori log/backup privat, RAM/disk/port/NTP, supervisor terpisah dari PM2 bot lama; lihat runbook Batch 7. |

Jangan melakukan getMe/polling/webhook test atau memasukkan token lama pada Batch 9. Identitas akun web HD belum dipetakan dari sender Telegram; label HD sebelumnya tetap belum tersedia. Aksi PICK/CEK/RECEK/DONE/GAGAL dan keputusan duplicate tidak diaktifkan. Frontend/Preview tidak diubah; pagination dan refresh ~60 detik tetap.

## Backup, instalasi baru dan recovery

Sebelum migrasi aktif yang kelak disetujui: inventaris/version/grants → backup hdwork2 memakai akun/login-path baru dan output terenkripsi di luar repo → verifikasi exit/hash/ruang disk → uji restore di instance cleanroom → cek schema tidak parsial → DBA jalankan 004,005,006 manual → validasi FK/status/JSON/keys/grants → baru pertimbangkan read-only. Jangan dump/import hd_b2c atau bot lama. Backup harus konsisten mencakup inbox/outbox/orders/audit/daily/tial keys; jangan memulihkan keys secara terpisah. Jangan simpan data pelanggan di Git.

Rollback aplikasi dengan flag tetap false dapat membiarkan tabel additive; rollback DDL bukan ROLLBACK transaksi. Restore backup memerlukan persetujuan/RPO karena data setelah backup bisa hilang. Telegram delivery tetap at-least-once (ACK hilang dapat mengulang kiriman); rollback database tidak menarik pesan Telegram. Rejection journal memakai satu percobaan dan dapat kehilangan balasan saat kegagalan ambigu. Detail langkah backup/Windows ada pada batch7-windows11-runbook.md, dengan **006 ikut urutan migrasi sekarang dan tanpa impor legacy**.

004–006 bukan baseline tabel users/auth hdwork2. Instalasi baru masih membutuhkan desain/provisioning akun web dan schema autentikasi terpisah yang disetujui; jangan menyalin users/password bot lama. Uji disposable ini tidak menyatakan login PC kantor, recovery backup nyata, performa beban, Windows native atau bot Telegram sudah tervalidasi.

## Hasil regresi dan file

127 tes Node mock/guard, 13 tes Python dan 51 tes frontend lulus; frontend production build serta git diff --check lulus. Build masih memberi peringatan ukuran chunk legacy yang sudah ada; frontend tidak diubah. Test MySQL nyata dijalankan terpisah dari angka unit test tersebut. Tidak ditemukan secret pada diff.

Perubahan mencakup guard/harness disposable 004–006, exercise command MySQL, tes batas riwayat bot baru, penghapusan fallback canonical tak terklasifikasi, komentar scope 006, dua template konfigurasi tanpa token, dan dokumentasi. Guard produksi tetap fail-closed; tidak ada migrator otomatis atau aktivasi service.
