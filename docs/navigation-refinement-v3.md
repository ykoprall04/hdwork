# HD Work 2.0 — Navigation refinement V3

Branch tetap `feat/hdwork-checkin-workspace-v2`, tanpa branch baru, merge/push ke
production `feat/my-work-chat`, atau perubahan konfigurasi Cloudflare.

## Hasil

- `/preview/jobs`: header akun/status/tema/logout/dropdown dan empat kartu, tanpa
  navigasi operasional, banner workspace lama atau tabel.
- Dropdown di kanan identitas aplikasi membuka B2C/ASSUREN/B2B/REPLACEMENT langsung,
  menunjukkan centang aktif dan menutup setelah dipilih. Item **Lihat Semua Pekerjaan**
  kembali ke empat kartu. Label jobs **Pilih Pekerjaan**, workspace **HD <kategori>**.
  Memilih kategori aktif dari inbox tetap membuka dashboard kategori tersebut.
- Navigasi B2C tunggal: Dashboard B2C, TIAL, LOGIC, Pekerjaan Saya, Transfer Order,
  Produktivitas HD, Monitoring Publik. Navigasi kedua/back-to-jobs berulang dihapus.
- Kategori lain hanya dashboard kategori masing-masing + menu bersama, tanpa TIAL/LOGIC.
  Inbox tetap gabungan semua kategori. Admin/Super Admin tetap memiliki Dashboard Admin.
- Dashboard B2C mempertahankan enam statistik dan ringkasan TIAL/LOGIC, tanpa menu
  duplikat atau shortcut kembali yang berulang. Daftar TIAL/LOGIC/filter/Quick PICK
  dan workflow terpisah tetap ada melalui navigasi utama.

## Konteks dan mobile

Konteks kategori berasal dari URL workspace dan preferensi lokal per akun pada key
`hdwork:navigation:v3:<id>`. Jobs/check-in tidak menampilkan kategori aktif.
Inbox/transfer/produktivitas mempertahankan kategori terakhir. Metadata navigasi ini
terpisah dari status kerja, check-in, order, kepemilikan dan notifikasi.
Storage terblokir tidak menghalangi navigasi kategori pada sesi yang sama.

Base UI Menu memberikan radio/check indicator, keyboard dan popup mengikuti viewport.
Header responsif membungkus grup tanpa menutupi akun/status/logout. Header tersedia
pada HP termasuk chat: panel chat menempati sisa layar di bawah header, dengan tinggi
header dari ResizeObserver. Scroll lock dilepas saat perpindahan kategori. Penandaan
pesan terlihat memperhitungkan header sticky dan menu agar pesan tertutup tidak terbaca.

Aturan kerja terdahulu tidak diubah: ONLINE/SIBUK/OFFLINE, logout→OFFLINE, persistence,
Quick PICK/anti-duplikasi lokal, BARU vs pesan, durasi, DONE/GAGAL, eskalasi, transfer,
takeover, reopen, audit dan batas simulasi backend tetap berlaku.

## File utama

- `PreviewApp.tsx`: guard/login terpisah dari layout dan satu navigasi utama.
- `WorkspacePicker.tsx`: dropdown header.
- `workspace-navigation.ts`: pemetaan route/menu/key preferensi per akun.
- `CategoryWorkspace.tsx`: penghapusan menu/back link ganda tanpa menghapus isi workspace.
- `MyWorkPage.tsx`: penghapusan back-to-jobs, penyesuaian chat HP/header dan visible-read.
- `tests/workspace-navigation.test.ts`, `tests/navigation-v3.browser.cjs`: tes baru.
- `tests/preview-navigation.helpers.cjs`: helper dropdown/all jobs bersama untuk browser.
- Runner check-in dan order actions diperbarui mengikuti navigasi baru; skenario lama
  tetap diuji, bukan dihapus agar lewat.

## Mencoba dan validasi

Dari root repo:

```powershell
npm.cmd ci --prefix frontend
npm.cmd run dev --prefix frontend -- --host 127.0.0.1 --port 5173
```

Buka `http://localhost:5173/preview/login` → Petugas HD → Check-in → empat kartu.

```bash
npm run build --prefix frontend
npm run lint --prefix frontend
node --test --test-isolation=none --test-reporter=tap frontend/tests/*.test.ts
node --test --test-reporter=tap tests/*.test.js
HD_CHROMIUM_PATH=/usr/bin/chromium node frontend/tests/navigation-v3.browser.cjs
HD_CHROMIUM_PATH=/usr/bin/chromium node frontend/tests/checkin-workspace.browser.cjs
HD_CHROMIUM_PATH=/usr/bin/chromium node frontend/tests/order-actions.browser.cjs
HD_CHROMIUM_PATH=/usr/bin/chromium node frontend/tests/message-visibility.browser.cjs
```

Runner browser memerlukan Playwright/browser pada lingkungan uji; tidak mengubah dependency
aplikasi/lockfile. Semua API internal diblokir. HD_CHROMIUM_PATH opsional jika browser
Playwright terpasang; HD_PREVIEW_URL opsional mengganti localhost. Screenshot navigasi
tersimpan di subfolder `hd-nav-v3` pada temp directory OS. Warning bundle >500 kB dan
warning lint lama tetap dilaporkan.

Cloudflare Preview diserahkan ke integrasi branch otomatis. URL hanya boleh dilaporkan
dari hasil check/deployment resmi yang terverifikasi, bukan diterka.
