# Perubahan 4 — Chat dan action bar

## Audit dan batas perubahan

Baseline aplikasi produksi yang dilaporkan operator: ccc646a; helper aktivasi aa47255. Chat existing memakai `/api/operations/chat/:id/messages`, payload `text/requestId/version`, penyimpanan draft per akun/order, dan retry identitas yang sama saat hasil tidak pasti. Tindakan memakai `/orders/:id/actions`, transaksi/lock/version existing, audit dan outbox Courier yang mengikat pesan/topic asli. Tidak ada perubahan backend, schema, parser, flags, mapping, kredensial atau worker dalam perubahan ini. Preview tetap memakai komponennya sendiri.

Enter mengirim chat (kecuali IME composition); Shift+Enter memberi baris baru. Blank ditolak, ref existing mencegah double submit, kegagalan mempertahankan teks dan retry unknown mempertahankan request ID. Refresh data setelah POST sukses tidak dianggap sebagai kegagalan kirim. Status ANTRE tetap dibedakan dari TERKIRIM.

Riwayat chat menjadi area scroll di panel; composer dan action bar berada di bawahnya. Panel tetap 50vw desktop dan fullscreen HP dengan breakpoint tablet existing. DONE/ESKALASI/GAGAL membuka dialog dengan catatan di dalamnya. DONE opsional; FAILED dan ESCALATE wajib nonblank. Tidak ada status optimistis. DONE kosong hanya menjalankan balasan penyelesaian standar backend existing (termasuk format TIAL existing), tanpa POST chat tambahan. ESKALASI memakai audit/outbox existing dan tetap IN_PROGRESS. Error definitif mempertahankan draft; unknown menampilkan retry existing di luar popup.

## LOGIC / SOLVER: pesan belum masuk

Operator melaporkan menu bukan kendala; pesan Telegram `/config_psb` dan `/MO` belum masuk. Kode sudah mendukung keduanya, masing-masing modul LOGIC_PSB dan LOGIC_MO. Perubahan UI tidak mengaktifkan ingress Telegram. Monitoring kini menampilkan `missingCommands` dari readiness API existing agar operator bisa melihat command yang belum tercakup mapping. Akar masalah produksi belum ditetapkan dan tidak boleh disimpulkan dari fixture.

**Semua grup bersama yang enabled+verified dengan profile ALL sudah menerima seluruh command yang didukung, termasuk /config_psb dan /MO. Tidak diperlukan grup SOLVER terpisah atau controller baru.** Fixture ingress/processor mencakup dua grup ALL (non-topic dan topic), kedua command termasuk huruf besar /MO, modul hasil dan isolasi tujuan.

Pemeriksaan operator melalui UI existing, tanpa menjalankan ulang aktivasi web atau mengubah pin Courier:

1. Buka Monitoring Sistem sebagai admin berizin. Catat kesehatan Courier/heartbeat dan kesiapan kategori LOGIC. Lease READY hanya bukti proses, bukan bukti ingress Telegram.
2. Baca Manajemen Grup Telegram: pastikan bot existing yang menerima pesan, chat dan topic aktual tercakup oleh mapping enabled+verified. Acuan update terbaru adalah mapping grup bersama ALL. TIAL1/TIAL2 dan SOLVER1 adalah profile legacy; jangan membuat pemisahan grup baru untuk mengaktifkan LOGIC. Jangan mengedit mapping sebelum identitas grup/topic, baseline cutoff dan kecocokan dengan expectedGroups pada plan existing (jika dipatok) diperiksa operator. Routing existing menolak drift; jangan mengubah pin atau plan untuk melewatinya.
3. Pastikan akun petugas memiliki LOGIC_PSB/LOGIC_MO melalui manajemen pengguna existing. Menu terlihat tidak membuktikan penerimaan pesan. Periksa rentang tanggal/filter agar order masuk tidak tersembunyi.
4. Periksa format command melalui kontrak existing: `/config_psb` wajib ORDER ID dan STO; `/MO` wajib SC/IN dan STO. Gunakan command baru setelah cutoff sesuai konfigurasi, bukan replay pesan/antrean lama.
5. Jika mapping dan format sudah sesuai tetapi pesan tetap tidak masuk, kirim bukti kesehatan, category/profile, chat/topic yang disamarkan, waktu pesan WIB serta format contoh sintetis. Diagnosis berikutnya dilakukan dari bukti operator; tidak membuka akses Telegram/VPN/database produksi.

Aktivasi produksi LOGIC belum dilakukan oleh sesi cloud ini. Tidak ada migrasi, reset cutoff, replay queue atau controller Courier tambahan. Tidak deploy atau merge ke main.

## Pengujian

Fixture transaksi untuk config_psb dan mo memeriksa DONE kosong, FAILED dan ESCALATE, satu audit/outbox pada retry, tujuan reply/topic yang sama, eskalasi nonfinal dan rollback transaksi saat alasan blank. Browser mock memeriksa keyboard, blank/IME, double submit, draft/retry, popup, status menunggu backend, konflik owner, isolasi order, SOLVER route/filter/chat serta action bar setelah scroll pada desktop dan HP. Tidak menggunakan Telegram, VPN atau database produksi.

Hasil cloud: 462 tes backend dan 75 tes unit frontend PASS; tiga suite browser (b2c-workbench, workflow, redesign) PASS terhadap build operasional dengan API mock. Geometry action bar diuji pada desktop 1440, HP 320/390 dan tinggi HP 600 px. Build TypeScript/Vite PASS; lint tanpa error dengan 25 warning baseline yang tidak bertambah. Pemeriksaan diff memastikan source backend/Courier, kontrak, database, script runtime/deployment serta dependency lockfile tidak berubah. Hasil ini bukan bukti ingress/delivery Telegram produksi.
