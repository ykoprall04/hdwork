# Cinematic Night Login

## Cakupan rilis

Mode malam pada login operasional memuat MP4 H.264 dan poster WebP sebagai aset statis Vite. Nama file ber-hash menjadi identitas cache. Server HTTPS Web melayani kedua aset bernama versi sebagai cache publik immutable. MP4 mendukung permintaan satu rentang byte dan mengembalikan 206 atau 416. Login HTML tetap no-cache. Server tidak mengubah atau mengodekan media. Uji Firefox/Safari dan perjalanan HTTPS melalui edge kantor sebelum rilis. Uji browser dalam repositori memakai Chromium.

## Preflight Windows

1. Catat pin Web aktif, status READY, health HTTPS dan identitas proses Courier melalui prosedur baca-saja. Cocokkan cakupan perubahan terhadap pin Web, bukan terhadap commit Courier.
2. Rekonsiliasi silsilah rilis Web dan main secara terpisah. Updater resmi memilih origin/main dan mengharuskan pin Web aktif menjadi leluhurnya. Jika pemeriksaan leluhur gagal, hentikan. Tinjau delta lintas branch dan jangan gunakan rilis ini untuk membawa perubahan lain tanpa persetujuan.
3. Setelah rekonsiliasi dan integrasi disetujui, fetch main dari worktree main yang bersih dan tinjau daftar delta. Bangun kandidat di worktree terpisah dengan builder resmi:

   ```powershell
   $env:VITE_API_BASE_URL = 'https://hdwork2.yoloo.space'
   $env:VITE_HDWORK2_ASSISTANT = 'true'
   node .\scripts\build-operational-frontend.js --build
   ```

   Pertahankan nilai flag Tanya Yanto sesuai baseline Web yang dikonfirmasi. Cocokkan dua entri `assets/HDWork-night-loop-*.mp4` dan `assets/night-poster-*.webp` beserta hash di release-manifest.json dan payload yang dihasilkan dari frontend/dist. Updater resmi menyalin seluruh file hasil build, mengecualikan release-manifest.json dari runtime. Pastikan `src/local-web.js` juga masuk payload.
4. Jalankan `node --test tests/night-login-media.test.js` dan browser fixture dengan `node tests/night-login-video.browser.cjs` pada preview terisolasi yang memakai API origin lokal sesuai konfigurasi preview. Di staging HTTPS, cek HEAD video dengan MIME `video/mp4`, `Accept-Ranges: bytes` dan cache immutable, GET Range `bytes=0-1` dengan status 206, lalu uji video, fallback, login/logout dan tema siang. Untuk Chrome/Safari mobile, verifikasi autoplay dan pemulihan dari background pada perangkat fisik.
5. Jalankan `.\hdwork-update.cmd -DryRun` dari worktree main setelah persetujuan integrasi. Tinjau target, delta, build dan rollback sebelum meminta persetujuan cutover. Dry-run updater standar memeriksa target dan delta, sehingga validasi fisik aset dilakukan lewat build terisolasi pada langkah 3.

## Cutover dan rollback

Setelah persetujuan cutover, jalankan `.\hdwork-update.cmd -KeepPrevious` dari worktree main dengan flag build yang sudah diverifikasi. Periksa target aktif, READY dan health HTTPS dengan TLS, serta MIME, byte range, dan cache dari jalur HTTPS produksi. Uji login dan mode siang dengan sesi yang diotorisasi. Cocokkan kembali identitas proses Courier dan konfigurasi Tanya Yanto.

Simpan lokasi paket rollback yang dilaporkan updater. Pada kegagalan startup atau health, updater resmi memulihkan file Web dan pin Scheduled Task dari backup. Verifikasi baseline kembali READY dan health HTTPS. Jika masalah ditemukan setelah aktivasi berhasil, gunakan paket rilis Web yang sama melalui prosedur handoff dan rollback yang ditinjau. Verifikasi hash `manifest.json`, `backup/`, dan `rollback-control.json`, hentikan Web secara kooperatif, pulihkan file dan pin lama, lalu cek READY dan HTTPS. Aset ber-hash kandidat tidak dirujuk oleh build sebelumnya. Pertahankan MySQL, Courier dan folder privat Tanya Yanto selama pemulihan.
