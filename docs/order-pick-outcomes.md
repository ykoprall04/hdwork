# PICK dashboard dan outcome pada chat — frontend DEMO

Branch: `feat/my-work-chat`. Tidak ada perubahan backend, MySQL, Sheets, atau bot aktif.

## Cara mencoba

Jalankan Vite dari folder frontend, buka `/preview/login`, pilih Petugas HD.

- Pilih HD B2C (gabungan), TIAL, LOGIC, ASSUREN, B2B atau REPLACEMENT.
- Tabel tetap enam kolom dengan header dan struktur yang sama. PICK/Buka/Ambil Alih
  berada di sel Identifier monitoring di kanan kode, sebelum kolom Kategori.
- MENUNGGU: PICK dengan konfirmasi. Sesudahnya PROSES CEK, pemilik akun aktif,
  reply bot simulasi `🟡 Data di cek [Nama HD]`, order muncul di Pekerjaan Saya.
- PROSES CEK milik sendiri: Buka mengarah langsung ke `/preview/my-work/:monitoringId`.
- PROSES CEK milik orang lain: Ambil Alih dengan konfirmasi. Riwayat menyimpan
  pemilik lama dan baru. Konfirmasi stale ditolak jika status/pemilik telah berubah.
- DONE/GAGAL/DUPLICATE: tidak ada kontrol pick/takeover. Link identifier tetap
  membuka detail; DUPLICATE tidak dapat diambil melalui model maupun UI.

## Penyelesaian dan eskalasi

Header percakapan menampilkan DONE, GAGAL, ESKALASI dekat status dan link detail.
Komponen tindakan yang sama dipakai di Detail Order agar aturan tidak berbeda.
Hanya pemilik pada PROSES CEK yang dapat menjalankan tindakan.

- DONE: dialog konfirmasi, simpan pelaku/nama/waktu/sesi, lalu masuk Riwayat.
- GAGAL: alasan nonblank wajib, langkah konfirmasi terpisah, simpan alasan dan
  pelaku/waktu/sesi. Model juga menolak GAGAL tanpa alasan, termasuk dari jalur lama.
- ESKALASI: tujuan dan keterangan nonblank, lalu konfirmasi. Menambah record dan
  audit/event tanpa mengganti status/pemilik atau membatalkan transfer tertunda.
  Pengiriman pesan, eskalasi lanjutan, DONE/GAGAL tetap dapat dilakukan.
- Indikator eskalasi per sesi tampil di tabel kategori, daftar dan header chat,
  serta detail. Daftar eskalasi di chat menampilkan nama, tujuan, keterangan, waktu.
- Outcome/escalation arrays dan event lama tetap tersimpan saat reopen. Reopen
  memulai sesi baru; indikator sesi lama tidak dianggap eskalasi baru.

Dashboard/filter/statistik, detail, chat dan Riwayat memakai reducer/provider yang
sama. Tidak ada salinan ownership atau dataset baru. Teks dan gambar percakapan
serta reply-to-original-message behavior dipertahankan. Alasan/tujuan internal dan
metadata outcome tidak dimasukkan ke proyeksi monitoring publik.

## File utama

- `features/operations/components.tsx`: slot opsional pada identifier/status,
  tanpa menambah kolom dan tanpa mengaktifkan tindakan pada tabel legacy/read-only.
- `OrderPickButton.tsx`: konfirmasi PICK/takeover dan link Buka.
- `OrderOutcomeActions.tsx`: form/konfirmasi dan guard pemilik/status.
- `OrderEscalationBadge.tsx`: indikator eskalasi dari state bersama.
- `model.ts`: validasi, outcome history, escalation history, audit.
- `PreviewApp.tsx`, `MyWorkPage.tsx`, `PreviewOrderDetail.tsx`: pemasangan komponen.

## Pengujian

Dari root repo:

```bash
npm run build --prefix frontend
npm run lint --prefix frontend
node --test --test-isolation=none --test-reporter=tap frontend/tests/*.test.ts
```

21 tes model (7 tambahan) mencakup claim/reply, stale takeover, blok terminal/duplicate,
DONE, alasan GAGAL, repeated escalation, guard nonowner/terminal, serta regresi
transfer/reopen/chat/notifikasi/proyeksi publik. Tes lama diperbarui untuk memberi
alasan pada GAGAL sesuai aturan baru.

`frontend/tests/order-actions.browser.cjs` menguji UI nyata untuk PICK/cancel/Buka,
takeover, enam kolom di seluruh scope, form wajib, DONE/GAGAL/eskalasi berulang,
chat setelah eskalasi, reopen/Riwayat, desktop dan HP. Seluruh API internal diblokir.
Runner membutuhkan Playwright dan browser pada lingkungan pengujian; dependency
runtime aplikasi/lockfile tidak diubah hanya untuk runner ini. Dengan Vite berjalan:

```bash
HD_CHROMIUM_PATH=/usr/bin/chromium node frontend/tests/order-actions.browser.cjs
```

HD_CHROMIUM_PATH opsional bila browser Playwright sudah terpasang; HD_PREVIEW_URL
opsional bila server tidak menggunakan `http://127.0.0.1:5173`.
Screenshot runner disimpan pada subfolder `hd-order-actions` di temp directory OS.
Build memberi peringatan chunk internal lama >500 kB. Lint tetap memiliki peringatan
lama; tidak ada peringatan baru pada fitur ini. Regresi browser registrasi/admin,
publikasi, upload/paste, bulk transfer dan dashboard kategori juga dijalankan.
