# Read-only gate expectations

- Database must be hdwork2 and identity the approved metadata account. Client must
  stop for review after any SQL error/STOP; SOURCE by itself is not an orchestrator.
- lanes UNKNOWN/1142 remains a blocker; no metadata visibility is not absence.
- Last production baseline (NOT refreshed by this development task): scoped
  DEAD=5, SENT=94, QUEUED/SENDING=0; total DEAD=8. Compare exact IDs/attempts/error/time.
  No build or backup was repeated. Any changed active count >0 => STOP.
- Exact 015 types/defaults/collations/primary/unique/head indexes must match official
  015. 016 adds fifo_order_id char(36) ascii/ascii_bin NULL, fifo_release JSON NULL,
  telegram_error JSON NULL, nonunique outbox_fifo_unknown(bot_id,fifo_order_id,created_at).
- After DDL only: legacy metadata remains NULL, unresolved_unknown_holds=8, all
  eight states/attempts/error/time unchanged. This is HOLD, not automatic release.
- No legacy Telegram error provenance is inferred from BAD_REQUEST. Only new
  authenticated Telegram rejection evidence may auto-mark a known lane.
- An approved manual release reduces HOLD count by that one ID, with exactly one
  audit; identical retry adds no audit. Late attestation adds one separate audit,
  retains original marker and leaves status DEAD. No idempotency/payload/seq edits.
- Writer/Courier need lanes SELECT/INSERT/UPDATE, no DELETE. Existing profiles
  retain full outbox SELECT/INSERT and Courier UPDATE/audit INSERT. The explicit
  manual session needs only selected outbox metadata SELECT, UPDATE(fifo_release),
  and audit INSERT(id,action,detail); validate its own grants independently.
- Original Telegram timestamp provenance and clock skew <300 seconds are release
  gates. Unknown/old timestamps mean HOLD for possible lanes, not a guessed lane.
- All writers/consumer must run the coherent reviewed release revision. Plan,
  source hashes, frontend manifest and full dependency pins must be regenerated.
  Successful fixture tests do not authorize production activation or guarantee
  shared-table DDL latency.
