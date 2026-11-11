# Persiapan rilis Windows — B2C workbench

Target aplikasi: `ccc646a649ed2bd6a9e138f27a43efe96a536edd`, branch `frontend/redesign-hdwork2`.
Baseline frontend produksi yang dilaporkan operator: `090aa82643a46856d8963909b3ecbb2d8c9d95bf`.

Perubahan aplikasi sudah di-push. Commit persiapan berikutnya hanya menambahkan dua helper inspeksi, tes dan dokumen ini; helper memverifikasi bahwa byte aplikasi tetap sesuai target ccc646a. Tidak ada deployment, koneksi Windows baru atau perubahan produksi dari cloud.

## Lingkup dan hal yang harus dipertahankan

Rilis mencakup frontend dan tiga file backend web:

- `src/operations/policy.js`: konfirmasi DONE/GAGAL dan ESCALATE nonfinal.
- `src/operations/read.js`: originalMessage internal dan kapabilitas UI.
- `src/operations/b2c-readiness.js`: metadata eskalasi yang sudah didefinisikan.

Tidak ada migrasi baru, perubahan Courier, grants, kredensial, DPAPI, bot, cutoff, journal, offset, antrean lama, TLS store atau autostart pada implementasi ini. Tidak merge ke main. Jangan memakai deploy operasional lama, Apply Shared Groups, migrasi 014, atau penyalinan langsung ke snapshot aktif sebagai jalan pintas.

Courier existing memverifikasi sourceHashes dari snapshot-nya. Jika tiga file backend ini berada pada snapshot bersama dan dipin, menimpa source web langsung dapat menyebabkan Courier gagal saat restart berikutnya. SourceHashes atau hash config tidak boleh diedit manual untuk menyembunyikan drift.

## 1. Ambil checkout persiapan terpisah

PowerShell Administrator dengan akun pemilik DPAPI yang sama:

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'D:\HDWork2-New'
git fetch origin frontend/redesign-hdwork2
if ($LASTEXITCODE -ne 0) { throw 'Fetch gagal' }

