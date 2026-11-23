# Tanya Yanto

Assistant Web tersedia untuk HD dengan akses modul serta Admin dan Super Admin. Akun lihat-saja dan akun uji Solver tidak memiliki akses. Hanya Super Admin yang dapat mengatur penyedia, menerbitkan artikel, membuat backup, atau memulihkan data. Akses diperiksa kembali pada API dengan sesi dan CSRF yang sudah dipakai Web.

## Persiapan Windows

- Siapkan direktori persisten khusus Tanya Yanto di luar checkout, snapshot rilis, dan direktori yang disajikan Web. Berikan Modify kepada identitas layanan Web dan akses administratif kepada operator yang berwenang. Direktori tidak perlu dapat dibaca Courier. Gunakan satu proses Web penulis untuk satu direktori.
- Tambahkan `HDWORK2_ASSISTANT_DIRECTORY` dengan path absolut tersebut ke konfigurasi runtime Web yang dipin. Bangun frontend dengan `VITE_HDWORK2_ASSISTANT=true` dalam proses persiapan rilis Web. Tanpa pengaturan runtime, endpoint tidak aktif. Tanpa flag build, tombol disembunyikan.
- Jalankan uji DPAPI dengan identitas layanan dan profil Windows yang sama pada direktori uji. DPAPI CurrentUser dan profil Windows melindungi konfigurasi saat istirahat. Uji baca ulang dari proses baru dan pemulihan cadangan sebelum mengaktifkan fitur. Jangan memasukkan key penyedia ke file environment, command line, tiket, atau log.
- Dari akun Super Admin, buka Tanya Yanto, pilih ikon pengaturan, isi Base URL HTTPS dan API key, lalu simpan. Jalankan **Uji konfigurasi tersimpan** untuk membaca daftar model. Masukkan ID model yang diterima, simpan, lalu uji kembali hingga jawaban teks terverifikasi. Setelah meninjau kebijakan retensi penyedia, aktifkan Tanya Yanto.
- API memakai `GET /models` dan `POST /chat/completions` dengan autentikasi Bearer. Jika ID model kosong, uji meminta daftar model. Jika ID sudah tersimpan, uji langsung memakai model tersebut tanpa bergantung pada daftar. Uji koneksi dengan model yang tersimpan dapat membuat satu permintaan inferensi pendek yang dikenai biaya oleh penyedia.

## Preflight terisolasi di PC kantor

Jalankan tahap ini setelah kandidat tersedia di PC kantor. Persiapan memakai worktree, direktori privat, dan port loopback pengujian sendiri. Jangan gunakan konfigurasi, kredensial akun, atau penyimpanan produksi untuk instance pengujian. Updater rutin dapat memilih target main, jadi siapkan preflight rilis Web dengan target commit eksplisit dan catat pin Web aktif serta target rollback terlebih dahulu.

1. Dari PowerShell Administrator, baca identitas Scheduled Task Web aktif tanpa mengambil argumen atau secret. Sesuaikan nama task dengan audit Web.

   ```powershell
   (Get-ScheduledTask -TaskPath '\' -TaskName 'HDWork2-Web-Standby').Principal |
     Select-Object UserId, LogonType
   ```

2. Jalankan uji berikut dari worktree kandidat sebagai identitas dan profil Windows yang sama. Untuk akun layanan seperti LocalService, jalankan lewat harness atau Scheduled Task **pengujian sementara** yang terpisah, bukan melalui action task Web aktif. Pastikan executable Node dapat dijalankan oleh principal tersebut dan direktori temporer pengujian memakai ACL privat. Tes membuat direktori sementara, menyegel key sintetis, membaca ulang lewat instance penyimpanan baru, lalu memulihkan backup. Laporkan kode keluar dan PASS saja. Jalankan percobaan ulang dengan proses baru dalam staging Web untuk membuktikan profil DPAPI konsisten.

   ```powershell
   node --test --test-name-pattern 'Windows DPAPI' tests/tanya-assistant.test.js
   ```

