# Integrasi lokal Batch A + B

Tanggal: 9 November 2026. Repository: `D:\HDWork2-New`, baseline/HEAD `66ceec4`.

Implementasi Batch A (#1–#8) dan Batch B (#9–#18) telah digabungkan secara lokal. Status ini berarti integrasi kode dan pengujian lokal selesai; belum merupakan PASS E2E atau persetujuan aktivasi.

## Sumber dan penyelesaian konflik

- Sumber berupa perubahan working tree yang belum di-commit di `D:\HDWork2-BatchA` (`codex/batch-a`) dan `D:\HDWork2-BatchB` (`codex/batch-b`), masing-masing 33 file termasuk file baru. Keduanya bertumpu pada baseline yang sama.
- Tidak dilakukan merge branch. Perubahan digabungkan per file terhadap baseline; file lokal tambahan yang sudah ada di repository utama dipertahankan.
- Delapan file beririsan: `WorkDetail.tsx`, `WorkList.tsx`, `model.ts`, `frontend/tests/workflow.test.ts`, `src/operations/policy.js`, `read.js`, `routes.js`, dan `tests/operational-grant-review.test.js`.
- Detail/daftar menggabungkan label SC/IN → INET tersamar → command, navigasi UUID internal, timer dan status feedback. Detail juga mempertahankan owner/finisher aktual, audit berhalaman, serta decoding JSON lama/malformed/Buffer.
- API menggabungkan pencarian, feedback dan statistik Batch B dengan penolakan pembuatan order web serta respons error Batch A. `POST /api/operations/orders` tetap 403; ingress Telegram tidak dialihkan ke endpoint web.
- Model memakai durasi HH:mm dengan jam tanpa batas 24. Timestamp asli tetap tersimpan dan timer selesai memakai finishedAt.
- Tes grant mempertahankan kedua kebijakan: akun/auth dan metadata feedback dengan batas kolom.

## Kontrak yang dipertahankan

| Area | Hasil pemeriksaan |
|---|---|
| Preview/frontend | Komponen desain Preview dipakai kembali; source Preview dan LegacyRoutes tidak diubah. SSE bersama, debounce, filter WIB/petugas/status, notifikasi opt-in, detail dan statistik terintegrasi. |
| Double CEK | `lockOrder()` menggunakan SELECT FOR UPDATE dalam transaksi mutasi. Validasi version setelah pengembalian replay idempotent; konflik 409. |
| Audit/outbox | Mutasi, request idempotent, audit dan outbox dalam satu transaksi. requestId/outboxId tetap masuk detail audit; replay tidak menambah pengiriman/audit. Keputusan duplikat hanya mengubah order terpilih. |
| Telegram | Ingestion, deduplikasi, anchor reply dan topic asli dipertahankan. GAGAL memerlukan alasan terpangkas dan memasukkannya ke feedback. Hanya RATE_LIMIT eksplisit aman untuk retry; error transport/lease kedaluwarsa ditahan untuk review. |
| Feedback | Query menghubungkan order → request web → outbox sesuai bot. TERKIRIM memerlukan Telegram message ID; tanpa rekaman tidak dibuat status sukses. |
| Autentikasi | Cookie session, CSRF dan pembatasan role tetap berlaku. Akun baru PENDING/nonaktif; approval mengikuti hierarki, self-approval ditolak, update tidak dapat mengaktifkan akun pending. Ganti password mencabut sesi. |
| Profil runtime | Profil read-only/session-audit-only tetap membatasi write. Fitur approval/manajemen akun memerlukan profil writable terpisah dan grant yang sesuai; konfigurasi aktif tidak diubah. |
| Database | Read/write/courier pool tetap terpisah. Read feedback hanya mendapat metadata; tidak mendapat payload, lease token atau password hash. |

## SQL tersedia, tidak dijalankan

- `database/manual/010_hdwork2_account_approval.sql`: menambah approval_status dan constraint; akun lama default APPROVED tanpa reset password/sesi.
- `ops/examples/hdwork2-account-management-grants.review.sql`: template tambahan integrasi untuk profil auth writable, sesuai allowlist readiness Batch A.
- `ops/examples/hdwork2-feedback-read-grants.review.sql`: delta SELECT metadata feedback untuk dedicated read pool.
- `ops/examples/hdwork2-operational-grants.review.sql`: provisioning operasional lengkap dari Batch B.

Tidak ada SQL, grant, migrasi atau pemeriksaan koneksi database yang dijalankan. Template harus ditinjau terhadap grant/schema aktual oleh pengelola lingkungan uji; jangan memakai kredensial write untuk melewati kegagalan read-pool readiness.

## Validasi lokal

| Pemeriksaan | Hasil |
|---|---|
| `node --test tests/*.test.js` | 266/266 lulus |
| `node --experimental-strip-types --test frontend/tests/*.test.ts` | 69/69 lulus, termasuk 7 workflow |
| `PYTHONPATH=courier_bot python -B -m unittest discover -s courier_bot/tests` | 31/31 lulus |
| Frontend `npm.cmd run build`, default | Lulus |
| Build dengan VITE_HDWORK2_AUTH_COOKIE=true dan VITE_HDWORK2_OPERATIONS=true | Lulus |
| oxlint file frontend yang berubah | Lulus tanpa peringatan |
| `git diff --check` | Lulus |

Build mengeluarkan peringatan chunk LegacyRoutes >500 kB. Lint seluruh frontend yang sempat dijalankan juga menunjukkan peringatan existing di luar file integrasi; file tersebut tidak diubah. Log pengujian/build tersedia di `.local/integration/` (diabaikan Git).

Tiga fixture lama diselaraskan: dua adapter SQL kini membedakan query metadata feedback dari query order; fake transport retry kini menggunakan RATE_LIMIT, sementara tes error NETWORK tetap memverifikasi tidak ada resend. Tes integrasi tambahan memverifikasi detail Buffer JSON + actor/owner aktual + delivery metadata sekaligus, dan kecocokan SQL grant auth dengan kebijakan writable.

## Investigasi tiga kegagalan Batch A

| Kegagalan awal | Bukti dan klasifikasi |
|---|---|
| Tidak ada setup-office-service-secrets.ps1 | File tidak ada di Batch A, sudah tersedia sebagai file lokal di repository utama. Tes connector-activation-gate kini lulus. Masalah kelengkapan lingkungan/worktree, bukan implementasi fitur Batch A. Script hanya dibaca, tidak dijalankan. |
| Tidak ada tunnel-token-broker.ps1 | File tidak ada di Batch A, tersedia lokal di utama. Setelah tersedia, assertion lama masih gagal karena menganggap seluruh WriteAllText sebagai penulisan credential. Script existing hanya menulis broker.state.json berisi status/stage/tipe error. Tes diperbaiki agar mengizinkan dua penulisan status tersebut, tetap menolak byte credential dan operasi file/network lain. Ini masalah lingkungan awal ditambah false positive pada kode tes, bukan bukti kebocoran token atau kegagalan fitur Batch A. Broker/layanan tidak diubah/dijalankan. |
| Tidak ada .local/tls/localhost.crt | Sertifikat tidak ada di Batch A, sudah tersedia lokal di utama. Tes HTTPS Host rejection kini lulus memakai sertifikat lokal dan listener tes acak. Masalah fixture lingkungan, bukan fitur Batch A. Tidak dibuat/dipasang sertifikat baru. |

## Risiko tersisa dan kesiapan E2E

Pembaruan 9 November 2026: runner yang disebut di bawah telah disesuaikan pada tahap persiapan berikutnya. Lihat `docs/e2e-integrated-readiness.md` untuk hasil rehearsal lokal dan prasyarat terkini. Daftar berikut merekam kondisi saat integrasi awal; bukan status runner terbaru.

1. **E2E belum dijalankan dan runner lama belum siap dipakai langsung.** Pemeriksaan statis menemukan `tests/integration/mysql-auth.cjs`, `mysql-operations.cjs`, `mysql-courier-integration.cjs` belum memuat migrasi 010 dan masih membuat akun lalu login tanpa approval. Runner auth juga masih mengharapkan pembuatan SUPER_ADMIN melalui manage(), yang ditolak kontrak Batch A. `local-base-web.cjs` masih mengharapkan POST order 201, berlawanan dengan Telegram-only/403; assertion recap lama juga belum mengenal field durasi Batch B. Runner tidak dijalankan atau diam-diam diubah agar hasil terlihat lulus.
2. Setelah runner diselaraskan, E2E memerlukan lingkungan disposable terisolasi, schema/grant ditinjau, build cookie+operations, dan transport Telegram palsu. Uji approval/login/password/logout/CSRF/role, ingress → daftar/detail/SSE, dua HD PICK bersamaan, takeover, canonical duplicate, DONE/GAGAL, replay idempotent, audit/outbox dan feedback. Jalankan E2E hanya dengan otorisasi terpisah untuk database uji/migrasinya.
3. Belum ada pembuktian SQL/grant nyata atau pengukuran pencarian substring/JSON dan feedback pada volume besar. Tidak boleh menyatakan siap produksi berdasarkan fixture lokal.
4. Audio memerlukan interaksi pengguna/browser; polling pemulihan 60 detik tidak menjamin bunyi untuk seluruh event saat SSE terputus. Timer mengikuti PICK/takeover terakhir sesuai kontrak sumber.
5. Hasil pengiriman tidak pasti tetap memerlukan review manual. Feedback memilih outbox terbaru menurut created_at lalu UUID; pengurutan dua aksi pada milidetik yang sama belum dibuktikan di MySQL nyata.

Tidak ada akses database live, pesan Telegram nyata, perubahan Cloudflare/DNS/VPN/Windows Service, sistem legacy, penghapusan data, commit, push, merge branch atau deploy. Kedua worktree sumber dipertahankan; seluruh hasil integrasi hanya di repository utama.
