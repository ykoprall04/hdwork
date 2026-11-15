# Courier: arsitektur dan batas integrasi

Audit: 2026-11-15 · branch `main` · HEAD `2d9c034f7da1a72a5de8777d23ae620b1bb41b88`.

## Arsitektur yang tampak di source

Python Courier berada di `courier_bot/courier/`; entrypoint `python -m courier --run` ada di `__main__.py`. Komponen mencakup runtime config, Telegram/internal HTTP clients, journal SQLite, lock/polling owner, durable runner, scheduler dan runner layanan. Node Courier/API internal berada di `courier-b2c-server.js`, `courier-api-server.js`, dan `src/courier/`. Supervisor/adapter Windows terkait ada pada `ops/windows/courier-native-supervisor.ps1` dan `courier-native-control.ps1`. Ini deskripsi source, bukan bukti proses atau task aktif di host.

## Alur penerimaan dan relasi Web

Telegram update diterima oleh poller Python dan dimasukkan ke journal lokal; durable runner mengirim event/inbox ke internal API Node. Node `src/courier/integration-app.js`, `mysql-store.js`, `inbox-worker.js`, `groups.js`, dan `b2c-workflow/command-storage.js` menangani autentikasi service, persist inbox idempotent, validasi/routing command, pemrosesan transaksi ke `hd2_orders`, audit dan live event. Pesan reply Telegram untuk chat dikirim melalui transaksi Web ke `hd2_courier_outbox`; worker/sender Courier mengambil outbox dan mengirimnya, lalu ACK memperbarui status dan live event. Detail konfigurasi aktual, autostart, token, offset, grants dan runtime tidak diperiksa pada audit ini.

Web mengonsumsi REST/SSE melalui backend; UI tidak berkomunikasi langsung ke Telegram. Untuk Batch 3, incoming chat tetap melalui jalur existing supaya `hd2_chat_messages` dan event change tersedia. Tidak diperlukan modifikasi Courier untuk read cursor localStorage atau Catatan HD. Jangan ubah polling, journal/offset, inbox/outbox, FIFO, lease, sender, token atau writer fence untuk dua fitur UI ini.

## Isolasi

Web dan Courier memiliki entrypoint, supervisor/task dan konfigurasi runtime yang berbeda. `courier-native-supervisor.ps1` mengatur owner Courier; `web-native-supervisor.ps1` mengatur proses Web. Source `src/config/operational-grants.js` membatasi privilege menurut role; Courier memiliki akses inbox/outbox/order yang dibutuhkan, dan tidak mendapat SELECT audit. Desain fitur Catatan HD harus memisahkan tabel/grant backend dari Courier. Jangan menganggap isolasi proses berarti bebas dari shared MySQL: perubahan skema/grant tetap dapat memengaruhi komponen, karena itu fitur baru harus aditif dan privilege Courier dipertahankan.

Status proses aktif, koneksi Telegram dan scheduled tasks: **tidak diverifikasi** (audit kode saja).
