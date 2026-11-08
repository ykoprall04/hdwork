# Batch 10–12 — kesiapan data nyata, courier, dan tunnel

Tanggal pemeriksaan: 8 November 2026. Tidak ada deployment publik, perubahan DNS,
aktivasi Telegram, migrasi, perubahan grants, atau penulisan data aplikasi.
Global read-only tetap aktif. Hasil Batch 9 real auth tetap berlaku; login nyata
tidak diulang. Perubahan working tree lama dipertahankan; tidak ada commit.

## Status dan batas bukti

| Batch | Status | Bukti / batas |
| --- | --- | --- |
| 10 | BLOCKED untuk data nyata | Koneksi privat hdwork_auth berhasil; tidak punya SELECT tabel operasional. Inventaris schema aktual dan jumlah data tidak dapat disahkan. Adapter read-only baru diuji fixture, belum dihubungkan ke route produksi. |
| 11 | Persiapan dry-run lulus; aktivasi nyata BLOCKED | Empat format sintetis terurai tanpa transport, DB, atau pesan. Belum ada identitas bot baru, secret, kelompok yang diizinkan, serta akun DB courier terpisah. |
| 12 | Build/startup lokal dan pemeriksaan terarah lulus; online BLOCKED | cloudflared tersedia dan ingress valid offline; domain, akun, Access, kredensial, firewall dan kebijakan auth permanen belum siap. Tidak ada tunnel dijalankan. |

## Batch 10: sumber data dan schema

Audit memakai DPAPI dan akun hdwork_auth, hanya database hdwork2. SHOW GRANTS dan
information_schema.COLUMNS dibatasi ke schema hdwork2 serta nama tabel yang
diizinkan. Tidak membaca data atau metadata schema legacy. Akun tetap hanya
memiliki SELECT users/hd2_user_modules, SELECT INSERT UPDATE hd2_sessions, dan
INSERT hd2_security_audit. Tidak ada grants tambahan dibuat.

| Modul | Mapping access_module dalam kode | Sumber nyata yang terverifikasi |
| --- | --- | --- |
| B2C | TIAL, LOGIC_PSB, LOGIC_MO, REQ | Belum; tersedia jalur courier dan input web pada kode |
| ASSUREN | ASSUREN | Belum; tidak ada feed eksternal yang terverifikasi |
| B2B | B2B | Belum; tidak ada feed eksternal yang terverifikasi |
| REPLACEMENT | REPLACEMENT | Belum; tidak ada feed eksternal yang terverifikasi |

Semua modul memakai model bersama hd2_orders, bukan tabel khusus masing-masing.
Jumlah baris **tidak diketahui**, bukan nol. Tabel tidak terlihat bagi akun auth
tidak berarti tabel tidak ada. Report lokal: .local/data-inventory-X3Nr6d/report.json.

Tabel yang diinventarisasi: hd2_orders, hd2_order_statuses, hd2_audit,
hd2_daily_keys, hd2_tial_keys, hd2_web_requests, hd2_live_events,
hd2_courier_inbox, hd2_courier_outbox, hd2_courier_workers, hd2_courier_nonces.
Query dan mapping diperiksa terhadap source/migrasi yang sudah ada, tanpa
menjalankan migrasi. Kecocokan schema aktual belum dapat dibuktikan dengan akun ini.

Mapping kode: id internal, bot_id/chat_id/message_id/update_id untuk asal Telegram,
access_module untuk permission, status untuk lifecycle, business_day dan
telegram_timestamp untuk waktu, owner_user_id/final_user_id untuk petugas,
sc_in/inet untuk referensi, command_fields untuk STO/jenis transaksi.
Scope modul harus memakai access_module; field module mentah dapat berupa kategori grup.
Status operasional dikendalikan jalur web, bukan otomatis dipercaya dari teks Telegram.

Pencegahan duplikat yang tersedia di kode: bot/update untuk ingress,
bot/chat/message untuk identitas pesan, kunci HMAC SC/IN TIAL untuk duplikat bisnis,
dan user/request UUID untuk input web. Duplikat bisnis tetap menyimpan asal dan
duplicate_of. Unique index aktual belum bisa diperiksa dengan grants sekarang.
Tidak ada bukti sink eksternal aktif; flag courier lokal nonaktif dan port lokal
3091 tidak aktif saat pemeriksaan, tetapi ini tidak membuktikan semua sink eksternal tidak ada.

Adapter baru src/operations/real-data-adapter.js menggunakan pool injeksi,
memeriksa SELECT DATABASE()=hdwork2, dan menjalankan pembacaan dalam transaksi
READ ONLY. Hanya list, recap, people, detail; tidak ada API tulis. Fixture membuktikan
masking INET, pembatasan modul, serta pelepasan koneksi saat target ditolak.
Adapter sengaja belum diaktifkan pada route karena akses/schema/data nyata belum disahkan.

Tindakan berikut: sediakan akun baca operasional khusus atau jalur audit privat
yang disetujui, periksa schema/index/jumlah agregat, tetapkan pemilik dan asal data
setiap modul. Jangan memperluas akun autentikasi tanpa review pemisahan kewenangan.
Ingestion baru perlu persetujuan tulis tersendiri; tidak mengambil data legacy langsung.

