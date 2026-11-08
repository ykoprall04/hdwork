# Batch 7 — runbook Windows 11, belum diaktifkan

Tujuan: persiapan PC 8 GB/24 jam. Tidak ada perintah di bawah yang telah dijalankan pada PC kantor. Jangan mengaktifkan sekarang. Panduan ini menggantikan contoh startup `server.js` historis untuk HD Work 2.0: gunakan hanya **api-only-server.js**. Jangan mengubah bot/PM2/database lama.

## 1. Inventaris lokal tanpa koneksi

Setelah PC dapat diakses dan pemilik menyetujui pemeriksaan:

```powershell
Set-Location 'C:\Apps\hdwork2'
.\ops\windows\preflight.ps1
```

Default hanya membaca versi Node/Python/mysql client, RAM dan daftar port listen. Tidak membaca .env, proses command-line, tabel pelanggan, PM2 atau Task Scheduler. Tidak memulai service. Hasil JSON hanya metadata aman. Bila instalasi/policy membatasi inventory, field unavailable bukan bukti sehat. Jangan menonaktifkan ExecutionPolicy secara global untuk menjalankan skrip. Minta review signature/policy lokal.

Setelah koneksi lokal juga disetujui, `-CheckLocalTcp` hanya mencoba handshake TCP loopback pada port database, API 3090 dan kurir 3091, tanpa payload/API request. `-CheckMySqlMetadata` adalah opt-in terpisah: mysql client menggunakan login-path **baru** yang operator simpan privat dengan mysql_config_editor. Host dipaksa 127.0.0.1, database dipaksa hdwork2, query hanya VERSION()/DATABASE(). Tidak memakai akun/token bot lama atau password di CLI. Siapkan profile berprivilege minimum; jangan jalankan sebelum disetujui. Jangan membagikan profile login atau dump. DatabasePort dapat diubah secara eksplisit untuk instance lokal yang sudah diverifikasi; ini bukan pemindaian jaringan.

Rekomendasi runtime: Node 24 LTS yang disetujui dan Python 3.10+ venv terpisah; pastikan dependensi aktual/Windows wheel kompatibel. MySQL server 8.0.13+ harus dikonfirmasi lewat metadata/rehearsal, bukan versi client saja. Catat versi, ruang disk, free RAM, port konflik dan akun Windows khusus; jangan ambil secret ke chat.

## 2. Rehearsal MySQL disposable (nanti, bukan sekarang)

Utamakan komputer/VM uji terpisah bila PC 8 GB sedang sibuk. Pada mesin uji itu gunakan instance MySQL baru di **127.0.0.1:3307** dengan datadir terpisah, tanpa replication/link ke database lama. Jangan me-reconfigure instance lama supaya lolos guard.

DBA menyiapkan schema kosong unik `hdwork2_test_<16 hex>` dan akun test scoped hanya schema tersebut. Jangan beri global privilege, role, GRANT OPTION, atau akses hdwork2/hd_b2c. Akun butuh CREATE/ALTER/REFERENCES/INDEX/SELECT/INSERT/UPDATE pada schema test. DBA harus menyesuaikan escaping underscore dengan partial_revokes: OFF memerlukan underscore di-escape pada pola grant, ON memakai nama literal. Harness memeriksanya; jangan mengubah setting instance lama agar lolos. Nilai environment berikut dibuat privat pada sesi operator, bukan disimpan di repo/.env:

- HDWORK2_MYSQL_TEST_ENABLE = DISPOSABLE_ONLY
- HDWORK2_MYSQL_TEST_HOST = 127.0.0.1
- HDWORK2_MYSQL_TEST_PORT = 3307 (bukan 3306)
- HDWORK2_MYSQL_TEST_DATABASE = nama unik di atas
- HDWORK2_MYSQL_TEST_USER = hdwork2_test_runner (akun baru)
- HDWORK2_MYSQL_TEST_PASSWORD = password test yang disuplai secara privat

Jangan menyalin variabel DB_* operasional. Setelah target/izin/ketersediaan resource diverifikasi, perintah opt-in untuk **nanti**:

```powershell
node .\tests\integration\mysql-disposable.cjs --run-disposable
```

Baca hasil check tanpa mengunggah SQL/raw exception. Jika guard gagal, jangan melonggarkannya; gunakan instance/akun baru yang benar. Rehearsal tidak memanggil API web, bot atau worker otomatis; handler dipanggil eksplisit dengan data sintetis. Setelah selesai DBA menghapus schema test secara manual setelah verifikasi nama target; harness sengaja tidak menyediakan DROP/cleanup. Hapus variabel password test dari sesi, tutup sesi dan jangan simpan transcript yang berisi credential.

## 3. Model proses dan resource

