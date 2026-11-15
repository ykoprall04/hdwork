# Web: deployment dan batas runtime

Audit: 2026-11-15 · branch `main` · HEAD `2d9c034f7da1a72a5de8777d23ae620b1bb41b88`.

## Mekanisme yang tersedia di checkout ini

`ops/windows/web-native-supervisor.ps1` adalah cooperative owner: memverifikasi SHA config dan source, memakai mutex, menjalankan child Node, menulis READY/STOPPED state, dan menerima graceful stop melalui named pipe. `ops/windows/web-native-control.ps1` menyediakan Inspect, StopFence dan AssertFence; stop mematikan tepat task yang tervalidasi, meminta child berhenti graceful dan membuktikan prosesnya berhenti.

Checkout ini **tidak memiliki** `hdwork-update.cmd`, `scripts/hdwork-web-update.ps1`, atau `scripts/hdwork-web-deployment-controller.ps1`. Maka updater generik satu perintah yang melakukan fetch/build/activate/health check tidak dapat dinyatakan tersedia dari kode di sini. `scripts/frontend-only-release.js` dan `docs/safe-frontend-only-deployment.md` menyediakan rencana/paket frontend statis dengan manifest, backup dan rollback manual/terkontrol; itu bukan updater umum untuk Scheduled Task Web. `scripts/hdwork2-release.ps1` menangani pemeliharaan/rehearsal database, bukan updater Web. Dokumen `docs/operational-deployment-20261109.md` mencatat sejarah deployment snapshot tertentu, bukan prosedur rutin generik.

## Task, pin, health dan rollback

Supervisor menerima `-ControlConfig` dan `-ConfigSha256`, memverifikasi SHA256 byte file config, task identity, file runtime pin, mutex, proses child dan handoff STOP. Control adapter membandingkan action task dengan action yang diharapkan, principal/task identity, process ownership, child PID dan config SHA. Nama task Web yang diizinkan oleh supervisor meliputi `HDWork2-Web`, `HDWork2-Web-Standby`, dan `HDWork2-Web-Rollback`; nama tersebut adalah allowlist kode, bukan bukti task itu terdaftar atau aktif di mesin ini.

Alur updater penuh (paket kandidat, backup file/runtime, handoff candidate, health gate, rollback otomatis dan retensi) **tidak tersedia di checkout yang diaudit**, sehingga detail operasionalnya tidak bisa disertifikasi. Jangan menyalin asumsi dari release-specific docs ke mekanisme permanen. Riwayat deployment Web menyebut snapshot lama dipertahankan dan rollback kode tidak memerlukan restore DB, tetapi ini tidak memverifikasi kemampuan updater branch ini.

## Risiko dan batas

- Handoff berbasis Scheduled Task dan owner cooperative bergantung pada kecocokan path, SHA, principal, ACL, task action dan state; mismatch atau kegagalan start dapat membuat Web belum READY.
- Control stop menonaktifkan task sebelum graceful stop. Bila fence/barrier tidak terbukti, adapter sengaja tidak mengubah kode runtime lebih lanjut; tugas operator mungkin perlu pemulihan terarah.
- Health pada supervisor/control dan health HTTPS aplikasi adalah pemeriksaan berbeda; READY proses saja bukan bukti endpoint publik sehat.
- Courier terpisah dari Web, namun keduanya memakai data MySQL tertentu; perubahan UI-only tidak perlu menyentuh task Courier. Jangan deploy atau ubah runtime dari audit ini.
- Task Scheduler, Web aktif, pin, backup, rollback dan health publik: **tidak diperiksa**, sesuai cakupan read-only kode lokal.

## Aturan audit permanen

Sebelum mengubah deployment, baca dokumen ini dan validasi hanya komponen yang terdampak atau berubah sejak commit yang tercatat. Setiap perubahan arsitektur/deployment memperbarui dokumen ini dan dokumen komponen yang relevan. Selalu catat tanggal, commit, lokasi source, serta hasil; tandai fakta, rencana, dan yang belum terverifikasi secara eksplisit. Jangan memasukkan secret atau data operasional. Hindari mengulang audit yang masih valid, tetapi jangan memperlakukan dokumentasi lama sebagai bukti runtime.
