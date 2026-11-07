# B2C staging read-only — kontrak adapter dan pengujian

> Pembaruan TIAL: schema fisik Orders dan format chat-only sudah dikonfirmasi.
> Lihat `tial-confirmed-schema-readonly.md` untuk kontrak TIAL terbaru.
> Rancangan lama tentang separator TIAL dan kolom hipotetis tidak berlaku untuk TIAL.


Branch lokal: `chore/remove-cacti-hdwork2`. Implementasi persiapan, bukan integrasi
MySQL yang sudah diverifikasi. Tidak ada koneksi MySQL, bot, polling atau server
utama dijalankan. Tidak ada perubahan env, SQL, data, kredensial atau sync-hdwork.

## Audit struktur dan batas

Frontend B2C saat ini: `CategoryWorkspace.tsx` membaca `PreviewProvider`, membagi
B2C menjadi TIAL dan LOGIC. Percakapan/actions memakai state demo bersama.
LOGIC PSB/MO belum merupakan dua backend operasional pada prototype tersebut.
Backend order lama membaca tabel orders dengan relasi telegram_groups/order_types,
bukan tabel staging. Service Telegram lama mem-parsing pesan sendiri. Adapter ini
berdiri sendiri dan tidak mengimpor service/order repository tersebut.

Semua fitur demo dipertahankan. Data staging tidak dimasukkan ke reducer demo,
My Work, public monitoring, localStorage atau endpoint mutasi order lama.
Tidak ada konversi ID staging menjadi ID internal orders.

## Endpoint dan halaman

`GET /api/b2c-staging/orders`

- Menggunakan middleware JWT yang sudah ada. Akses sementara SUPER_ADMIN saja;
  staging belum memiliki kontrak city/segment scope. HD/ADMIN mendapat 403.
  Ini bukan API publik. Pemeriksaan revokasi/status akun JWT mengikuti batas
  middleware aplikasi yang sudah ada, belum diperluas pada tugas ini.
- Default nonaktif; tanpa `B2C_STAGING_ENABLED=true` merespons 503 sebelum
  memuat pool staging. Tidak ada fallback ke pool atau kredensial DB operasional.
- Query: `module=TIAL|LOGIC_PSB|LOGIC_MO`, `date=YYYY-MM-DD`, `status`, `sto`,
  `q` (substring literal SC/IN atau INET), `page` mulai 1, `limit` 1–100 (default 25).
- Mapping case-sensitive: Orders → TIAL; solver → LOGIC_PSB; MO → LOGIC_MO.
- Status sumber diteruskan apa adanya, tanpa mengarang mapping DONE/GAGAL.
  Tanggal berdasarkan kolom DATE bisnis Asia/Jakarta dalam kontrak di bawah.
- Hanya SELECT terparameterisasi ke tabel tetap `hd_b2c.sheet_import_test`.
  Sorting tanggal terbaru lalu source_key. Pagination offset dengan hasMore,
  tanpa klaim snapshot konsisten saat sinkronisasi sedang mengubah tabel.
- Respons `source=MYSQL_STAGING`, `readOnly=true`, daftar DTO allowlist, page,
  hasMore. Tidak menampilkan raw payload, kredensial, identitas pelanggan atau
  semua kolom staging. SC/IN dan INET hanya ditujukan untuk workspace internal
  yang berwenang, bukan monitoring publik. Header Cache-Control no-store.
- Tidak ada endpoint POST/PICK/DONE/GAGAL/Telegram untuk sumber ini.

Halaman baru `/b2c/staging` berada di layout internal, melalui login nyata `/login`.
Buka URL tersebut langsung sebagai SUPER_ADMIN. Belum ada menu sidebar tambahan.
Halaman menyediakan filter, pagination, loading/empty/error, Light/Dark melalui
komponen/tema yang ada. Request hanya dilakukan setelah Baca staging ditekan.
Jika gagal, tidak mengganti hasil dengan demo. Login demo `/preview/login` tidak
memberikan akses API internal. Tidak ada token/kredensial database di frontend.

## Pembaruan normalisasi Telegram

Adapter endpoint sekarang mensyaratkan kolom payload JSON. Lihat
`b2c-telegram-reference-normalization.md` untuk konfigurasi kolom JSON dan grup.
Kontrak kolom datar di bawah merupakan rancangan awal, bukan konfigurasi endpoint
yang aktif saat ini. Identitas permanen dan nama kolom fisik tetap wajib dikonfirmasi.

## Kontrak schema — harus dikonfirmasi sebelum diaktifkan

Struktur fisik sheet_import_test belum diberikan atau diinspeksi. Implementasi
ini **tidak mengklaim** kolom fisik berikut sudah ada. Operator harus menyediakan
DDL yang disanitasi atau daftar nama/tipe kolom tanpa nilai pelanggan. Jika tabel
berupa JSON payload atau EAV, diperlukan adapter mapping lanjutan; jangan
mengaktifkan query ini seolah-olah tabel sudah berbentuk kolom kanonik.

| Alias logis | Kontrak |
| --- | --- |
| source | Nama tab tepat: Orders, solver, MO |
| source_key | String immutable unik per kiriman dalam satu source; bukan nomor baris Sheets |
| order_date | SQL DATE tanggal bisnis Asia/Jakarta, bukan DATETIME arbitrer atau teks ambigu |
| status | String status sumber |
| sto | String STO sumber |
| sc_in | String referensi SC/IN; nullable |
| inet | String referensi INET; nullable |