$releaseWorktree = 'D:\HDWork2-B2C-ccc646a'
if (Test-Path -LiteralPath $releaseWorktree) {
    throw 'Worktree sudah ada. Periksa HEAD/status; jangan hapus atau timpa.'
}
git worktree add --detach $releaseWorktree FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw 'Pembuatan worktree gagal' }
Set-Location $releaseWorktree
```

Repo sumber dan berkas inspeksi/.bak yang tidak terlacak dibiarkan. Jika Git fetch mengambil perubahan aplikasi tambahan di masa depan, helper akan menolak perbedaan di luar file persiapan yang diizinkan.

## 2. Inspeksi runtime read-only

```powershell
.\scripts\inspect-b2c-windows-release.ps1
```

Script membutuhkan Windows, Git dan Node existing. Ia tidak membutuhkan instalasi npm, tidak membuka bundle DPAPI dan tidak mengakses MySQL atau Telegram.

Yang diperiksa:

1. Task HDWork2-Web memiliki satu action dan menunjuk launcher snapshot-nya.
2. PID READY adalah node.exe milik LocalService dengan command line launcher web yang cocok serta read/write pools yang dilaporkan siap.
3. Task Courier existing menunjuk config dan ConfigSha256 eksplisit; akun operator sama dengan pemilik task/config.
4. Hash config sesuai argumen task; identitas snapshot Courier diambil dari config aktif, bukan nama folder yang ditebak.
5. Tiga file backend dibandingkan dengan source Git immutable target/baseline, dengan normalisasi LF/CRLF. Jika ikut dipin Courier, byte file tersebut diperiksa terhadap pin config di snapshot Courier.
6. Dist aktif ditentukan oleh konfigurasi runtime, lalu HTML /login dan aset entry JS/CSS dibandingkan dengan yang benar-benar dilayani melalui HTTPS loopback, CA existing dan pin sertifikat leaf.

Output berisi metadata/path/hash dan boolean, bukan isi environment atau config lengkap. Pemeriksaan pin ini hanya mencakup delta tiga file backend, bukan sertifikasi seluruh kesehatan Courier. Pemeriksaan pools berasal dari state web yang dicocokkan dengan proses aktif, bukan pengujian SQL baru.

Status sukses inspeksi: `B2C_WINDOWS_READ_ONLY_INSPECTION`, dengan `frontend.status=BASELINE_FRONTEND_PASS`.
`deploymentReady` selalu false: bukti ini diperlukan untuk menyiapkan paket dan backup, bukan izin Apply atau bukti aplikasi baru sudah aktif.

Arti temuan:

| Temuan | Langkah persiapan berikutnya |
|---|---|
| Snapshot web/Courier sama dan delta source dipin | Siapkan web snapshot terisolasi yang kompatibel dengan konfigurasi protected web; pertahankan snapshot dan pin Courier existing. Detail proses cutover baru ditentukan dari bukti host. |
| Snapshot terpisah, source/pin cocok | Siapkan backup dan paket web/backend+frontend terkoordinasi; Courier tetap memakai snapshot existing. |
| UNKNOWN_DRIFT / COURIER_SOURCE_PIN_DRIFT | Review perbedaan source yang dilaporkan terlebih dahulu. Jangan overwrite atau mengganti hash config. |
| TLS / hash HTML/aset gagal | Diagnosis host/path/CA berdasarkan error asli. Jangan bypass TLS atau mengubah Tunnel. |

Kirim output JSON dan error apa adanya. Jangan kirim secret bundle, token, password atau isi environment/config penuh.

## 3. Build kandidat, tanpa mengubah runtime

Jalankan setelah hasil inspeksi dapat dibaca. Perintah ini hanya menyiapkan artefak kandidat:

```powershell
Set-Location 'D:\HDWork2-B2C-ccc646a'
node.exe --version
npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency backend/test gagal' }
npm.cmd ci --prefix frontend --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency frontend gagal' }

node.exe --test tests/b2c-workbench.test.js tests/b2c-windows-preparation.test.js tests/frontend-only-release.test.js
if ($LASTEXITCODE -ne 0) { throw 'Tes persiapan gagal' }

