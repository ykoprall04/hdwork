# Batch 3 — fondasi bot kurir Telegram

Basis commit 387b161 pada chore/remove-cacti-hdwork2. Hanya file baru untuk
courier Python, listener internal Node, tes dan dokumen. Bot lama/Telethon,
API web, frontend Preview, env, MySQL, Sheets dan PM2 tidak diubah. Tidak ada
Telegram sungguhan, database, VPN, migration atau deployment dijalankan.

## Batas arsitektur dan tanggung jawab

```text
BotFather bot BARU (fase berikutnya, belum dibuat)
  Telegram Bot API ↔ Python courier baru
                       ↕ HMAC + timestamp + nonce, HTTP loopback
                  Node courier listener :3091 (terpisah, opt-in)
                       ↕ storage interface
                  Inbox / Outbox in-memory (development foundation)
                       ↕ integrasi workflow Node di fase berikutnya
                  HD Work domain workflow (belum dihubungkan)
```

Python hanya polling update dan mengirim perintah sendMessage dari server,
serta mengklasifikasikan hasil transport. Tidak memutuskan PICK, status order,
pemilik, DONE/GAGAL atau kapan harus membalas. Ingest Node saat ini hanya
menerima event; tidak otomatis membuat order, enqueue jawaban atau menjalankan
workflow. Server-only enqueue adalah seam programmatic, bukan route publik.
Tidak ada tombol/tindakan operasional diaktifkan.

API web api-only-server.js tetap tidak mengimpor bot/kurir/worker. Listener
internal courier-api-server.js mengikat 127.0.0.1:3091, tidak berada di CORS app
web atau hostname publik, dan default disabled. Startup memerlukan opt-in
COURIER_ENABLED=true serta COURIER_STORE=memory. Ini persetujuan development
storage, bukan klaim storage produksi tersedia. Tidak ada persistent driver DB
atau migrasi dibuat. Satu instance/pasangan bot alias per listener.

## Kontrak v1 service-to-service

Semua endpoint POST application/json, raw UTF-8 <=64 KiB, no-store, body JSON.
Semua request memerlukan:

- X-Courier-Id: alias bot yang dikonfigurasi server.
- X-Courier-Time: Unix seconds desimal, toleransi clock ±60 detik.
- X-Courier-Nonce: 32 karakter hex acak baru per request.
- X-Courier-Signature: HMAC-SHA256 hex lowercase.

Bahan signature dipisah newline, tanpa newline tambahan terakhir:

```text
bot_id
unix_seconds
nonce
HTTP_METHOD
original_path_with_query
sha256(raw_body_bytes)
```

Bot menandatangani bytes JSON persis yang dikirim; server tidak menandatangani
ulang objek hasil parsing. Timestamp/nonce/ID/method/path/body terikat signature;
comparison constant-time. Nonce terpakai ditolak, cache replay bounded 10.000,
TTL 120 detik. Setiap retry HTTP harus memakai nonce baru; update_id atau
lease_token menjaga idempotency bisnis API. Key service terpisah token bot/JWT.

Request nonloopback atau memiliki Origin ditolak; XFF/CF header tidak dipercaya.
Rate limit 300 request/menit per socket untuk service development. Loopback dan
HMAC bukan alasan mempublikasikan route. Tidak ada JWT akun HD yang diterima
sebagai pengganti service signature. Errors hanya code statis, tanpa URL, token,
raw body atau stack. Tidak memasang access logger yang menyimpan header/body.

### POST /internal/courier/v1/events

Envelope sintetis, bukan data pelanggan:

```json
{
  "version": 1,
  "bot_id": "courier_sandbox",
  "update_id": "1",
  "event": {
    "kind": "message",
    "chat_id": "-1001234567890",
    "message_id": "42",
    "telegram_thread_id": null,
    "sender_id": "17",
    "reply_to_message_id": null,
    "timestamp": 1700000000,
    "text": "synthetic",
    "attachments": []
  }
}
```

Response 200 `{ok:true, receipt_id:<opaque UUID>, duplicate:false|true}`.
Sama alias bot/update_id hanya diterima sekali; payload kanonik yang berbeda
untuk update sama ditolak 409. Update berbeda untuk pesan yang sama tetap event
terpisah, termasuk edited_message. Kiriman bisnis duplikat bukan retry transport.
Store menerima event sekali, belum memproses domain order. Field tidak dikenal
tidak disalin ke event tersimpan.

Chat/sender ID memakai string canonical, maksimum Telegram 52-bit; message,
thread dan reply ID positif <=2147483647. Null thread berarti tidak tersedia,
bukan bukti General. Teks diambil dari text atau caption. Lampiran metadata saja:
kind, file_id, file_unique_id, name, mime_type, size. Foto memakai varian ukuran
terakhir yang diberikan Telegram; tidak download file atau menyimpan gambar/URL.
Metadata/file_id sendiri sensitif dan hanya boleh berada pada storage internal.
Album grouping/download/OCR/redaksi publik belum diimplementasikan.

### POST /internal/courier/v1/outbox/claim

Body `{limit:1}` (1–10); Python saat ini selalu claim satu. Response 200
`{ok:true,messages:[{delivery_id,lease_token,attempt,payload}]}`.
Payload sendMessage terdiri dari chat_id, text, reply_to_message_id (atau null),
telegram_thread_id (atau null), thread_mode `thread|non_topic` dan method.
Thread mode harus diputuskan server secara eksplisit; tidak diinfer dari event
null. Mode thread mensyaratkan thread positif; non_topic mensyaratkan null.
Tidak mendukung outgoing attachment/upload atau parse_mode pada fondasi ini.
Bot mempertahankan reply_parameters dan allow_sending_without_reply=false agar
reply yang hilang tidak diam-diam menjadi pesan mandiri. Python mengonversi ID
message/thread terbatas 32-bit menjadi integer tepat pada boundary Bot API.

