# HD Work 2.0 — Check-in & workspace v2 (DEMO)

Branch `feat/hdwork-checkin-workspace-v2`, dari production terbaru `feat/my-work-chat`
commit `92e429f`. Production/config Cloudflare, backend, MySQL, Sheets dan bot tidak diubah.

## Mencoba

```powershell
Set-Location .\frontend
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

Buka `http://localhost:5173/preview/login` pada laptop yang menjalankan Vite.
LOGIN → CHECK-IN bila belum pernah/terakhir OFFLINE → PILIH PEKERJAAN → WORKSPACE.
Persona Admin memakai alur admin lama.

- ONLINE boleh PICK/Ambil Alih dan menangani pekerjaan sendiri.
- SIBUK/OFFLINE memblokir PICK/Ambil Alih baru, tetapi pesan/DONE/GAGAL/ESKALASI dan
  penanganan pekerjaan sendiri tetap tersedia; kepemilikan tidak dilepas.
- Check-in dapat memilih ketiga status. Header bisa mengubah status lintas kategori;
  header chat mobile juga menyediakan dropdown.
- Refresh/menutup browser tidak mengubah status. Login ulang saat ONLINE/SIBUK melewati
  Check-in. Logout aplikasi mengubah hanya akun aktif ke OFFLINE, tanpa melepas order.
  Login berikutnya membutuhkan Check-in lagi. Tidak ada idle/unload auto-OFFLINE.

## Workspace

Pilih Pekerjaan hanya empat kartu, tanpa tabel/monitoring. `/preview/work/B2C` fokus
statistik gabungan/ringkasan TIAL dan LOGIC tanpa tabel PICK. Menu B2C: Dashboard B2C,
TIAL, LOGIC, Pekerjaan Saya. `/preview/work/B2C/TIAL` dan `/preview/work/B2C/LOGIC`
memiliki data/filter terpisah, default MENUNGGU, PROSES CEK, SELESAI (DONE/GAGAL).
Tab DUPLICATE terpisah menjaga visibilitas duplikat, tanpa kemampuan PICK. Langkah
teknis tetap placeholder. Pencarian meliputi kode, HD, STO, SC/INET/TELP sintetis DEMO;
referensi ditampilkan di sel identifier, bukan nomor pelanggan nyata.

Quick PICK TIAL/LOGIC memeriksa status/availability, menonaktifkan tombol selama proses,
menetapkan pemilik/status/timestamp dan membuat reply bot sintetis ke pesan order asli.
Tidak pindah halaman; toast menyampaikan hasil. Kategori lain tetap memakai konfirmasi.
Ambil Alih membutuhkan konfirmasi/ONLINE. Claim service menolak duplikasi, stale owner/
status dan pergantian akun saat pending. Reducer memvalidasi kembali dan menolak PICK
ulang pada order yang sudah dimiliki. Service hanya menjamin satu instance frontend:
backend atomik/transactional claim tetap wajib untuk race lintas tab/perangkat.

## Notifikasi dan persistence

Flag `unopenedBy` per akun terpisah dari `readBy` pesan. Badge menu BARU dan Pesan
berbeda. Membuka menu tidak menghapus BARU. Membuka detail/chat hanya menghapus flag
order tersebut. Pesan baru tetap belum dibaca sampai kartu pesan benar-benar berada
di area scroll percakapan DAN viewport aktif; tab tersembunyi/dialog terbuka tidak
membaca pesan. Tombol menuju pesan belum dilihat membantu membaca pesan di luar layar.

Adapter `persistence.ts`, schema versi 2:
- `hdwork:workspace:v2`: canonical order/ownership/riwayat demo bersama pada browser.
- `hdwork:account:v2:<id>`: status kerja, read IDs, flag BARU terpisah per akun.
- `hdwork:session:v2`: sesi/check-in untuk melanjutkan saat refresh.

Password tidak disimpan. **Gunakan identitas fiktif saja**. localStorage bukan security
boundary. UI penanda pribadi hanya memakai akun bersangkutan. Proyeksi publik tetap
allowlist, tidak memuat kehadiran, referensi SC/INET/TELP, NIK, read flags, raw chat,
lampiran atau metadata internal. Screenshot/data URL sengaja tidak dipersist (quota/
privasi); teks/metadata bertahan dan placeholder jumlah gambar tampil setelah reload.
JSON yang rusak fallback ke demo awal; storage blocked/quota failure ditampilkan sebagai
peringatan, bukan diklaim berhasil. Tidak ada sinkronisasi/anti-PICK lintas perangkat.

## Durasi dan penyelesaian

Waktu mulai disimpan saat PICK, bukan saat halaman dibuka. Daftar proses, inbox dan detail
menampilkan menit/jam, diperbarui 15 detik sekali. DONE/GAGAL menyimpan durasi final;
reopen memulai sesi/waktu baru. Indikator lama default 60 menit (bukan SLA), konfigurasi
`VITE_LONG_ORDER_MINUTES`. DONE menampilkan identifier, Batal, Konfirmasi DONE. GAGAL
wajib alasan/konfirmasi. Eskalasi, transfer, takeover, audit, kredit historis, percakapan
terpisah dan reopen tetap memakai model bersama.

## Validasi

Dari root repo:

```powershell
npm.cmd run build --prefix frontend
npm.cmd run lint --prefix frontend
node --test --test-isolation=none --test-reporter=tap frontend/tests/*.test.ts
```

33 tes model: legacy + 12 skenario status/check-in/persistence/notifikasi, claim pending/
identity change dan durasi. Test legacy check-in ONLINE secara eksplisit sebelum alur
lama, dan takeover memakai mode takeover eksplisit. Runner browser opsional membutuhkan
Playwright/browser di lingkungan uji, Vite aktif (tidak mengubah dependency aplikasi):

```bash
HD_CHROMIUM_PATH=/usr/bin/chromium node frontend/tests/checkin-workspace.browser.cjs
HD_CHROMIUM_PATH=/usr/bin/chromium node frontend/tests/message-visibility.browser.cjs
HD_CHROMIUM_PATH=/usr/bin/chromium node frontend/tests/order-actions.browser.cjs
```

HD_CHROMIUM_PATH opsional bila browser Playwright terpasang; HD_PREVIEW_URL opsional
mengganti localhost. Semua API internal diblokir dalam uji browser. Skenario mencakup
refresh/logout, akun terisolasi, TIAL/LOGIC, Quick PICK/stay/toast, BARU, visibilitas
pesan, pekerjaan sendiri saat OFFLINE, DONE/GAGAL, transfer/eskalasi/reopen, desktop/HP.
Build mempertahankan warning chunk internal >500 kB. Lint memiliki warning lama.

URL Cloudflare Preview harus berasal dari check/deployment resmi, bukan ditebak. Tidak
ada perintah deployment, konfigurasi production, atau merge production pada pekerjaan ini.
