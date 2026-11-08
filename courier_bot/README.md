# HD Work 2.0 — Telegram courier foundation

**Batch12:** CLI `python -m courier --run` sekarang menggunakan journal durabel,
allowlist command eksplisit, OS lock dan lease backend. Gunakan listener
`courier-b2c-server.js --run` / `npm run start:courier`, bukan listener memory
foundation untuk integrasi. Semua flag tetap nonaktif secara default. Konfigurasi
Batch3/8 saja tidak cukup untuk menjalankan CLI terbaru. Panduan lengkap:
[Batch12](../docs/batch12-telegram-integration.md). Bagian berikut adalah riwayat
fondasi; bukan instruksi aktivasi layanan sekarang.

Python 3.11+; hanya standard library, tanpa Telethon, session user, pip dependency,
atau konfigurasi bot lama. Import modul tidak memulai network. Token hanya dari
bot BotFather **baru milik pengguna**, bukan TELEGRAM_BOT_TOKEN lama.

Status Batch 3: local development foundation, default disabled. Jangan jalankan
live sebelum persistent inbox/outbox, provenance bot/grup dan izin pengujian
terpisah tersedia. Tidak ada token atau bot Telegram nyata dibuat/dihubungi.

## Pengujian aman (tanpa layanan)

Dari root repository pada Bash:

```sh
PYTHONPATH=courier_bot python -m unittest discover -s courier_bot/tests -v
node --test --test-isolation=none tests/courier.test.js
```

PowerShell:

```powershell
$env:PYTHONPATH = Join-Path (Get-Location) 'courier_bot'
python -m unittest discover -s courier_bot/tests -v
node --test --test-isolation=none tests/courier.test.js
```

Tes menggunakan mock Telegram, transport dan database in-memory. Tes Node
interoperabilitas menjalankan parser Python saja, bukan bot atau network.

## Persiapan konfigurasi, bukan instruksi aktivasi sekarang

.env.example hanya template blank/non-secret; tidak otomatis dibaca program.
Jangan commit .env, token, session, file pelanggan atau hasil getUpdates.
Nanti, setelah disetujui, buat bot baru melalui akun BotFather pengguna,
simpan token pada secret/config proses baru, beri nama proses/cwd terpisah,
dan verifikasi grup/permissions/privacy mode. Tidak mengambil token lama.
Mengaktifkan privacy mode sesuai kebutuhan grup adalah keputusan tersendiri.

- COURIER_BOT_ID: alias asal internal, bukan token, username atau hasil getMe.
- COURIER_TELEGRAM_BOT_TOKEN: hanya token baru, khusus Python.
- COURIER_SERVICE_KEY: secret acak >=32 byte, khusus pasangan Node/Python.
- COURIER_SERVER_URL: HTTP loopback 127.0.0.1 atau ::1, default port 3091.
- COURIER_ENABLED dan COURIER_ALLOW_NETWORK harus true untuk Python.
- Node courier-api-server.js terpisah memerlukan COURIER_ENABLED=true dan
  COURIER_STORE=memory secara eksplisit. Memory berarti development-only.

Tidak menaruh secret ini pada frontend atau proses bot lain. API web
api-only-server.js/start:api tidak mengimpor listener kurir atau memulai bot.

Entrypoint untuk fase live yang kelak disetujui adalah `python -m courier --run`
dari direktori courier_bot dan `node courier-api-server.js` untuk service internal
terpisah. **Tidak dijalankan pada Batch ini.** Tidak menyediakan script auto-PM2,
webhook atau autostart baru. Jangan membuka port service internal lewat Tunnel.

Lihat [kontrak dan arsitektur](../docs/batch3-courier-foundation.md).
