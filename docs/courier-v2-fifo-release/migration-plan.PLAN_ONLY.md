# Migration/release plan — development revision

New target is branch HEAD containing this packet; 707f7ec is superseded. All old
source/config/manifest/helper pins MUST be regenerated and reviewed. Do not run
the historical staging/apply helpers pinned to 707f7ec for this revision.

1. READ ONLY: run `01-preflight.readonly.sql` in an already-authorized local
   metadata session. lanes is still UNKNOWN from last production evidence (1142);
   no production metadata/credentials were accessed in this development task.
   Empty information_schema is not absence. STOP on denied/filtered visibility,
   active QUEUED/SENDING >0, unexpected IDs/counts, invalid original timestamp or
   unverified clock skew (<300 seconds required).
2. APPROVAL: window/quiescence for owned HD Work producers only, verified coherent
   MySQL+SQLite backups and restore rehearsal. Metadata queues=0 is not quiescence.
   Do not touch other bots. Review shared-table MDL impact or STOP.
3. APPROVAL: exact schema 015, plus 004/005/006/008/009/012 prerequisites as applicable.
   Never rerun all migrations. lanes exists incompatible/partial => STOP and
   separate repair plan. If absent with sufficient metadata authority, review 015
   independently. 015 is non-idempotent; CREATE and ALTER commit separately.
4. APPROVAL: `SOURCE database/manual/016_fifo_release.PLAN_ONLY.sql;` in a reviewed
   DDL session only. This adds nullable metadata and an index; no backfill/status
   changes. Verify columns/types/collation/index after the statement. It is
   non-idempotent and no startup executes it. STOP on partial schema or error.
5. APPROVAL: minimum existing writer/Courier lanes SELECT/INSERT/UPDATE (no DELETE)
   if still missing. Both already require full outbox SELECT/INSERT; Courier
   UPDATE and audit INSERT cover automatic metadata. Manual session separately
   requires SELECT metadata, UPDATE(fifo_release), INSERT audit(id,action,detail),
   with no status UPDATE/DELETE/GRANT OPTION. No account/GRANT is created by tools.
6. APPROVAL: each legacy release is a separate explicit per-ID decision. Run the
   manual command DRY-RUN first, inspect metadata/fingerprint, then apply only
   that ID with operator/reason and expected fingerprint. All eight legacy stay
   HOLD until approved; no guessed identity/backfill, boundary change or resend.
7. READ ONLY: `02-postflight.readonly.sql`, own SHOW GRANTS under each role, inspect
   audit markers/alerts, status/attempt/error invariants. STOP if active queue
   changes during the approved maintenance gate, or if any result is unknown.
8. Separate approval only after all gates: coherent new source/peer rollout,
   regenerated pins, then reviewed release flags on all producers. No deployment,
   restart, flag activation, or Telegram call is authorized by this packet.

DDL lock estimate: secondary index construction is not INSTANT; nullable-column
addition combined with index creation can use a rebuild path. Time/space depends
on total shared table size and concurrent transactions. No production size/timing
was measured here. Tiny fixture milliseconds are not a production estimate.
Online DDL still needs MDL and may block other bots using the shared table.
Use representative-copy rehearsal, disk checks and a reviewed session MDL timeout;
never kill unrelated sessions or silently retry with COPY/stronger locks.

Rollback is paired DATA restore, not source downgrade; see rollback.PLAN_ONLY.md.
No production restore command is safe until a verified MySQL recovery point and
selective/shared-schema impact have been established. DDL cannot be ROLLBACKed.