Pilih **satu** supervisor API; jangan menjalankan PM2 dan task foreground sekaligus. Konfigurasi ini belum menginstal/mengaktifkan apa pun.

| Proses | Keputusan |
|---|---|
| Bot lama | Tidak disentuh. Pemadaman bertahap memerlukan inventaris dan persetujuan terpisah; jangan start/stop/restart all. |
| MySQL lama | Tidak disentuh. Tidak membuka port publik. Tidak menurunkan buffer pool atau mengubah setting karena perkiraan RAM saja. |
| API web baru | Satu proses api-only-server.js, loopback 3090, heap JS 192 MiB. Budget awal RSS sekitar 256 MiB, ukur aktual; heap bukan batas RSS total. Tidak cluster/watch. |
| Courier Python/Node | Proses terpisah secara arsitektur, **belum dimasukkan supervisor/diaktifkan**. Flag false. Tidak menjalankan polling/worker/sync. |
| Frontend | Build pada mesin pengembangan/CI; jangan menjalankan Vite/build berulang pada PC 8 GB untuk operasional. Tidak deploy pada batch ini. |

Sisakan minimum awal 2 GiB free RAM sebagai gate konservatif, cek paging/commit Windows dan workload bot/MySQL. Ini bukan jaminan kapasitas. Jangan menjalankan disposable instance bersamaan bila headroom tidak cukup. Ukur RSS/CPU/disk/latensi sebelum aktivasi bertahap; jangan menghentikan bot lama untuk memberi ruang tanpa persetujuan.

**Opsi PM2**: `ops/windows/ecosystem.hdwork2.config.cjs` inert, hanya satu aplikasi API, restart backoff 2 detik, 5 restart tidak stabil, memory restart 256M. Operator harus menyediakan PM2_HOME privat absolut dengan basename **hdwork2-pm2**, berbeda dari daemon bot lama, dan HDWORK2_LOG_DIR absolut dengan ACL khusus. File menolak home/path yang belum sesuai. Semua perintah PM2 kelak harus membawa PM2_HOME baru yang sama. Jangan menjalankan pm2 list/resurrect/save/startup dengan konteks daemon bot lama. Tidak perlu memasang/mengubah service PM2 lama. Template tidak memuat password/token; konfigurasi privat API/JWT dibuat baru pada checkout baru khusus aplikasi, DB_NAME wajib hdwork2. Flag read/staging/courier dipaksa false sehingga start supervisor bukan aktivasi integrasi. Review port/CORS/credential sebelum start.

PM2 di Windows tidak otomatis bertahan reboot. Autostart perlu task Windows **khusus konteks PM2_HOME baru**, setelah dipilih/disetujui, tidak memakai dump/resurrect bersama bot. Jangan menginstal global PM2 logrotate ke daemon lama. Konfigurasi contoh belum menyediakan instalasi autostart.

**Opsi Task Scheduler foreground**: `hdwork2-api.task.xml.example` disabled dengan akun placeholder, least privilege, delay boot 2 menit, IgnoreNew, tanpa time limit, restart kegagalan 1 menit maksimum 5 kali. `start-api-task.ps1` menolak start tanpa ApprovedStart dan path log/node yang disiapkan. XML harus direview/import secara manual, ganti akun/path, tinjau S4U (akses hanya resource lokal; tidak cocok bila membutuhkan EFS/network). Jangan menaruh password dalam XML. Jangan mengaktifkan task sekarang. Task Scheduler tidak memiliki restart berbasis RSS; heap flag bukan RSS limiter, sehingga observasi memori/alert wajib. PowerShell wrapper mencatat stdout/stderr ke file privat per peluncuran dan meneruskan exit code; tidak mencetak .env.

**Log**: gunakan direktori di luar repo dengan ACL akun aplikasi/admin, bukan folder publik/OneDrive. PM2 log dapat tumbuh tanpa batas; wrapper log dipilih saat start, bukan rotasi harian otomatis. Sebelum aktivasi, siapkan rotasi khusus HD Work 2.0 (misalnya batas 10 MiB/file dan retensi 7 hari sesuai kebijakan), alert disk dan pengujian rotasi; belum ada task penghapus yang dibuat. Log tidak boleh berisi payload/ID Telegram/credential. Hindari PM2 dump/describe/environment output ke chat karena tooling supervisor dapat menyimpan environment privat.

## 4. Backup dan migrasi manual (tahap persetujuan berikutnya)

