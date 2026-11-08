# Batch 10 — Autentikasi, sesi, dan hak akses HD Work 2.0

## Audit dan keputusan

Acuan f97bebd9c6c14c896135aecc13b739609e9be989. Login sebelumnya sudah memakai users, bcrypt dan JWT 8 jam; API-only mewajibkan DB_NAME=hdwork2. /me memeriksa akun aktif/role, tetapi tidak ada pencabutan JWT, sesi per perangkat atau assignment modul; frontend bearer memakai localStorage. API order sementara Super Admin. Tidak ada baseline lengkap users untuk instalasi baru.

Implementasi memakai **users, bcrypt dan JWT yang sama**, bukan identity store baru. Endpoint login tetap /api/auth/login; mode baru hanya pada API-only dengan **HDWORK2_AUTH_V2=true**. Default false menjaga controller/login/JWT lama dan middleware legacy; tidak ada dua login aktif pada API-only. Tidak mengubah server legacy, parser Telegram, duplikat, Preview, database aktif, .env atau deployment.

Mode baru tidak menerima bearer fallback. JWT baru disimpan di cookie __Host-hdwork2-session (HttpOnly, Secure, SameSite=None, Path=/, tanpa Domain). Database hanya menyimpan SHA-256 token, uid, expiry dan revoked. /me mengecek signature HS256, expiry, hash session, current user/role/modules pada setiap request. Role/modul tidak dipercaya dari klaim JWT atau frontend. Sesi 8 jam per perangkat; login tidak mencabut sesi lain. Logout mencabut hash sesi ini saja, reset/nonaktif/update akun/revoke mencabut seluruh sesi target. Perubahan izin langsung diberlakukan backend; menu frontend diperbarui pada verifikasi /me berikutnya (~60 detik), bukan batas keamanan.

Rate limit login 10/15 menit serta /me 120/menit dipertahankan; admin 60/menit, order memiliki limit lama. Login salah/unknown/nonaktif memakai error generik dan bcrypt comparison termasuk dummy hash, dengan audit tanpa username mentah/password. Hash password bcrypt cost12 (aman dan sudah menjadi dependency); password baru 12 karakter minimum, maksimum72 byte agar tidak terpotong bcrypt. Tidak ada registrasi publik atau password default.

## Role dan modul

SUPER_ADMIN mendapat semua modul, manajemen pengguna dan seluruh audit keamanan. ADMIN/HD/SHOW_ONLY hanya membaca modul yang ditugaskan dalam tahap ini; kemampuan pengelolaan pekerjaan ADMIN/HD adalah izin yang direncanakan, **endpoint aksi order tetap tidak tersedia**. SHOW_ONLY tidak dapat mengubah pengguna/order. /api/admin/users beserta semua aksi hanya Super Admin, diverifikasi ulang dalam transaksi untuk mutasi.

Identifier fisik order yang ada: TIAL, LOGIC_PSB, LOGIC_MO. REQ adalah identifier **izin logis** baru, bukan perubahan orders.module atau parser. Scope query menggunakan command: order→TIAL, config_psb→LOGIC_PSB, mo→LOGIC_MO, req→REQ; data non-command fallback ke module yang sudah tersimpan. Diterapkan ke list, direct detail/history by ID serta link duplicate previous; bukan filter UI saja. Tidak mengubah baris order. Assignment banyak modul memakai hd2_user_modules.

## CSRF, cookie dan frontend

Semua mutasi cookie membutuhkan Origin persis dalam FRONTEND_ORIGINS dan X-CSRF-Token, HMAC terikat cookie sesi. CSRF didapat lewat login/me, hanya disimpan di memori frontend. Login memeriksa Origin untuk mencegah login CSRF. CORS mode baru credentials=true, allowlist eksplisit HTTPS dan header X-CSRF-Token. Tidak mempercayai forwarded IP baru. Cookie tidak dapat diakses JS dan tidak ditaruh localStorage/sessionStorage. Logout tidak menghubungi bot/terminal legacy.

Frontend mode baru diaktifkan terpisah melalui **VITE_HDWORK2_AUTH_COOKIE=true** pada build yang disetujui. Provider menghapus bearer lama di kunci operasional dan menggunakan credentialed fetch tanpa Authorization header. Preview tetap provider DEMO sendiri. Flag frontend/backend harus cocok; mismatch gagal tertutup, tidak mencoba dua sistem login. Mode lama tetap ada untuk rollback dan masih memiliki penyimpanan bearer historis; jangan menyatakan telah dimigrasikan sampai aktivasi disetujui.

Halaman /admin/users: pagination25, create/edit name/role/modules/active, reset password dan revoke all; tanpa delete permanen. Audit keamanan berisi aktor/target/action/waktu, pagination25. Reset melalui password baru yang ditentukan Super Admin di sesi HTTPS; tidak ada email reset/public recovery atau token default. Distribusikan password privat dan jangan tempel ke chat/log. Tidak ada klaim alur forced-password-change/email telah dibuat.

Menu TIAL/LOGIC/REQ mengikuti assignment. Pembacaan menggunakan layout operasional yang sama dan modul dropdown; halaman LOGIC/REQ menggunakan reader aman yang sama saat mode baru. Backend masih otoritatif untuk URL langsung. Flag read-only B2C_WORKFLOW_READ_ENABLED dan B2C_COMMAND_SCHEMA_READY harus true sebelum pembacaan scoped diaktifkan. Mode sesi baru menonaktifkan route staging hd_b2c (503), sehingga tidak membuka jalur auth lama paralel.

## Migrasi 007 dan provisioning

