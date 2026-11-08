# Batch 13–15 — Telegram langsung sebagai sumber order

Pemeriksaan: 8 November 2026. Sumber yang ditetapkan pengguna adalah bot Telegram
kurir baru, bukan Google Sheets atau sistem operasional lama. Semua perubahan sesi
ini diuji dengan mock/fixture. Tidak ada koneksi atau penulisan ke database asli,
Telegram nyata, migrasi, perubahan grants, firewall, DNS atau tunnel aktif.
Global read-only dan environment privat yang aktif tidak diubah.

## Status

| Batch | Validasi aman | Aktivasi nyata |
| --- | --- | --- |
| 13 | PASS mock empat kategori; Node dan Python mendukung routing chat/topic | BLOCKED: identitas bot, allowlist dan secret baru belum tersedia/disahkan |
| 14 | PASS fixture pipeline, dashboard, status, retry dan concurrency | BLOCKED: akun baca/courier belum dibuat atau diverifikasi; izin tulis belum diberikan |
| 15 | PASS build dan persiapan origin/HTTPS; audit firewall parsial | BLOCKED: firewall, domain/Access, auth permanen, secret loader dan akun operasional |

Batch belum dinyatakan PASS end-to-end dengan data nyata. Informasi hd2_orders=0
berasal dari konfirmasi pengguna; tidak mengulang query database dengan akun yang
belum memiliki grants operasional.

## Batch 13: penerimaan empat kategori

| Kategori | Profil | Command | access_module |
| --- | --- | --- | --- |
| B2C | TIAL1/TIAL2, SOLVER1 sesuai allowlist | /order, /req, /config_psb, /MO | TIAL, REQ, LOGIC_PSB, LOGIC_MO |
| ASSUREN | ASSUREN | /assuren | ASSUREN |
| B2B | B2B | /b2b | B2B |
| REPLACEMENT | REPLACEMENT | /replacement | REPLACEMENT |

Format tiga kategori baru ditetapkan eksplisit dalam
contracts/workspace-commands.json: SC/IN, NO INET/TELP, STO, TRANSAKSI wajib;
KETERANGAN opsional. Alias NO INET/NO INTERNET/INET/TELP dan TIPE TRANSAKSI
dinormalisasi; field yang sama melalui alias berulang ditolak. SC/IN maksimal
100 karakter dengan grammar identifier, nomor harus berbentuk angka, STO dan
transaksi dibatasi. Mention harus menunjuk bot yang dikonfigurasi.
Parser B2C lama dipertahankan dan mendapat alias NO INET/TELP.
Format baru belum disahkan terhadap sampel pesan asli; diperlukan sampel yang
disanitasi sebelum menyatakan seluruh variasi lapangan didukung.

Node dan Python memakai spesifikasi workspace bersama. Pemetaan memakai pasangan
chat ID + topic ID; null hanya untuk non-topic. Topic berbeda dalam chat yang
sama dapat dipetakan ke kategori berbeda. Command lintas profil, topic tak dikenal,
mapping ganda dan edit pesan ditolak/diabaikan. Modul tidak diambil dari klaim
payload yang dapat diubah pengirim; ia berasal dari konfigurasi lokal allowlist.

Idempotency tetap mempertahankan model schema yang sudah ada:

- Replay update yang sama: satu inbox dan satu order. Payload berubah untuk ID
  update yang sama ditolak; identitas pesan unik bot/chat/message tetap berlaku.
- TIAL /order: kunci SC/IN HMAC sepanjang riwayat sesuai aturan lama, tidak diubah.
- Tiga kategori baru: memakai reservasi hd2_daily_keys, cakupan bot + module +
  business_day Jakarta + HMAC SC/IN. Ini memakai cakupan harian yang sudah tersedia,
  bukan menyatakan dedupe lintas hari atau lintas bot.
- Satu order kanonik menang. Pesan berbeda dengan referensi sama tetap dicatat
  sebagai riwayat DUPLICATE/duplicate_of sesuai model sebelumnya, bukan order
  kanonik kedua. Jika kebijakan yang diinginkan adalah dedupe seumur hidup untuk
  modul baru, kebijakan itu perlu disepakati sebelum aktivasi.
- Ordered inbox memproses received_seq; saat kegagalan sementara, pesan berikutnya
  tidak mendahului pesan pertama. Setelah batas retry DEAD, perlu review operator.
  "Pertama" berarti urutan penerimaan inbox, bukan jaminan timestamp paling awal
  jika pesan diterima di luar urutan.