1. Bekukan perubahan schema; inventaris table/view/trigger/schema dan bukti versi/config tanpa data pelanggan. Konfirmasi database tujuan hdwork2, bukan hd_b2c/legacy, dan tidak ada proses penulis baru aktif. Koordinasikan window hanya komponen baru; jangan hentikan bot lama.
2. Backup hdwork2 memakai akun backup baru, login-path privat dan MySQL dump client yang kompatibel. Gunakan single-transaction/quick untuk InnoDB serta hindari table lock; DDL bersamaan tetap dapat merusak konsistensi. Sertakan objek tambahan bila inventaris membuktikan ada dan haknya sudah disetujui. Jangan mengubah GTID/replication setting server. Simpan dump ke direktori backup terenkripsi/ACL di luar repo, verifikasi exit code, ukuran/hash dan ruang disk. Dump users dapat berisi password hash: jangan upload/commit. Opsi/cakupan backup harus direview DBA, bukan ditebak dari enam tabel baru saja.
3. **Uji restore** backup pada instance disposable/cleanroom dengan kredensial dan target sendiri; jangan restore ke kantor sebagai percobaan. Pastikan backup benar-benar bisa dipulihkan. Jangan memakai harness test pada schema restore yang berisi; harness khusus schema kosong.
4. Pastikan rehearsal 004/005 lulus; review EXPLAIN/index/resource/FK. Verifikasi struktur hdwork2 yang sudah ada: jika ada salah satu hd2_* jangan jalankan file utuh; evaluasi partial migration dahulu. Tidak ada migrator otomatis/schema-version runner.
5. Setelah persetujuan terpisah, DBA menjalankan SQL 004 lalu 005 secara manual hanya pada target terverifikasi dengan akun migrasi sementara, tidak akun reader/runtime. Catat checksum file, statement sukses, waktu dan hasil SHOW CREATE secara privat. Jangan mematikan FOREIGN_KEY_CHECKS, menambahkan IF NOT EXISTS atau mengabaikan error agar file terus berjalan.
6. Validasi struktur, seed lima status, FK, indeks, engine, kolom audit.detail dan hak akses runtime. Bandingkan baseline account/auth di database hdwork2; SQL ini bukan baseline lengkap users/login. Uji API/auth dengan scope yang disetujui; jangan mengaktifkan workflow/Telegram sebagai bagian validasi DDL.
7. Revoke privilege migrasi setelah DBA review. Baru pertimbangkan aktivasi read-only secara terpisah; jangan otomatis mengubah flag. Courier/worker/sync/PICK/DONE tetap tidak aktif sampai gate masing-masing disetujui.

## 5. Rollback dan pemulihan

MySQL 8 atomic DDL berlaku **per statement**, bukan seluruh file. CREATE/ALTER melakukan implicit commit; BEGIN/ROLLBACK tidak mengembalikan enam CREATE dan ALTER yang sudah sukses. Kegagalan di tengah file meninggalkan hasil sebagian. Jangan mengulang seluruh file atau DROP tabel sebagai "rollback".

Rollback aplikasi paling aman untuk perubahan additive: hentikan hanya proses API baru lewat supervisor yang dipilih, pastikan flag integrasi false, kembalikan kode ke SHA acuan yang telah disetujui dan **biarkan tabel/riwayat**. Jangan rollback schema kalau data baru sudah masuk. Jika harus memulihkan database, gunakan backup yang telah diuji, target terverifikasi, window dan persetujuan DBA; tentukan kehilangan data/RPO terlebih dahulu. Restore dump dapat menghapus data setelah backup; bukan langkah otomatis.

Bila kelak worker diaktifkan, hentikan hanya komponen baru setelah identifikasi lease/in-flight. Lease kedaluwarsa dipulihkan oleh caller claim berikutnya, bukan API read-only. Jangan requeue SENT/DEAD tanpa review. Telegram send berhasil dengan ACK hilang bisa terulang; rollback DB tidak menarik pesan yang sudah terkirim. Simpan bukti privat, jangan mencoba mengaktifkan bot lama dan baru bersamaan sebagai solusi rollback.

## 6. Monitoring dan urutan manual berikutnya

Monitoring awal: restart count/RSS/CPU; free RAM/paging; disk log/backup; health loopback API; auth 401/403/429/503 agregat tanpa token; koneksi/latensi/lock wait/deadlock MySQL; jumlah/umur PENDING, expired lease, DEAD dan backlog outbox; umur backup/hasil restore; sinkronisasi waktu Windows. Pada fase nonaktif, antrean tidak boleh dianggap akan terkirim otomatis. Alert/backlog thresholds disepakati dari baseline, bukan angka operasional palsu. Tidak ada exporter, polling atau scheduler yang dipasang batch ini.

Urutan di kantor: review file → preflight tanpa koneksi → review resource/akun/path → rehearsal PowerShell native dan instance disposable → review hasil MySQL/EXPLAIN/backup-restore → persetujuan migrasi → validasi schema/auth → persetujuan supervisor/read-only. Aktivasi courier, penghentian bot lama, Tunnel dan deployment adalah keputusan tahap lain. Jika versi/schema/grants/resource tidak sesuai, berhenti; jangan melonggarkan guard.
