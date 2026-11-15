# Frontend: PROSES CEK, workspace, chat, dan indikator baru

Audit: 2026-11-15 · branch `main` · HEAD `2d9c034f7da1a72a5de8777d23ae620b1bb41b88`.

## Susunan sumber

Frontend React/TypeScript/Vite berada di `frontend/src`. Route aplikasi termasuk `frontend/src/InternalRoutes.tsx` dan halaman operasional pada `frontend/src/features/workflow/WorkList.tsx`. `frontend/src/pages/HdWorkspacePage.tsx` adalah jalur lain/demo dan bukan komponen API operasional pada route tersebut. API wrapper/cookie ada di `frontend/src/features/workflow/api.ts`; model/filter di `model.ts` dan `src/operations/policy.js`.

## PROSES CEK dan workspace saat audit

`WorkList.tsx` mengambil daftar `/orders` dengan `mine=true` pada tab PROSES CEK, paginasi server 25 item (`src/operations/read.js`), pencarian/filter, lalu membuka `OrderWorkPanel.tsx` sebagai dialog/panel di atas daftar. File ini belum menunjukkan workspace terintegrasi 30:70 dengan seluruh pekerjaan pribadi tanpa batas pagination. Aksi seperti TAKEOVER dan tindakan order memakai `Actions.tsx`/`src/operations/mutate.js`.

`OrderWorkPanel.tsx` memuat detail `/orders/:id`, teks order asli dan `OrderChat.tsx`. `OrderChat.tsx` memuat `/chat/:id/messages?page=...`, memiliki draft per akun/order, form balasan dan action bar. Komponen menggunakan key user/order untuk menghindari state chat tertukar.

## Live update

`frontend/src/features/workflow/live.ts` memakai satu koneksi EventSource bersama per tab, debounce event, deduplikasi event ID, reset saat koneksi/poll fallback 60 detik. `hooks.ts` membuat `useWorkData` me-refresh endpoint terkait pada SSE/reset. Backend `src/operations/live.js` membaca `hd2_live_events` dan mengirim event per modul; `src/chat/service.js` menulis event change saat ada chat masuk/keluar, dan Courier menulis event saat ACK outbox sesuai `src/courier/mysql-store.js`.

## Rencana indikator PESAN BARU — belum diimplementasikan

Lokasi UI yang sesuai: list/workspace pribadi dalam `WorkList.tsx` atau komponen daftar kerja yang kelak menjadi panel kiri; logika cursor kecil sebaiknya dipisah menjadi helper/test di `frontend/src/features/workflow/`. Sumber kandidat identitas adalah `sequence` dari `/chat/:id/messages`, bukan waktu lokal; hitung hanya `direction === 'IN'` dengan `replyTo` terisi agar pesan asli order (`replyTo=null`) dan pesan OUT tidak dianggap pesan baru. Persist key harus menyertakan ID akun dan ID order. Bandingkan dengan cursor tersimpan; stable-sort order unread ke atas dengan urutan asal sebagai tie-breaker.

Jangan tandai baca pada saat klik order atau sebelum response berhasil diterima dan data yang menentukan cursor benar-benar ter-render. Refresh/reconnect cukup memperbarui sequence terbaru; jangan mengganti cursor ketika fetch gagal. Untuk tab lain, event `storage` dapat menyinkronkan cursor localStorage. Saat localStorage kosong, kebijakan baseline harus ditetapkan agar histori lama tidak seluruhnya muncul sebagai baru; rekomendasi awal: inisialisasi baseline pada latest sequence yang berhasil dimuat, lalu hanya pesan sesudahnya yang memicu badge.

Endpoint riwayat saat ini per order/paginasi dan SSE hanya memberi modul, sehingga perhitungan badge seluruh daftar melalui request satu-per-order tidak efisien. Rekomendasi endpoint ringkasan batched per order aktif milik user tercatat di [BACKEND.md](BACKEND.md). Tidak ada perubahan frontend yang dibuat pada audit ini.

## Catatan HD — lokasi rencana

Catatan ringkas di tabel dapat dirender oleh list/table cell pada `WorkList.tsx` atau komponen tabel terpisah; editor sebaiknya komponen kecil tersendiri dengan save state/error yang terikat order. API client ada di `workflow/api.ts`, auth/user scope di `contexts/AuthContext.tsx`. Rencana endpoint, otorisasi, dan migrasi ada di [BACKEND.md](BACKEND.md) dan [MYSQL.md](MYSQL.md). Jangan memetakan Catatan HD ke `Work.note`/`completion_note` karena itu hasil tindakan order.
