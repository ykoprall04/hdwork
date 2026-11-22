# Rilis Web Dashboard Rekap terisolasi

Status: persiapan lokal. Tunggu persetujuan deployment eksplisit sebelum menggunakan
instruksi ini di PC kantor. Branch transfer menyediakan tooling dan riwayat kandidat. Tidak diperlukan merge.

- Kandidat: `6cda7056cce3073b369529309e224b7a32315720`.
- Web aktif yang wajib cocok: `f63b0a1b0f42a57e5438f3d0a4dd7594db6606a3`.
- Commit aplikasi berisi tepat delapan file Rekap beserta tes. Enam file lolos
  seleksi sumber Web updater. Dua tes backend tetap di Git. Frontend dibangun ulang
  dari worktree kandidat. Updater bawaannya memeriksa juga kontrak dan helper
  runtime. Kandidat ini diblokir jika pemeriksaan itu meminta file tambahan.
- Simpan skrip tooling di luar worktree kandidat. CMD dan skrip standar di checkout
  main tetap tersedia. Tidak ada perubahan schema, konfigurasi media, atau
  pemakaian flag persetujuan database.

## Setelah deployment disetujui

Dari PowerShell Administrator, ambil branch transfer dan buat dua worktree
terpisah. Worktree tooling menyediakan skrip updater, sedangkan worktree build
harus tepat di commit aplikasi yang sudah diaudit. Untuk tahap preflight,
berhenti setelah perintah dengan `-DryRun`.

```powershell
$main = 'D:\HDWork2-New\.worktrees\main'
$toolTree = 'D:\HDWork2-New\.worktrees\recap-transfer-6cda705'
$targetTree = 'D:\HDWork2-New\.worktrees\recap-only-6cda705'
$target = '6cda7056cce3073b369529309e224b7a32315720'
$baseline = 'f63b0a1b0f42a57e5438f3d0a4dd7594db6606a3'

git -C $main fetch origin refs/heads/transfer/recap-only-6cda705
if ($LASTEXITCODE -ne 0) { throw 'Fetch branch transfer gagal' }
$toolCommit = git -C $main rev-parse FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw 'Commit tooling tidak ditemukan' }
git -C $main merge-base --is-ancestor $target $toolCommit
if ($LASTEXITCODE -ne 0) { throw 'Branch transfer tidak memuat kandidat' }
git -C $main worktree add --detach $toolTree $toolCommit
if ($LASTEXITCODE -ne 0) { throw 'Persiapan worktree tooling gagal' }
git -C $main worktree add --detach $targetTree $target
if ($LASTEXITCODE -ne 0) { throw 'Persiapan worktree kandidat gagal' }
$updater = Join-Path $toolTree 'scripts/hdwork-web-update.ps1'
npm.cmd ci --prefix (Join-Path $targetTree 'frontend')
if ($LASTEXITCODE -ne 0) { throw 'Persiapan dependency frontend gagal' }
git -C $targetTree status --porcelain=v1
```

Output status harus kosong. Dari sesi Administrator yang sama, jalankan preflight
hanya setelah diizinkan. Mode ini membaca task aktif dan membandingkan scope,
serta berhenti sebelum build runtime atau handoff.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $updater -TargetCommit $target -ExpectedActiveCommit $baseline -TargetWorktree $targetTree -DryRun
```

Preflight harus menunjukkan `WEB_EXPLICIT_RECAP_SCOPE` dengan `changed=8`,
`payloadSource=6`, target `6cda705...`, dan rollback `f63b0a1...`. Harus juga
menunjukkan `DRY_RUN` dengan `runtimeChanged=false` dan `courierTouched=false`.
Berhenti jika hasil berbeda. Setelah persetujuan cutover, jalankan perintah yang
sama tanpa `-DryRun`. Mode eksplisit otomatis mempertahankan backup sebelumnya.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $updater -TargetCommit $target -ExpectedActiveCommit $baseline -TargetWorktree $targetTree
```

Verifikasi output `SUCCESS ... web=DEPLOYED ... courier=UNTOUCHED`, manifest
ACTIVE, dan rilis Web READY. Uji kedua tab Rekap serta kedua unduhan Excel dengan
sesi sah. Catat direktori rollback dari output updater.

## Rollback dan rilis main berikutnya

Jika handoff atau pemeriksaan health gagal setelah Web lama berhenti dengan aman,
jalur rollback updater memulihkan file dan konfigurasi dari snapshot sebelum
cutover, termasuk pin Web `f63b0a1`. Verifikasi manifest `ROLLED_BACK`,
`rollbackTargetCommit=f63b0a1...`, health PASS, task READY, dan pin aktif.
Jika updater tidak dapat membuktikan proses lama berhenti atau rollback gagal,
pertahankan paket dan diagnosis. Jika kegagalan fungsional baru ditemukan setelah
status ACTIVE, rencanakan pemulihan Web dari manifest dan backup rilis yang sama
melalui prosedur handoff Web dengan persetujuan terpisah. Paket lama ke e5259a4
tidak dipakai untuk rollback rilis ini.

Commit terisolasi belum menjadi leluhur main. Apabila dipasang, updater standar
akan menolak rilis Web dari main sampai ancestry direkonsiliasi secara eksplisit.
Sebelum update Web reguler berikutnya, pertahankan commit terisolasi dalam sejarah
main melalui merge dengan ancestry utuh yang disetujui. Squash atau cherry-pick
saja tidak mencukupi. Jangan mengubah pin runtime secara manual.
