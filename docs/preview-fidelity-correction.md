# Koreksi migrasi: Preview sebagai sumber desain dan UX

Branch chore/remove-cacti-hdwork2. Semua perubahan lokal frontend/dokumentasi;
backend, kontrak API-only, bot, DB, Sheets, env dan Cloudflare tidak diubah.
Belum commit/push/deploy. Tidak mengaktifkan tindakan order.

## Perbandingan dan perbaikan

| Aspek | Migrasi awal | Koreksi |
| --- | --- | --- |
| Login | Versi tersendiri yang mirip Preview | AuthLayout diekstrak dari PreviewAuth dan digunakan keduanya; handler operasional tetap POST login API |
| Alur | Login langsung jobs | Login → validasi me → check-in lokal → jobs → workspace |
| Check-in | Hilang | CheckInView diekstrak dari Preview, tiga pilihan sama dengan keterangan operasional eksplisit |
| Pilih pekerjaan | Empat kolom desktop/teks/kartu berbeda | JobSelection diekstrak persis dari Jobs Preview, dua kolom mulai sm, satu di HP |
| Header | Versi tiruan | WorkspaceHeader diekstrak dari PreviewApp dan dipakai keduanya |
| Dropdown | Implementasi terpisah | WorkspacePicker Preview asli dipakai operasional, versi tiruan dihapus |
| Navigasi | Sidebar desktop/nav mobile | Navigasi horizontal di semua ukuran sesuai Preview, tersembunyi di check-in/jobs |
| Status header | Hilang | ONLINE/SIBUK/OFFLINE lokal, label belum tersinkronisasi selalu terlihat |
| B2C | Dua kartu sederhana | B2cSummary bersama: enam KPI, ringkasan TIAL/LOGIC terpisah, bagian order terbaru; tanpa angka global palsu |
| Navigasi fitur | LOGIC/monitoring hilang | TIAL, LOGIC, My Work, transfer, produktivitas, monitoring, admin sesuai role dipertahankan |
| Fitur belum aktif | Satu pesan generik | Struktur panel/tab/filter/tabel/composer/section nonaktif; Belum tersedia, tidak ada contoh order atau aktivitas |
| Monitoring | Alias masuk ke demo | /monitoring operasional placeholder; DEMO eksplisit /preview/monitoring, tautan Preview diperbarui |

Komponen visual bersama baru di features/workspace-ui: AuthLayout, WorkspaceHeader,
CheckInView, JobSelection, B2cSummary. Preview tetap memakai reducer/store/persistence
demo sendiri, bukan API. Operasional tidak membungkus state menggunakan PreviewProvider.

My Work mempertahankan statistik placeholder, tab aktif/riwayat, area pencarian,
filter dan layout daftar/percakapan; transfer mempertahankan bulk/perminaan masuk;
produktivitas mempertahankan struktur tabel; LOGIC/kategori lain mempertahankan
filter/tab yang belum diaktifkan. Detail order mempertahankan bagian informasi,
riwayat, tindakan dan pesan nonaktif. Belum ada detail order nyata karena API
staging hanya daftar; tidak merekonstruksi order dari data DEMO atau URL.
Bagian-bagian tanpa data tidak bisa menampilkan transcript/order/riwayat Preview
secara identik tanpa mengarang data. Area itu sengaja kosong dengan label jujur.

## Status check-in operasional

Pilihan hanya disimpan dalam sessionStorage dengan namespace
hdwork:operational:checkin:<userId>, tidak di namespace DEMO. Tidak ada request
attendance atau update bot/MySQL. Status tidak memengaruhi izin PICK, CEK,
RECEK, DONE atau GAGAL; semua tetap nonaktif. Login baru menghapus pilihan lama,
refresh tab yang sama mempertahankan pilihan lokal, logout menghapusnya tanpa
mengubah status backend. Tutup tab mengakhiri preferensi sessionStorage.

Nama status ONLINE bukan bukti pengguna sedang online di server. Semua pilihan
memiliki keterangan belum tersinkronisasi di check-in/header. Status diperlihatkan
untuk menjaga alur/UI, bukan klaim tersedianya API kehadiran.

## Data asli dan keterbatasan

POST auth/login, GET auth/me dan GET b2c-staging/orders tidak diubah kontraknya.
Halaman /b2c/staging tetap membaca service yang sudah ada, dengan pagination,
refresh/error yang sama. Backend tetap membatasi Super Admin. Order SC/IN sama
atau kiriman duplikat tidak digabung oleh koreksi frontend ini.

API daftar belum menyediakan total global/KPI/LOGIC: kartu menggunakan Belum
tersedia, bukan 0 atau jumlah halaman. Tidak mengubah tanggal impor menjadi
tanggal bisnis. Tidak membuat backend check-in, detail, chat, transfer, statistik,
publik, produktivitas atau admin dalam koreksi UI ini.

## Pengujian dan perbandingan gambar

Screenshot pasangan Preview/operasional di /tmp/hdwork-fidelity memakai ukuran
sama: desktop 1440x1000 dan mobile 390x844, untuk login, check-in, jobs, B2C,
LOGIC, My Work, transfer, produktivitas dan Dark Mode. Script memeriksa kolom
jobs desktop=2/HP=1, nav TIAL/LOGIC, ringkasan terpisah, tanpa overflow HP,
status lokal tanpa request mutasi, dan tidak adanya state DEMO pada operasional.

Gambar dibandingkan secara visual untuk layout inti. Bukan pixel-diff absolut:
teks profil/peringatan dan ketersediaan data memang berbeda. Header operasional
bisa lebih tinggi karena label wajib belum tersinkronisasi; struktur card tetap
sama. Tidak menganggap seluruh halaman berdata bisa identik saat backend belum ada.

Tes browser memakai mock API dan data sintetis. Regresi Preview navigation-v3
memastikan alur DEMO/check-in/PICK simulasi/inbox/navigasi/Light-Dark tetap berfungsi.
Tes operasional memverifikasi kontrak login/me/TIAL, refresh, check-in, sesi error,
logout tanpa terminal dan pemisahan demo. Tidak melakukan login nyata kantor
atau query MySQL; smoke test API asli tetap memerlukan lingkungan yang diizinkan.

## File berubah

- App.tsx, InternalRoutes.tsx: flow check-in/route dan monitoring operasional.
- features/operational: Login, SessionProvider, Shell, penghapusan WorkspacePicker
  tiruan; penambahan local-status, local-checkin dan UnavailableWorkflows.
- features/workspace-ui: lima komponen visual diekstrak dari Preview.
- features/preview: PreviewApp, PreviewAuth, CheckInPage, CategoryWorkspace,
  WorkspacePicker dan workspace-navigation memakai visual bersama/tautan DEMO.
- pages/PublicMonitoringPage.tsx: tautan kembali ke namespace DEMO.
- Tes browser operational-migration dan preview-fidelity, serta dokumentasi ini.

Legacy tidak menjadi dasar desain dan tetap tersedia untuk rollback. Risiko
tersisa: status hanya lokal, ID staging belum permanen, belum ada statistik
agregat/detail/chat/backend fitur lain, serta risiko token localStorage dari
implementasi sesi sebelumnya. Review screenshot dan uji akun sendiri pada API
lokal sebelum keputusan commit atau deployment terpisah.
