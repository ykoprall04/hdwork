# HD Work 2.0 — audit frontend dan usulan desain

Tanggal: 11 November 2026. Tahap: audit awal dan rancangan implementasi.

## Baseline yang diperiksa

- Repository `ykoprall04/hdwork`, branch sumber `chore/remove-cacti-hdwork2`, HEAD `7c6258072389c9762adbe5d9f6def8d6efbb126c`.
- `827bb86` merupakan ancestor HEAD. Tidak ada perbedaan file `frontend/` antara commit tersebut dan HEAD. Status deployment produksi tidak diverifikasi dalam pemeriksaan ini.
- Branch pengembangan lokal `frontend/redesign-hdwork2`, worktree `/workspace/work/hdwork-redesign`.
- React 19, React Router 7, Tailwind 4, Base UI, Lucide. Komponen dasar dan tema terang/gelap sudah tersedia; pertahankan fondasi ini.
- Rute operasional berada di `InternalRoutes.tsx` dan `features/operational/Shell.tsx`. `components/AppSidebar.tsx` milik jalur legacy; mengubahnya saja tidak memperbaiki navigasi HD Work 2.0.

## Audit terarah

| Prioritas | Temuan dan sumber | Dampak | Perubahan yang diusulkan |
|---|---|---|---|
| P0 | `Shell.tsx`: satu baris menu horizontal mencampur chat, monitoring, password, dashboard, modul, dan administrasi. | Menu penting tersembunyi saat lebar layar mengecil; posisi menu berubah mengikuti kategori. | Sidebar dengan kelompok tetap, submenu kategori, pengaturan akun di menu profil. |
| P0 | `WorkspaceCounts.tsx`: enam kartu, grid desktop lima kolom, satu kolom pada ponsel. `Recap.tsx` memiliki pola serupa. | Ringkasan menggeser antrean jauh ke bawah dan menghasilkan kartu yatim pada baris berikutnya. | Ringkasan antrean menjadi strip ringkas; dashboard memakai grid 2/3/6 sesuai ruang yang tersedia. |
| P0 | `WorkList.tsx`: statistik besar, notifikasi, tab dan filter mendahului tabel. | Petugas perlu menggulir sebelum membaca order pertama. | Judul ringkas, statistik singkat, tab status, pencarian utama; filter lanjutan dapat dibuka. |
| P1 | `WorkList.tsx` memakai badge outline untuk semua status; komponen demo memiliki badge semantik sendiri. | Status sulit dipindai dan tidak konsisten antarmodul. | Satu pemetaan label/warna/ikon untuk status operasional, termasuk duplikat menunggu dan duplikat ditolak. |
| P1 | Form native dirangkai ulang dengan string class di daftar, rekap, pengguna dan chat. | Tinggi kontrol, label, pesan kesalahan dan jarak tidak seragam. | Komponen Field, FilterBar, SearchInput, DateRange, Pagination dan DataState bersama. |
| P1 | `UserManagement.tsx`: tabel daftar tidak memiliki header kolom. | Arti kolom kurang jelas dan aksesibilitas tabel lemah. | Header semantik dengan `scope=col`, label aksi jelas, keadaan memuat/kosong/gagal konsisten. |
| P1 | `Shell.tsx`: kategori pada detail order dapat mengikuti kategori terakhir di sessionStorage; `JobSelection.tsx` operasional tidak menerima `allowedCategories`. | Konteks navigasi tidak selalu mencerminkan order atau izin modul yang sedang dilihat. | Resolusi menu dari metadata rute/detail dan `canOpenWorkspace`; tampilkan status akses secara jujur. |
| P1 | Teks seperti “live SSE”, “hdwork2”, “izin modul diverifikasi backend” berada di area utama. | Informasi teknis memperebutkan perhatian dengan pekerjaan. | Gunakan teks “Data diperbarui otomatis” dan “Data terakhir belum diperbarui”; detail teknis di monitoring. Tetap jelaskan status lokal serta kondisi pengiriman pesan. |
| P2 | `InternalRoutes.tsx` mengimpor halaman operasional secara eager, sementara App sudah memisah legacy/preview secara lazy. | Ada peluang mengurangi JavaScript awal untuk modul yang jarang dibuka. | Ukur ukuran dan waktu transisi terlebih dahulu, lalu lazy-load admin/chat bila bermanfaat; pertahankan pemulihan kegagalan chunk. |