$env:VITE_API_BASE_URL = 'https://hdwork2.yoloo.space'
npm.cmd run build:operational
if ($LASTEXITCODE -ne 0) { throw 'Build produksi gagal' }
```

Catat FRONTEND_MANIFEST_SHA256 dari build Windows yang baru berhasil. Jangan memakai hash cloud, build 090aa82, Shared Groups lama, atau direktori dist sisa build gagal.

## 4. Paket backup dan cutover setelah bukti host tersedia

Persiapan harus menghasilkan manifest baru berisi: commit aplikasi, commit checkout helper, target snapshot web, inventory/hash baseline frontend, sebelum/sesudah tiga file backend, manifest frontend Windows, lokasi backup, identitas task web, serta bukti bahwa snapshot/pin Courier dan konfigurasi terlindungi tetap sesuai baseline. Backup disimpan privat dan tidak di-prune.

Web snapshot baru harus mempertahankan konfigurasi protected service yang valid dan ACL LocalService; source/dependency closure, node_modules, TLS publik/privat dan bundle existing tidak boleh dipindah atau disalin dengan ACL default secara sembarangan. Penanganan path absolut dalam konfigurasi dan compatibilitas DPAPI harus ditentukan dari runtime aktual. Jangan menduplikasi/mengaktifkan launcher atau poller Courier.

Cutover web membutuhkan restart proses web untuk memuat JavaScript backend baru. Persetujuan pada langkah ini adalah push dan persiapan; dokumen/helper ini tidak menjalankan cutover atau mengganti task. Setelah paket konkret dan rollback siap, gunakan otorisasi penerapan untuk target rilis baru sesuai instruksi operator.

## 5. Verifikasi dan rollback yang harus tersedia dalam paket

- Baseline web TLS, source, konfigurasi dan task dicocokkan lagi tepat sebelum perubahan.
- Backend dimuat pada proses web baru yang terverifikasi; frontend HTML/aset cocok dengan manifest, bukan sekadar HTTP 200.
- UI lama harus dimuat ulang karena backend baru menolak DONE/GAGAL tanpa confirm. UI baru pada backend lama menonaktifkan ESKALASI; ini bukan bukti rilis lengkap aktif.
- Pemeriksaan API/UI berizin meliputi originalMessage, kapabilitas, konfirmasi, konflik owner, eskalasi nonfinal dan isolasi dua chat. Pengiriman nyata hanya memakai order uji baru pada rute yang sudah disetujui operator, bukan antrean lama.
- Jika health gagal setelah cutover, pulihkan backend web dan frontend pasangan backup yang kompatibel, serta verifikasi pemulihan. Catat kegagalan rollback secara eksplisit; jangan menghapus lock atau mencoba berulang tanpa diagnosis.
- Backend/Courier tidak boleh diturunkan melewati baseline fencing Shared Groups. Tidak memulihkan tabel lama, mereset cutoff atau mengulang DEAD/antrean yang ditahan.

## Bukti cloud

Aplikasi ccc646a: 431 tes backend, 75 unit frontend, build/lint dan tiga browser suite pada build produksi lokal lolos. Tambahan helper persiapan diuji dengan filesystem fixture dan probe/Git yang diinjeksi. Helper PowerShell belum dijalankan di Windows dari cloud. Tidak ada hasil cloud yang dianggap sebagai bukti deployment atau Telegram/MySQL produksi.

## Tahap staging terisolasi setelah build Windows

Helper `stage-b2c-isolated-web.ps1` menyiapkan kandidat **tanpa aktivasi**. Ia menerima tiga hash eksplisit: manifest Windows, index baseline aktif, serta config Courier dari inspeksi. Helper mengulangi inspeksi dan menghentikan proses jika ada drift selain keterkaitan pin snapshot bersama yang sudah diketahui.

Wrapper membuat direktori baru `C:\ProgramData\HDWork2WebB2C-<GUID>` dengan inheritance ACL dimatikan: operator, Administrators dan SYSTEM memiliki FullControl; LocalService hanya ReadAndExecute. Subfolder service/state baru memberi LocalService Modify. File baru ditulis sebagai byte pada target sehingga mewarisi ACL privat; security descriptor/alternate streams source tidak disalin. Direktori bukan salinan direktori state aktif; tidak ada PID/state READY lama yang dipakai sebagai bukti sehat.

Engine menyalin source web dan node_modules dari runtime existing, lalu mengganti hanya tiga source backend dengan blob Git immutable ccc646a. Environment dan encrypted bundle disalin byte-identik, tanpa unwrap, perubahan flags atau penulisan ulang path. Referensi absolut existing tetap menunjuk lokasi existing yang harus dipertahankan. Sertifikat/key server yang dibutuhkan disalin ke root privat; issuer private key ca.key tidak disalin. Target default TLS yang tidak tersedia/di luar kontrak harus diperiksa, bukan ditebak atau di-bypass.

Frontend baseline disalin untuk mempertahankan aset immutable bagi tab lama. Aset kandidat ditambahkan, collision nama dengan byte berbeda ditolak, lalu index kandidat dipasang hanya pada snapshot baru. Runtime web/Courier lama tidak disentuh. Bukti rollback mencakup snapshot lama yang tetap ada, inventori/hash baseline, salinan XML task web existing dan hash-nya. Plan memuat inventori hasil staging dan tidak mengubah task Courier maupun hash config-nya.

Hasil sukses: `STAGED_NOT_STARTED`, `activated=false`, `servicesChanged=false`. Catat `stagedRuntime` dan `planSha256`. Ini bukan bukti proses baru bisa boot atau rilis sudah dilayani web. Stage yang gagal dipertahankan sebagai `STAGING_FAILED_NOT_ACTIVATED`; jangan timpa atau hapus direktori untuk mencoba lagi tanpa diagnosis.

Contoh parameter harus diisi dari hasil Windows aktual:

```powershell
.\scripts\stage-b2c-isolated-web.ps1 `
  -ManifestSha256 '<hash-build-Windows>' `
  -ExpectedBaselineIndexSha256 '<hash-index-inspeksi-terbaru>' `
  -ExpectedCourierConfigSha256 '<hash-config-task-Courier>'
```

