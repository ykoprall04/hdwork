# Provisioning testing — menunggu konfirmasi akhir

SQL courier asli telah ditinjau. Review gabungan dua akun ada di
ops/examples/hdworkopsbot-testing-accounts.review.sql: 13 GRANT, hanya hdwork2,
hdwork_courier@localhost dan hdwork_ops_read@localhost. SHA256 review:
41fc6fb955cad487b9d69861999b49932a9058cfb0f58ae018a2fc54d38beeaa.
Tidak ada SQL/admin connection dijalankan pada tahap persiapan ini.

HMAC service dan identity key baru telah dibuat independen dengan RNG kriptografis
dan DPAPI akun Windows pemilik runtime. Pembacaan DPAPI nyata dan perbedaan kedua
key sudah diverifikasi tanpa mencetak nilai. Ciphertext existing tidak ditimpa.
Password courier/dashboard belum tersedia dan tidak dibuat otomatis.
Token @HDWorkOpsBot tetap dipertahankan. Ingestion/send tetap nonaktif.

## Perintah lokal

Administrator default root hanya untuk provisioning one-shot, bukan runtime.
Ganti AdminUser bila administrator lokal menggunakan nama lain. Password admin
melalui Read-Host -AsSecureString, diteruskan lewat anonymous stdin pipe, tidak
disimpan ke file/env/argv/log. Jangan kirim password melalui percakapan.

    Set-Location D:\HDWork2-New
    powershell -NoProfile -File scripts/provision-testing-accounts.ps1 -Mode Inspect -AdminUser root

Inspect hanya membaca metadata dua nama akun dan grants; tidak membaca password,
hash, tabel aplikasi atau akun legacy. Hasilnya menentukan apakah memasukkan
password existing atau memilih password untuk akun yang benar-benar baru.

    powershell -NoProfile -File scripts/setup-testing-secrets.ps1

Setup meminta password courier dan read melalui prompt tersembunyi jika file
belum ada. HMAC/identity existing dipertahankan. Password disimpan hanya DPAPI;
tidak membuat/mereset password MySQL pada tahap setup.

Perintah yang disiapkan untuk SETELAH konfirmasi SQL eksplisit pengguna (belum
dijalankan; sesuai poin 5 permintaan):

    powershell -NoProfile -File scripts/provision-testing-accounts.ps1 -Mode Apply -ConfirmProvision -AdminUser root

Helper meninjau ulang SQL, memastikan hdwork2 di localhost:3306, memeriksa hanya
dua akun target, menolak existing account locked/grants berbeda, dan memeriksa
log_raw sebelum mengirim password CREATE USER. Jika sudah ada dan sesuai,
password/grants/status tidak diubah; kredensial existing hanya diverifikasi.
Untuk akun yang belum ada: CREATE USER ACCOUNT LOCK, GRANT sesuai allowlist,
verifikasi, unlock akun yang dibuat pada run ini, lalu koneksi runtime non-root
dan SHOW GRANTS. Tidak ada DROP/REVOKE/reset password atau SQL schema/data aplikasi.
SQL literal password di-escape sesuai sql_mode, hanya berada dalam memori driver;
raw errors tidak dicetak. Setiap query dibatasi timeout 5 detik.

Account DDL bukan transaksi rollback aplikasi. Bila terjadi kegagalan parsial,
jangan mengulang Apply secara buta atau menghapus akun; jalankan Inspect dan
tinjau laporan tersanitasi. Existing accounts yang membutuhkan perubahan grants
akan dihentikan untuk review, tidak diperluas otomatis.

Verifikasi koneksi/grants/schema kedua akun tanpa menulis data:

    node scripts/check-testing-databases.js --read-only

Jika PASS, barulah minta persetujuan live ingestion satu order di chat -5436357946.
Persetujuan provisioning tidak mengaktifkan Telegram/API/dashboard atau reply.
Satu reply DONE tetap memerlukan verifikasi chat/message ID dan izin terpisah.

## Pemeriksaan persiapan

Review SQL, penolakan SQL di luar scope, gate konfirmasi dan mode Inspect tanpa
write lulus pemeriksaan guard terarah. Tidak mengulang suite mock lama. Sintaks
Node/PowerShell dan git diff --check PASS. Koneksi/grants nyata belum diverifikasi
karena dua password dan konfirmasi eksekusi belum tersedia.

Referensi [CREATE USER MySQL 8.4](https://dev.mysql.com/doc/refman/8.4/en/create-user.html)
dan [password rewriting pada log](https://dev.mysql.com/doc/refman/8.4/en/query-log.html).
