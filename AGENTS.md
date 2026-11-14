# HD Work 2.0 — Permanent Development Rules

## 1. Tujuan utama

HD Work 2.0 wajib mudah dikembangkan, diperbarui, dipelihara, dan dioperasikan dalam jangka panjang.

**Kemudahan pengembangan adalah persyaratan utama, bukan fitur tambahan.**

Jangan mengorbankan kemudahan pengembangan demi kompleksitas pengamanan yang tidak diperlukan.

## 2. Arsitektur yang dipertahankan

- Frontend: React, TypeScript, Vite.
- Backend: Node.js, Express.
- Database: MySQL 8.4.
- Telegram Courier: Node.js/Python.
- Runtime: Windows PC kantor.
- Repository resmi: `ykoprall04/hdwork`.
- Branch utama: `main`.
- Folder utama: `D:\HDWork2-New`.

Pertahankan aplikasi dan fitur yang sudah berfungsi. Jangan melakukan rewrite besar tanpa kebutuhan nyata dan persetujuan pengguna.

## 3. Prinsip pengembangan

1. Utamakan solusi sederhana, modular, dan mudah dipelihara.
2. Periksa kode yang sudah ada sebelum membuat komponen baru.
3. Gunakan kembali mekanisme existing jika sesuai.
4. Jangan membuat sistem pengamanan berlapis tanpa alasan teknis yang terbukti.
5. Jangan menambah approval manual untuk perubahan rutin yang dapat diverifikasi otomatis.
6. Jangan berhenti pada audit jika tugas pengguna adalah implementasi.
7. Jangan memperluas scope pekerjaan tanpa persetujuan.
8. Jangan membuat clone, worktree, service, atau folder permanen baru tanpa kebutuhan yang jelas.
9. Hindari hardcode commit, snapshot, dan konfigurasi khusus satu release untuk proses update rutin.
10. Setiap fitur baru harus tetap mudah diperbarui pada versi berikutnya.

## 4. GitHub dan deployment

Sebelum mengubah mekanisme update atau deployment, baca status terkini di [`docs/DEPLOYMENT-STATUS.md`](docs/DEPLOYMENT-STATUS.md). Perbarui dokumen itu saat status atau kemampuan updater berubah.

GitHub `main` adalah sumber kode resmi.

Target alur permanen:

`Codex / Claude → GitHub main → hdwork-update.cmd → Pull → Build → Deploy → Health Check`

Persyaratan:

- Satu perintah CMD untuk pembaruan rutin.
- Web dan Courier dapat diperbarui secara independen.
- Komponen yang tidak berubah tidak perlu direstart.
- Tidak ada kewajiban membuat prosedur deployment baru untuk setiap commit.
- Mekanisme update harus dapat digunakan berulang kali.
- Gagal update tidak boleh merusak data atau layanan yang masih berjalan.
- Perubahan database yang tidak kompatibel harus ditangani secara eksplisit.
- Jangan menganggap sistem update sudah selesai sebelum terbukti bekerja.

## 5. Perlindungan operasional

- Jangan mengganggu 12 bot Telegram pribadi.
- Jangan menghapus atau mereset database operasional.
- Pertahankan journal, FIFO, offset, antrean, dan writer fence.
- Jangan menjalankan dua Courier aktif yang mengambil kepemilikan sama.
- Gunakan penghentian dan pergantian Courier yang aman.
- Jangan mengunggah `.env`, token, kredensial, backup database, atau data privat ke GitHub.

Perlindungan ini harus diterapkan tanpa menghambat update Web yang tidak berkaitan dengan Courier.

## 6. Pengujian

- Jalankan pengujian yang relevan dengan perubahan.
- Mock dan dry-run adalah alat pengujian, bukan larangan deployment permanen.
- Jangan menambahkan larangan deployment yang tidak diminta pengguna.
- Deployment nyata boleh dilakukan jika diminta atau diizinkan pengguna dan pemeriksaan keselamatan terpenuhi.
- Jangan melewati pengaman penting hanya untuk memaksakan keberhasilan.

## 7. Penanganan BLOCKED

Jika menemukan blocker:

1. Jelaskan penyebab teknis secara spesifik.
2. Tentukan perbaikan terkecil.
3. Implementasikan perbaikan jika berada dalam scope dan aman.
4. Lanjutkan tugas utama setelah blocker terselesaikan.
5. Jangan mengulang audit yang sama tanpa informasi baru.
6. Jangan membuat status BLOCKED hanya karena mekanisme yang diminta belum tersedia; evaluasi apakah mekanisme itu dapat dibuat.
7. Jika benar-benar tidak aman melanjutkan, berhenti dan jelaskan bukti serta tindakan yang diperlukan.

## 8. Larangan kompleksitas berlebihan

Jangan membuat:

- Mekanisme deployment khusus untuk setiap commit.
- Approval berlapis tanpa kebutuhan nyata.
- Snapshot permanen berulang yang tidak diperlukan.
- Supervisor tambahan untuk menyelesaikan masalah sederhana.
- Ketergantungan baru antara Web dan Courier yang sebenarnya independen.
- Prosedur manual panjang untuk update rutin.

## 9. Kriteria keberhasilan

Pekerjaan dianggap selesai jika:

- Fitur yang diminta berfungsi.
- Pengujian relevan lulus.
- Tidak merusak fitur existing.
- Source code tetap mudah dipelihara.
- Perubahan kompatibel dengan mekanisme update rutin.
- Status deployment dan hasil pekerjaan dilaporkan secara jelas.

**Prinsip utama: HD Work 2.0 harus semakin mudah dikembangkan seiring waktu, bukan semakin sulit.**
