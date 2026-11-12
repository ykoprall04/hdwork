# Manual per-ID disposition — no sender

The CLI imports only the explicitly supplied owner-managed session adapter, which
exports `pool()` returning an existing authorized mysql2-compatible pool and an
optional `close()`. It never reads runtime environments, DPAPI or login history.
Use a stable UTC/dateStrings connection so a dry-run fingerprint matches apply.
Operator and reason are identifiers/codes, not free text or customer/message data.

```powershell
node scripts/reconcile-fifo-release.js --session C:/owner/approved-session.cjs --bot hdworkopsbot-testing --id <EXACT_UUID> --operator <OPERATOR_ID> --reason REVIEWED_HOLD_RELEASE
# DRY-RUN is default. Review ID/state/attempts/error/time and fingerprint.
# Separate approval is required before this per-ID write:
node scripts/reconcile-fifo-release.js --session C:/owner/approved-session.cjs --bot hdworkopsbot-testing --id <EXACT_UUID> --operator <OPERATOR_ID> --reason REVIEWED_HOLD_RELEASE --expected <DRY_RUN_SHA256> --apply
```

Identical apply is idempotent, without duplicate audit. Conflicting decisions,
non-DEAD rows, changed metadata or missing operator/reason/expected hash fail.
Marker and audit are atomic; audit failure rolls back the marker. The original
delivery state is always DEAD, not SENT/QUEUED, and the original is never retried.

If a separate approved external manual delivery happened later, use the same
ID with `--late --reason LATE_EXTERNAL_DELIVERY_ATTESTED`, first dry-run, then
`--apply --expected ...`. This records a late attestation only, preserves the
original release and writes its own audit; it does not send/verify a receipt or
claim that the delivery was ordered. Do not use this option as a resend command.

No production session adapter/credential is included or used in development tests.
