# Optimasi frontend: refresh TIAL, request, tabel dan chunk recovery

Branch chore/remove-cacti-hdwork2. Perubahan lokal frontend/tes/dokumentasi,
belum commit/push/deploy. Backend, database, bot, workflow, URL dan kontrak
login tidak diubah. Lazy loading Preview/Legacy tetap dipertahankan.

## Perbandingan perilaku sebelum dan sesudah

| Area | Sebelum | Sesudah |
| --- | --- | --- |
| Refresh query TIAL yang sama | setResult(null), tabel dilepas lalu dipasang kembali | Data terakhir tetap di DOM, indikator pembaruan pada slot tinggi tetap |
| Error sementara 503/network | Hasil dikosongkan | Data terakhir ditandai belum terkini, waktu sukses terakhir dipertahankan |
| Akses 401/403 | Hasil dihapus | Tetap dihapus segera; refresh dihentikan, validasi me periodik tetap berjalan |
| Query/filter/page berubah | Data lama dibuang | Tetap dibuang; tidak mencampur hasil query lama dan baru |
| Filter teks ekuivalen setelah trim | Objek state baru memicu request lagi | Key query kanonik sama, tanpa request tambahan |
| Validasi me bersamaan | Bisa mengirim request duplikat | Pending request per token+base URL digabung; hasil selesai tidak dicache |
| Payload tabel sama | Array/objek baru setiap respons | Result/array/baris dipertahankan identitasnya jika nilainya sama |
| Satu baris berubah | Seluruh map elemen dibuat kembali | Memo table/row dan structural sharing mempertahankan tetangga yang tidak berubah |
| Chunk Preview/Legacy gagal | Tidak ada UI recovery route | Error boundary, retry eksplisit dan reload URL yang sama |

Ini perbandingan berdasarkan kode awal dan assertion tes sesudah, bukan klaim
pengukuran waktu render/latensi pengguna produksi. Tidak menambah virtualisasi
karena tabel sudah dipaginasi. Tidak mengubah hasil pencarian, urutan atau batas
halaman, dan tidak dedup berdasarkan SC/IN.

## Batas keamanan dan keakuratan

- Retensi data hanya untuk refresh query/halaman/token yang sama. Filter atau
  halaman berbeda menghapus hasil lama. Tidak menaruh respons ke localStorage.
- 503/network dapat meninggalkan data lama yang jelas ditandai belum terkini;
  ini bukan fallback DEMO atau bukti server masih mengizinkan data terbaru.
- 401/403 menghapus data dan menghentikan refresh sampai retry/akses diperiksa.
  Backend tetap otoritas izin. SessionProvider tetap memanggil me saat awal dan
  sekitar 60 detik setelah request sebelumnya selesai; kegagalan validasi sesi
  tetap memblokir halaman terlindungi, bukan memakai profil cached sebagai izin.
- Coalescing hanya berlaku selama request pending, tidak memakai TTL cache
  keputusan autentikasi. Token/endpoint berbeda tidak berbagi hasil. Subscriber
  yang dibatalkan tidak menerima hasil. Jika tidak ada pemakai lagi, request
  dibatalkan setelah satu tick; ini memungkinkan efek StrictMode menggunakan
  request yang sama tanpa membuka akses atau menyimpan credential baru.
- Profil yang identik dan context value distabilkan untuk menghindari rerender;
  perubahan name/username/role/city/id tetap diterapkan dan role/inactive tetap
  berasal dari me/database. Tidak mengurangi frekuensi validasi backend.

## Chunk retry

Initial lazy component disimpan per loader agar identitasnya tetap stabil saat
Suspense belum commit. Tanpa ini, lazy baru dapat dibuat berulang saat rejection
sehingga fallback error tidak muncul. Retry eksplisit membuat lazy type baru
karena React.lazy menyimpan rejection. Browser juga dapat menyimpan kegagalan
ES module; opsi Muat ulang halaman adalah fallback eksplisit, tanpa reload loop,
URL token/query tambahan, atau pemutihan autentikasi. URL dan storage sesi tetap.
State hanya-memori dapat hilang ketika halaman dimuat ulang; tidak ada jaminan
recovery draft/attachment Preview yang memang belum dipersist sebelumnya.

## Tes dan bukti

Unit baru memeriksa coalescing, abort independen, pemisahan token, pembatalan
request yang ditinggalkan, tidak ada cache hasil selesai, structural sharing,
perubahan baris/order/metadata, dan duplikat SC/IN tetap berbeda.

Browser dengan API mock/fake clock memverifikasi satu request me dan staging
awal di StrictMode, nol request tambahan untuk filter whitespace ekuivalen,
node baris tetap sama selama dan setelah refresh payload identik, error 503
bertanda stale, pembersihan pada 403, serta logout ketika me ditolak.
Tes lain memblokir chunk Preview/Legacy lalu memverifikasi error boundary,
retry/reload, URL tetap dan tidak ada detail exception pada UI.

Regresi TIAL filter/pagination/refresh/error/empty, login operasional, Preview
navigasi/mobile/Light-Dark dan lazy route tetap dijalankan. Tes tidak mengakses
MySQL, Telegram atau API kantor. Tidak mengklaim benchmark render produksi.

Risiko tersisa: data terakhir memang bisa tertinggal saat gangguan API sehingga
peringatan harus diperhatikan; pending-request sharing perlu direview bila nanti
ada parameter otorisasi lain selain token+base; retry import kadang memerlukan
reload karena cache browser. Tidak ada perubahan strategi autentikasi/token
localStorage dari fase sebelumnya.
