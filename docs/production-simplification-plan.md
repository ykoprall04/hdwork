# HD Work 2.0: satu jalur operasional produksi

Pembaruan keputusan Live Chat: review manual antrean lama diganti isolasi tanpa
modifikasi data dan tanpa replay. Prosedur spesifik terbaru ada di
[live-chat-real-cutover.md](live-chat-real-cutover.md); persyaratan review manual
backlog pada dokumen historis di bawah tidak lagi menjadi gate aktivasi.

Status: arah penyederhanaan serta commit/push disetujui; deployment dan restart
produksi tidak diizinkan pada tahap ini. Database, task Windows, credentials,
Telegram dan runtime produksi tidak diubah oleh perubahan kode ini. Manifest
migrasi dan rollback konkret tetap harus disetujui sebelum perubahan produksi.

## Arsitektur tujuan dan batas perubahan

Pertahankan React, Express, MySQL dan Python Telegram Courier. Express web menjadi
satu API bisnis untuk auth, akun, dashboard, order seluruh modul, monitoring dan
Live Chat. Transport ingress Courier tetap privat di loopback, bukan API bisnis
kedua. Tidak memindahkan seluruh aplikasi atau menggabungkan proses secara paksa.
Otorisasi backend, assignment order, CSRF, audit, idempotency dan antrean tetap ada.

Satu task Courier produksi mengendalikan satu bot dan satu poller. Worker tetap
menggunakan lease berfencing di database. Jangan menyalakan worker kedua, menghapus
lease, atau mengganti namespace bot untuk menghilangkan kata `testing`: namespace
lama merupakan foreign identity untuk order, outbox, dedup dan journal. Pemakaian
namespace lama memerlukan `legacyNamespaceReviewed: true`; ini hanya pengakuan
identitas lama, bukan izin menjalankan workflow testing.

Satu file topologi non-secret menjadi input review produksi; token dan password
tetap pada penyimpanan DPAPI yang sudah ada. File ini mereferensikan routing review
yang telah diverifikasi, repository dan snapshot aktif. Jangan menaruh password,
token, isi `.env`, atau credentials DPAPI dalam file topologi. Flag environment
runtime belum dihasilkan/diterapkan otomatis: perubahan writer flags memerlukan
review terpisah dan tidak boleh terselip dalam aktivasi frontend/Live Chat.

## Implementasi aman pada perubahan ini

1. `src/config/production-topology.js`: satu kontrak topologi, tanpa default tujuan,
   menolak field asing/secrets inline, task testing dan identitas tidak lengkap.
2. `scripts/hdwork2-control.js`: satu entry point `plan` dan `health`, read-only.
   Membandingkan hash source repository/snapshot (normalisasi CRLF), lockfile,
   menginventarisasi checksum migrasi serta kebijakan grant. Source lokal dirty,
   drift runtime, origin salah dan trial overlay aktif menghasilkan blocker.
   File symlink/hardlink tidak dibaca. Isi environment dan credentials tidak dicetak.
3. Launcher protected menerima pasangan credential trial yang dikenal dalam bundle
   lama ketika flag trial dimatikan. Pasangan itu tidak dipakai untuk memulai sender;
   inisialisasi trial tetap bergantung pada scope aktif. Field asing, pasangan
   setengah, credential malformed dan writer tanpa profile operational-write ditolak.
   Tidak ada dekripsi, rotasi atau penulisan bundle oleh perubahan ini.
4. Parser JSON operator dipakai bersama oleh preparation dan control, termasuk
   format UTF-16LE yang dibuat Windows PowerShell 5.

Salin template `ops/examples/hdwork2-production-topology.review.json` ke lokasi
privat di luar Git. Isi dengan path/identitas yang sudah diverifikasi; path relatif
dihitung dari direktori file topologi. Template sengaja belum valid untuk digunakan.

```powershell
npm run ops:plan -- --config 'C:\ProgramData\HDWork2\production.review.json'
npm run ops:health -- --config 'C:\ProgramData\HDWork2\production.review.json'
```