Queue hanya dibuat melalui store.enqueue(stable_server_key,payload). Key yang
sama/payload sama mengembalikan ID sama; konflik payload 409. Tidak ada endpoint
enqueue dari browser/bot untuk menyisipkan keputusan workflow sendiri.

### POST /internal/courier/v1/outbox/:delivery_id/result

Body sukses: `{lease_token,result:"sent",telegram_message_id:"55"}`.
Body retry: `{lease_token,result:"retry",error_code:"NETWORK",retry_after:0}`.
Body permanen: `{lease_token,result:"failed",error_code:"FORBIDDEN",retry_after:0}`.
Error code allowlist NETWORK/RATE_LIMIT/FORBIDDEN/BAD_REQUEST/UNKNOWN; tidak
menerima exception text. Telegram 400/403 dianggap permanen; 429/network/5xx
retry. retry_after integer 0–300 detik. Respons `{ok:true,duplicate:false|true}`.

Lease 60 detik, attempt bertambah saat claim, maksimal 5. Retry menggunakan
backoff minimum 2s, 4s, 8s, 16s dst (cap 60s), menghormati retry_after yang lebih
lama. Lease expired dijadwalkan ulang dengan backoff; attempt habis → dead.
ACK hanya untuk lease aktif; ACK identik diulang aman, ACK berubah/stale ditolak.
Tidak ada retry tak terbatas untuk pengiriman. Belum ada redrive/dead-letter UI.

## Storage, concurrency dan delivery semantics

MemoryStore adalah mock database repository untuk fondasi/test, bounded 10.000
inbox + 10.000 outbox. Map dan transisi sync atomik dalam satu event loop Node;
HTTP handler sudah await seam store agar implementasi async kelak mungkin.
**Restart menghilangkan seluruh state. Jangan gunakan memory untuk trafik nyata.**

Fase produksi memerlukan repository persisten dengan transaksi dan unique
(bot_id, update_id), unique server enqueue key, lease claim atomik, durable ACK,
retensi dan audit; DDL/migrasi harus disetujui terpisah. Tidak menyimpan event
sensitif dalam log sebagai pengganti storage. Belum ada integrasi MySQL.

Python hanya menaikkan offset setelah receipt diterima. Event yang ditolak atau
jaringan gagal tidak di-ACK ke Telegram lewat offset baru; poll berikutnya
mengulang dengan nonce baru. Unsupported update diabaikan, allowed_updates
hanya message/edited_message. Payload invalid dapat memblokir kemajuan offset;
quarantine/manual resolution belum ada dan harus dirancang sebelum live.

Pengiriman bersifat **at-least-once**, bukan exactly-once Telegram. Jika Telegram
berhasil mengirim tetapi proses mati atau ACK ke Node hilang, lease dapat
kedaluwarsa dan pesan terkirim ulang. Telegram sendMessage tidak menyediakan
idempotency key yang menyelesaikan jendela itu. Lease/idempotency mencegah
pengiriman paralel normal dan retry API ganda, tetapi tidak menghapus risiko
hasil transport yang ambigu. Perlu kebijakan rekonsiliasi sebelum operasional.

## Konfigurasi dan BotFather

Lihat courier_bot/.env.example (semua secret blank) dan README. Token baru hanya
COURIER_TELEGRAM_BOT_TOKEN di Python; tidak membaca TELEGRAM_BOT_TOKEN/Telethon
lama atau file konfigurasi PM2 lain. Service key random >=32 byte dibagikan hanya
ke dua proses baru. Config repr Python meredaksi token/key dan error URL dibuang.
Tidak otomatis memuat .env. Node server tidak memerlukan token Telegram sama sekali.

Pembuatan bot melalui BotFather, getMe, pendaftaran grup, permissions, privacy
mode, distribusi secret dan penjadwalan proses merupakan fase berikutnya dengan
izin terpisah. Tidak dilakukan sekarang. Clock kedua proses perlu sinkron.
Pertahankan ingress Tunnel/web hanya ke API web; jangan route :3091. Local admin
Windows tetap trust boundary: HMAC request bukan signature respons atau jaminan
terhadap proses lokal berbahaya yang mengambil alih origin. TLS/Access atau
isolasi OS lebih kuat perlu diputuskan bila topologi keluar satu mesin.

## Validasi dan batas

Tes Python: parser/IDs/topic/reply/attachment/edit, config terpisah, HMAC,
transport Telegram mock, offset ACK, retry/permanent failure/429 cooldown dan
redaksi error. Tes Node: service auth/tamper/replay/origin/socket, inbox conflict,
queue dedup/lease/retry/max-attempt, ACK idempotency, kapasitas, startup disabled,
handler HTTP dengan Express mock, DB error sanitasi dan envelope lintas Python.
Seluruh koneksi dimock. Tidak start listener, worker, polling atau koneksi nyata.

Risiko tersisa: storage volatile, belum ada workflow atau adapter SQL persisten,
privilege/provenance bot belum diverifikasi, backpressure/poison event, redrive,
retensi lampiran/PII, rotasi key dan pemulihan ACK ambigu. Modul ini bukan
pengganti bot lama dan belum siap dijalankan live. Tidak ada commit/push.