## Bukti browser

Chromium headless, build pengembangan, cookie/operations/live-chat aktif secara lokal. Akun SUPER_ADMIN dan seluruh respons API menggunakan fixture sintetis melalui intersepsi browser; tidak menghubungi database maupun mengirim tindakan order.

| Viewport | Lebar area menu B2C | Lebar isi menu | Posisi awal tabel TIAL dari atas halaman |
|---|---:|---:|---:|
| 1440 × 900 | 1376 px | 1376 px | 994 px |
| 768 × 900 | 704 px | 1154 px | 1124 px |
| 390 × 900 | 358 px | 1154 px | 1902 px |

Sembilan kombinasi halaman `/jobs`, `/work/B2C`, `/work/B2C/TIAL` dan viewport diperiksa. Tidak ada overflow horizontal pada body atau error JavaScript dalam pemeriksaan ini. Scroll horizontal tetap terjadi pada menu dan tabel. Angka posisi tabel merupakan hasil fixture dan teks akun tersebut, bukan pengukuran semua role atau data produksi.

## Arah desain

Gaya: panel operasional terang dengan latar slate, kartu putih, aksen biru, garis batas tipis, ikon Lucide 18–20 px. Tema gelap mengikuti token semantik yang sama. Hindari ornamen besar di halaman antrean.

- Warna usulan: background `#F8FAFC`, surface `#FFFFFF`, teks `#0F172A`, teks sekunder `#475569`, primary `#1D4ED8`, border `#E2E8F0`. Verifikasi kontras semua state saat implementasi.
- Status: menunggu amber, proses biru, selesai emerald, gagal merah, duplikat violet/slate. Selalu sertakan label teks; warna tidak berdiri sendiri.
- Tipografi: Geist yang sudah terdaftar sebagai dependency, judul halaman 24–28 px, isi 14 px, metadata 12 px. Angka statistik dan durasi tabular.
- Spacing dasar 4 px; padding panel 16–24 px; radius panel 12 px, kontrol 8 px; target sentuh navigasi 44 px.
- Tombol utama biru untuk aksi utama; outline untuk aksi sekunder; destructive untuk aksi berisiko. Pertahankan konfirmasi tindakan yang sudah ada.

## Susunan navigasi

Sidebar desktop 248 px; dapat diciutkan menjadi 72 px. Pada tablet gunakan mode ringkas; pada ponsel gunakan drawer dengan pengelolaan fokus, Escape, backdrop, dan tombol tutup. Drawer menutup setelah navigasi. Link aktif tetap terbaca saat membuka detail.

```text
HD Work 2.0
Beranda / Pilih pekerjaan              /jobs

RUANG KERJA
B2C                                   /work/B2C
  Ringkasan                           /work/B2C
  TIAL / REQ                          /work/B2C/TIAL
  LOGIC / SOLVER                      /work/B2C/LOGIC
ASSUREN                               /work/ASSUREN
B2B                                   /work/B2B
Replacement                           /work/REPLACEMENT

OPERASIONAL
Telegram Live Chat                    /chat
Rekap Pekerjaan                        /recap

PENGELOLAAN
Monitoring Sistem                     /admin/system
Manajemen Pengguna                    /admin/users

Profil · status lokal · tema · keluar
  Ganti password                      /change-password
  Ubah check-in                       /check-in
```

Visibilitas mengikuti role, grants, dan feature flag yang sudah ada. REQ tetap dalam antrean TIAL pada workflow aktif; jangan membuat antrean kedua dengan data yang sama. Menu fitur yang belum tersedia tidak menjadi tujuan utama. Monitoring Sistem mengikuti izin yang berlaku saat ini; jangan mengubah otorisasi karena pemindahan kelompok visual.

