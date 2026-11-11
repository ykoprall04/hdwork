# HD Work 2.0 — B2C workbench, tiga batch

Baseline: branch `frontend/redesign-hdwork2`, commit `090aa82643a46856d8963909b3ecbb2d8c9d95bf`.
Tanggal pengembangan: 11 November 2026. Pekerjaan dilakukan di cloud Linux; produksi tetap di Windows dan tidak diakses dari sesi pengembangan.

## Audit sebelum perubahan

- `features/operational/navigation.ts`, `Shell.tsx` dan `local-checkin.tsx`: kategori mengikuti grants, tanpa pembatasan menu B2C untuk pengguna biasa. Check-in memerlukan tombol lanjut terpisah; status lokal dapat diubah dari menu akun.
- `features/workflow/WorkList.tsx`: enam kolom dan navigasi ke halaman detail penuh. Belum ada panel kanan.
- `Actions.tsx`: REOPEN sudah memiliki konfirmasi, tetapi DONE/GAGAL belum. Setiap percobaan tindakan membuat requestId baru. Draft DONE/GAGAL berada pada penyimpanan lokal aplikasi.
- `LiveChat.tsx` dan `chat-draft.ts`: sudah memisahkan draft berdasarkan akun dan order, memakai CSRF dan requestId untuk kiriman chat. Belum memperingatkan perpindahan dengan draft. UI dan data chat belum dapat digunakan bersama oleh panel pekerjaan.
- `src/operations/mutate.js` dan `claim-protection.js`: transaksi, row lock, pemeriksaan versi, hd2_web_requests, audit, dan enqueue Courier sudah tersedia. Semua ini digunakan kembali.
- `src/chat/service.js`: server menentukan bot/chat/topic/pesan induk dari order, memeriksa owner dan grants, menyimpan chat/audit/outbox dalam transaksi. Pembacaan pesan memakai `m.order_id` dan scope modul. Resolusi reply masuk sudah memeriksa bot/chat/topic/anchor dan ACK yang benar-benar terkirim.
- `src/courier/delivery-state.js` dan mysql-store: retry RATE_LIMIT terbatas dan queue fencing tersedia. NETWORK/UNKNOWN/lease expired bukan bukti pesan ditolak; hasil tidak pasti tidak boleh diulang otomatis.
- `src/operations/read.js`: raw_text sudah disimpan dan dibaca secara internal, tetapi requestText hanya dikembalikan untuk REQ/manual. Endpoint detail terautentikasi/no-store dan dibatasi grants modul.

## Batch 1 — navigasi

Pengguna HD, Admin dan View Only melihat pilihan kategori HD B2C sesuai grants B2C. Kategori lain tidak muncul pada menu atau pilihan pekerjaan mereka. Super Admin melihat semua kategori. Ini pengaturan visibilitas: tidak menambahkan grants maupun melewati WorkspaceBoundary/otorisasi API. Super Admin tanpa grants tertentu tetap menerima penolakan data pada kategori itu.

Klik kartu ONLINE/SIBUK/OFFLINE pada check-in langsung menyimpan pilihan dan menuju `/jobs`. Pilihan status juga tersedia di atas halaman; perubahan dari menu akun menuju `/jobs`. Tidak ada logout atau mutasi backend akibat perubahan status. Status tetap preferensi tab, bukan absensi atau kehadiran server dan tidak mengubah kepemilikan order.

## Batch 2 — pekerjaan

- PROSES CEK memakai tiga kolom: order (termasuk modul/perintah), petugas, durasi.
- Klik identifier membuka panel kanan nonmodal: 50% viewport desktop, 65% tablet, penuh pada layar di bawah 768 px. Daftar tetap terpasang dan dapat dipakai memilih order lain. Ctrl/Cmd+klik tetap membuka halaman detail melalui tautan biasa.
- Header panel memiliki tutup, order sebelumnya/berikutnya pada halaman daftar yang sedang dimuat, identifier dan status. Panel tidak perlu ditutup untuk pindah order. Jika order tidak lagi masuk filter setelah selesai, detail tetap terbuka; navigasi mengikuti daftar terbaru.
- Isi panel berurutan: pesan asli Telegram, tindakan, feedback Courier, live chat per order. Jika sumber pesan belum ada, UI menyatakan belum tersedia; tidak merekonstruksi pesan seolah-olah asli.
- `OrderChat` digunakan oleh panel dan halaman Live Chat. Pembacaan/draft/pending-send dipisahkan per akun+order. Pergantian komponen chat memakai key akun+order; respons lama tidak dapat menimpa percakapan terpilih.
- Draft dipertahankan saat pindah/menutup panel. Ada peringatan pada pemilihan order, navigasi link, shortcut status/logout, browser Back, dan unload ketika browser mengizinkannya. Draft tidak dikirim otomatis.
- Browser mobile memakai panel penuh dengan scroll isi sendiri, kontrol prev/next dan tombol tutup; tidak membuat salinan kedua form atau tindakan order.

## Batch 3 — keamanan dan kontrak operasional

### DONE/GAGAL

UI menampilkan dialog konfirmasi dengan catatan sebelum mengirim. Payload menyertakan `confirm: true`; server menolak DONE/FAILED tanpa nilai boolean tersebut. Catatan GAGAL tetap wajib. Versi dan catatan dibekukan ketika dialog dibuka agar perubahan owner/status selama dialog terbuka menghasilkan konflik, bukan mengeksekusi keputusan lama pada state baru.

### ESKALASI

Tindakan API `ESCALATE` hanya untuk HD aktif, pemilik order IN_PROGRESS, dengan grant modul dan alasan valid 1–2000 karakter. Menggunakan endpoint actions yang sama: transaksi, lock, versi, idempotency, audit dan Courier yang sama.

