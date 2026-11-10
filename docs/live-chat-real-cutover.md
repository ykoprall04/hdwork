# Live Chat REAL: paket cutover terkontrol

Status pekerjaan: kode persiapan, bukan aktivasi produksi. Dokumen ini menggantikan
persyaratan review manual 10 QUEUED dan 3 DEAD pada rencana sebelumnya. Operator
memutuskan mengisolasi antrean lama, mempertahankan data dan tidak mengirim ulang.

## Tujuan routing yang disetujui operator

Bot Telegram `@HDWorkOpsBot`, numeric ID `9133904377`. Namespace internal yang
telah diamati `hdworkopsbot-testing` dipertahankan untuk menjaga referensi order,
dedup, audit dan outbox; namanya bukan izin menjalankan testing.

| Profile | Chat ID | Topic | Command yang sudah tersedia |
| --- | --- | --- | --- |
| TIAL1 | -1004300013756 | non-topic | order, req |
| TIAL2 | -1003727127068 | non-topic | order, req |
| SOLVER1 | -1004297857215 | non-topic | config_psb, mo |

Routing review dan laporan Telegram asli tetap di folder privat host. Tidak ada
token atau konfigurasi runtime yang dimasukkan ke Git. Tidak membuat bot baru.

## Isolasi antrean tanpa modifikasi data lama

Setelah produsen testing dihentikan dan web dipause pada jendela deployment yang
disetujui, ambil SATU cutoff UTC dari MySQL, hanya query berikut:

```sql
SELECT CONCAT(LEFT(DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%f'),23),'Z') AS cutover_utc;
```

Query menghasilkan UTC dengan tiga digit milidetik; jangan gunakan jam PC.
Simpan timestamp tetap ini di plan sebagai `activationNotBefore`. Semua
outbox/inbox dengan `created_at <= cutoff` berada di luar scope controller baru.
Query claim, expired-lease handling dan settlement/ACK semuanya mengecualikan
outbox lama. Tidak ada UPDATE status karantina, DELETE, migrasi, retry DEAD, atau
perpindahan baris. Pending inbox lama juga tidak diproses untuk membuat balasan baru.
Telegram ingress dengan waktu pesan sebelum/sama cutoff ditolak sebelum transaksi.

Sesudah cutoff ditetapkan, tunggu melewati detik cutoff sebelum menerima pesan
baru/membuka web kembali. Timestamp Telegram memiliki presisi detik. Cutoff harus
dipertahankan pada setiap restart; jangan menghitung ulang dari Date.now saat boot.
Berhenti menggunakan controller lama yang tidak memahami filter ini adalah bagian
wajib isolasi. Jangan menyalakan kembali task testing ketika rollback.

Journal produksi memakai direktori BARU privat. Hanya offset polling dari journal
lama yang disalin melalui koneksi SQLite read-only setelah identitas namespace dan
fingerprint token cocok. Payload lama, event pending, dan ACK lama tidak disalin.
Journal lama tidak dibuka untuk write. Lock directory tetap yang lama, sehingga
OS lock untuk token yang sama dan database lease tetap mencegah dua poller. Lease
diakuisisi secara normal; jangan menghapus, memalsukan atau memajukan lease manual.

## Paket yang tersedia

* `prepare-live-chat-production.ps1 -DisableCollidingTrial` menyiapkan patch flag
  monitoring/chat ON dan overlay trial OFF. Writer approval, scope trial tersimpan,
  credentials dan data tidak diubah. Payload mencakup launcher web, closure JS
  backend/Courier serta sumber Python Courier. File runtime tidak dikenal tetap
  memblokir staging; tidak ditimpa. Backup byte-exact dan manifest rollback dibuat
  oleh preparation ke direktori ACL-privat; runtime aktif tidak diganti.
* `prepare-production-courier-plan.js` membuat konfigurasi produksi baru dari plan
  lama, routing review dan laporan getMe/group yang cocok. SHA source harus sama
  dengan laporan verifikasi. Secret refs dan lock directory dipertahankan, source
  journal dipertahankan, direktori journal baru harus disediakan eksplisit.
* `run-production-live-chat-courier.js` adalah supervisor foreground untuk SATU
  transport Node dan SATU Python Courier, bukan service installer. Backend hanya
  mendapat DB/key; Python hanya token/service key. Plan menyimpan `secretRoot` yang
  sudah ada sehingga source snapshot baru tidak mengubah lokasi DPAPI refs.
* Courier produksi memerlukan grants `courierSendChat`, mapping DB persis sesuai
  tiga target, identitas Telegram getMe benar, webhook kosong, lock dan lease.
  Drift mapping menghentikan cycle sebelum poll/claim; tidak fallback ke testing.
