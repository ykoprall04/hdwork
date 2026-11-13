# Pembaruan 13 November 2026 - rencana terbaru

Lihat [activation plan terbaru](D:/HDWork2-New/courier-v2-activation-20261113.md). Audit produksi baru: SENT 109, DEAD 18, QUEUED/SENDING 0; schema 015-017 dan grants runtime telah terverifikasi. Jangan ulang migrasi atau administrative18. Aktivasi tertahan: writer web aktif belum kompatibel FIFO dan belum mempunyai fence per bot. Kandidat supervisor dan flags-off telah diuji terisolasi, belum diinstal/diaktifkan. Catatan di bawah adalah riwayat, bukan instruksi aktivasi terkini.

---

# HD Work Courier v2 — development readiness

New target: branch HEAD containing the three FIFO release commits, replacing
707f7ec. Old source/config/helper/manifest pins MUST be regenerated and reviewed.
This is development evidence, not production activation approval.

## PASS in isolated development

- Targeted JavaScript: 44/44. Python: 27/27. Real Windows MySQL 8.4.13, unique
  named pipe/TCP disabled: 19/19 checks; no production connection or Telegram call.
- Five scoped + three historical DEAD remain HOLD and preserve status/attempts/
  error/time. Proven independent new order/conversation lanes run, including a
  different order within the same chat. Existing possibly related orders remain
  HOLD rather than guessing the unknown legacy lane.
- Same-order successor is blocked until a durable marker; after explicit release
  it proceeds across store recreation. NETWORK and local BAD_REQUEST do not
  auto-release. New confirmed Telegram 400 gets metadata release + atomic alert
  audit, keeps DEAD. Error descriptions are static sanitized metadata only.
- Manual default DRY-RUN, expected fingerprint, operator/reason/time/database
  identity audit, idempotence and audit-failure rollback verified. Only fifo_release
  is updated; late manual delivery is labelled late without changing status.
- Restart journal evidence/ACK safety, no ambiguous resend, TIDAK_PASTI, group
  pacing/global pacing and chat exclusions verified. Delayed ACK cannot resurrect
  DEAD or overwrite a manual disposition. Old Telegram anchors cannot use a new
  database record to bypass unknown history.
- PREFLIGHT/POSTFLIGHT read-only SQL executed on the temporary instance.
  One Windows SQLite-reader leak discovered in existing reconciliation was fixed;
  relevant tests passed on rerun. No other failing repair round was required.

## Production still BLOCKED

- Last lanes evidence remains UNKNOWN/1142; no credentials/token/runtime bundle
  were opened/decrypted and no production MySQL/journal data was accessed by this
  development task. Last scoped baseline DEAD=5, SENT=94, active=0 is historical,
  not a fresh preflight. Eight actual legacy IDs are listed in reconciliation plan.
- Need exact 015 + PLAN_ONLY 016, metadata authority, grants review, coherent
  MySQL/SQLite recovery pair with restore rehearsal, shared-table MDL/disk/window
  review, all writers on the same reviewed version, trusted original Telegram
  timestamps and verified clock skew <300 seconds.
- Unknown identity or old/unverifiable original time means HOLD for possibly
  affected existing orders; unrestricted liveness is deliberately NOT promised.
  Each of the eight legacy releases requires a separate explicit operator decision.
- No production schema/grants/status/config/flags changed; no retry/deletion,
  service restart/deploy, Telegram send, other-bot operation or main merge.

## Final order requiring separate production approvals

1. Metadata/preflight and actual per-ID outcome review (read-only). STOP if
   QUEUED/SENDING >0, baseline changed, metadata unknown or clock/provenance unverified.
2. Approve owned-producer quiescence/window and paired MySQL+SQLite backups/restore
   rehearsal without affecting other bots. STOP if shared ownership is unsafe.
3. Approve exact 015 if needed, then separately 016 metadata/index revision;
   inspect after each DDL. No rerun on partial installation.
4. Approve only missing minimum runtime/manual-review grants; verify each role.
5. Approve each per-ID marker after DRY-RUN; no identity/status backfill or resend.
6. Regenerate and approve all pins/release packet; read-only postflight, then
   separate deployment/restart/flag approvals, outside this task.

Full plan, SQL, expectations, reconciliation and rollback:
[docs/courier-v2-fifo-release](docs/courier-v2-fifo-release).

Reproduce offline targeted checks:
```powershell
node --test tests/courier-fifo-release.test.js tests/courier-fifo.test.js tests/courier-mysql.test.js tests/private-courier-runner.test.js tests/live-chat-production-boundary.test.js tests/live-chat-activation.test.js
$env:PYTHONPATH='courier_bot;courier_bot/tests'
python -B -m unittest test_fifo_release test_fifo_ack test_scheduler test_courier
node scripts/test-fifo-release-isolated.cjs --temporary-only
```
