# Tunnel: asal IP, rate limit dan akun terkini

Status: lokal pada chore/remove-cacti-hdwork2. Tidak membuka API, membuat Tunnel,
mengubah Cloudflare/.env/DB atau memulai bot. Melengkapi api-only-security-hardening.md.

## Audit jalur IP

Jalur yang direncanakan: browser → Cloudflare edge → Tunnel outbound cloudflared
→ HTTP 127.0.0.1:3090. Pada origin, socket TCP adalah cloudflared/loopback,
bukan IP browser. Cloudflare biasanya menyampaikan IP pengunjung dalam
CF-Connecting-IP dan rantai X-Forwarded-For. Keberadaan header bukan bukti
keasliannya: proses lokal dapat mengirim header yang sama ke API loopback,
dan proxy/Worker tambahan dapat mengubah semantik header/rantai.

Belum memeriksa header trafik atau konfigurasi aktual akun Cloudflare. Tidak
menganggap request yang menyebut CF-Connecting-IP otomatis berasal dari edge.
Bind tetap 127.0.0.1, Express trust proxy tidak diaktifkan, dan limiter tetap
menggunakan socket remoteAddress atau identitas akun yang diverifikasi DB.
X-Forwarded-For, Forwarded, CF-Connecting-IP dan req.ip tidak menjadi kunci
keamanan baru. Tidak menambahkan shared-secret bypass lewat header.

## Keputusan implementasi

1. Pertahankan batas koneksi sebelum autentikasi: login 10/15 menit, staging
   120/menit, tambahan auth/me 120/menit per socket. Semua pengguna Tunnel
   kemungkinan berbagi alamat dan anggaran loopback tersebut.
2. Tambahkan batas staging 30/menit **per ID akun yang sudah diperiksa DB**,
   selain batas koneksi. Kunci dibuat server dari ID tervalidasi setelah akun
   aktif SUPER_ADMIN dibuktikan; bukan username/header/claim role semata.
3. Ganti /api/auth/me agar SELECT profil terbaru melalui ID JWT tervalidasi.
   Akun hilang/nonaktif ditolak 403; ID malformed 401; DB gagal tertutup 503.
   Role yang diturunkan/dinaikkan tercermin pada respons setiap request. Hanya
   id/name/username/city_id/role diserialisasikan, bukan hash atau klaim arbitrer.
4. Role JWT awal staging tetap pembatas konservatif: promosi akun yang JWT-nya
   masih HD membutuhkan login ulang. Downgrade/nonaktif diblokir oleh DB terkini.
5. Tidak ada perubahan bot/account/sync. Auth membaca DB_* users, staging memakai
   pool SELECT terpisah. Kegagalan backend tidak memulai ulang/menghentikan bot.
   Beban SELECT tambahan tetap perlu dinilai pada PC bersama; tidak ada janji
   isolasi sumber daya mutlak pada mesin/MySQL yang sama.

Limiter fixed-window single-process tetap bounded/in-memory, reset saat restart.
Per-account limiter tidak menghilangkan shared global cap atau penyerangan
login oleh pengguna lain. Penyerang yang menghabiskan batas loopback dapat
menyebabkan denial layanan sementara. Ini konfigurasi konservatif untuk tahap
persiapan, bukan kebijakan final yang layak diasumsikan cocok semua tim.

## Konfigurasi Cloudflare yang diperlukan nanti (tidak diterapkan)

- Named Tunnel dan hostname API pada akun sendiri, service origin hanya
  http://127.0.0.1:3090, ingress default 404; tidak meneruskan MySQL/SSH/agent.
- Jangan membuka port router/firewall publik. PC tidak boleh mempunyai akses
  origin alternatif yang melewati proteksi edge. Akses lokal masih merupakan
  trust boundary sendiri: batasi akun Windows dan akses ke host.
- CORS origin exact https://hdwork.yoloo.space (dan origin tambahan yang secara
  eksplisit disetujui), bukan wildcard. CORS tetap bukan autentikasi.
- Evaluasi Cloudflare rate limiting/WAF sesuai paket akun pada host API + path
  login/staging/me, memakai IP pengunjung di edge. Itu lokasi yang memiliki
  konteks koneksi pengunjung; jangan menyalin header ke aplikasi begitu saja.
- Evaluasi Cloudflare Access sesuai kebutuhan: policy/identitas, perilaku browser
  lintas-origin dan preflight harus diuji. Jangan menaruh Access service token
  di frontend, dan jangan mengganti JWT/otorisasi aplikasi dengan Access saja.
- Jika kelak aplikasi benar-benar memerlukan IP klien: desain dan uji bukti
  asal request (misalnya validasi JWT Access bertanda tangan dengan issuer/aud
  dan policy yang tepat, serta ingress yang dikunci). JWT Access tidak otomatis
  menandatangani header IP; jangan menyamakan identitas Access dengan keaslian
  CF-Connecting-IP. Untuk IP security, utamakan pembatasan edge; penggunaan
  header di origin memerlukan trust boundary dan sanitasi proxy terverifikasi.
- Jangan mengaktifkan trust proxy=true atau mengambil header IP kiri/kanan
  tanpa model topologi/hop yang pasti. Jangan mengandalkan token statis yang
  dapat dikirim browser sebagai autentikasi proxy.

## Keputusan yang masih memerlukan persetujuan sebelum publikasi

- Besaran shared cap vs kebutuhan login tim dan refresh 60 detik; threshold
  edge/account, window, respons saat budget habis dan risiko denial layanan.
- Apakah Access diperlukan dan bagaimana browser/login/preflight akan bekerja.
- Apakah IP klien perlu dipakai di aplikasi atau cukup rate limit edge dan
  account server; desain proxy trust belum disetujui dan tidak diaktifkan.
- Penggunaan shared limiter store bila proses direplikasi atau ketahanan reset
  diperlukan; belum menambah Redis/dependensi/layanan.
- Retensi log, redaksi, kebijakan revokasi token/session, monitoring dan
  readiness/recovery. /me dan staging kini recheck DB, tetapi tidak berarti
  seluruh endpoint legacy mempunyai revokasi JWT global.

## Pengujian

Tes terisolasi mencakup spoof header CF/XFF/Forwarded, dua akun pada satu tunnel,
kuota akun yang tidak berubah saat header berubah, rate-limit/reset/capacity,
kuota limiter aktual, akun nonaktif/dihapus, downgrade/promotion role pada /me,
error DB aman, auth staging dan graph entrypoint tanpa bot/worker. Semua query
DB/HTTP operasional dimock, tidak memeriksa PC atau jaringan Cloudflare nyata.
Uji browser/tunnel aktual harus dilakukan kemudian dengan izin terpisah.