Kedua perintah tidak mengubah file maupun layanan. Exit 1 berarti input/blocker;
exit 2 berarti konsistensi lokal lolos tetapi integrasi produksi belum dibuktikan.
Tidak ada exit 0/claim LIVE hanya karena source cocok. Delapan komponen health
(frontend, API, MySQL, Courier, lease, queue, tunnel dan Telegram) masih `UNKNOWN`
tanpa pemeriksaan langsung. Perintah ini adalah satu pintu pemeriksaan konsistensi,
bukan pengganti health collector produksi yang belum dihubungkan. Routing review
yang dibaca adalah evidence operator; numeric Telegram ID belum dicocokkan ulang
ke token oleh control ini. Gunakan verifier read-only yang sudah ada untuk itu.

## Satu prosedur release yang diusulkan

| Tahap | Tindakan | Bukti/keputusan sebelum lanjut |
| --- | --- | --- |
| 1. Inventory | Jalankan `ops:plan`; cocokkan commit dan seluruh drift | Semua file runtime berbeda ditinjau; jangan overwrite lokal |
| 2. Backup | Source, environment, bundle terenkripsi, frontend, ekspor schema/grants dan backup database oleh DBA | Hash serta uji restore kompatibel; backup di lokasi privat |
| 3. Review migrasi | Gunakan checksum `database/manual` dan policy grant versi release | Schema yang sudah ada tidak diulang; delta dan invers grant ditinjau DBA |
| 4. Staging | Gunakan staging backend `prepare-live-chat-production.ps1` dan frontend `deploy-hdwork2-frontend-only.ps1` | Tidak mengganti runtime aktif; dependency closure termasuk launcher/helper baru harus ditambahkan ke payload release |
| 5. Persetujuan | Setujui satu manifest perubahan source/config/DB dan rollback | Persetujuan arah/commit bukan izin deployment; tidak menjalankan apply |
| 6. Aktivasi terkendali | Hentikan hanya task milik release; terapkan payload yang hash-nya cocok; mulai satu controller bot | Antrean ditinjau, mapping benar, code/config/grants kompatibel |
| 7. Verifikasi nyata | Auth/role, HTTP frontend/API, MySQL, lease, queue, Telegram ingress/reply pada order berwenang | Bukti host produksi dengan timestamp; controlled send hanya sesudah routing terverifikasi |
| 8. Rollback | Hentikan controller release baru, pulihkan source/frontend/config kompatibel dan task semula | Tidak menghapus order/chat/outbox, tidak retry DEAD atau replay pesan otomatis |

Ini satu prosedur review; executor apply gabungan belum dibuat. Jangan memakai
`deploy-hdwork2-operational.ps1` lama sebagai jalan pintas karena perubahan writer
flags di dalamnya bukan aktivasi frontend-only. Jangan menghapus tooling lama
sebelum release pengganti melewati rehearsal dan rollback yang disetujui.

## Runbook singkat untuk operator

1. Sinkronkan branch dengan `git pull --ff-only origin chore/remove-cacti-hdwork2`.
   Bila gagal atau ada perubahan lokal, hentikan sinkronisasi dan pertahankan file
   lokal. Pull hanya memperbarui checkout, bukan snapshot runtime.
2. Isi topologi privat, jalankan `ops:plan`, dan review setiap drift. Perintah ini
   tidak menyimpan rencana ke runtime atau mengaktifkan flag. Catat commit release,
   hash source, lockfile, migrasi, kebijakan grant dan manifest build frontend.
3. Sebelum apply apa pun, siapkan backup privat byte-exact untuk source yang akan
   berubah, environment, DPAPI bundle terenkripsi, frontend aktif serta definisi
   task. Backup database/schema/grants dikerjakan DBA. Jangan commit backup ini.
   Buktikan restore fallback dapat boot dengan grants yang sedang berlaku.