3. Jalankan Web staging di loopback dengan identitas layanan yang sama dan direktori state staging. Di akun Super Admin staging, isi `https://api.dinero.web.id/v1` dan key uji Dinero langsung pada input API Key. Biarkan sakelar **Aktifkan Tanya Yanto** kosong. Simpan lalu klik **Uji konfigurasi tersimpan**. Pastikan ada daftar model aktual, pilih satu ID yang dikembalikan, simpan saat masih nonaktif, lalu ulangi uji sampai daftar model dan jawaban teks terverifikasi. Jangan salin key, header Authorization, atau respons mentah ke laporan.
4. Buat backup staging. Buat perubahan pada artikel uji lalu pulihkan backup dan periksa bahwa artikel kembali. Hentikan dan jalankan ulang **staging saja**, pastikan UI masih menunjukkan key tersimpan, lalu ulangi uji koneksi tanpa memasukkan key lagi. Pastikan chat tetap nonaktif. Kegagalan TLS, DNS, DPAPI, daftar model, atau jawaban teks harus selesai sebelum permintaan aktivasi diajukan.
5. Laporkan pin kandidat dan baseline, hasil DPAPI di bawah identitas layanan, hasil uji Dinero, status nonaktif, serta rencana rollback Web. Minta persetujuan terpisah untuk cutover dan aktivasi. Setelah cutover yang disetujui, uji konfigurasi aktual dalam keadaan nonaktif sebelum mengaktifkan chat.

Server hanya menerima aktivasi setelah respons teks model diverifikasi untuk kombinasi Base URL, API key, dan model yang tersimpan. Perubahan konfigurasi tersebut saat asisten aktif harus disimpan dalam keadaan nonaktif dan diuji kembali.

Permintaan daftar model memiliki batas 15 detik. Permintaan jawaban teks dan verifikasi model memiliki batas 45 detik di server dan 50 detik di browser.

## Knowledge Base dan privasi

Artikel awal meliputi alur ambil/ambil alih order, tindakan selesai dan eskalasi, duplikat, Catatan HD, Live Chat, Rekap, bobot, dan status kerja. Artikel memiliki judul, tag, teks, role, modul, dan status terbit. Modul kosong berlaku untuk semua modul dalam role yang dipilih. Backend hanya menambahkan paling banyak empat artikel terbit yang sesuai role, modul, dan istilah pertanyaan. Tinjau panduan saat alur operasional berubah.

Asisten tidak memiliki akses ke order, Telegram, atau alat mutasi. Hanya pertanyaan, hingga tiga pasangan percakapan terbaru, dan cuplikan panduan yang cocok dikirim ke penyedia. Pesan pengguna dan jawaban tidak ditulis ke penyimpanan atau log aplikasi. Pemeriksaan pola di server mendeteksi beberapa jenis nomor pelanggan dan kredensial, tetapi pengguna tetap harus menghindari mengirim data pribadi atau rahasia. Kebijakan penyimpanan di penyedia berlaku terpisah. Jawaban model ditampilkan sebagai teks.

## Backup dan pemulihan

- **Buat backup** pada pengaturan Super Admin menyimpan salinan konfigurasi dan Knowledge Base terkini di `tanya-backup.dpapi`. Membuat backup lagi mengganti salinan sebelumnya setelah konfirmasi. Akun browser tidak menerima file atau key.
- **Pulihkan backup** mengganti `tanya-state.dpapi` secara atomik dan memuat ulang konfigurasi yang dipulihkan. Jika keadaan saat ini masih dapat dibaca, layanan menyimpan salinannya di `tanya-before-restore.dpapi`. Jika file aktif rusak, pemulihan tetap dapat dilakukan dari backup yang valid. Hasil pemulihan selalu nonaktif dan memerlukan uji model ulang sebelum aktivasi.
- Operator dapat mengarsipkan file terenkripsi dengan ACL privat. DPAPI CurrentUser membutuhkan identitas dan profil Windows yang cocok. File cadangan itu tidak menjamin pemulihan lintas mesin atau akun. Untuk pemulihan bencana lintas mesin, simpan pemulihan profil/materi DPAPI dalam prosedur backup Windows atau masukkan key kembali pada host baru. Simpan sumber artikel terpisah apabila diperlukan untuk pemulihan lintas mesin.
- Untuk menonaktifkan, matikan sakelar di pengaturan. Bila perlu rollback Web, gunakan paket rollback Web yang sudah diverifikasi dan pertahankan direktori Tanya Yanto. Tidak ada migrasi, grant MySQL, atau tindakan Courier.

## Pengujian lokal

Jalankan `node --test tests/tanya-assistant.test.js` untuk API, pemilihan artikel, dan pemulihan. Tes Windows menjalankan DPAPI asli; tes lintas platform memakai codec AES-GCM yang disuntikkan ke fixture. Tes browser `frontend/tests/tanya-yanto.browser.cjs` memakai preview lokal dengan fixture API serta build berflag assistant. Variabel `HD_TANYA_CAPTURE_DIR` menyimpan tangkapan layar.
