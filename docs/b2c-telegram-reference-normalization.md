# Normalisasi referensi Telegram B2C staging

> Pembaruan TIAL: schema fisik Orders dan format `chat_id:message_id` sudah dikonfirmasi.
> Lihat `tial-confirmed-schema-readonly.md` untuk kontrak TIAL terbaru.
> Rancangan lama tentang separator TIAL dan kolom hipotetis tidak berlaku untuk TIAL.


Status: lokal, read-only, nonaktif secara default. Tidak mengakses MySQL,
mengubah bot, memanggil Telegram, menjalankan backend/polling, atau mengaktifkan
PICK/CEK/DONE/GAGAL. Semua pengujian memakai data sintetis.

## Kontrak yang diketahui dan yang belum diketahui

Staging menyimpan payload JSON. Nama kolom fisik payload, source dan stable key
belum diberikan. Nama key JSON untuk tanggal/status/STO/SC-IN/INET juga belum
lengkap; tetap konfigurabel per modul, tidak ditebak. Adapter melakukan filter,
proyeksi dan sorting menggunakan JSON_UNQUOTE(JSON_EXTRACT(...)) untuk field
tersebut. Format tanggal masih mensyaratkan YYYY-MM-DD tanggal bisnis Jakarta;
belum mengonversi timestamp atau format tanggal Sheets yang belum dikonfirmasi.

Endpoint mensyaratkan mode JSON. Reader murni masih mendukung mode kolom datar
untuk kompatibilitas tes kontrak sebelumnya, tetapi controller endpoint tidak
mengaktifkannya. Ketidaksesuaian konfigurasi memberi error, bukan fallback demo.

### TIAL

Key pasti: `Message ID`, format tepat `chat_id:message_id`. Hasil audit MySQL
pengguna: 26.675 baris, 26.672 berformat gabungan, nol chat-only, tiga format lain.
Angka tersebut merupakan laporan pengguna, tidak dihitung ulang di cloud.

Parser memerlukan satu titik dua, Chat ID negatif kanonik dalam batas Telegram
52-bit dan Message ID positif 1–2147483647. Keduanya dipertahankan sebagai string;
validasi batas memakai BigInt tanpa konversi Number. Chat-only, komponen kosong,
spasi, pecahan, extra delimiter dan overflow invalid; kedua field menjadi null.
Baris invalid tetap tampil, tidak ditebak atau dibuang. Tidak perlu konfigurasi
separator TIAL. Format valid tidak membuktikan pesan ada/akses bot di Telegram.

### LOGIC PSB dan LOGIC MO

PSB membaca key `Message ID`; MO membaca `MSG_ID`. Message ID boleh integer JSON
aman atau string desimal kanonik positif. Kosong/null/hilang → null dan issue.
Chat ID diperoleh dari satu mapping grup per modul, bukan payload acak atau
fallback modul lain. Mapping tunggal saat ini belum membuktikan grup asal untuk
rekaman historis. Tidak membuat daftar grup alternatif atau hardcode ID produksi.

### Validasi dan DTO

Chat ID grup: string desimal negatif kanonik dalam batas Telegram 52-bit.
Message ID: integer positif kanonik 1–2147483647, string pada DTO. Tidak menerima
spasi, pecahan, scientific notation string, nol, tanda plus atau leading zero.
Nilai numerik JSON yang sudah diparse tidak membawa informasi ejaan JSON asli;
validator hanya menilai nilainya. Chat numerik hanya diterima jika integer aman dan dalam batas Telegram 52-bit;
DTO selalu string. Gunakan string pada konfigurasi agar representasi eksplisit.

Field tambahan DTO:

- `source_bot`: alias bot dari konfigurasi, atau null; bukan token/credential.
- `telegram_chat_id`: string kandidat Chat ID, atau null.
- `telegram_message_id`: string Message ID, atau null.
- `telegram_thread_id`: selalu null pada tahap ini.
- `reference_verified`: selalu false pada tahap ini.
- `reference_issues`: kode alasan, tanpa raw payload atau data pelanggan.

Issue meliputi referensi hilang/format salah, grup belum dipetakan, bot belum
jelas, `historical_reference_unverified` dan `thread_unknown`. Key payload atau
konfigurasi yang mengklaim verified/thread tidak dapat mengubah status tersebut.
Halaman staging memperlihatkan label belum diverifikasi/topik belum diketahui.
Null thread tidak berarti General, nol, atau izin mengirim tanpa thread.

## Konfigurasi yang disiapkan (tidak dipasang pada .env)

`B2C_STAGING_COLUMNS_JSON` sekarang untuk tiga kolom fisik:

```json
{"source":"source_tab","source_key":"stable_uuid","payload":"payload_json"}
```

