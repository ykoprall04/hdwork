# Batch 16–18 — secret, pool, permission dan receive-only

Tanggal: 8 November 2026. Dokumen ini memperbarui blocker teknis Batch 13–15,
tanpa menghapus laporan atau working tree sebelumnya. Tidak ada CREATE USER,
GRANT, perubahan schema, migrasi, penulisan data aplikasi nyata, aktivasi Telegram,
perubahan firewall/DNS/tunnel, commit, push, merge atau deployment pada sesi ini.
Tidak mengakses database legacy atau mengubah PM2/bot lama.

## Status

| Batch | Implementasi/persiapan | Aktivasi nyata |
| --- | --- | --- |
| 16 | PASS mock: loader DPAPI courier, pemisahan pool, wiring route, startup identity/grants | BLOCKED: ciphertext/akun operasional belum tersedia atau belum diverifikasi |
| 17 | PASS review/tes: SQL minimum dan prosedur provisioning disiapkan | Menunggu persetujuan administrator untuk CREATE USER/GRANT; tidak dijalankan |
| 18 | PASS mock receive-only dan audit network parsial | BLOCKED: identitas bot/izin ingestion/network, firewall exceptions/router, domain/Access/auth permanen |

Ini bukan PASS dengan order Telegram nyata. Jumlah hd2_orders=0 memakai informasi
pengguna; tidak membaca ulang order, membuat session atau melakukan login nyata.

## Batch 16: pemisahan koneksi dan secret

| Fungsi | Akun | Jalur |
| --- | --- | --- |
| Auth/login/session | hdwork_auth | src/config/database.js, hak auth lama tetap |
| Dashboard/detail/recap/people/SSE/export | hdwork_ops_read | operational-pools.getReadPool |
| Input/status web (opsional) | hdwork_ops_write | operational-pools.getWritePool |
| Ingestion courier receive-only | hdwork_courier | pool proses courier terpisah |

Pool tulis dibagi lagi antara web dan courier agar bot tidak mendapat hak ubah
order/user/session. Tidak ada fallback operasional ke akun auth. Semua akun runtime
root/internal MySQL ditolak; pool operasional hanya menerima identitas yang
ditentukan, database hdwork2 dan 127.0.0.1:3306. Pool kecil (dua koneksi), antrean
terbatas dan multipleStatements=false.

Startup pool baca/tulis memeriksa DATABASE(), CURRENT_USER() dan SHOW GRANTS.
Grants global/schema, akses schema lain, role tak dikenal, GRANT OPTION, SELECT
password_hash operasional atau hak berlebih ditolak. Kegagalan menutup pool yang
sudah dibuat. Pool baca juga menolak SQL tulis sebelum driver dipanggil. Pool tulis
memerlukan OP_WRITE_ENABLED=true, global read-only=false dan
HDWORK2_OPERATIONAL_WRITE_APPROVED=true; akses ditolak kembali jika read-only
kembali aktif, termasuk koneksi yang sudah diperoleh. Rollback tetap diizinkan.
Tidak mengaktifkan nilai tersebut pada konfigurasi nyata.

Readiness kini memeriksa auth dengan pool auth dan metadata operasional dengan
pool baca. Akun baca tidak memerlukan password_hash atau tabel session/audit auth.
/ready gagal tertutup bila pool/schema belum siap; health proses saja bukan bukti
kesiapan database. Launcher private-runtime memuat rencana nonsecret, memeriksa
pool baca sebelum membuka runtime operasional, lalu menutup pool miliknya saat stop.
Mode auth-only tetap dapat dipisahkan dari operasi.

Loader baru src/config/private-courier-env.js memakai pembaca DPAPI existing:

