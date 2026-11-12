# Paired-data rollback — PLAN ONLY

No rollback, production backup/restore or code downgrade is performed by this task.
The earlier SQLite backup is verified but is not a proven pair with a restore-tested
MySQL backup. This remains a production blocker.

Before any approved DDL/marker change: quiesce only owned HD Work producers,
record one coherent MySQL+SQLite recovery point, backup and restore BOTH into
temporary locations, verify integrity and delivery/ACK/marker/audit invariants.
SQLite online backup folds committed WAL into a standalone file; never mix its
old DB with a newer live WAL. Preserve failure evidence instead of deleting files.

DDL is atomic per statement, not as an entire multi-statement migration. A failed
015/016 requires read-only metadata inspection; do not retry/drop columns or
revoke grants blindly. Stop at partial/incompatible schema.

If rollback is approved, restore the verified pair first into an isolated MySQL
instance and a NEW journal path, verify marker/hold/ACK invariants without sending,
then obtain separate approval for a coherent data cutover. A blind whole-schema
restore can rewind other bots: shared ownership and selective/PITR recovery must
be proven first. No production restore commands are safe without that evidence.

After a marker has allowed successor traffic, reverting it can strand or reorder
history. After Telegram side effects, data restore does not undo delivery and may
cause duplicate sends. STOP for per-ID evidence reconciliation, never auto-replay.
Old 707f7ec source cannot interpret the release semantics safely; source downgrade
is not the rollback mechanism. Keep v2 flags off until all new pins/gates are approved.
