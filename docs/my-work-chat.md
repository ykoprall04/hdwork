# Pekerjaan Saya & percakapan order — prototype

> Pembaruan workspace v2: status/notifikasi dan canonical order demo kini tersimpan
> lokal; gambar tetap sementara. Lihat [checkin-workspace-v2.md](checkin-workspace-v2.md)
> untuk alur login/check-in dan batas simulasi terbaru.


Branch fitur: `feat/my-work-chat`, dibuat dari remote terbaru
`feat/hdwork2-frontend-preview` pada commit `763652a` (termasuk perbaikan dependency Socket.IO).
Tidak ada perubahan backend, database, bot Telegram atau deployment.

## Mencoba

```powershell
Set-Location .\frontend
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

Buka `http://localhost:5173/preview/login`, pilih persona Petugas HD,
lalu menu **Pekerjaan Saya** (`/preview/my-work`). Login simulasi tidak menggunakan
kredensial produksi. Semua data berada di memori browser dan reset saat reload.

- B2C/TIAL, B2C/LOGIC, ASSUREN, B2B dan REPLACEMENT tampil dalam satu inbox.
- Tab Aktif hanya menampilkan order milik akun aktif. Riwayat menampilkan order
  selesai yang dimiliki atau pernah melibatkan akun tersebut sebelum perpindahan.
- Statistik Aktif/DONE/GAGAL/Total mengikuti kepemilikan saat ini, tidak menghitung
  order yang telah dipindahkan sebagai milik lama.
- Pencarian kode/STO, filter kategori, status dan tanggal penerimaan (WIB).
- Desktop: daftar kiri, percakapan kanan. HP: daftar terlebih dahulu, lalu chat
  layar penuh dengan tombol kembali; scroll halaman belakang dikunci selama chat terbuka.
- Percakapan dibatasi ke order milik sendiri/riwayat keterlibatan. Mantan pemilik
  dapat membaca riwayat, tetapi tidak menerima notifikasi atau mengirim pesan baru.

## Uji notifikasi

Pilih target order milik sendiri pada **Order penerima pesan**, pilih pengirim
Bot/Petugas Telegram, lalu **Pesan Telegram Masuk**. Jika order tidak sedang dibuka,
badge bertambah dan order naik menurut aktivitas terakhir. Membukanya menandai pesan
terbaca hanya untuk pemilik tersebut. Pesan yang datang saat chat terbuka langsung
terbaca. Counter dan daftar aktif berubah mengikuti perpindahan kepemilikan.

## Semantik pesan

`chat-model.ts` menggabungkan pesan bot/Telegram sintetis dan pesan web yang sudah ada,
tanpa menggandakan sumber data pesan web. Setiap pesan mempunyai orderId dan replyToMessageId.
ID pesan asli adalah `TG-DEMO-ORDER-<monitoringId>`; ini fixture, bukan ID Telegram sungguhan.
Teks web tetap persis yang diketik; nama pengirim ditampilkan sebagai metadata saja.
Semua reply web diarahkan ke pesan asli order, bukan pesan terakhir pada percakapan.
Pesan lama dari layar pengerjaan juga muncul dalam chat. Koreksi/gambar/status pekerjaan
menggunakan model prototype yang sama. Komposer diaktifkan hanya untuk pemilik pada PROSES CEK.
Maksimal 10 gambar per pesan dan 5 MB per gambar, mendukung upload/paste.
Draft direset ketika berpindah percakapan agar tidak terkirim ke order yang berbeda.

Ambil Order menghasilkan bot simulasi `🟡 Data di cek [Nama HD]`. Pindah ke
Pekerjaan Saya untuk melihat order tersebut. Detail & tindakan tetap menyediakan
DONE/GAGAL, reopen, dan transfer. Riwayat participants diperbarui pada claim/takeover,
transfer yang diterima, perpindahan admin, dan reopen; pesan dan sesi lama tetap ada.
Metadata chat, readBy, participants dan ID pesan Telegram asli tidak dimasukkan ke
proyeksi monitoring publik. Publikasi teks web tetap mengikuti persetujuan demo lama.

## Validasi

```powershell
npm.cmd run build
npm.cmd run lint
node --test --test-isolation=none --test-reporter=tap tests/*.test.ts
```

Enam tes chat dan delapan tes prototype lama memeriksa isolasi, exact text/reply ID,
private unread/read, bot claim, ownership/participation, transfer, reopen, dan proyeksi
publik. Pengujian Chromium memakai API yang diblokir dan mencakup desktop/mobile,
tema, notifikasi/sorting, isolasi percakapan/draft, upload/limit gambar, DONE→Riwayat,
serta regresi registrasi/admin/publikasi/bulk transfer/paste screenshot/dashboard lama.
Build berhasil dengan peringatan chunk internal lama >500 kB. Lint mempertahankan
peringatan lama; fitur baru tidak menambahkan peringatan.
