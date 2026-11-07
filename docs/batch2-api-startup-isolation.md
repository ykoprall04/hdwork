# Batch 2 — startup API-only dan isolasi MySQL

Basis branch chore/remove-cacti-hdwork2, commit b7a1f54. Perubahan lokal backend,
script npm, tes dan dokumen. Tidak menjalankan backend, MySQL, VPN, bot, PM2,
sinkronisasi atau migrasi; tidak mengubah .env, secret, frontend atau Cloudflare.
Belum commit/push/deploy.

## Audit entrypoint dan perintah

| Entrypoint/perintah | Perilaku | Keputusan |
| --- | --- | --- |
| root npm start / npm run dev | node server.js / nodemon server.js, app dan socket legacy; service Telegram dimuat transitif oleh controller order | Tetap persis, jangan dipakai untuk API-only |
| npm run start:api | node api-only-server.js | Baru, perintah eksplisit HD Work 2.0 API-only |
| api-only-server.js | HTTP loopback, auth dan staging; tanpa app/socket/worker/scheduler/bot/sync legacy | Validasi konfigurasi sebelum app/HTTP/driver/pool dimuat |
| local_agent npm start/dev | server agent lokal dan koneksi socket gateway | Tidak diubah atau dijalankan |
| frontend npm dev/build/preview | Vite frontend | Tidak diubah atau dijalankan pada Batch 2 |
| check-tial-staging-readonly.js --read-only-check | Diagnostic opt-in terpisah | Tidak diubah atau dijalankan; tidak menyalakan API/bot |
| generate-password.js | Utility password terpisah | Tidak diubah atau dijalankan |

Perintah untuk nanti, **bukan yang dijalankan pada pekerjaan ini**:

```powershell
Set-Location 'C:\Apps\hdwork2'
npm run start:api
```

Bila menggunakan PM2 nanti, target script tetap api-only-server.js dengan nama
proses baru dan cwd sendiri. Jangan restart/stop/save proses bot lama. Belum
menambahkan ecosystem config atau autostart Windows.

## Validasi fail-closed

src/config/api-only-startup.js adalah modul murni, tidak mengimpor driver MySQL.
Sebelum require app, startup memeriksa:

- DB_NAME **harus persis hdwork2**, bukan hd_b2c, nama legacy, kosong atau varian
  spasi/case. Tidak mengganti nilainya diam-diam.
- DB_HOST, DB_USER, DB_PASSWORD dan JWT_SECRET wajib nonblank. Tidak menyalin,
  mencetak atau menghasilkan secret. Panjang secret lama tidak diubah paksa;
  penggunaan secret berentropi tinggi tetap kewajiban konfigurasi operator.
- PORT valid 1–65535 (default 3090); DB_PORT valid (default 3306).
- Origin frontend tetap exact allowlist melalui validator CORS yang sudah ada.
- B2C_STAGING_ENABLED hanya absent/false/true. Selain true staging nonaktif.
- Jika true: konfigurasi host/user/password staging wajib lengkap, port valid,
  database staging fixed hd_b2c. Jika env B2C_STAGING_DB_NAME disediakan, nilainya
  hanya boleh hd_b2c; tidak mengganti database utama.
- Username staging harus berbeda dari DB_USER, bukan root/mysql.sys/mysql.session.
  Ini batas konfigurasi konservatif, bukan introspeksi privilege MySQL.

Konfigurasi buruk menghentikan CLI dengan exitCode 1 dan satu pesan generik,
tanpa nilai env, stack, host, token atau password. Listener tidak dibuat dan
pool tidak dimuat. Import entrypoint sendiri tetap inert. Listen error juga
melewati pesan generik. Health tetap liveness, bukan readiness/koneksi DB:
validasi ini tidak mengklaim database dapat dihubungi atau schema sudah lengkap.

## Isolasi staging

