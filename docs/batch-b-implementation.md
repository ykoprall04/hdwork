# Batch B - implementasi lokal #9-#18

Worktree: `D:\HDWork2-BatchB`, branch `codex/batch-b`. Status berikut berarti implementasi kode selesai, bukan PASS end-to-end.

| Fitur | Status implementasi | Hasil |
|---|---|---|
| #9 Auto-refresh | Selesai | Satu SSE bersama per tab, coalescing 250 ms, refresh pemulihan setiap 60 detik saat tab terlihat. Pagination dipertahankan; kedatangan pada halaman lanjutan menampilkan pemberitahuan. |
| #10 Notifikasi | Selesai | Banner dan suara opt-in lewat interaksi pengguna; event ID monoton, deduplikasi sebelum coalescing dan penyimpanan penanda per sesi/scope. Snapshot awal dan backlog sebelum koneksi tidak membunyikan suara. Jumlah kedatangan dibatasi workspace. |
| #11 Pencarian | Selesai | Backend SC/IN, INET, NO INET/TELP, NO VOICE dan STO; case-insensitive, parameterized SQL, escape wildcard, debounce 350 ms. Pagination direset ketika pencarian diterapkan. |
| #12 Filter | Selesai | Tab/status, tanggal WIB, command dan petugas; filter petugas kini tersedia untuk PROSES CEK dan SELESAI. Pemilihan HD memindahkan cakupan ke semua order sehingga tidak bertabrakan dengan ORDER SAYA. |
| #13 Double CEK | Selesai | Service `claim-protection` memisahkan SELECT FOR UPDATE dan pemeriksaan version. Seluruh perubahan tetap satu transaksi bersama idempotency request, audit dan outbox; konflik HTTP 409. |
| #14 Timer | Selesai | Timestamp server, berjalan setiap detik, membeku pada finishedAt. Format HH:mm dengan jam tidak dibatasi 24; data timestamp tidak dipotong. |
| #15 Aktivitas | Selesai | Audit append-only existing dipertahankan: actor, from/to, timestamp, alasan dan pergantian owner. Audit baru selalu menyimpan requestId dan outboxId; replay tidak menambah event. UI riwayat existing tetap digunakan. |
| #16 Alasan GAGAL | Selesai | Validasi backend existing dipertahankan dan diverifikasi: alasan terpangkas wajib, tersimpan completion_note/audit dan masuk teks outbox. Tidak ada pengiriman Telegram nyata. |
| #17 Feedback | Selesai; perlu integrasi grant | DTO daftar/detail menampilkan ANTRE/TERKIRIM/GAGAL/TIDAK_PASTI dari outbox yang terkait request order. SENT memerlukan Telegram message ID. Transport error dan expired lease ditahan DEAD untuk tinjauan; hanya RATE_LIMIT eksplisit yang aman untuk retry. |
| #18 Statistik | Selesai | Total/status existing ditambah durationSeconds, durationCount, averageDurationSeconds dari timestamp DONE/FAILED yang valid. Rata-rata gabungan dibobot berdasarkan jumlah order, bukan rata-rata antar-workspace. Komponen desain Preview tetap dipakai. |

## Integrasi dengan Batch A

- Gunakan `lockOrder(connection, id)` dalam transaksi yang sama dengan perubahan order. Setelah otorisasi dan pengecekan replay idempotency, panggil `assertVersion(order, input.version)` sebelum transition. Jangan memindahkan version check sebelum pengembalian hasil replay.
- `src/operations/mutate.js` hanya mengganti seam locking dan menambahkan korelasi audit `requestId/outboxId`. Pertahankan saat menggabungkan perubahan aksi Batch A.
- `src/operations/policy.js` hanya menambah pencarian. Validasi status dan alasan existing tidak diubah.
- `WorkDetail.tsx` hanya memasang komponen `WorkTimer` dan `FeedbackStatus`. Batch A dapat memasang kedua komponen tersebut pada halaman detail akhirnya.
- Respons `/api/operations/orders` dan `/orders/:id` memperoleh field opsional `feedback: {status,deliveryId,errorCode} | null`. Endpoint tidak berubah. Frontend operasional memerlukan VITE_HDWORK2_AUTH_COOKIE=true dan VITE_HDWORK2_OPERATIONS=true, sesuai flag existing. Nama base path mengikuti konfigurasi operations existing.
- `/recap` dan `/overview` memperoleh durationSeconds, durationCount, averageDurationSeconds. `/overview.all` menggunakan penjumlahan durasi/jumlah order untuk menghitung rata-rata gabungan.
- Event SSE memiliki eventId, arrivalCount dan arrivalModules tambahan. Klien memakai satu koneksi bersama; event reset hanya refresh data, tidak membunyikan suara.
- Data audit/outbox existing dipertahankan. Korelasi feedback juga bekerja untuk request web existing melalui idem_key `web:<userId>:<requestId>`; tanpa rekaman tidak ditampilkan status sukses.