Nama di atas contoh kontrak, bukan schema aktual. `source_key` wajib string
permanen per kiriman; bukan nomor baris atau ID hasil reimport yang berubah.

`B2C_STAGING_JSON_FIELDS` memetakan key payload tiap modul. Contoh sintetis:

```json
{
  "TIAL":{"order_date":"date","status":"status","sto":"sto","sc_in":"sc_in","inet":"inet"},
  "LOGIC_PSB":{"order_date":"date","status":"status","sto":"sto","sc_in":"sc_in","inet":"inet"},
  "LOGIC_MO":{"order_date":"date","status":"status","sto":"sto","sc_in":"sc_in","inet":"inet"}
}
```

Key konfigurasi dibatasi karakter aman, bukan ekspresi SQL/JSON path bebas.
Key Telegram yang diketahui tetap exact `Message ID`/`MSG_ID`, bukan field mapping
operasional yang belum pasti. Schema payload bersarang memerlukan kontrak baru;
adapter saat ini hanya key top-level.

`B2C_STAGING_TELEGRAM_GROUPS` adalah object per modul:

- TIAL: `source_bot` alias; separator tetap `:` dan tidak dikonfigurasi.
- LOGIC_PSB: `source_bot` alias dan `chat_id` string tunggal.
- LOGIC_MO: `source_bot` alias dan `chat_id` string tunggal.

Tidak menuliskan nilai grup produksi di repository atau frontend. Alias bot
hanya label asal, belum bukti verifikasi kepemilikan bot. Konfigurasi ini tidak
membawa token, tidak membuat koneksi, tidak dapat menandai verified=true.
Env `B2C_STAGING_ENABLED` tetap harus persis true untuk melewati gate; tidak
mengubah nilai atau file env pada tahap ini. Pool SELECT tetap terpisah.

## Duplikat, histori dan identitas

HMAC order tetap berasal dari `[source, source_key]`, tidak dari referensi
Telegram. Dua kiriman dengan stable key berbeda tetap dua order walaupun Message
ID sama. Duplicate stable key pada halaman tetap ditolak karena ambigu; tidak
menggabungkan order berdasarkan Message ID saja (ID pesan bersifat lokal chat).
Keunikan lintas halaman harus dijamin kontrak upstream.

Sort/sisip/hapus baris tidak mengubah ID selama source key permanen dipertahankan.
Konfigurasi grup terkini tidak boleh dipakai untuk menyatakan referensi historis
sah. Bila grup/bot pernah berubah, perlu provenance atau mapping historis dengan
batas waktu yang dibuktikan sebelum pengiriman diizinkan. Hapus baris staging
masih menghilangkan tampilan baris, bukan menyimpan audit historis.

## Syarat sebelum PICK/CEK atau balasan diaktifkan

1. Konfirmasi nama/tipe kolom staging, key JSON masing-masing tab, format tanggal
   dan nilai status menggunakan contoh dummy/DDL yang disanitasi.
2. Format TIAL gabungan sudah dikonfirmasi; periksa tiga referensi invalid
   melalui sumber yang berizin, tanpa merekonstruksi ID secara heuristik.
3. Verifikasi provenance bot/grup/pesan untuk setiap record, termasuk perubahan
   grup/bot historis. Jangan memverifikasi semua histori hanya dari mapping kini.
4. Peroleh thread ID dari data/event yang dipercaya, atau bukti eksplisit konteks
   non-topik/General. Ketidakhadiran thread bukan bukti. Rancang model bukti
   verifikasi per referensi; belum ada storage/aksi verifikasi dalam tahap ini.
5. Pastikan stable key permanen dan bedakan retry transport dengan kiriman
   duplikat bisnis; jangan memakai nomor baris Sheets sebagai primary identity.
6. Uji pada sandbox sendiri dengan akun SELECT dan data dummy dahulu. Pengujian
   pesan sungguhan memerlukan persetujuan terpisah dan grup uji sendiri.
7. Tindakan order membutuhkan kontrak kepemilikan/audit, adapter sender dan
   otorisasi yang terpisah. `reference_verified` frontend bukan kontrol keamanan
   tindakan. Belum ada endpoint mutasi staging dan tidak menambahkannya di sini.

## Validasi

`tests/telegram-reference.test.js` mencakup pemisahan TIAL, chat-only, ID
kosong/salah/overflow, key PSB/MO, grup kosong/invalid, histori, thread null,
payload palsu verified, JSON malformed, identifier injection, duplicate stable
key dan kiriman berbeda dengan referensi sama. Executor SQL dimock; tes ini
memeriksa query terbangun, bukan membuktikan JSON_EXTRACT pada MySQL nyata.
Tes staging, lifecycle API tanpa polling dan fitur demo sebelumnya tetap dipakai.