Eskalasi mempertahankan status IN_PROGRESS, owner, waktu mulai/selesai dan data final. Versi bertambah dan audit `ESCALATE` menyimpan alasan. Balasan `⚠️ Eskalasi oleh <nama>\n<alasan>` masuk outbox untuk pesan/topic asli. Tidak memindahkan petugas, menetapkan tim tujuan, membuka workflow baru atau menyelesaikan order. RECEK tetap belum didefinisikan/diaktifkan.

Detail API mengiklankan `capabilities.escalate` dan `capabilities.completionConfirmation`. Frontend menonaktifkan ESKALASI jika kapabilitas tidak tersedia; akun trial tetap tidak dipromosikan ke jalur eskalasi umum.

### Retry dan isolasi

- Identitas/payload tindakan yang hasil HTTP-nya tidak pasti disimpan per akun+order. UI hanya mengizinkan pemeriksaan/ulangan dengan requestId dan payload asli; tidak membuat tindakan baru sebagai retry. Logout membersihkan penyimpanan tersebut.
- Kiriman chat yang belum pasti mempertahankan requestId, versi dan teks asli. Teks dibuat read-only sampai hasilnya diketahui. Pemeriksaan permintaan lama tetap dapat dicoba jika owner berubah; server mengembalikan hasil yang sudah committed atau menolak permintaan yang belum diterapkan sesuai aturan owner.
- Ini retry HTTP terhadap idempotency store, bukan pengiriman Telegram kedua. Pengiriman fisik tetap sepenuhnya milik Courier existing.
- Bot, chat_id, thread_id dan reply_to_message_id tidak diterima sebagai override dari browser. Row locking/versi mencegah dua PICK berhasil pada order yang sama.
- Retry/lease/fencing Courier, cutoff aktivasi, journal, antrean lama dan DEAD yang belum pasti tidak diubah atau diputar ulang.
- Pesan asli ditambahkan sebagai `originalMessage` hanya pada detail internal yang lolos scope modul. Field terstruktur yang sebelumnya dimasking tetap dimasking. Pesan asli tidak ditambahkan ke monitoring publik, daftar global atau export.

## Validasi

- Full backend suite: 431 pengujian pada fixture/mock lokal, termasuk concurrency, action/CSRF/scope, idempotency, route Telegram dan fencing.
- Full frontend unit suite: 75 pengujian, termasuk visibilitas kategori, penyimpanan pending action dan isolasi akun/order.
- Browser workbench: status langsung/jobs tanpa logout, Super Admin vs HD, tabel 3 kolom, panel 50%, pesan asli, prev/next tanpa mengganti panel, peringatan draft/link/status/Back, respons chat terlambat, pemisahan draft, kirim ulang HTTP chat dan eskalasi, konflik owner, konfirmasi DONE/GAGAL, kapabilitas backend lama, 320/390 px.
- Browser regresi workflow: pagination/order baru, PICK/takeover, draft tindakan, DONE/GAGAL/reopen/duplikat, rekap, ekspor fixture, SHOW_ONLY dan preview.
- Browser regresi redesign: sidebar/collapse, status, filter, dashboard, drawer/fokus, grants, tema gelap dan logout.
- Build TypeScript/Vite dan lint diperiksa. Warning baseline yang tidak terkait tidak disembunyikan.
- Pengujian historis Shared Groups dipindah ke clone lokal disposable pada commit rilis historis yang tepat. Guard rilis aslinya tidak diubah agar frontend baru tidak lolos sebagai paket Shared Groups lama.
- Tes sentinel PowerShell menerima LF/CRLF yang setara, tanpa mengubah script deployment operasional, untuk menghindari kegagalan representasi akhir baris Windows yang sudah ditemukan pada rilis sebelumnya.

Semua bukti di atas merupakan pengujian cloud dengan fixture/disposable, bukan bukti pengiriman Telegram atau integrasi MySQL produksi. Native integration runner diperbarui untuk kontrak confirm, tetapi tidak dijalankan terhadap Windows/produksi.

## Rencana rilis dan pemulihan

Ini rilis terkoordinasi backend web + frontend. Jangan menyebut penyelesaian tiga batch sebagai deploy frontend-only: server memerlukan policy konfirmasi, tindakan ESCALATE dan respons detail baru. Tidak diperlukan migrasi SQL baru atau perubahan Courier, grants, DPAPI, kredensial maupun autostart untuk implementasi kode ini.

Sebelum penerapan Windows: ambil bukti runtime/config source hashes/health terkini, siapkan snapshot web dan build yang provenance-nya cocok, serta backup frontend dan backend web yang kompatibel dengan Shared Groups/fencing. Gunakan prosedur rilis yang sesuai untuk backend web; jangan memakai paket Shared Groups lama atau hanya menyalin frontend sambil mengklaim ESKALASI aktif. Jangan mengubah hash konfigurasi autostart secara manual untuk menyembunyikan drift.

Selama cutover, tab UI lama dapat menerima penolakan DONE/GAGAL tanpa confirm dari backend baru. Ini fail-closed; pengguna perlu memuat ulang UI baru. UI baru pada backend lama menonaktifkan ESKALASI dan menyatakan pesan asli belum tersedia jika endpoint belum mendukungnya.

Verifikasi nyata di Windows harus mencakup owner/konfirmasi/eskalasi nonfinal, original message, serta chat dua order pada grup/topic yang sudah disetujui. Gunakan order uji baru, bukan antrean lama. Jika gagal, hentikan penerapan dan pulihkan snapshot web/frontend yang kompatibel; jangan downgrade Courier/backend di bawah baseline fencing Shared Groups atau mengembalikan data mapping/antrean lama.

Tidak ada deployment produksi yang dijalankan dalam pekerjaan pengembangan ini.