## Rancangan halaman

**Dashboard B2C:** breadcrumb dan judul → strip status pembaruan → ringkasan total/menunggu/proses/selesai/gagal/durasi → panel TIAL dan LOGIC berisi angka dan tautan langsung ke antrean. Pertahankan definisi statistik, scope akses, dan rentang “seluruh tanggal”. Tidak menambahkan grafik tanpa API pendukung.

**Daftar pekerjaan:** breadcrumb/judul → ringkasan kompak → tab Order masuk/Duplikat/Proses cek/Selesai → pencarian dan tombol Filter → tabel → pagination. Search dan tab tetap terlihat tanpa membuka filter lanjutan. Filter aktif diringkas menjadi chip yang bisa dihapus. Di ponsel, ringkasan 2 kolom yang padat dan baris order berupa kartu identifier/status/petugas/aksi; desktop tetap tabel. Hilangkan ruang kosong yang tidak membantu pemindaian.

**Detail order:** header identifier/status, tautan kembali yang mempertahankan konteks daftar, dua kolom data dan tindakan pada desktop; satu kolom pada ponsel. Riwayat di bawah. Draft dan aturan PICK, takeover, DONE/GAGAL serta reopen tetap mengikuti perilaku sekarang.

**Chat:** daftar percakapan dan panel pesan; pada ponsel tampilkan satu panel dengan tombol kembali ke daftar. Bedakan pesan antre, terkirim dan gagal; hanya tampilkan status yang benar-benar didukung respons API.

**Rekap/admin/form:** PageHeader yang sama, toolbar filter konsisten, tabel berheader, status memuat/kosong/gagal dan pagination yang seragam. Kelompokkan form panjang; error dekat field dan pesan hasil di area yang stabil.

## Paket implementasi berikutnya

1. **Fondasi dan shell operasional:** metadata navigasi terpusat, OperationalSidebar, drawer, PageHeader/breadcrumb, menu profil; pertahankan route dan guard. Hindari mengubah shared preview header secara global tanpa verifikasi preview.
2. **Dashboard dan antrean:** padatkan WorkspaceCounts, benahi grid enam metrik, tata ulang filter, status badge dan mobile order card. Jangan mengubah kontrak API.
3. **Pemerataan halaman:** detail, chat, rekap, admin, check-in dan autentikasi mengikuti token serta komponen yang sama.
4. **Optimasi terukur:** validasi transisi, jumlah request dan SSE; pecah bundle hanya berdasarkan pengukuran. Pertahankan debounce, pembatalan request, satu SSE bersama, dan data lama saat refresh.

Setiap paket menghasilkan perubahan yang dapat ditinjau dan diuji. Audit ini menjadi baseline; pemeriksaan berikutnya berfokus pada perubahan yang dibuat.

## Kriteria penerimaan

- Sidebar aktif dan breadcrumb benar pada tautan langsung, refresh, pergantian workspace, dan detail order; kategori lain maksimal dua klik dari shell desktop.
- Tidak ada overflow body pada 390, 768, 1440 px; keyboard dapat membuka/menutup drawer dan submenu, fokus kembali ke pemicu; navigasi punya label aksesibel.
- Target antrean desktop: header tabel muncul sebelum 650 px pada viewport 1440 × 900 dengan filter lanjutan tertutup; ponsel: order pertama ditargetkan terlihat sebelum 900 px pada 390 × 900 dengan fixture yang sama.
- Tampilan loading, kosong, error, data lama dan izin ditolak dapat dibedakan; angka kosong tidak berubah menjadi nol fiktif.
- Tidak ada request mutasi akibat navigasi, pengiriman draft otomatis, atau pelonggaran role/module guard.
- Build TypeScript/Vite dan lint diperiksa; browser regression yang relevan mencakup operasi, cookie session, role, preview, pagination/filter dan draft.