## Batch 11: courier

Perintah aman yang sudah dijalankan: node scripts/courier-dry-run.js --dry-run.
Empat fixture sintetis /order, /req, /config_psb, /MO diterima; cakupan field
SC/IN=3, INET=1, STO=3, tipe transaksi=1. Pesan terkirim=0, jaringan=false, DB=false.
Tes baru memeriksa parsing, tidak membocorkan teks fixture, dan replay update.
Tidak mengklaim bahwa dry-run baru menguji ulang persistensi/idempotency bisnis.

Review source yang sudah ada:

- src/courier/auth.js: signature HMAC body/method/path, timestamp toleransi 60 detik,
  nonce; runtime-store.js menambahkan penyimpanan nonce dan worker lease.
- mysql-store.js: transaksi inbox sebelum ACK, antrean/outbox, lease, retry bertahap,
  batas percobaan/dead-letter dan ACK identik yang idempoten.
- courier_bot/courier/__main__.py memakai DurableCourier, lock polling, journal
  lokal tahan restart, worker lease, serta flag poll/send terpisah. Exception log
  berbentuk kode/pesan umum, bukan payload atau kredensial.
- Jalur helper legacy gate.py tidak dijadikan entrypoint produksi; review entrypoint
  wajib agar jalur penolakan pesan lama tidak mengirim balasan tak diinginkan.

Konfigurasi privat kosong: .local/courier.production.plan.json (diabaikan Git).
Semua sakelar network/poll/send/worker/receive/outbox tetap false. Ini **rencana**,
bukan environment aktif. Token, HMAC, dan fingerprint kunci harus diisi melalui
loader privat; loader DPAPI token courier ke runtime Python masih perlu integrasi.
Jangan mengisi token nyata dalam JSON atau .env plaintext.

Prasyarat: bot baru berbeda dari bot lama, username/bot ID, allowlist chat/topic,
HMAC dan kunci bisnis, akun DB courier dengan hak minimum terpisah, direktori
journal/lock privat di luar repo, library Python sesuai requirements, dan persetujuan
receive/write/send terpisah. Format nyata harus ditinjau dalam sampel tersanitasi.
Tidak ada session Telegram lama yang dibaca/dipakai; tidak ada risiko tabrakan
runtime saat ini karena courier tidak dijalankan.

Aktivasi terkendali setelah persetujuan: validasi konfigurasi privat dan mock;
uji receive pada bot/grup pengujian khusus dengan send=false; periksa inbox,
dedupe/ACK dan backlog; aktifkan worker terbatas; send hanya dengan persetujuan
khusus tujuan pesan. Rollback: matikan poll/send dan hanya proses courier milik
HD Work 2.0, biarkan journal/backlog tersimpan, jangan mengubah PM2 atau bot lama.

## Batch 12: tunnel dan keamanan

cloudflared 2026.10.7 tersedia di Program Files (x86). Direktori pengguna
.cloudflared kosong saat diperiksa; domain/kepemilikan akun/tunnel tidak diketahui.
Tidak mengambil domain dari contoh dokumentasi sebagai bukti kepemilikan.

node scripts/prepare-tunnel.js menyiapkan file privat tanpa menimpa file lama:
.local/cloudflare/plan.json, ingress.preview.yml, remote-run.yml. Review terbaru
di .local/cloudflare/ingress.review-v2.yml; preview pertama tetap dipertahankan.
Semua gate pada plan false; token kosong; tidak ada token atau tunnel dibuat.

node scripts/tunnel-control.js check hanya memeriksa plan offline dan saat ini
menghasilkan BLOCKED. Mode --approved-start **jangan dijalankan dalam sesi ini**.
Mode tersebut memerlukan domain/Access/ingress/firewall/data/grants/auth/build
yang disahkan, persetujuan publik berjangka, serta token DPAPI di .local.
Supervisor yang disiapkan membatasi restart maksimal dua kali, log hanya event
umum, metrics loopback, child env minimal dan token di memori/env child saja.
Stop melalui pipe privat hanya menyasar child milik supervisor; tidak memakai
taskkill global atau PM2. Token tidak diteruskan melalui argv/log/file plaintext.
Startup/shutdown cloudflared nyata belum diuji karena akan memerlukan akses eksternal.
Setelah STOP, file state dipertahankan untuk review; tidak otomatis menimpa state lama.

Ingress preview memakai origin https://127.0.0.1:8443, SNI localhost, CA privat,
noTLSVerify=false, Access wajib, dan catch-all 404. Path internal/ready/legacy/
preview/uploads/socket.io/json/devtools/metrics diblokir pada preview terbaru.
Remote-managed ingress harus dicocokkan di akun Cloudflare sebelum gate disahkan;
preview lokal tidak otomatis mengubah konfigurasi remote.

Blocker publik yang ditemukan:

1. local-web-server.js dan build sekarang memakai origin localhost:8443. Perlu
   dukungan hostname milik pengguna, CORS/origin/CSRF konsisten, serta rebuild
   frontend untuk origin publik sebelum deployment. Jangan mengganti Origin
   request publik menjadi localhost untuk melewati pemeriksaan.