## Persiapan database dan izin - belum dijalankan

Tidak memerlukan perubahan schema tabel di atas migrasi existing 004?008. Pembacaan feedback memerlukan tambahan SELECT kolom metadata pada dedicated read pool. Delta manual tersedia di `ops/examples/hdwork2-feedback-read-grants.review.sql`; template provisioning dan allowlist pemeriksaan grant sudah disesuaikan. Script tidak memberi akses payload, token lease, password hash, ataupun write.

**Sebelum mengaktifkan hasil integrasi**, administrator perlu meninjau dan menerapkan delta grant pada lingkungan uji yang disepakati. Tanpa grant baru, pemeriksaan startup read pool menolak izin yang belum lengkap; ini tidak boleh diatasi memakai write credential. Tidak ada SQL grant/migrasi yang dijalankan selama pengerjaan.

## Pemeriksaan lokal

- Backend: 40 tes lulus pada operations, operational-enhancements, workspace-status-concurrency, courier, courier-mysql, testing-solver-security. Menggunakan data sintetis dan adapter tes; tidak terhubung database atau Telegram.
- Grant review: 3 tes lulus, termasuk penolakan SELECT penuh terhadap tabel request/outbox.
- Frontend workflow: 7 tes lulus lewat Node TypeScript stripping, meliputi timer lintas hari, scope, SSE, notifikasi awal/replay dan coalescing.
- Frontend build: `npm.cmd run build` (TypeScript + Vite).
- Lint file frontend yang berubah: oxlint.
- Build default dan build dengan VITE_HDWORK2_AUTH_COOKIE=true serta VITE_HDWORK2_OPERATIONS=true lulus. Lint file frontend yang berubah lulus tanpa peringatan; git diff --check lulus. Total 50 tes lokal lulus (40 backend + 3 grant review + 7 frontend).

## Risiko dan batas verifikasi

- Belum dilakukan E2E browser + MySQL + courier nyata; jangan menyatakan PASS operasional.
- Performa SQL pencarian substring/JSON dan query feedback perlu pengukuran dengan volume data lingkungan uji; hasil daftar tetap dibatasi 25 item.
- Notifikasi suara memerlukan izin audio browser/interaksi pengguna dan SSE yang berfungsi. Refresh 60 detik menjaga data/outbox terkini; mode pemulihan polling tidak menjamin notifikasi suara atas semua kejadian selama koneksi SSE terputus.
- Tidak ada retry otomatis untuk hasil pengiriman tidak pasti. Peninjauan manual diperlukan; tidak disediakan tombol replay otomatis.
- Timer mengikuti started_at existing (PICK/ambil alih terakhir); perubahan aturan penghitungan saat ambil alih harus disepakati dengan Batch A.
- Build dapat memperingatkan ukuran chunk LegacyRoutes di atas 500 kB; tidak ada perubahan pada desain Preview atau bundle legacy untuk tugas ini.
- Semua perubahan lokal; tidak ada commit, push, merge, deploy, runtime credential, perubahan order nyata atau akses layanan produksi. Worktree Batch A dan HDWork2-New tidak diubah.

## Seluruh file berubah

- `.gitignore`
- `docs/batch-b-implementation.md`
- `frontend/src/features/workflow/OperationalStatus.tsx`
- `frontend/src/features/workflow/OrderNotifications.tsx`
- `frontend/src/features/workflow/Recap.tsx`
- `frontend/src/features/workflow/WorkDetail.tsx`
- `frontend/src/features/workflow/WorkHome.tsx`
- `frontend/src/features/workflow/WorkList.tsx`
- `frontend/src/features/workflow/WorkspaceCounts.tsx`
- `frontend/src/features/workflow/hooks.ts`
- `frontend/src/features/workflow/live.ts`
- `frontend/src/features/workflow/model.ts`
- `frontend/src/features/workflow/notification-policy.ts`
- `frontend/src/features/workflow/statistics.ts`
- `frontend/tests/workflow.test.ts`
- `ops/examples/hdwork2-feedback-read-grants.review.sql`
- `ops/examples/hdwork2-operational-grants.review.sql`
- `src/config/operational-grants.js`
- `src/courier/delivery-state.js`
- `src/courier/memory-store.js`
- `src/courier/mysql-store.js`
- `src/operations/claim-protection.js`
- `src/operations/feedback.js`
- `src/operations/live.js`
- `src/operations/mutate.js`
- `src/operations/policy.js`
- `src/operations/read.js`
- `src/operations/routes.js`
- `src/operations/statistics.js`
- `tests/courier-mysql.test.js`
- `tests/operational-enhancements.test.js`
- `tests/operational-grant-review.test.js`
- `tests/workspace-status-concurrency.test.js`