4. Stage backend dan frontend menggunakan tooling pada tabel di atas. Staging
   backend saat ini belum mencakup launcher/helper baru secara otomatis dan masih
   menolak overlay trial yang bentrok. Lengkapi manifest payload dan rencana
   penonaktifan trial sebelum apply; jangan melewati blocker secara manual.
5. Minta persetujuan manifest final, jadwal aktivasi dan rollback. Sesudah disetujui,
   gunakan release tersebut untuk mengganti hanya file yang hash preimage-nya masih
   cocok, hanya pada task web/Courier yang kepemilikannya telah diverifikasi.
6. Jika health/auth/role/chat gagal, hentikan controller baru dan pulihkan file,
   environment serta task dari backup yang cocok dengan manifest. Jangan menimpa
   perubahan baru pihak lain. Frontend memakai mode `Rollback` tooling frontend;
   backend/config mengikuti manifest byte-exact. Tidak ada rollback otomatis data
   pesan yang sudah terkirim; outbox/idempotency/journal harus dipertahankan.

Tahap 3–6 adalah prosedur produksi mendatang, tidak dijalankan untuk commit ini.
Belum tersedia satu executor gabungan yang aman untuk apply web + Courier;
runbook ini tidak menyatakan prosedur tersebut sudah otomatis.

## Migrasi database dan rollback yang harus disetujui

Gunakan tabel/checksum migrasi 004–013 yang sudah ada sebagai katalog review.
Jangan membuat tabel ledger baru atau menjalankan migrasi hanya karena belum ada
ledger; cocokkan schema nyata terlebih dahulu. Baseline schema 012/013 dilaporkan
sudah tersedia. Kebijakan grant yang tetap menjadi sumber kebenaran adalah
`src/config/operational-grants.js`: web `chatRead`/`chatWrite`, Courier
`courierSendChat`. DBA melaporkan tiga GRANT tambahan Courier berhasil; itu belum
membuktikan runtime dapat boot dengan policy baru.

Rencana produksi berikutnya: inventarisasi grant aktual read-only, hitung delta
terhadap policy tersebut, review SQL/invers bersama backup, lalu terapkan hanya
delta yang disetujui. Jangan memberi `ALL`, wildcard atau GRANT OPTION. Migrasi
DDL MySQL tidak dapat dianggap transaksi rollback biasa. Setiap DDL membutuhkan
strategi forward recovery/restoration terpisah dan downtime yang disetujui.

Rollback source harus mempertahankan kompatibilitas dengan grant yang sekarang
sudah diperluas. Mengembalikan konfigurasi feature-off lama bisa gagal strict grant
check. Jangan otomatis mencabut grant untuk membuat rollback lolos. Versi fallback
yang dapat boot atau delta grant rollback harus dibuktikan dahulu.

## Prioritas berikut: Live Chat REAL

Urutan setelah rencana ini disetujui: payload launcher/helper + backend yang sudah
ditinjau; nonaktifkan overlay trial tanpa mengubah bundle; mapping TIAL1/TIAL2/
SOLVER1 dari routing terverifikasi; satu Courier produksi dengan grants yang tepat;
frontend yang terverifikasi; lalu verifikasi ingress dan reply nyata pada order
yang memang ditugaskan kepada akun penguji.

Bukti operator terakhir: task testing sudah Disabled, PID lama hilang dan port 3091
kosong; tiga GRANT Courier berhasil. Masih ada laporan 10 QUEUED dan 3 DEAD dari
pemeriksaan sebelumnya. Sebelum sender diaktifkan, tinjau tujuan/jenis/status pesan
tersebut; jangan drain, hapus, retry atau reset otomatis. Bot numeric ID dan target
grup yang sebelumnya diverifikasi tidak boleh ditebak atau diganti.

Tes otomatis hanya membuktikan kontrak dan regresi kode. Pekerjaan ini tidak
mengklaim Live Chat produksi berhasil atau sudah diaktifkan.