Main auth pool masih memakai src/config/database.js yang tidak diubah agar
legacy kompatibel. Batas nama hdwork2 ditegakkan pada entrypoint API-only baru.
Jangan memakai factory app langsung sebagai alternatif startup produksi tanpa
validasi ini; entrypoint yang didukung adalah api-only-server.js/start:api.

Staging menggunakan credential B2C_STAGING_DB_* dan pool terpisah, maksimum dua
koneksi, multipleStatements=false, dateStrings dan BIGINT strings. getPool kini
mengembalikan facade frozen yang hanya mengekspos execute; tidak mengekspos
pool/query/getConnection penulis. Semua konsumennya di repo hanya memakai execute.

Facade menolak statement non-SELECT dan query di luar bentuk tabel staging
adapter sebelum membuat pool. Query sah mengambil koneksi lalu:

1. START TRANSACTION READ ONLY.
2. connection.execute SELECT terparameterisasi.
3. ROLLBACK dan release dalam finally, termasuk bila begin/select/rollback gagal.

Read-only transaction mengikat koneksi yang sama; tidak menyalakan transaksi
read-write atau migrasi. Guard bentuk SQL bukan parser SQL lengkap atau pengganti
privilege database; input SQL hanya berasal dari reader server yang sudah
mengallowlist identifier dan binding filter, bukan string SQL dari request.
Akun staging **tetap wajib hanya GRANT SELECT pada hd_b2c.sheet_import_test**.
Tidak mengeksekusi GRANT, SHOW GRANTS, EXPLAIN atau query lain pada database nyata.

Diagnostic opt-in memiliki koneksi dan transaksi read-only sendiri, tidak
menggunakan facade pool ini. Menjalankannya memerlukan izin akses tersendiri.
Tidak ada perubahan parsing/DTO, query filter, frontend atau aturan bisnis order.

## Pengujian terisolasi

- Konfigurasi valid/invalid, main tidak dapat diarahkan ke hd_b2c atau legacy,
  port/secret wajib, staging enabled/disabled dan pemisahan akun/schema.
- Invalid startup menolak sebelum require app/HTTP/driver dan sebelum listen.
- CLI gagal config/listen mengembalikan status gagal tanpa mencetak secret dummy.
- Graph dependency aktual tetap menolak impor bot/polling/socket/worker/sync.
  Main pool mock memeriksa schema hdwork2; semua koneksi mock tanpa trafik DB.
- Facade staging lazy, execute-only, SQL SELECT, read-only transaction,
  rollback/release saat berhasil maupun gagal dan tidak membuat pool saat disabled.
- npm start legacy tetap node server.js; start:api eksplisit node api-only-server.js.
- Regresi autentikasi, hardening, adapter TIAL dan notifikasi order memakai mock.

## Risiko kompatibilitas dan tindak lanjut

- Instalasi API-only dengan DB_NAME berbeda atau konfigurasi wajib kosong kini
  sengaja gagal startup. Pengelola perlu meninjau konfigurasi sendiri; tidak ada
  file env diubah. Jangan memindahkan DB lama atau menamai ulang schema otomatis.
- Menolak username staging sama walau host berbeda adalah kebijakan konservatif;
  konfigurasi dengan username sama di dua server akan memerlukan akun terpisah
  atau keputusan desain berikutnya, bukan bypass diam-diam.
- Satu SELECT staging sekarang menambah begin/rollback round trip dan snapshot
  read-only. Beban/latensi serta dukungan transaksi pada versi/storage engine
  kantor belum diuji langsung. Tabel transactional (misalnya InnoDB) dan akun
  SELECT harus diverifikasi kemudian pada lingkungan yang disetujui.
- Konfigurasi tervalidasi bukan bukti koneksi, privilege atau schema sehat.
  Main shared pool legacy tetap tidak dipaksa hdwork2 bila memakai server.js.
- Tidak ada background job, retry koneksi otomatis baru, migrasi, bot baru atau
  perubahan workflow. Validasi HMAC dataset tetap ada di reader saat digunakan;
  startup ini memvalidasi isolasi DB, bukan seluruh kesiapan data TIAL.