* Settlement chat memicu event module-scoped dalam transaksi yang sama agar web
  memperbarui status melalui SSE. ACK duplikat tidak menghasilkan event duplikat.
  Incoming reply memakai korelasi order/pesan yang telah ada. Pemilik order,
  session, module grants, CSRF, version dan idempotency tetap diperiksa backend.

## Persiapan file di host (bukan perintah aktivasi)

Setelah checkout sinkron ke commit release dan file review privat tersedia:

```powershell
.\scripts\prepare-live-chat-production.ps1 `
  -Review $review -Routing $verifiedRouting -DisableCollidingTrial
```

`$review` adalah review flag yang ada; `$verifiedRouting` adalah file routing asli
hasil verifikasi, bukan template. Preparation tidak melakukan deploy/restart/SQL.
Output staging serta backup harus ditinjau sebelum apply. Jangan kirim isi DPAPI,
environment atau task arguments ke chat.

Setelah cutoff MySQL diperoleh dalam jendela yang disetujui, buat plan produksi:

```powershell
node scripts/prepare-production-courier-plan.js `
  --source-plan $existingCourierPlan `
  --routing $verifiedRouting `
  --verification $telegramReport `
  --activation-not-before $cutoffUtc `
  --new-journal $newPrivateJournal `
  --output $privateProductionPlan