## Validasi baseline

- `npm ci --cache /workspace/work/npm-cache --no-audit --no-fund`: berhasil, lockfile tidak berubah.
- `npm run build`: berhasil (TypeScript dan Vite).
- `npm run lint`: exit 0 dengan warning yang sudah ada pada baseline; bukan hasil bersih tanpa warning.
- Browser Chromium: sembilan pemeriksaan geometri dengan fixture sintetis, tanpa error JavaScript. Belum merupakan pengujian seluruh modul atau performa produksi.
- Dokumen ini belum menerapkan perubahan UI atau melakukan deployment.

## Implementasi paket pertama — 11 November 2026

Paket pertama telah diterapkan pada branch pengembangan lokal. Bagian audit di atas tetap menjadi catatan baseline sebelum perubahan.

- Shell operasional memakai sidebar desktop yang dapat diciutkan dan drawer untuk layar di bawah 1024 px. Submenu B2C, menu akun, status lokal, breadcrumb, skip link dan navigasi keyboard tersedia. Menu serta kartu pilihan pekerjaan mengikuti grants modul; otorisasi server tidak diubah.
- Dashboard B2C memakai enam metrik dalam grid responsif dan kartu tautan antrean TIAL/REQ serta LOGIC/SOLVER sesuai izin.
- Antrean memakai ringkasan kompak, tab status, pencarian langsung dan filter lanjutan yang dapat dibuka. Status filter tanggal tetap terlihat ketika panel ditutup. Tabel beralih ke susunan kartu pada ponsel dengan satu instance tindakan per order.
- Badge status operasional disatukan; PageHeader digunakan pada dashboard, antrean, detail, rekap dan manajemen pengguna. Tabel pengguna kini memiliki header semantik.
- Token warna, font Geist, spacing, kontrol form, fokus dan tema gelap diterapkan pada shell operasional. Layout legacy/preview tidak diganti.
- Perbaikan navigasi: debounce pencarian tidak lagi menjadwalkan reset pagination saat pencarian awal belum berubah. Sebelumnya, klik cepat ke halaman kedua bisa dibatalkan oleh timer 350 ms tersebut.

Hasil geometri fixture awal setelah implementasi: tabel TIAL mulai sekitar 551 px pada desktop 1440 px, 561 px pada tablet 768 px dan 792 px pada ponsel 390 px. Pemeriksaan ulang juga mencakup 320 px. Ini pengukuran sintetis, bukan metrik performa produksi.

Validasi:

- TypeScript/Vite build berhasil, termasuk build dengan cookie/operations/live-chat aktif dan API lokal untuk uji browser.
- Lint exit 0, tetap 25 warning baseline; tidak ada warning pada komponen baru.
- 27 pengujian unit untuk workflow, akses workspace, cookie-session race, draft chat dan tindakan order lolos.
- `redesign.browser.cjs`: sidebar/collapse tersimpan, submenu aktif, status lokal, filter, dashboard, geometri 320–1440 px, drawer/Escape/fokus, perubahan kategori, grants dan role, tema gelap, logout serta pembersihan check-in.
- `workflow.browser.cjs`: pagination/order baru, PICK/takeover, draft, DONE/GAGAL/reopen/duplikat, rekap, ekspor dengan respons fixture, SHOW_ONLY dan preview. Fixture identifier diperbarui agar mengikuti identifier SC yang benar-benar ditampilkan; penyelesaian job ekspor disimulasikan eksplisit setelah browser memulai unduhan.
- `checkin-workspace.browser.cjs`: regresi preview/check-in, kategori, tindakan dan mobile lolos tanpa request API.

Seluruh respons operasional untuk browser test menggunakan fixture sintetis. Belum ada merge, push, deployment, perubahan database, atau pengujian integrasi backend produksi. Penataan mendalam chat, autentikasi dan detail administrasi serta pemecahan bundle tetap menjadi paket lanjutan.
