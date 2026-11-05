# HD Work 2.0 — Frontend Preview

> Pembaruan workspace v2: status/notifikasi dan canonical order demo kini tersimpan
> lokal; gambar tetap sementara. Lihat [checkin-workspace-v2.md](checkin-workspace-v2.md)
> untuk alur login/check-in dan batas simulasi terbaru.


Branch: `feat/hdwork2-frontend-preview`. Perubahan dashboard dan prototipe sebelumnya dipertahankan.

## Melihat preview

Dari root repository:

```bash
npm ci --prefix frontend
npm run dev --prefix frontend -- --host 0.0.0.0
```

Buka port 5173 melalui fasilitas Ports/Preview lingkungan, jika tersedia. Untuk menjalankan
di mesin lokal: `http://localhost:5173/preview/login`.
Gunakan tombol persona Petugas HD, Admin atau Super Admin. Login preview terpisah dari
`/login` operasional. Password preview hanya memvalidasi form, tidak diverifikasi atau disimpan.
Gunakan identitas fiktif; jangan memasukkan kredensial atau identitas pegawai nyata.
Data simulasi hanya di memori provider React: bertahan selama navigasi dan logout/persona
switch pada SPA yang sama, reset saat reload/tab baru. Preferensi tema lama tetap localStorage.

## Halaman dan fitur

- `/preview/login`, `/preview/register`: enam field pendaftaran, PENDING APPROVAL,
  APPROVED, REJECTED, RESUBMITTED; persetujuan dapat disimulasikan oleh admin.
- `/preview/jobs`: B2C, ASSUREN, B2B, REPLACEMENT untuk semua persona HD.
- `/preview/work/B2C/TIAL`, `/preview/work/B2C/LOGIC`: dashboard dan daftar masing-masing.
- `/preview/work/ASSUREN`, `/preview/work/B2B`, `/preview/work/REPLACEMENT`: dashboard kategori.
- `/preview/orders/:monitoringId`: ambil manual tanpa cap, ambil alih dengan konfirmasi,
  pesan terpisah dari DONE/GAGAL, upload/paste gambar, koreksi dengan versi lama,
  persetujuan teks publik, reopen wajib alasan dengan sesi baru.
- `/preview/transfers`: beberapa order ke satu penerima, penerimaan/penolakan seluruh paket,
  tidak kedaluwarsa. Order tetap milik pengirim sebelum diterima. Takeover/perubahan order
  membatalkan permintaan tertunda yang terdampak agar tidak terjadi pemindahan stale.
- `/preview/productivity`: DONE/GAGAL aktif dan kredit historis. Tidak menghitung poin/ranking.
- `/preview/admin`: ringkasan dan pemindahan order aktif oleh admin.
  Subhalaman users, approvals, templates, integrations, audit menyediakan administrasi demo.
- `/monitoring`: tanpa login; proyeksi field publik, kategori termasuk TIAL/LOGIC, pencarian,
  pagination, detail di kanan, riwayat status dan pesan yang dinyatakan aman. Terbaru di atas.

Aturan satu pemilik aktif dijaga reducer. Tidak ada Lepas Order. Logout, akun nonaktif,
atau akhir shift tidak memindahkan pemilik; simulasi tidak menambahkan aksi akhir shift.
Admin dapat menonaktifkan sementara/permanen dan mengaktifkan kembali. Akun nonaktif/belum
approved tidak dapat login preview. Persetujuan transfer melalui bot belum diimplementasikan.
Reopen ditetapkan ke pemilik yang melakukan reopen; alasan dan pemilik sebelumnya dicatat.
Durasi tunggu/pengerjaan sesudah reopen mengikuti sesi baru; timestamp penerimaan tetap asli.

## Batas dan arsitektur

Seluruh fitur baru adalah DEMO frontend. Tidak ada koneksi MySQL, bot aktif, Google Sheets,
migrasi, delivery pesan, API publik baru, atau autentikasi produksi baru. Status antrean
pesan adalah SIMULATED / NOT SENT. Notifikasi berasal dari tindakan lokal/button simulasi,
bukan server push. Langkah teknis khusus TIAL/LOGIC sengaja placeholder, belum ditetapkan.
Maksimal 10 gambar per pesan, 5 MB/gambar untuk menjaga memori preview. Gambar berada di
memori sebagai data URL dan tidak pernah disertakan ke proyeksi publik.

`features/preview/model.ts`: reducer/transisi domain dan proyeksi publik eksplisit.
`context.ts`/`store.tsx`: sumber state simulasi, dapat diganti adapter data pada tahap berikutnya.
`PreviewAuth`, `PreviewApp`, `PreviewOrderDetail`, `PreviewAdmin`: layar reusable memakai
Card, Button, Badge, Dialog, ThemeToggle yang sudah tersedia.
Fitur dan autentikasi operasional lama tetap ada pada route sebelumnya, tidak diubah aturannya.

Proyeksi publik saat ini hanya untuk fixture/simulasi. Pada integrasi nyata, allowlist harus
ditegakkan di server, bukan menyembunyikan data di browser. Teks publik memerlukan persetujuan
simulasi, bukan sanitasi otomatis. Koreksi membatalkan persetujuan sebelumnya. Pesan privat,
revisi, NIK, Telegram ID, gambar, alasan internal dan employee record tidak disertakan pada
proyeksi tersebut. Alias registran menggunakan kode demo stabil, bukan username/NIK.
API publik, pembatasan akses, rate limiting dan channel realtime terpisah perlu dirancang
sebelum menyambungkan data operasional. Arsitektur target tetap Telegram → Bot Python/bot
baru → Express → MySQL pusat → Express → React. Tidak ada perubahan backend pada fase ini.

## Validasi

```bash
npm run build --prefix frontend
npm run lint --prefix frontend
node --test --test-isolation=none --test-reporter=tap frontend/tests/preview-model.test.ts
```

Delapan tes domain memverifikasi bulk transfer, reject/takeover, logout/akun nonaktif,
pesan/revisi/batas gambar, reopen/kredit historis, tanpa cap order, approval registrasi,
dan proyeksi publik. Tes browser lokal memblokir semua API internal, memeriksa alur
registrasi/admin/pengerjaan/publik/mobile/tema serta upload 10 gambar dan paste screenshot.
Build berhasil; peringatan bundle internal >500 kB tetap ada. Lint memiliki peringatan lama.
Screenshot terbaru tersedia pada `/workspace/artifacts/hdwork2-preview/` di mesin ini.