- Secret hanya di .local/courier-secrets/*.dpapi, empat file berbeda, tidak memakai
  file/session Telegram lama. Pembaca existing memeriksa realpath/symlink dan batas
  ukuran sebelum DPAPI didekripsi lewat pipe privat, tanpa stdout plaintext.
- Backend menerima password DB courier, HMAC service dan kunci identity/dedupe;
  tidak menerima token Telegram.
- Python menerima token bot baru dan HMAC; tidak menerima password DB atau kunci
  bisnis. Child env hanya whitelist OS dan konfigurasi courier, bukan env auth.
- Konfigurasi privat berisi path/flag/ID, tidak berisi nilai token/password.
  Secret tidak dimasukkan ke argv, JSON laporan, Git atau log. String runtime
  diperlukan di memori driver/klien; referensi env dibersihkan setelah handoff.
- Script store-private-secret.ps1 menyediakan Read-Host -AsSecureString dan DPAPI
  akun Windows yang sama. Tidak dijalankan untuk mengambil input dalam sesi ini;
  tidak membuat password baru otomatis dan tidak menimpa ciphertext existing.

Rencana baru diabaikan Git dan nonaktif:

- .local/database-pools.plan.json: read/write enabled=false. Bagian auth bersifat
  informasi; auth tetap memakai .env privat dan DPAPI yang sudah ada.
- .local/courier.receive-only.plan.json: enabled/approval=false, send=false,
  bot/chat/topic kosong. Rencana Batch 12–15 tidak ditimpa.

applyPrivatePoolPlan hanya menerapkan pengaturan nonsecret untuk entri enabled;
konflik dengan env ditolak. Setelah akun/ciphertext tersedia, aktivasi read pool
perlu konfigurasi rencana yang disetujui; tidak mengubah global read-only. Write
pool tetap opsional/nonaktif. Lihat ops/examples/hdwork2-pools.environment.example.

Pemeriksaan ketersediaan file saat ini (tanpa dekripsi secret baru): auth DPAPI
tersedia dan tidak kosong; enam file baru belum ada: password read/write,
password DB courier, token baru, service HMAC dan identity key.

## Batch 17: grants minimum dan prosedur aman

SQL rekomendasi yang diperbarui:
ops/examples/hdwork2-operational-grants.review.sql. Template CREATE USER yang
seluruhnya dikomentari: ops/examples/hdwork2-create-users.review.sql.
Tidak ada SQL provisioning dieksekusi atau password ditulis ke file SQL.

Hak receive-only minimum:

| Akun | Tabel dan privilege |
| --- | --- |
| hdwork_ops_read | SELECT hd2_orders, hd2_audit, hd2_live_events, hd2_user_modules; SELECT kolom id/name/role/is_active pada users |
| hdwork_courier | SELECT+INSERT hd2_orders; SELECT+INSERT+UPDATE inbox/daily_keys/tial_keys/workers; INSERT audit/live_events; SELECT+INSERT+DELETE nonces |
| hdwork_ops_write (opsional) | SELECT kolom identitas users/modules/sessions; SELECT+INSERT orders; UPDATE delapan kolom status/owner/version; INSERT audit/live_events; SELECT+INSERT+UPDATE web_requests; SELECT+INSERT outbox dan UPDATE(id) saja |

Semua nama tabel tersebut berawalan hd2_ kecuali users; SQL lengkap berisi nama
eksplisit. Akun courier receive-only **tidak mendapat hak outbox**, user, session,
atau UPDATE order. Future courierSend policy terpisah menambahkan hak outbox dan
memerlukan persetujuan send; bukan konfigurasi yang digunakan runner baru.
Hak SELECT dictionary status dihapus dari rekomendasi read karena tidak digunakan
query dashboard. Tidak ada hak DDL, global, EXECUTE, GRANT OPTION atau akses legacy.

Dua koreksi penting berdasarkan query:

1. create order web sebelumnya mengunci users FOR UPDATE. Kini FOR SHARE, sehingga
   tidak perlu memberikan UPDATE users. Race request ditangani unique user/request
   dan rollback; duplicate/deadlock menghasilkan 409 agar requestId yang sama
   dapat dicoba ulang, bukan membuat order kedua.
2. Upsert outbox memakai id=id. Akun web write memerlukan UPDATE khusus kolom id,
   walaupun retry idempoten; hak UPDATE seluruh outbox tidak diberikan.

Prosedur administrator setelah persetujuan:

1. Periksa keberadaan nama akun yang dituju dan schema hdwork2, tanpa membaca
   password/hash; jangan reset atau mengubah akun existing secara otomatis.
2. Buat hanya akun yang disetujui dengan host localhost, caching_sha2_password,
   password dari input lokal tersembunyi dan ACCOUNT LOCK. Jangan menyalin password
   ke file SQL, command line, history, transcript atau percakapan Codex. Placeholder
   template sengaja bukan SQL yang langsung dapat dijalankan. Gunakan tool admin
   lokal yang menjaga input/riwayat secret dan tinjau logging-nya.
3. Terapkan hanya bagian GRANT untuk akun yang disetujui. Untuk receive-only tahap
   awal cukup akun read dan courier; akun web write boleh ditunda. Akun auth dan
   SUPER_ADMIN tidak diubah. Jangan memakai account admin sebagai runtime.
4. Verifikasi SHOW GRANTS sesuai allowlist dan unlock hanya akun yang disetujui
   untuk pengujian. Account-management tidak memerlukan FLUSH PRIVILEGES; jangan
   memanipulasi mysql.user secara langsung.
5. Simpan password existing yang baru disiapkan dan secret bot baru melalui prompt
   lokal tersembunyi ke DPAPI akun Windows pemilik runtime. Contoh perintah manual:

       powershell -NoProfile -File scripts/store-private-secret.ps1 -Name ops-read-password

   Nama lain yang diizinkan: ops-write-password, courier-db-password,
   courier-token, courier-service-key, courier-identity-key. Jangan jalankan ini
   melalui percakapan untuk mengirim password. Jangan memulai runner live dahulu.
6. Setelah tersedia, jalankan pemeriksaan koneksi/grants read-only yang disetujui;
   ulangi tes fitur baru pada instance disposable jika perlu. Grants column-level
   serta locking InnoDB belum diuji dengan akun nyata baru; fixture bukan bukti
   validasi privilege server. Jangan aktivasi ingestion sebelum pemeriksaan lolos.

Rujukan primer [CREATE USER](https://dev.mysql.com/doc/refman/8.4/en/create-user.html)
dan [GRANT](https://dev.mysql.com/doc/refman/8.4/en/grant.html).

## Batch 18: receive-only dan network

scripts/private-courier.js --check hanya memeriksa plan; hasil saat ini BLOCKED,
started=false, karena plan belum lengkap/disetujui. Tidak mendekripsi atau
menghubungi Telegram. Mode live disiapkan tetapi **tidak dijalankan**:

    node scripts/private-courier.js --run-backend-receive-only
    node scripts/private-courier.js --run-python-receive-only

Mode live memerlukan HDWORK2_COURIER_RUN_APPROVED=true, persetujuan network dan
ingestion spesifik dalam plan, konfirmasi bot baru, serta expiry maksimal 15 menit.
Backend mendapat pengecualian tulis hanya pada env proses courier yang terisolasi,
bukan mengubah .env atau read-only API web. Jangan menyetel approval/readonly
untuk mengakali prasyarat; perlu persetujuan pengguna berikutnya.

Mode receive-only memaksa receive/worker aktif pada backend, outbox=false;
Python poll=true/send=false. JSON ACK adalah receipt HTTP internal menuju courier,
bukan balasan pesan Telegram. Polling Bot API memakai getUpdates dan offset untuk
penerimaan; tidak ada sendMessage atau ACK chat. Tes runner/journal asli dengan
transport fake membuktikan nol send, claim, settle/outbox ACK walau ada retry.

Session Bot API memakai token bot baru; tidak memakai session akun Telegram lama.
Journal/lock di luar repo dibedakan fingerprint token dan bot ID. Stop Python
melalui stdin STOP/EOF; forced termination hanya child sendiri setelah 15 detik
bila tak berhenti. Backend stop hanya app miliknya, menunggu worker lalu pool.
Timer expiry menjadwalkan penghentian; koneksi/pekerjaan yang sudah berjalan
ditangani cleanup. Tidak ada taskkill global, service atau PM2 yang diubah.
Lifecycle live ini baru diuji dengan mock, belum dengan proses Telegram nyata.

HMAC/timestamp/replay/worker lease tetap digunakan. Startup backend sekarang
memverifikasi identitas/grants sebelum listener dan worker, sehingga akun salah
atau hak berlebih/kurang ditolak sebelum ingestion. Routing empat kategori dengan
chat/topic, FIFO retry dan dedupe tetap lulus pada fixture/journal terisolasi.

Audit network nyata yang dijalankan:

    node scripts/audit-mysql-network.js --read-only

Memakai hdwork_auth + DPAPI, memeriksa DATABASE/CURRENT_USER/@@bind_address/@@port,
tanpa membaca tabel aplikasi. Hasil: target hdwork2/hdwork_auth benar, port 3306,
bindLoopbackOnly=false, writesPerformed=false. Tidak mengubah konfigurasi MySQL.
netsh advfirewall show allprofiles menunjukkan ketiga profil ON dan kebijakan
BlockInbound,AllowOutbound. Pengecualian allow/app/range/Any-port serta router/NAT
belum diverifikasi; default block tidak membuktikan port 3306 aman dari internet.
Audit PowerShell aturan port sebelumnya ditolak Windows; tidak mengulangnya tanpa
alasan perubahan akses. Tidak ada bukti baru keterjangkauan internet yang diuji.

Rekomendasi (jangan diterapkan tanpa persetujuan): audit dependensi MySQL bersama;
jika seluruh kebutuhan lokal, usulkan bind loopback. Bila ada kebutuhan LAN yang
sah, batasi sumber yang diizinkan secara spesifik; jangan membuka 3306 ke internet.
Periksa pengecualian Windows Firewall dan port forwarding router. Jangan restart
server MySQL atau mengganti binding sepihak karena dapat mengganggu sistem lama.
Cloudflare Tunnel tidak memerlukan publikasi port MySQL.

Rencana Cloudflare privat dipertahankan; tunnel-control check tetap BLOCKED dan
publicStarted=false. Belum ada domain/akun/Access audience/token tunnel disahkan.
Checklist Access/ingress/TLS/rollback disiapkan di
ops/examples/cloudflare-access.activation-checklist.md. Origin harus loopback,
CA/SNI localhost diverifikasi, noTLSVerify=false, Access default-deny/allowlist/MFA,
internal courier dan DevTools diblokir. Tidak ada tunnel/DNS/Access resource dibuat.
Lihat [HTTPS origin Cloudflare](https://developers.cloudflare.com/tunnel/troubleshooting/https-origins/).

## Tes dan file

Hasil akhir: **19 tes baru PASS, 0 FAIL tersisa**:

- private-integration-pools: 5 (pool/identity/grants/guards/readiness).
- private-courier-secrets: 4 (scope secret, mode, rejection/redaction).
- operational-pool-routing: 2 (HTTP route wiring dan root/identity rejection).
- operational-grant-review: 2 (SQL/column/profile dan unsafe grants).
- private-courier-runner: 4 (approval, env, cleanup dan startup fail-before-listen).
- Python courier_receive_only: 2 (empat kategori, no-send, FIFO retry/dedupe).

Tiga kegagalan awal pada fixture pool diperbaiki: mock mengira SHOW GRANTS FOR
CURRENT_USER sebagai query SELECT CURRENT_USER. Setelah pembeda diperbaiki,
semua tes pool lulus; tidak ada perubahan database untuk mengatasinya.
Regresi terarah: 10 courier-integration, 1 private-runtime-startup,
2 workspace-create-mock dan 2 kasus reviewer auth: **15 PASS**.
Sintaks Node, Python dan PowerShell serta git diff --check PASS. Pemeriksaan akhir
tidak menemukan listener uji di 3090/3091/8443. Listener DevTools existing tetap
loopback dan tidak disentuh; MySQL bersama tetap pada binding sebelumnya.
Tidak menjalankan seluruh suite, browser, login nyata, atau build frontend ulang
karena frontend tidak diubah. Hasil build sebelumnya dipertahankan.

File baru sesi ini:

- src/config/{operational-grants,operational-pools,private-pool-plan,private-courier-env}.js
- scripts/{private-courier,prepare-private-integration,audit-mysql-network}.js
- scripts/store-private-secret.ps1
- ops/examples/{hdwork2-create-users.review.sql,hdwork2-pools.environment.example,cloudflare-access.activation-checklist.md}
- tests/{private-integration-pools,private-courier-secrets,operational-pool-routing,operational-grant-review,private-courier-runner}.test.js
- tests/helpers/courier_receive_only.py dan dokumen ini.

File existing yang ditambah/diperbaiki:
src/config/database.js, src/config/local-database-check.js, src/access/database-audit.js,
src/operations/{routes,create}.js, src/api-only-app.js, local-web-server.js,
scripts/private-runtime.js, courier-b2c-server.js, courier_bot/courier/__main__.py,
ops/examples/hdwork2-operational-grants.review.sql,
tests/{courier-integration,private-runtime-startup}.test.js.
File privat baru: .local/database-pools.plan.json dan
.local/courier.receive-only.plan.json, keduanya nonsecret dan diabaikan Git.

## Langkah minimum menuju real data / online

Pertama, setujui provisioning akun read dan courier serta input DPAPI lokal untuk
secret baru, lalu verifikasi koneksi/grants tanpa tulis. Setelah itu konfirmasi
bot/chat/topic dan berikan persetujuan ingestion receive-only terpisah untuk satu
uji terkontrol, dengan send tetap false dan web tetap read-only. Pastikan order
terlihat di dashboard sesuai permission sebelum membuka akses publik.

Online masih memerlukan review firewall/router, domain/Cloudflare Access/token,
public origin + build, kebijakan auth-only permanen (gate uji 15 menit bukan layanan
24 jam), dan kebijakan rate limit proxy. Tidak cukup sekadar menyalakan tunnel.
Persetujuan CREATE USER/GRANT, secret input manual, network/ingestion nyata,
perubahan firewall/binding, auth permanen, DNS/tunnel dan deployment tetap terpisah.
