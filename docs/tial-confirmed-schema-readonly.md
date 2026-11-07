# TIAL Orders — schema terkonfirmasi dan uji read-only

Status: lokal pada `chore/remove-cacti-hdwork2`, staging tetap nonaktif secara
default. Tidak menjalankan backend, MySQL, PM2 atau Telegram. Panduan ini untuk
uji yang dijalankan pengguna nanti setelah izin akses, bukan uji yang sudah
terjadi di PC kantor.

## Hasil audit dan perubahan

Schema terkonfirmasi: `id BIGINT AUTO_INCREMENT`, `sumber_tab VARCHAR(50)`,
`nomor_baris INT`, `data_json JSON`, `created_at TIMESTAMP` pada
`hd_b2c.sheet_import_test`. Reader khusus TIAL menggantikan konfigurasi kolom
hipotetis untuk endpoint TIAL, tanpa mengubah reader PSB/MO.

Query hanya SELECT dengan kondisi `BINARY sumber_tab = BINARY ?` bernilai Orders.
Proyeksi field yang dipilih memakai:

- SC/IN: `JSON_UNQUOTE(JSON_EXTRACT(data_json, '$."SC/IN"'))`
- INET: `JSON_UNQUOTE(JSON_EXTRACT(data_json, '$."NO INET/TELP"'))`
- status: `JSON_UNQUOTE(JSON_EXTRACT(data_json, '$."STATUS"'))`
- referensi chat: `JSON_UNQUOTE(JSON_EXTRACT(data_json, '$."Message ID"'))`

Tidak SELECT raw payload, nomor baris, nama pelanggan atau field tambahan.
Nilai filter/pagination memakai binding. ID BIGINT di-CAST AS CHAR pada query
untuk menghindari pembulatan JavaScript. Tidak ada GROUP BY/DISTINCT atau merge
berdasarkan SC/IN: dua kiriman dengan SC/IN sama tetap dua baris.

### Chat ID, Message ID dan thread

Koreksi berdasarkan audit MySQL yang dilaporkan pengguna: 26.675 baris Orders,
26.672 berformat `chat_id:message_id`, nol chat-only, tiga format lain. Cloud
belum mengakses database untuk memverifikasi distribusi tersebut.

Parser mensyaratkan satu titik dua dengan Chat ID negatif kanonik dalam batas
Telegram 52-bit dan Message ID positif 1–2147483647. Validasi memakai BigInt,
kedua hasil tetap string. Chat-only, nilai kosong, spasi, format alternatif dan
overflow ditandai invalid; kedua komponen null tanpa menebak. Baris tersebut
tetap disertakan, termasuk kiriman dengan SC/IN sama.

`reference_syntax_valid` dan `reference_complete` true hanya ketika dua komponen
valid. `reference_verified` tetap false; `telegram_thread_id` tetap null,
bukan General. Memiliki pasangan ID yang valid bukan bukti pesan ada, bot bisa
mengaksesnya, atau konteks thread benar. Tidak ada tindakan order diaktifkan.

### Identitas — keterbatasan penting

HMAC ID memakai `[datasetId, 'Orders', CAST(id AS CHAR)]`; tidak memakai
`nomor_baris`, SC/IN, chat ID atau hash konten. DTO memberi
`identity_scope=staging_row`, respons `identityScope=staging_row`.

Ini hanya identitas baris database, **belum identitas bisnis permanen**. Sortir
Sheets aman jika sync mempertahankan id baris yang sama. Jika sync mencocokkan
berdasarkan nomor_baris, menghapus/reinsert atau TRUNCATE, identitas kiriman
bisa berubah atau id baris dipakai ulang untuk kiriman berbeda. HMAC tidak
menyelesaikan masalah upstream ini. `B2C_TIAL_DATASET_ID` harus diubah ketika
reset/reimport yang memakai ulang ID; ini prosedur manual, bukan deteksi otomatis.
Aktivasi tindakan tetap terblokir sampai stable UUID/provenance upstream tersedia.

### Tanggal dan STO yang belum dikonfirmasi

Tidak ada key JSON tanggal order atau STO yang terkonfirmasi. Karena itu:

- Filter `date` TIAL secara eksplisit adalah **tanggal impor created_at dalam
  Asia/Jakarta**, bukan tanggal order. DTO/respons memberi
  `date_basis/dateBasis=import_created_at_jakarta`; UI menampilkan tanggal impor.
- Ekspresi tanggal menggunakan UNIX_TIMESTAMP(created_at) dan offset +25200
  detik pada epoch tetap, bukan asumsi timezone session atau tabel timezone
  bernama. Bentuk SQL harus diuji pada versi MySQL kantor; tidak diuji nyata di sini.
- STO default NULL, `stoFilterAvailable=false`. Mengirim filter STO sebelum key
  dikonfirmasi memberi 503 sebelum query/pool dipanggil. Tidak menebak key STO.
- Setelah key diketahui, `B2C_TIAL_STO_JSON_KEY` dapat memetakan satu key top-level
  dengan validasi karakter aman. Tes memakai `STO_DUMMY`, bukan schema nyata.

Status dipertahankan sesuai sumber, pencocokan bergantung collation MySQL.
Search LOCATE literal pada SC/IN atau INET, bukan wildcard SQL; hasil pencocokan
huruf besar/kecil perlu ditetapkan setelah collation diketahui. Pagination
mengurutkan created_at DESC, id DESC dengan lookahead limit+1. Offset bisa
bergeser saat sinkronisasi; belum snapshot/cursor lintas request. Keberadaan
baris JSON null atau tipe non-string perlu dinilai dari data dummy upstream.

