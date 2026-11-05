# HD Work 2.0 — Tahap 2

## Audit dan dasar kerja

Dashboard hasil redesign masih tersedia sebagai perubahan lokal: DashboardPage.tsx modified,
use-dashboard.ts dan dashboard-model.ts untracked, belum di HEAD 6b8bd5f.
Ketiganya dipertahankan, bukan dibuat ulang pada Tahap 2.

- React Router sebelumnya membungkus seluruh route dengan AuthProvider.
- ProtectedRoute mengharuskan token untuk halaman internal; aturan ini tidak diubah.
- AppSidebar tetap menjadi layout internal, dengan drawer mobile dan tema yang sama.
- AuthProvider kini hanya dipasang pada kelompok route internal/login. Route publik berada
  di luar AuthProvider, ProtectedRoute, AppSidebar dan NetworkToolsWorkspace.
- Komponen tema, Card, Badge dan Button lama dipakai ulang. Dashboard, order, detail,
  attendance, team, laporan, user, grup dan network tools lama tetap tersedia.

## Route dan status implementasi

- `/monitoring`: tanpa login, DEMO read-only, default tanggal hari ini Asia/Jakarta.
- `/monitoring/:monitoringId`: detail terbatas, riwayat status, contoh pesan aman publik.
- `/workspace`: dashboard rancangan HD, wajib login dan role HD.
- `/workspace/queue`, `/workspace/my-work`, `/workspace/history`,
  `/workspace/transfers`, `/workspace/productivity`: halaman awal DEMO.
- `/workspace/orders/:monitoringId`: detail order DEMO dan tindakan nonaktif.
- Login menyediakan link monitoring publik; sidebar menyediakan pintu workspace dan monitoring.

Semua fitur Tahap 2 menggunakan fixture sintetis terpisah di features/operations/demo-data.ts.
Tidak ada fetch, Socket.IO, API publik baru, migrasi, perubahan MySQL atau Telegram.
Tidak ada autentikasi tiruan pada kode produk. Pengujian UI memakai browser fixture lokal.
Kategori B2C/ASSUREN/B2B/REPLACEMENT dan status MENUNGGU/PROSES CEK/DONE/GAGAL/DUPLICATE
hanya representasi rancangan, bukan pemetaan baru terhadap status backend lama.
Semua kiriman demo termasuk duplikat tampil. Statistik unik mengecualikan DUPLICATE.
Statistik mengikuti filter; pagination enam kiriman per halaman. Pesan publik bersifat
contoh dan memiliki publicApproved=true; tidak menampilkan lampiran atau pesan internal.

## Perilaku masa depan, belum diaktifkan

- Ambil manual, tanpa batas order aktif; satu pemegang aktif. Tidak ada Lepas Order.
- Logout/akhir shift tidak menghapus kepemilikan.
- Ambil alih tanpa persetujuan; kirim ke rekan memerlukan persetujuan.
- Bulk satu penerima, Terima Semua/Tolak Semua, tanpa kedaluwarsa; web/Telegram pribadi.
- Setiap perpindahan memiliki riwayat. Banyak pesan pengecekan, lalu tindakan DONE/GAGAL
  terpisah. Reopen oleh semua HD wajib alasan, tanpa batas, menciptakan sesi baru.
- Kredit aktif mengikuti penetap DONE/GAGAL terakhir; kredit historis dipertahankan.
  Statistik unik mengikuti status terakhir. Tidak ada poin, formula skor atau ranking baru.

Backend lama masih memiliki aturan berbeda, termasuk batas order aktif dan alur reassign.
Tombol rancangan sengaja nonaktif dan tidak disambungkan ke endpoint lama tersebut.
Dashboard lama tetap melaporkan kapasitas API lama secara jujur.

## Kontrak keamanan sebelum tahap integrasi

Perlu kesepakatan DTO publik allowlist yang berdiri sendiri: identifier monitoring opaque,
kategori, status, timestamp yang diizinkan, alias publik petugas (bukan identitas internal),
referensi duplikat publik, riwayat status terbatas, teks yang sudah disetujui aman publik.
Jangan mengirim DTO internal lalu menyembunyikannya melalui CSS/client-side filtering.
Tidak boleh ada nomor layanan lengkap, NIK, identitas pelanggan, kredensial, lampiran,
raw Telegram, detail SSH, token atau ID internal. Identifier DEMO saat ini bukan desain
identifier produksi; generator identifier aman harus dirancang pada tahap backend.

Endpoint dan channel realtime publik harus terpisah dari API/socket internal; validasi
server-side, sanitasi, kontrol akses field, rate limiting, pagination server, publikasi
pesan, deduplikasi, dan pengujian kebocoran wajib dirancang sebelum data nyata diaktifkan.
Real-time penerimaan Telegram, keamanan API publik dan rate limiting BELUM diimplementasikan.
Tidak ada klaim bahwa prototipe frontend memenuhi keamanan API produksi.