Belum ada mode Apply pada helper staging. Cutover/rollback eksekutabel akan disiapkan dari bukti hasil staging dan identitas task/proses yang masih berlaku, dengan hanya proses web yang berpindah. Courier harus terus memakai snapshot lama dan satu controller yang sama.

Tes staging memakai fixture filesystem: overlay tepat tiga file, preservation environment/ciphertext, task XML rollback, aset tab lama, penolakan collision/build/baseline/direktori existing dan ketiadaan operasi aktivasi. Windows ACL, copy aktual node_modules, boot LocalService dan integrasi produksi belum diverifikasi dari cloud.

## Aktivasi web terisolasi dan rollback

Setelah staging berhasil, gunakan `scripts/activate-b2c-isolated-web.ps1` dari checkout helper terbaru. Tidak perlu membangun ulang atau melakukan staging ulang. Wajib memasukkan `-StagedRuntime` dan `-PlanSha256` dari hasil Windows; jangan mengganti plan. Default `-Mode Verify` hanya memeriksa baseline, seluruh file staging, dependency native/policy secara offline, backup task, identitas proses dan pin Courier serta TLS/aset baseline.

`-Mode Apply -ApproveWebCutover` melakukan preflight tersebut lalu menghentikan hanya task `HDWork2-Web`, menunggu proses web lama berhenti, mengganti hanya action task ke snapshot baru dan memulai web baru. Principal, trigger dan settings task dipertahankan. Mutex deployment bersama dan lock frontend mencegah deployment bersamaan; lock existing ditolak tanpa dihapus. Periksa output `B2C_WEB_ACTIVE`, READY read/write proses LocalService baru, TLS dan index/aset kandidat. Courier harus tetap READY dengan PID/start time yang sama pada snapshot lama. Tidak ada migrasi, replay antrean, perubahan autostart Courier atau konfigurasi/kredensial. Saat boot normal, web tetap membuka pool database melalui mekanisme protected service existing.

Kegagalan setelah cutover memicu pemulihan action task lama dan verifikasi TLS/aset baseline. Hasil pemulihan `B2C_WEB_ROLLED_BACK_COURIER_PRESERVED`; kegagalan pemulihan dilaporkan `B2C_ROLLBACK_FAILED_PRESERVE_ALL_RUNTIME_AND_STATE`. Jangan menghapus direktori, journal atau lock untuk memaksa retry. Mode `Status` memeriksa runtime task aktif dan health terkait. Pemulihan manual menggunakan parameter stage/hash yang sama dengan `-Mode Rollback -ApproveWebCutover`.

Plan immutable tetap menyatakan `STAGED_NOT_STARTED` dan hash-nya tidak berubah setelah aktivasi. Status aktivasi disimpan terpisah di `.b2c-release/activation.json`; gunakan mode Status untuk bukti proses/web aktual. Apply menolak journal yang sudah ada agar pengulangan tidak memicu restart tak sengaja.

Tes fixture memeriksa drift plan, payload, backup rollback, baseline source/aset dan pin Courier; smoke offline memuat bcrypt/mysql2 dan menguji konfirmasi/eskalasi tanpa SQL/Telegram. Pemeriksaan statis memastikan operasi task controller hanya menargetkan web. Eksekusi PowerShell/ACL/task Windows belum diuji dari cloud. Verifikasi UI berizin dan live chat/order uji tetap diperlukan setelah health lulus; output helper mencatat `RealOrderAndChatTest=PENDING_OPERATOR_CHECK`.