- Balasan DONE/GAGAL Telegram tidak mengubah order pada mode webOnly. Reply ke
  pesan duplikat tidak pernah diarahkan menjadi update order kanonik.

HMAC, timestamp toleransi 60 detik, nonce/replay persistence, worker lease,
transaksi sebelum ACK, retry/backoff dan dead-letter memakai implementasi existing.
Tes regresi courier yang terdampak lulus. Jalur HTTP baru diuji dengan signature
sintetis hingga commit inbox fixture dan pemrosesan order empat kategori.
Tidak ada Telegram transport nyata dipanggil. Outbox reply sekarang mempertahankan
topic dan anchor pesan asli; otorisasi memeriksa command dan topic order asal.

Pengaman tambahan: composition root courier menolak startup bila
HDWORK2_LOCAL_READ_ONLY bukan false secara eksplisit, sebelum driver/socket/worker
dibuat. Nilai false hanya digunakan dalam object fixture tes; environment aktif
tetap true. Mengubahnya untuk runtime nyata memerlukan persetujuan terpisah.

Konfigurasi privat baru .local/courier.modules.plan.json diabaikan Git, semua
sakelar nonaktif, ID/secret null, dan sengaja belum valid untuk runtime.
scripts/prepare-courier-modules.js membuatnya hanya bila belum ada, tanpa menimpa
rencana lama. Token baru harus DPAPI, tidak diisi dalam JSON/env plaintext.
Courier memakai Telegram Bot API, bukan session akun pengguna/Telethon milik bot
lama. Journal dan lock khusus bot baru tetap diwajibkan di luar repo, dibedakan
fingerprint token. Loader DPAPI untuk token/HMAC/password courier ke runtime
Python/Node masih harus dirangkai dan diuji mock sebelum aktivasi nyata.

Dry-run yang dapat diulang bila format berubah:

    node scripts/courier-dry-run.js --dry-run ops/examples/courier-four-workspaces.fixture.json

Hasil sesi ini: accepted=4, rejected=0, SC/IN=4, INET=4, STO=4, transaksi=3;
networkUsed=false, databaseUsed=false, sentMessages=0.

## Batch 14: database dan dashboard

Tidak perlu migrasi ulang: command VARCHAR(16) dan module VARCHAR(32) dalam schema
yang sudah diterapkan cukup untuk command baru. Generated access_module memakai
ELSE module untuk command baru sehingga tidak salah dipetakan ke TIAL. Kolom
generated tidak di-INSERT. Tes membandingkan kolom payload dengan deklarasi schema
004/006/008 secara offline; kecocokan schema/index pada server tetap perlu audit
berizin. Tidak menjalankan SQL migrasi tersebut.

Penyimpanan: hd2_courier_inbox → hd2_orders + hd2_audit + hd2_live_events,
reservasi hd2_tial_keys/hd2_daily_keys. Dashboard list/detail/recap/export kini
mengenali command baru dan tetap memfilter access_module dari permission user.
Nomor NO INET/TELP disamarkan pada detail. Tidak mengubah desain Preview.
Role HD dengan modul sesuai dapat melakukan transisi; SUPER_ADMIN tidak otomatis
menjadi petugas eksekusi. Session aktif, CSRF, version lock dan request UUID tetap
diperiksa oleh jalur status web. Reply outbox mengikuti topic sumber.

Tes concurrency memakai SQL contract double dengan transaksi terserialisasi,
bukan membuktikan locking InnoDB nyata: concurrent PICK versi sama menghasilkan
satu sukses dan satu 409; request ulang tidak membuat audit/outbox tambahan;
DONE mengikuti PICK; penolakan duplikat hanya menyasar record duplikat.
Uji MySQL nyata terisolasi untuk tambahan perilaku ini masih dianjurkan sebelum
aktivasi produksi; suite MySQL lama tidak diulang.

SQL rekomendasi saja: ops/examples/hdwork2-operational-grants.review.sql.
Tidak ada CREATE USER atau password. Akun yang diusulkan:

- hdwork_ops_read: SELECT tabel operasional dan kolom identitas users yang dibutuhkan
  dashboard; tidak membaca password_hash, tidak mendapat hak tulis/auth.
