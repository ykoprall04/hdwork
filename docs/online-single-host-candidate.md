# Kandidat online satu hostname — belum aktif

Arsitektur yang disetujui: browser → Cloudflare Access/Tunnel → HTTPS loopback
8443 → React build dan proxy `/api/` → Express loopback3090 → MySQL hdwork2.
Frontend dan API memakai origin yang sama. Pages tidak diperlukan pada tahap ini.
Courier/backend internal3091 tetap terpisah dan tidak dipublikasikan.

## Persiapan offline

`node scripts/prepare-online-candidate.js --prepare` membuat direktori baru
`.local/online-candidate-*/`, tanpa menimpa rencana lama. Seluruh environment,
ingress, rencana Access/Tunnel, dan build kandidat disimpan di luar Git.
Tidak membaca `.env` asli, mendekripsi DPAPI, menghubungi database atau Cloudflare.

Build memakai VITE_API_BASE_URL dengan origin publik yang disetujui, cookie auth
dan operations=true, output terpisah ke `dist` kandidat. Jangan menimpa bukti build
lama. `LOCAL_WEB_DIST` hanya menerima folder `dist` kandidat di bawah `.local`;
jangan menunjuk root `.local` atau direktori kredensial sebagai static root.

## Autentikasi berkelanjutan

`HDWORK2_SERVICE_AUTH_POLICY=session-audit-only` menyediakan layanan login tanpa
TTL pengujian15menit. Sesi individual tetap8jam, bukan sesi tanpa batas. Cookie
host-only `__Host-`, Secure, HttpOnly, SameSite=Lax; CSRF dan pengecekan Origin
pada route existing tetap berlaku. Tidak menambah refresh endpoint atau memperpanjang
sesi otomatis. Logout mencabut sesi seperti sebelumnya.

Startup menolak approval yang hilang, root, target selain hdwork2/loopback,
pool tulis, courier, origin berbeda dan kombinasi gate pengujian lama. Middleware
hanya mengecualikan POST login/logout dari read-only. API admin tetap diblokir;
API operational hanya baca dan tetap memerlukan session/role/module.
Menghapus approval dalam proses menutup pengecualian login/logout; perubahan file
konfigurasi membutuhkan restart proses, bukan hot reload.

Kandidat menyimpan SERVICE_AUTH_APPROVED=false. Runtime tidak diaktifkan oleh
persiapan ini. Loader web hanya membaca dua referensi DPAPI berbeda saat runtime
secara eksplisit diizinkan; secret masuk memori, tidak disimpan ulang atau dicetak.
Preservasi signing secret existing perlu diverifikasi privat. Jangan membuat atau
merotasi signing secret otomatis. Runtime menangkap secret ke pool/service lalu
menghapusnya dari process.env. Pool baca memakai hdwork_ops_read dengan policy
grants existing; tidak ada fallback ke akun auth atau root.

## Batas publik

Ingress memblokir ready, internal, legacy, uploads, socket.io, metrics dan DevTools.
Hanya auth login/logout/me dan operations diizinkan pada namespace `/api`; API
lain mendapat404. Semua origin HTTPS yang diteruskan memerlukan Access JWT,
SNI localhost, CA privat dan noTLSVerify=false. Host lain mendapat404.
MySQL3306 dan courier3091 tidak dicantumkan sebagai layanan Tunnel.
Remote-managed ingress nantinya harus sama dengan kandidat; preview YAML bukan
bukti konfigurasi remote sudah diterapkan.

## Sebelum aktivasi berikutnya

1. Verifikasi kepemilikan domain/akun Cloudflare dan target Production lama.
2. Siapkan tunnel khusus dan DPAPI token, Access team/audience serta allowlist
   pengguna/MFA. Rencana Access adalah checklist review, bukan payload API siap kirim.
3. Verifikasi DPAPI auth/read/signing secret melalui prosedur privat yang disetujui.
   Tidak ada kredensial yang dibuat oleh generator.
4. Setelah izin koneksi nyata, periksa startup identity/grants auth/read dan origin
   health/ready. Periksa firewall/router dan kebijakan proxy/rate limit; jangan
   mengubah shared MySQL atau PM2 legacy untuk meloloskan gate.
5. Setelah izin runtime, muat backend.environment kandidat ke proses baru secara
   eksplisit (jangan ke environment global). Runtime lokal adalah
   `node scripts/private-runtime.js local`; mode layanan memerlukan approval auth
   dan HDWORK2_ONLINE_RUNTIME_APPROVED=true yang terpisah. Jangan menjalankan
   perintah ini pada tahap persiapan offline.
6. Setelah izin Cloudflare/DNS, terapkan Access dan ingress yang telah direview,
   lalu jalankan Tunnel dengan controller existing setelah semua gate sah terpenuhi.
   Jangan menandai check verified hanya karena tes offline lulus.
7. Uji satu-origin cookie/login/CSRF/permission/logout melalui Access setelah
   otorisasi pengujian nyata. Cutover Production tetap memerlukan izin terpisah.

PC harus tetap menyala dan tersambung internet. Startup otomatis nantinya harus
memakai akun Windows pemilik DPAPI; tidak ada service/task Windows dibuat di sini.
Rollback menghentikan hanya proses kandidat/tunnel proyek dan mengembalikan target
domain/deployment lama, tanpa menghapus DB/journal atau mengubah PM2.
