# Cloudflare Pages + Windows Tunnel — review, belum deploy

Frontend tujuan pengguna: https://hdwork.yoloo.space. Production saat ini tidak
diubah atau dipublikasikan ulang. Konfigurasi calon deployment:
ops/examples/hdwork-pages-tunnel.review.json. Tidak ada DNS, resource Access,
tunnel, project Pages, branch, push atau deployment yang dibuat pada sesi ini.

Arsitektur yang diusulkan: frontend statis Pages pada hdwork.yoloo.space, backend
Windows melalui hostname terpisah api.hdwork.yoloo.space (masih perlu konfirmasi).
Hostname yang sama tidak diarahkan sekaligus ke Pages dan tunnel. Backend hanya
listen loopback; MySQL, DevTools dan courier internal tidak dipublikasikan.

Candidate build memakai root frontend, npm ci && npm run build, output dist,
VITE_API_BASE_URL=https://api.hdwork.yoloo.space, cookie auth/operations=true.
Jangan mengubah environment Production untuk menyiapkan candidate. Preview Pages
tidak mengganti custom domain Production; upload candidate tetap perlu persetujuan.
[Dokumentasi preview Pages](https://developers.cloudflare.com/pages/configuration/preview-deployments/).

Backend kini memiliki dukungan Host API terpisah melalui
HDWORK2_PUBLIC_API_ORIGIN dan HDWORK2_PUBLIC_API_ORIGIN_APPROVED, sementara
HDWORK2_PUBLIC_ORIGIN/FRONTEND_ORIGINS tetap menunjuk frontend. API harus merupakan
subdomain frontend dan memerlukan approval eksplisit; default lokal tetap sama.
Guard split-host lulus pemeriksaan offline dan belum diaktifkan pada env nyata. Cookie
__Host tetap host-only di API, Secure/HttpOnly, credentials fetch dan CSRF dengan
Origin frontend eksplisit. Jangan menulis ulang Origin menjadi localhost atau
menggunakan wildcard CORS. Cookie cross-origin harus dibuktikan di candidate nyata.

Tunnel origin HTTPS lokal memakai SNI localhost dan CA privat, noTLSVerify=false.
[TLS origin Cloudflare](https://developers.cloudflare.com/tunnel/troubleshooting/https-origins/).
Cloudflare Access default-deny, identitas/MFA/team/audience diperlukan. Browser
login Access lintas origin dan OPTIONS preflight perlu diuji, karena challenge
Access dapat memblokir preflight. Jangan mengisi service token Access di frontend
publik atau mematikan autentikasi API.
[CORS Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/).

Kebijakan auth permanen perlu disetujui terpisah: window login lokal 14 menit
bukan mode layanan online 24 jam. Penulisan operasional global tetap read-only
sampai izin fitur tulis diberikan. Role HD pada workflow normal tetap berlaku;
finalisasi administratif satu order dummy bukan perubahan role/permission umum.

Gate sebelum cutover: hostname API disahkan, credentials Cloudflare privat,
Access/preflight/cookie nyata lulus, pool/grants aktual lulus, firewall/router
menutup 3306 dari internet, trusted proxy/rate limiting direview, health/ready
origin sehat, rollback Production dicatat. Tidak membuat perubahan firewall atau
binding MySQL bersama tanpa persetujuan dan pemeriksaan dependensi legacy.

Rollback setelah cutover yang disetujui: kembalikan deployment/domain Pages
sebelumnya, hentikan hanya tunnel proyek, pertahankan database/journal dan PM2
legacy. Jangan menjalankan migrasi ulang atau menghapus order saat rollback.