- hdwork_courier: SELECT/INSERT orders; hak inbox/outbox/reservasi/worker sesuai
  query; INSERT audit/live events; SELECT/INSERT/DELETE nonce kedaluwarsa. Tidak
  punya akses users, sesi login, perubahan status order atau schema lain.

Pemeriksaan keberadaan order pada command-storage diubah dari FOR UPDATE menjadi
FOR SHARE karena tidak mengubah order lama. Ini menghindari kebutuhan UPDATE order
pada akun ingestion; reservation tetap dikunci FOR UPDATE dengan hak UPDATE pada
tabel kunci. Dasarnya aturan [locking reads MySQL 8.4](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).
Jangan menjalankan jalur status Telegram non-webOnly memakai akun ingestion ini.

Akun baca dashboard terpisah belum dipasang sebagai pool pada API. Runtime API
saat ini masih menggunakan akun auth dengan loader yang dibatasi hdwork_auth.
Pemisahan pool baca operasional dari auth harus diselesaikan sebelum dashboard
nyata dinyatakan siap. Status web tulis memerlukan akun/policy berizin tersendiri;
tidak memperluas hdwork_auth atau menonaktifkan read-only pada sesi ini.

## Batch 15: HTTPS publik dan firewall

Kode launcher sekarang siap menerima public origin tunggal yang eksplisit dan
disetujui melalui HDWORK2_PUBLIC_ORIGIN + HDWORK2_PUBLIC_ORIGIN_APPROVED=true,
harus sama persis dengan FRONTEND_ORIGINS. Default lokal tetap localhost:8443.
HTTP, IP literal, quick tunnel, placeholder .invalid, port nonstandar, path,
userinfo dan wildcard origin ditolak. HTTPS web menolak Host di luar allowlist
sebelum proxy/static; host publik dan probe localhost dapat dipisahkan dari SNI
sertifikat localhost. Tidak mengubah environment atau mengaktifkan origin publik.
Template review: ops/examples/hdwork2-public-web.environment.example.

Build frontend berhasil, masih artifact untuk environment localhost yang aktif.
Sebelum online perlu rebuild VITE_API_BASE_URL dengan hostname pengguna yang sah.
Tidak memakai domain contoh sebagai domain produksi.

Security review source: cookie __Host-hdwork2-session memakai Secure, HttpOnly,
Path=/, SameSite=None, max-age 8 jam; /me memeriksa sesi DB, logout mencabut sesi;
CSRF terikat sesi dan Origin pada mutasi, CORS allowlist HTTPS eksplisit dengan
credentials. SameSite=None tetap bergantung pada CSRF/Origin; perubahan menjadi
Lax pada deployment satu origin perlu review/test tersendiri, tidak diubah diam-diam.
Refresh halaman memverifikasi /me, bukan endpoint refresh-token baru.
Express trust proxy tetap false, header CF/XFF tidak dipercaya. Bucket rate limit
masih dapat menyatukan semua pengguna tunnel ke loopback; belum siap untuk beban
multiuser tanpa batas proxy/IP terpercaya yang diuji. Jangan set trust proxy=true
secara umum atau memalsukan Origin agar login lolos.

Firewall read-only: Domain/Private/Public aktif. Query profil berizin berhasil,
tetapi Get-NetFirewallPortFilter ActiveStore tetap Access denied meskipun sudah
meminta izin tool. Tidak dapat menyatakan aturan port 3306 aman. Netstat tetap
menunjukkan MySQL 0.0.0.0:3306; keterjangkauan dari internet belum terbukti atau
disangkal. Diperlukan audit administrator terhadap inbound allow/block, aturan
aplikasi/range/Any-port dan port forwarding router. Jangan mengganti binding
MySQL bersama secara sepihak karena bisa mengganggu sistem lama.
DevTools 9222 hanya loopback; 3090/3091/8443 tidak listening sebelum pengujian
fixture lokal. Proses existing tersebut tidak disentuh.

File tunnel privat Batch 12 dipertahankan tanpa perubahan; tidak membuat tunnel,
mengisi token, mengubah ingress remote atau DNS. Existing plan tetap menolak start
karena gate belum disahkan. TLS origin harus tetap diverifikasi dengan CA dan SNI
localhost, noTLSVerify=false; Cloudflare Access wajib dan default-deny. Lihat
[parameter origin resmi Cloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/).

