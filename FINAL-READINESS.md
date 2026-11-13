# Final infrastructure readiness, 2026-11-13

Current result: NOT READY for production cutover. See
`INFRASTRUCTURE-READINESS.md` for new evidence and approval gates; the historical
administrative18 implementation below is unchanged. Native dummy adapter PASS;
current legacy launcher needs approved cooperative bootstrap. New targeted
integration10/10 and native client2/2 PASS, including real temporary MySQL/SQLite
backup+restore, 015/016/017/minimum grants, scoped approval, post-stop queue race
gate and runtime-only rollback retaining administrative history. Native combined
deployment/owner writer+install+health binding remains unproved and BLOCKED.
Audit 2026-11-13T04:11:45.273Z: QUEUED10 + DEAD8 unchanged, SENDING0, unlisted
QUEUED0, candidate lease0, active worker lease1. Lanes UNKNOWN1142; existing
outbox lacks015/016/017 and both runtime accounts lack lanes SELECT/INSERT/UPDATE.
Production recovery pair awaits approved quiescence; fixture PASS is not proof
of a production recovery pair. New exact commit and regenerated pins supersede
7f2b010 in the private infrastructure packet. No production writes or controls.

# DEC-20261112-01 — administrative closure and cutover development

Supersedes the f399b0d readiness design. New target is branch HEAD containing this
revision; exact SHA and freshly regenerated FE/BE/plan pins are in the private
release packet produced AFTER commit. No production execution is authorized here.

## Audit and decision

Operator Yayan, DEC-20261112-01: ten old QUEUED and eight legacy DEAD are not to
be sent. Exact IDs/time/attempts/error/routing/order-digests and creation cutoffs
are locked in `ops/examples/courier-admin-DEC-20261112-01.PLAN_ONLY.json`.
Private read-only audit contains routing/order IDs/lease metadata/age, never body
or raw lease token. Initial two independent transactions: 10 QUEUED + 8 DEAD,
no candidate active lease, no unlisted QUEUED; every route has an order metadata
match. This is not a historical FIFO sequence proof or a delivery receipt.
Queue cutoff: 2026-11-09 19:51:32.881 UTC; full cohort cutoff:
2026-11-11 16:00:24.575 UTC. A changed cohort/lease is a STOP, not a new allowlist.

18/18 are eligible for the reviewed administrative transaction ONLY after the
approved stopped/quiescent, verified paired-backup window. Zero were closed in
production. Live Courier remains active; a metadata audit is not stop evidence.

## Implementation

- Existing terminal DEAD is safe for old/v2 workers: claim selects QUEUED only.
  017 PLAN_ONLY adds `administrative_closure JSON NULL`, no ENUM expansion.
- Ten exact allowlisted QUEUED become DEAD in one transaction with the eight
  already-DEAD markers. Each update checks bot/ID/cutoff/state/no active lease;
  exact affected counts (10 and 8) or rollback ALL, including audit.
- Operator, reason, timestamp, decision ID and decision reference are in the DB
  marker AND per-ID audit, not merely a sidecar. Default DRY-RUN writes nothing;
  identical applied decision is idempotent. Partial/conflicting closure stops.
- Administrative closure NEVER writes fifo_release or assigns guessed identity.
  Unknown same-order HOLD persists; separate explicit per-ID FIFO release is
  necessary. The old ABANDONED_BY_OPERATOR FIFO-release command now rejects.
- No status is reported TERKIRIM; no resend/retry/delete. Late ACK cannot undo
  administrative closure. Existing attempts/error/time/idempotency are retained.

## Verification performed (targeted only)

7/7 new unit checks; 18/18 new real Windows MySQL TCP-off integration checks.
Tests cover active lease/changed cohort/missing row, affected-count rollback,
audit rollback, ten+eight closure, idempotence, decision audit, unlisted QUEUED,
unknown/same/independent lanes, old/v2 eligibility, late ACK, separate release,
executor order, real temporary mysqldump+restore and SQLite backup/integrity,
flags-off health failure/runtime rollback, and external-effect STOP.
The fixture Windows-service lifecycle/install/TLS callbacks are simulations;
native production service control is NOT proven. No Telegram calls, production
access from tests, or Windows service controls. Two fixture repairs: normalize
zero-fraction MySQL time; commit SQLite fixture transaction before backup and
bound its runtime. Other previously passing suites were not repeated.

## Executor and remaining blockers

`execute-courier-cutover.js` defaults to file-only PLAN; --execute requires exact
HEAD/clean tree, plan SHA, FE manifest, BE source pins, sealed allowlist and a
separately pinned owner host adapter. Sequence: cohort gate → clean stop/fence →
paired backup/restore evidence → exact 015/016/017 → minimum grants → closure18 →
install with all sender/poller/FIFO/scheduler flags OFF → pinned health.
Phase1 FIFO, phase2 scheduler, phase3 separateIo require separate approval.

Automatic rollback restores runtime/config to flags OFF, keeps Courier STOPPED,
and preserves committed administrative decisions/audits. It NEVER automatically
rewinds DB or restarts a sender. Possible external delivery means STOP without
data rewind. Disaster paired-data restore needs separate recovery review.

The native owner host adapter is deliberately not fabricated: the active legacy
owner exposes STOP only through its owned stdin; attaching to it from another
process is not proven safe. Stop-ScheduledTask/kill fallback is NOT implemented.
Without a pinned, reviewed owner coordinator that owns clean-stop/fencing,
backup, DDL/grant/install/health/rollback capabilities, --execute fails BEFORE
loading any controls. The complete transition engine is tested; native deployment
and legacy graceful-stop integration remain explicit production blockers.

Last read-only schema/grants: outbox lacks 015/016 (and therefore 017); lanes
UNKNOWN/1142; writer/Courier lack lanes SELECT/INSERT/UPDATE. No alternative
credentials/accounts used. Existing SQLite online backup PASS is not a verified
production MySQL–SQLite pair. No production DDL/grant/closure/service/flag change.

## Required approvals

Review final stable allowlist/metadata and owner coordinator → window/fence and
clean Courier+writers stop → coherent MySQL/SQLite backup and restore verification
→ exact conditional 015,016,017 → least grants → one closure transaction18 →
install exact new pins with flags OFF → health → separately approved phase1/2/3.
See `ACTIVATION.PLAN_ONLY.md`. Any unknown metadata, cohort/lease change, unlisted
active queue, partial schema, unverified backup, or unsafe host control is STOP.