007 bersifat manual, **fresh-only**. Membuat users bila belum ada melalui CREATE TABLE users tanpa IF NOT EXISTS, lalu tabel modules/sessions/security_audit/guard. Sengaja error di awal bila users sudah ada; jangan memakai --force. Akun/password tidak disalin/di-seed. DDL implicit commit per statement: backup/restore dan partial migration review tetap wajib. Foreign key users.id bertipe BIGINT UNSIGNED; instalasi existing dengan INT/signed/type/charset lain memerlukan rencana DBA terpisah yang menyesuaikan FK/role tanpa menghapus akun. Jangan menjalankan file utuh pada instalasi existing. Tidak ada auto-migrator atau startup provisioning.

Guard singleton hd2_auth_guard dikunci FOR UPDATE oleh semua perubahan akun/provisioning. Pemeriksaan jumlah Super Admin aktif ada dalam transaksi yang sama; dua demosi/nonaktif paralel tidak dapat menghapus admin aktif terakhir. Tidak ada delete permanen. Data audit/sesi revoked tetap ada untuk retensi yang disetujui nanti.

Setelah rehearsal schema dan persetujuan khusus, provisioning pertama memakai akun database provisioning baru di loopback, schema hdwork2 dan environment privat: DB_HOST=127.0.0.1, DB_PORT, DB_NAME=hdwork2, DB_USER/PASSWORD, JWT_SECRET, HDWORK2_PROVISION_APPROVED=true, HDWORK2_FIRST_ADMIN_NAME/USERNAME/PASSWORD. Jangan simpan secret dalam repo/argumen. Perintah manual **belum dijalankan pada database aktif**:

```powershell
node .\scripts\provision-first-admin.js --provision-first-super-admin
```

Script tidak membaca .env, menolak default/tanpa flag dan berhenti jika Super Admin aktif sudah ada. Provisioning dan concurrent admin mutation memakai lock yang sama. Unset password/approval dari sesi setelah selesai. Tidak ada HTTP bootstrap endpoint. Status is_active/role/modules semuanya berasal dari DB baru.

## Aktivasi dan rollback (belum dilakukan)

1. Review schema existing/backup/restore/RPO; siapkan instalasi auth baru atau adaptasi DBA yang disetujui. Tidak mengimpor users/password lama.
2. Rehearsal 007/schema dan provisioning pada disposable, review role-module mapping dan akun Super Admin.
3. Siapkan JWT_SECRET baru >=32 byte, HTTPS allowlisted frontend/API dan backup privat. SameSite=None dapat diblok browser untuk third-party cookies: utamakan frontend/API custom domain same-site; bila perlu proxy/BFF, desain terpisah. Jangan menurunkan Secure atau menambahkan bearer fallback.
4. Koordinasikan HDWORK2_AUTH_V2 dan VITE_HDWORK2_AUTH_COOKIE; jangan menyalakan satu sisi saja. Sesi bearer lama tidak diterima pada mode baru; jadwalkan login ulang. Tidak ada flag yang diubah oleh batch ini.
5. Uji HTTPS browser nyata, desktop/HP, Origin/CSRF, multi-device dan revocation di lingkungan uji sebelum aktivasi. Bot/worker dan tombol pekerjaan tetap nonaktif.

Rollback mode baru memerlukan menonaktifkan flags secara terkoordinasi dan login ulang pada mode yang disetujui; jangan menghidupkan kedua mode bersamaan atau menghapus tabel auth. JWT secret lama hanya dipertahankan bila sudah disetujui, bukan disalin otomatis. Revocation sesi baru **tidak berlaku pada JWT legacy** bila mode lama dinyalakan lagi; rotasi secret/log out wajib direncanakan untuk menghindari menghidupkan token lama. Restore DB dapat mengembalikan akun/sesi yang telah dicabut; lakukan revocation/rotasi saat recovery. Tidak ada janji rollback DDL otomatis.

## Tes dan batas bukti

Tes mock/SQL scope, unit frontend transport dan regresi Batch1–9 dijalankan. Rehearsal MySQL 8.0.46 disposable menjalankan schema007 serta bcrypt login, dua sesi/logout/revoke, modul/role, reset/nonaktif, dua demosi paralel dan audit. Container/kredensial test di luar Git dibersihkan setelah selesai. Tidak ada koneksi ke kantor, bot atau database aktif.

`tests/integration/mysql-auth.cjs --run-auth-disposable` memakai seluruh guard Batch7 (database acak hdwork2_test_*, localhost port selain3306, schema kosong, grants scoped). Tidak menerima hdwork2/hd_b2c/legacy atau root; akun disposable baru saja. Tanpa flag tidak ada koneksi. Test ini tidak mengganti harness004–006; jalankan pada schema disposable berbeda yang kosong. Jangan jalankan pada produksi.

Browser smoke memakai API mock, bukan TLS/cookie server production: menguji login UI, tanpa bearer persistence, create admin/CSRF, desktop/HP, menu SHOW_ONLY/direct admin denial, dan Preview. HTTPS cookies/cross-domain/reboot Windows asli belum diverifikasi. Retensi/purge sesi expired/audit dan keamanan backup perlu kebijakan manual; tidak ada scheduler baru. Audit UI menampilkan metadata aman, bukan raw pesan internal/token. Belum ada pagination cursor/snapshot; daftar menggunakan page terbatas1..1000.

Hasil akhir: **133 tes Node**, **13 tes Python**, **52 tes frontend** lulus; build dan lint lulus (peringatan legacy lama tetap ada). Dua suite browser lulus: mode cookie/admin dan regresi mode bearer/Preview. File007 final fresh-only diulang pada disposable MySQL8.0.46 dan lulus. Tidak ada klaim aktivasi auth produksi atau TLS browser nyata. Container test, file secret sementara dan server Vite uji dibersihkan setelah validasi.