Prosedur aktivasi PC Windows — hanya setelah persetujuan terpisah:

1. Verifikasi bot baru, format pesan, pemetaan chat/topic, grants aktual dan loader
   DPAPI dengan akun Windows pemiliknya. Pastikan tak ada secret di argv/log/Git.
2. Selesaikan pool baca dashboard, secret loader courier dan kebijakan login
   auth-only permanen. Gate validasi auth 15 menit bukan kebijakan layanan online.
3. Setujui write khusus ingestion secara terpisah dari web operasional. Uji bot
   pengujian receive-only/send=false, satu order baru, dashboard, replay dan ACK.
   Pertahankan modul admin/status web read-only sampai ada izin khusus.
4. Tinjau firewall/router dan domain milik pengguna. Tidak ada port inbound untuk
   MySQL/API/HTTPS origin/DevTools; tunnel cukup koneksi keluar. Jangan ganggu PM2.
5. Isi rencana privat dengan domain/Access/token DPAPI setelah approval; cocokkan
   ingress remote dengan preview, blokir internal/ready/legacy/DevTools dan catch-all.
6. Rebuild frontend untuk origin publik, jalankan origin hanya loopback melalui
   launcher privat yang sudah direview, verifikasi TLS/health/ready dan tes mock.
   node scripts/private-runtime.js local saat ini hanya mode observasi read-only,
   belum merupakan launcher produksi dengan login permanen/pool operasional.
7. node scripts/tunnel-control.js check harus lolos semua gate; minta persetujuan
   deployment/DNS/publikasi sebelum mode --approved-start dijalankan. Jangan jalankan
   mode start pada sesi ini. Supervisor hanya mengelola child tunnel milik proyek,
   restart terbatas dan log event tersanitasi; autostart/service belum diaktifkan.

Rollback berizin: hentikan hanya tunnel proyek melalui kontrol miliknya, matikan
poll/receive/worker/send courier baru, tutup proses origin proyek dan pengecualian
tulis yang disetujui. Pertahankan journal/inbox/backlog/state untuk audit dan
replay terkendali. Tidak menghapus order, menjalankan migrasi balik, menghentikan
MySQL bersama atau mengubah PM2/bot lama.

## Pengujian dan perubahan

Tes baru: 9 Node courier/workspace/schema/HTTP, 2 Node status/concurrency,
2 Node origin/Host/TLS, 3 Python parser/routing/topic reply: **16 PASS**.
Regresi terarah karena file terkait berubah: courier-integration (10),
operations (8), local-web (3), courier-dry-run (2): **23 PASS**.
Tidak menjalankan seluruh suite. Tidak menjalankan browser atau real login ulang.
Build frontend PASS dengan warning chunk legacy >500 kB. Audit aturan firewall
BLOCKED oleh izin Windows, bukan dianggap tes keamanan PASS.

Source yang diubah sesi ini:

- src/b2c-workflow/{commands,config,command-storage}.js
- src/courier/{groups,integration-config,dry-run}.js
- courier_bot/courier/{commands,groups}.py
- src/operations/{policy,read,mutate,export}.js
- local-web-server.js, src/local-web.js
- tests/helpers/courier-db.js, tests/courier-integration.test.js

File baru: contracts/workspace-commands.json, src/courier/workspace-command.js,
courier_bot/courier/workspace_command.py, src/config/web-origin.js,
scripts/prepare-courier-modules.js, ops/examples/courier-four-workspaces.fixture.json,
ops/examples/hdwork2-operational-grants.review.sql,
ops/examples/hdwork2-public-web.environment.example,
tests/courier-four-workspaces.test.js, tests/workspace-status-concurrency.test.js,
tests/public-origin-readiness.test.js, tests/helpers/courier_four_workspaces.py,
dan laporan ini. Rencana privat baru .local/courier.modules.plan.json diabaikan
Git. Perubahan lama dipertahankan; tidak ada commit/push/merge/deployment.

Minimum menuju data real: sahkan format dan bot/chat/topic baru, selesaikan loader
serta pool terpisah, siapkan akun sesuai SQL melalui administrator, lalu beri izin
ingestion terbatas dan uji receive-only. Sesudah data terlihat dengan permission
yang benar, selesaikan firewall/domain/auth permanen/proxy security dan minta
persetujuan publikasi. Jangan menganggap mock PASS sebagai izin aktivasi nyata.