`B2C_STAGING_COLUMNS_JSON` memetakan masing-masing alias ke identifier kolom
fisik sederhana (huruf/angka/underscore, tanpa expression/JSON path/schema).
Contoh kontrak sintetis, **bukan klaim schema nyata**:

```json
{"source":"source_tab","source_key":"source_uuid","order_date":"business_date","status":"source_status","sto":"sto_code","sc_in":"sc_in_reference","inet":"inet_reference"}
```

Nama tabel/schema tetap, bukan input request. Nama kolom konfigurasi divalidasi
allowlist identifier. Filter dan LIMIT/OFFSET memakai binding parameter. Reader
menolak sumber tak sesuai, kunci kosong atau duplikasi ID dalam halaman. Keunikan
lintas tabel/halaman harus dijamin oleh kontrak upstream dan ditinjau sebelum
aktivasi; pemeriksaan halaman bukan pengganti constraint/index yang disetujui.

## Identitas stabil

ID staging = prefix stg_ + HMAC-SHA256 atas `[source, source_key]` dengan kunci
khusus server. Tidak memakai nomor baris, status, tanggal, SC/IN, INET atau hash
seluruh isi yang berubah. Namespace ini berbeda dari ID orders/demo. Mengubah
status/isi atau memindahkan baris tidak mengubah ID selama source_key tetap.

Rekomendasi upstream: UUID permanen yang dibuat sekali per kiriman, atau identitas
Telegram yang benar-benar tersedia dan immutable (bot/chat/message), disimpan
melalui sync-hdwork tanpa diganti setiap upsert. SC/IN atau INET tidak cukup unik;
beberapa kiriman bisa mempunyai referensi sama. ID auto-increment staging yang
berubah saat TRUNCATE/reimport juga tidak cukup. Bila key permanen belum ada,
integrasi identitas **terblokir**; jangan memakai fallback nomor baris/hash konten.

Kontrak ini perlu persetujuan sebelum mengubah Sheets/sync/DDL. Tidak membuat
perubahan tersebut di sini. Rotasi kunci HMAC mengubah seluruh ID; simpan stabil,
backup secara aman, dan rencanakan versioning jika nanti dirotasi. ID opaque bukan
pengganti otorisasi dan belum merupakan ID monitoring publik yang disetujui.

## Konfigurasi baru (nama saja)

- `B2C_STAGING_ENABLED`: default selain true berarti nonaktif.
- `B2C_STAGING_DB_HOST`, `B2C_STAGING_DB_PORT`, `B2C_STAGING_DB_USER`,
  `B2C_STAGING_DB_PASSWORD`: akun baru khusus SELECT tabel staging; tidak memakai
  root, akun sync penulis, atau fallback DB_* lama. Database selalu hd_b2c.
- `B2C_STAGING_COLUMNS_JSON`: kontrak mapping kolom yang telah dikonfirmasi.
- `B2C_STAGING_IDENTITY_KEY`: secret baru minimal 32 byte, berbeda dari JWT/token
  bot, hanya server. Tidak ditaruh pada env VITE_* atau laporan.

Tidak ada file `.env` dibuat/diubah. Pool terpisah lazy, maksimal dua koneksi,
multipleStatements=false, dateStrings=true. Read-only juga harus ditegakkan oleh
GRANT akun database; kode SELECT saja tidak menggantikan least privilege.
Belum ada startup/config PM2 baru atau aktivasi pada PC kantor.

## Pengujian tanpa layanan operasional

```powershell
node --test --test-isolation=none --test-reporter=tap tests/b2c-staging.test.js tests/backend-lifecycle.test.js tests/telegram-order-regression.test.js tests/terminal-session-manager.test.js tests/terminal-recovery-storage.test.js
node --test --test-isolation=none --test-reporter=tap frontend/tests/*.test.ts
npm run build --prefix frontend
npm run lint --prefix frontend
```

Tes adapter memakai executor dummy, identitas/ref sintetis dan tidak memuat driver
MySQL. Memverifikasi mapping tab, SELECT allowlist, binding filter/pagination,
validasi input/identifier, identitas stabil, duplikat, hasMore, proyeksi allowlist,
akses per role dan keadaan nonaktif. Tes lifecycle tetap memakai VM/mock startup
serta memastikan route lama dan route staging terdaftar. Tidak menjalankan tes
socket loopback atau backend utama. Pemeriksaan UI di browser nyata belum dilakukan;
build TypeScript bukan bukti UI/integrasi runtime sudah teruji.

## Langkah berikutnya — menunggu persetujuan

1. Berikan struktur DDL/nama+tipe kolom staging dan contoh format dummy dari tiga
   tab, termasuk semantik tanggal/status, tanpa kredensial atau data pelanggan.
2. Verifikasi identitas permanen sync-hdwork dan kebijakan duplicate vs retry.
3. Setujui pemetaan kolom, normalisasi tanggal/status serta scope kota/segmen/role.
4. Uji pada MySQL sandbox terpisah dengan akun SELECT dan data sintetis; kemudian
   evaluasi indeks/EXPLAIN di sandbox sebelum membaca staging yang dituju.
5. Setelah izin akses tersendiri, pasang konfigurasi server dan uji read-only.
   Polling bot tetap terpisah dan tindakan operasional tetap dinonaktifkan.

Belum commit, push, merge, deploy atau mengubah website online. Adapter ini
menyiapkan jalur data, bukan klaim integrasi staging aktif sudah berhasil.