```

Semua variabel path di atas harus menunjuk file/direktori aktual yang ditinjau.
Gunakan parent ACL privat Administrator/SYSTEM dan akun pemilik DPAPI yang sudah
ada. Tool tidak menyalin/mengganti credential atau membuat folder baru di lokasi
arbitrer. Jangan menambahkan plan produksi terisi ke Git.

## Tindakan produksi spesifik yang memerlukan persetujuan deployment

1. Backup source yang akan diganti, environment, bundle terenkripsi dan frontend
   aktif; simpan definisi task serta snapshot konfigurasi mapping. Hash preimage,
   payload dan backup harus cocok. Backup database oleh DBA hanya bila ada rencana
   modifikasi schema/grant; pekerjaan ini tidak mengusulkan migrasi atau grant baru.
2. Pause hanya `HDWork2-Web` dan pastikan controller testing yang sudah Disabled
   tetap berhenti. Ambil cutoff UTC read-only; persiapkan journal baru privat dan
   salin offset tanpa memodifikasi journal/queue lama.
3. Terapkan payload backend dan tiga patch flag dari manifest yang lolos review.
   Terapkan frontend yang manifest build-nya cocok. Jangan ubah OP_WRITE_ENABLED,
   HDWORK2_OPERATIONAL_WRITE_APPROVED, HDWORK2_LOCAL_READ_ONLY atau secrets.
4. Melalui API/UI mapping yang sudah berautentikasi ADMIN/SUPER_ADMIN, gunakan ID,
   version dan requestId aktual untuk mengaktifkan tiga target di atas. Mapping
   testing untuk bot yang sama harus dinonaktifkan jika ada, tanpa menghapus data.
   Jangan menebak ID mapping atau menulis mapping lewat SQL tanpa audit log.
5. Mulai satu supervisor Courier menggunakan akun Windows yang dapat membuka DPAPI
   refs lama dan konfigurasi produksi baru; web memakai task web yang sudah ada.
   Perintah berikut HANYA sesudah persetujuan deployment, bukan saat staging:

   ```powershell
   node scripts/run-production-live-chat-courier.js --run-production-approved --plan $privateProductionPlan
   ```

   Supervisor memerlukan terminal hidup. Penjadwalan/autostart belum diimplementasi
   pada perubahan ini; jangan klaim task Service lama sudah dikonversi otomatis.
6. Setelah identitas, route dan lease valid, operator membuat satu order baru di
   grup yang disepakati. HD berizin mengambil order dan mengirim satu balasan web;
   operator membalas pesan itu dari Telegram. Catat ID order, outbox, message ID,
   timestamp dan status; cocokkan pesan masuk muncul lewat SSE. Pengujian lintas
   pemilik/role harus tetap ditolak. Ini adalah izin kirim pesan produksi nyata
   yang terpisah dari permission menyiapkan kode.

Executor file-only `apply-live-chat-web-overlay.js` dapat menerapkan/memulihkan
payload dari manifest, setelah web dipastikan berhenti dan hash plan disetujui:

```powershell
node scripts/apply-live-chat-web-overlay.js --mode apply --prepared $preparedDirectory --plan-sha256 $approvedPlanSha256 --approved-deployment yes --confirmed-web-stopped yes
```

Tool memeriksa seluruh preimage dan backup sebelum write, mempertahankan writer
flags serta bundle, dan mengganti environment terakhir. Tidak menghentikan atau
memulai layanan, tidak mengubah mapping/database. Gunakan `--mode rollback` dengan
plan yang sama untuk restore file; web tetap harus berhenti. Bila terjadi error
di tengah penggantian file, perubahan parsial mungkin ada: pertahankan web OFF dan
gunakan rollback yang menolak overwrite perubahan independen. Tidak ada executor
gabungan mapping/task/frontend. Jangan melewati preimage drift atau memakai deploy
operational-write lama. Source runtime tidak dikenal tetap harus ditinjau spesifik.

## Rollback

### Kandidat kompatibel untuk baseline pool f875aed

Baseline yang ditemukan operator memilih `read/write` karena flag chat belum ada,
tetapi source pool f875aed sendiri sudah mendukung `chatRead/chatWrite` dan policy
grant-nya sama. Karena grant produksi sudah diperluas, restore konfigurasi asli
secara buta tidak dapat dipakai sebagai fallback restart.

Tool pendamping `prepare-compatible-chat-rollback.js` membuat plan rollback BARU di
dalam direktori preparation privat. Payload aplikasi tetap commit `4ef886e`; tool
pendamping tidak melakukan restaging versi aplikasi atau mengubah manifest/backup
asli. Kandidat mengembalikan source lama, dengan dua pengecualian eksplisit:
launcher protected dan validator dormant bundle tetap dari release baru, sementara
flag monitoring/chat tetap true dan trial false. Ini mempertahankan kompatibilitas
grant/bundle tanpa mencabut privilege atau menghidupkan testing. Courier tetap OFF.

```powershell
node scripts/prepare-compatible-chat-rollback.js --prepared $preparedDirectory
```

Output berisi lokasi kandidat dan hash plan rollback. Jalankan `check-pools.ps1`
di lokasi output, dengan `-Review` review flag asli dan `-ApprovedReadOnly`.
Pemeriksaan memakai source pool HISTORIS dari backup, reader/writer asli melalui
stdin privat, serta SQL allowlist SELECT/SHOW/LIMIT 0. Tidak membaca order/pesan,
memulai web, mengubah grant atau mengakses Telegram. Status
`ROLLBACK_POOLS_SCHEMA_GRANTS_PASS` membuktikan kompatibilitas pool/schema/grants,
bukan keberhasilan full web boot atau Live Chat produksi.

Untuk rollback sesudah apply selesai, gunakan executor file-only dengan lokasi
kandidat dan `rollbackPlanSha256` tersebut, mode rollback, serta web/Courier OFF.
Ini bukan restore byte-exact environment lama: profile chat dipertahankan secara
sengaja. Jika apply gagal parsial sebelum dua validator terpasang, jangan memaksa
plan kompatibel; pertahankan layanan OFF dan lakukan recovery file dari backup
asli lalu pasang dua validator/config kompatibel dengan pemeriksaan hash. Restore
parsial tidak boleh diikuti start service sampai keseluruhan fallback konsisten.

Tool pendamping tersedia pada commit tooling sesudah `4ef886e`; versi payload yang
di-deploy tetap ditentukan oleh manifest preparation commit `4ef886e`, bukan HEAD
checkout tooling. Jangan menjalankan preparation release ulang dari HEAD tooling.

Hentikan supervisor BARU (Ctrl+C mematikan anak miliknya dan melepaskan lease).
Pertahankan plan, cutoff tetap, journal baru dan semua baris database. Pulihkan
frontend dari backup lewat tooling frontend-only. Pulihkan source/config web hanya
dari fallback yang terbukti cocok dengan grant saat ini; jangan restore feature-off
lama secara buta. Jangan mencabut grant atau menghapus data sebagai rollback kode.

Jika fallback web belum terbukti bootable, hentikan cutover sebelum apply. Dalam
kegagalan setelah apply, pertahankan Courier OFF dan laporkan status; jangan pernah
memulai controller testing lama karena bisa mengirim antrean terisolasi. Tidak ada
rollback otomatis pesan yang sudah dikirim ke Telegram.

## Batas bukti

Tes Node membuktikan isolasi dan regresi via SQL contract fixtures; tes Python
memakai SQLite disposable lokal dan transport fixture. Build hanya membuktikan
artifact dapat dibuat. Semuanya BUKAN bukti integrasi Telegram produksi. Setelah
aktivasi, getMe/lease READY hanya membuktikan startup; hasil dua arah harus dicatat
terpisah sebelum menyatakan Live Chat REAL berfungsi.