2. Global read-only tetap memblokir login/logout tanpa gate uji. Gate 15 menit
   bukan kebijakan autentikasi layanan permanen. Perlu desain/approval auth-only
   permanen tanpa membuka penulisan admin/operasional.
3. Express trust proxy=false aman terhadap header IP palsu, tetapi seluruh pengguna
   tunnel berbagi bucket IP loopback (misalnya batas login). Perlu batas proxy
   terverifikasi dan kebijakan rate limit per pengguna/IP sebelum online; jangan
   mengaktifkan trust proxy=true secara umum.
4. MySQL 3306 mendengarkan di luar loopback. Belum terbukti terbuka ke internet,
   tetapi firewall Windows tidak dapat diverifikasi (Get-NetFirewallProfile gagal
   dengan CimException juga pada pemeriksaan berizin). Jangan online sebelum
   firewall/router memastikan 3306 tidak dapat diakses dari luar. Tidak ada
   binding, port forwarding, firewall, atau service yang diubah.
5. Akun runtime auth tidak cukup untuk readiness operasional. Supervisor meminta
   /ready scope operations sukses; tidak memalsukan PASS dengan health proses saja.
6. Belum ada domain/akun/Access/tunnel ID/token DPAPI yang disetujui. Jangan memakai
   quick tunnel atau domain pihak lain untuk melewati blocker ini.

Checklist online: konfirmasi domain dan akun; buat Access default-deny dengan
allowlist pengguna; pastikan origin/API hanya loopback dan tidak ada port forwarding
3306/3090/8443/DevTools; review firewall; pilih sumber data dan akun operasional;
review auth-only permanen dan proxy rate limit; perbaiki public origin lalu rebuild;
tes HTTPS/CSRF/permission/session secara terarah; simpan token terenkripsi; cocokkan
remote ingress dan Access audience; minta persetujuan DNS/tunnel/deployment.
Gunakan restart supervisor terbatas; service/autostart Windows memerlukan review
dan persetujuan terpisah. Rollback publik: hentikan hanya tunnel milik proyek,
tutup auth-write khusus dan origin milik proyek, pertahankan log/state untuk audit.

Rujukan primer konfigurasi:

- https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/
- https://developers.cloudflare.com/tunnel/troubleshooting/https-origins/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/

## Validasi sesi ini

- 12 tes baru lulus: operational-data-readiness (4), courier-dry-run (2),
  tunnel-plan (2), tunnel-api-security (2), private-tunnel-secret (2).
- Empat tes private-database-env yang relevan diulang karena loader memperoleh
  fungsi DPAPI tambahan; lulus. Tidak menjalankan seluruh test suite lama.
- Audit DB nyata read-only: koneksi berhasil; kebutuhan grants/data menghasilkan
  BLOCKED yang diharapkan, bukan kegagalan koneksi.
- Startup backend lokal: health 200, anonymous /me 401, login blocked 503,
  writes=false; proses uji ditutup. Tidak membuat session/audit baru.
- API security mock: GET sensitif 401, POST 503, foreign Origin 403,
  spoof CF-Connecting-IP/XFF tidak melewati rate limit; tidak mengimpor pool DB.
- Frontend production build berhasil; warning chunk legacy >500 kB (bukan error).
- cloudflared ingress validate offline: OK. Tidak menjalankan tunnel.
- Pemeriksaan sintaks dan git diff --check lulus.
- Pemeriksaan akhir netstat: 3090/3091/8443 tidak listening; DevTools 9222
  listening hanya pada 127.0.0.1. Proses tersebut tidak dibuat/dihentikan sesi ini;
  jangan publikasikan portnya. MySQL tetap listening 0.0.0.0:3306, sehingga
  verifikasi firewall merupakan blocker nyata, tanpa menyimpulkan akses internet.

Daftar source baru sesi ini: src/operations/{data-inventory,real-data-adapter}.js,
src/courier/dry-run.js, src/config/tunnel-plan.js,
scripts/{audit-operational-data,courier-dry-run,prepare-tunnel,tunnel-control}.js,
ops/examples/courier-dry-run.fixture.json, lima file tes di atas, dan dokumen ini.
src/config/private-database-env.js ditambah fungsi pembaca DPAPI privat generik.
File .local privat tidak masuk Git; build dist juga tidak ditambahkan ke Git.

Langkah minimum berikutnya adalah memberikan akses audit baca operasional khusus
yang disetujui dan menetapkan asal data setiap modul. Paralel secara administratif:
konfirmasi domain/akun Cloudflare milik pengguna dan review firewall. Online dengan
data nyata belum dapat dinyatakan aman/siap hari ini tanpa menyelesaikan blocker.
Persetujuan diperlukan untuk grants/credential baru, ingestion atau tulis nyata,
perubahan firewall/binding, kebijakan auth permanen, penggunaan Telegram nyata,
pembuatan tunnel/DNS/Access serta deployment. Tidak satu pun dilakukan sesi ini.