## Konfigurasi

TIAL tidak lagi memerlukan B2C_STAGING_COLUMNS_JSON/B2C_STAGING_JSON_FIELDS.
PSB/MO masih memakai konfigurasi sebelumnya. Nama env yang diperlukan:

- B2C_STAGING_ENABLED: tidak diubah; default nonaktif. Pemeriksaan koneksi
  standalone tidak bergantung gate API ini dan tidak mengaktifkannya.
- B2C_STAGING_DB_HOST/PORT/USER/PASSWORD: akun SELECT khusus tabel staging.
- B2C_STAGING_IDENTITY_KEY: secret server baru minimal 32 byte, bukan token bot.
- B2C_TIAL_DATASET_ID: namespace generasi dataset yang ditetapkan operator.
- B2C_TIAL_SOURCE_BOT: alias non-secret opsional, bukan bukti bot historis.
- B2C_TIAL_STO_JSON_KEY: opsional, hanya setelah key STO dikonfirmasi.

Tidak membuat atau mengubah .env/kredensial. Semua nilai hanya server. API tetap
JWT+SUPER_ADMIN dan no-store. HD/ADMIN ditolak; mode nonaktif tetap 503 tanpa
pool staging. Frontend tidak beralih ke demo ketika error, tidak memiliki action
atau ID operasional orders, dan tidak menyimpan respons staging di state demo.

## Uji standalone berikutnya di PC kantor

Prasyarat: checkout sendiri berisi script baru, dependensi Node tersedia,
izin membaca staging dan akun SELECT khusus sudah disediakan oleh pengelola.
Jangan memakai root atau akun bot penulis. Pengguna menyiapkan env server di
PowerShell secara aman (jangan memasukkan password dalam history atau mengirimnya
ke chat); script tidak memuat .env, tidak mengambil konfigurasi PM2/bot.
Tidak perlu menyalakan backend atau mengaktifkan B2C_STAGING_ENABLED.

Jalankan dari folder checkout HD Work 2.0 setelah prasyarat dipenuhi:

```powershell
node .\scripts\check-tial-staging-readonly.js --read-only-check
```

Script tanpa argumen opt-in tidak mencoba koneksi. Dengan argumen, script membuka
satu koneksi, `START TRANSACTION READ ONLY`, menjalankan reader TIAL limit 3,
kemudian rollback dan menutup koneksi, termasuk saat query gagal. Script tidak
mengimpor server/app/service Telegram. Tidak START/STOP/RESTART proses PM2.

Output hanya summary: ok, sampled, hasMore, dateBasis, identityScope dan jumlah
verified (seharusnya nol). Tidak mencetak baris, SC/IN, INET, Chat ID, source key,
password atau detail error database. Bila gagal, investigasi konfigurasi/schema
secara lokal tanpa membagikan log mentah berisi secret.

Filter opsional khusus diagnostic:
`B2C_TIAL_CHECK_DATE` (YYYY-MM-DD tanggal impor Jakarta),
`B2C_TIAL_CHECK_STATUS`, `B2C_TIAL_CHECK_STO` (hanya jika key diketahui),
`B2C_TIAL_CHECK_SEARCH`. Jangan membagikan nilai search pelanggan ke chat.
Bersihkan variabel sementara setelah uji. Script hanya mengambil sampel kecil,
namun JSON filter dapat memicu scan; pilih waktu yang disetujui pengelola dan
nilai beban sebelum menerapkan query filter pada tabel besar.

## Pengujian yang dilakukan di cloud

- 50 tes backend terisolasi: SQL TIAL fixed schema/keys, BigInt string, status,
  tanggal impor, STO dummy/unsupported, SC-IN/INET search, pagination/lookahead,
  SC/IN sama tidak merge, namespace ID, normalisasi gabungan dan penolakan chat-only, API gate dan
  mock transaksi diagnostic (rollback/close saat berhasil maupun gagal).
- Executor query merupakan test double yang mensimulasikan filter/pagination
  atas dataset sintetis; bukan eksekusi SQL MySQL. Tes query construction dan
  mock tidak membuktikan kompatibilitas prepared statement/JSON/timezone di DB nyata.
- Tes/frontend build dan pemeriksaan sintaks dilakukan tanpa layanan operasional.

## Syarat kelanjutan

Konfirmasi perilaku sync terhadap id/nomor_baris dan reimport; key STO dan tanggal
order (jika ingin tanggal bisnis asli); format status; versi/collation MySQL dan
hasil diagnostic summary. Uji di sandbox MySQL dengan data sintetis lebih dahulu
bila memungkinkan. Jangan memakai chat-only sebagai target reply. PICK/CEK,
DONE/GAGAL, integrasi sender dan verifikasi histori tetap belum diaktifkan.


## Hitungan diagnostic dan koreksi kontrak

`syntaxValid`, `completeReferences`, `verified`, dan `invalidReferences` hanya
menghitung sampel yang dibaca (maksimal tiga), bukan seluruh tabel. Untuk data
TIAL saat ini syntaxValid sama dengan completeReferences; verified tetap nol;
syntaxValid + invalidReferences sama dengan sampled. Duplikat dihitung terpisah.

Summary tidak mencetak ID, baris atau data pelanggan, dan tetap memberi
identityScope=staging_row beserta peringatan bahwa identitas belum permanen.
Jalankan script yang sama nanti setelah izin akses/configuration lokal:

```powershell
node .\scripts\check-tial-staging-readonly.js --read-only-check
```

Tidak perlu mengaktifkan API staging. Tidak ada koneksi MySQL atau verifikasi
Telegram dilakukan selama pengembangan koreksi ini.
