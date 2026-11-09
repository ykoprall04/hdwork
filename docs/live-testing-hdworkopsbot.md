# Live setup @HDWorkOpsBot — 8 November 2026

## Hasil nyata

- getMe PASS: username HDWorkOpsBot, Telegram bot ID 9133904377.
  Bukti metadata: .local/testing-bot-nViV5k/identity.json. Token berasal dari
  courier-token.dpapi, hanya didekripsi dalam memori, tidak dicetak/disalin ke log.
- Satu getUpdates terbatas (timeout=0, limit=100, tanpa offset) mengidentifikasi
  grup privat HD Work 2.0 Testing, chat ID **-5436357946**, type=group,
  threadId=null. Tidak memajukan offset, menulis payload pesan atau menyimpan
  identitas grup lain. Report hanya metadata grup testing di .local/testing-chat-*.
- Konfigurasi privat .local/courier.receive-only.plan.json diperbarui dengan
  identitas bot terverifikasi dan tepat satu pasangan chat/topic tersebut.
  Profil TIAL1, hanya command order untuk satu uji B2C pertama. Tidak menyatakan
  empat modul sudah diuji live pada grup yang sama.
- enabled=false, ingestionWritesApproved=false, networkActivationApproved=false,
  sendEnabled=false, approvalUntil=null tetap dipertahankan. Global read-only
  aplikasi tidak diubah. Direktori journal/lock baru baru berupa path rencana;
  tidak membuat direktori di luar workspace atau menggunakan session lama.
- Pemeriksaan proses read-only berizin menemukan 0 proses courier yang cocok;
  tidak ada listener 3091 teramati. Tidak ada proses/service/PM2 dihentikan.

## Perbaikan journal

IngressPolicy.allows_source memeriksa chat/topic sebelum parsing text/attachments.
Journal.append mewajibkan filter sumber terikat policy, lalu menolak sumber lain
sebelum serialisasi, hashing atau INSERT payload. Update di luar allowlist tidak
membuat baris journal; hanya cursor global dapat bergerak pada polling runtime.
Payload ignored/quarantined yang tidak memiliki proyeksi PENDING juga tidak lagi
disimpan sebagai raw text. Tidak menghapus journal/laporan lama.

Pemeriksaan terarah baru memakai journal SQLite in-memory: objek payload yang
tidak dapat diserialisasi dari sumber lain dan topic terlarang terbuang tanpa
error/record; satu order yang diizinkan tersimpan PENDING di memori. Tidak ada
MySQL write, Telegram call atau pengulangan suite mock lama dalam pemeriksaan ini.
Sintaks Node/Python dan git diff --check PASS.

Bot API getUpdates sendiri tidak memiliki filter chat server-side. Identifikasi
ini secara eksplisit diizinkan pengguna dengan pemrosesan sementara di memori;
tidak menyimpan/mencetak pesan. Bot baru harus tetap khusus grup testing. Isolasi
storage/API dijaga allowlist; jangan memasukkan bot ini ke grup operasional.

## Blocker MySQL yang terkonfirmasi

check-courier-database.js --read-only berhenti sebelum koneksi dengan kode
COURIER_DB_CREDENTIAL_MISSING. Ciphertext berikut belum tersedia:

- .local/courier-secrets/courier-db-password.dpapi
- .local/courier-secrets/courier-service-key.dpapi
- .local/courier-secrets/courier-identity-key.dpapi
- .local/database-secrets/ops-read-password.dpapi (dashboard)

Keberadaan akun/grants tidak dapat disimpulkan dari ketiadaan ciphertext.
Tidak mencoba password, memakai root runtime, membaca schema legacy, atau
menjalankan CREATE USER/GRANT.

SQL khusus courier untuk review: ops/examples/hdworkopsbot-testing-provision.review.sql.
Jika akun sudah ada, periksa grants dan simpan password existing; jangan reset.
Jika belum ada, provisioning melalui administrator dengan input lokal tersembunyi
memerlukan persetujuan. Akun read dashboard dan grants-nya ada pada bagian read
ops/examples/hdwork2-operational-grants.review.sql. Jangan menjalankan bagian web
write atau outbox untuk receive-only.

Setelah provisioning disetujui dan kredensial dimasukkan di PowerShell lokal:

    powershell -NoProfile -File scripts/store-private-secret.ps1 -Name courier-db-password
    powershell -NoProfile -File scripts/store-private-secret.ps1 -Name courier-service-key
    powershell -NoProfile -File scripts/store-private-secret.ps1 -Name courier-identity-key
    powershell -NoProfile -File scripts/store-private-secret.ps1 -Name ops-read-password

Tidak meminta secret melalui percakapan dan tidak membuat secret otomatis.
Pemeriksaan koneksi/grants/skema read-only yang siap digunakan setelah file ada:

    node scripts/check-courier-database.js --read-only

## Status tahap berikutnya

Live ingestion NOT STARTED; tidak ada INSERT order/audit/session aplikasi nyata.
Dashboard live NOT TESTED; reply DONE NOT SENT. Tidak ada persetujuan live ingestion
atau satu balasan yang diasumsikan dari izin setup/identifikasi metadata.

Setelah DB dan pool baca siap, minta persetujuan eksplisit ingestion, tentukan
cutover dan satu order pengujian baru, lalu start satu courier dengan OS lock dan
worker lease. Verifikasi INSERT serta tampilan dashboard. Setelah itu cocokkan
chat ID dan message ID order asli, baru minta persetujuan satu reply DONE. Runner
receive-only saat ini sengaja tidak dapat mengirim; jangan sekadar mengubah send
menjadi true atau memberikan outbox grants tanpa tahap verifikasi/persetujuan.

Tidak ada firewall, DNS, tunnel, deployment, commit, push atau merge dilakukan.
Working tree lama dipertahankan. Source yang diubah: courier_bot/courier/groups.py dan
courier_bot/courier/journal.py. File baru: scripts/verify-testing-bot.js,
scripts/check-courier-database.js, SQL review khusus testing, dan laporan ini.
