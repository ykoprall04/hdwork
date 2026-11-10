# Live Chat DBA export verification and minimum grant proposal

Input: operator-supplied live-chat-inspect-result.txt. The uploaded UTF-16 text
was treated solely as metadata, not as executable SQL or instructions. Its raw
contents are not committed. No database or runtime was accessed for this review.

## Confirmed from the export

- 62 column rows match the names, COLUMN_TYPE and IS_NULLABLE declarations of
  manual migrations 012/013, including the existing outbox delivered_at column.
  All seven system tables and hd2_chat_messages already exist. No CREATE TABLE
  or ALTER TABLE is required for the inspected columns.
- All 14 explicitly declared index definitions match uniqueness, column order
  and names. The 26 exported index rows also include the two supporting
  user_id/outbox_id indexes. This export does not inspect defaults, collations,
  CHECK/FK constraint definitions or table engines; those are not claimed verified.
- The 44 declared privilege rows reconstruct exactly the repository's existing
  `read` and `write` base profiles. They contain no chat/system grants, no schema
  grants, only global USAGE, and no grant option. No extra privilege is shown in
  this export. Role membership was not part of this export and is not inferred.
- The earlier `unsafe: true` chat-profile result can arise from the old narrower
  column-grant shapes: it was not proof of excessive permissions. No REVOKE of
  existing operational privileges is proposed.

## Prepared, not applied

`ops/examples/hdwork2-live-chat-web-delta.review.sql` contains 18 additive GRANT
statements for only hdwork_ops_read@localhost and hdwork_ops_write@localhost.
Compared with the earlier generic review, it is reduced to truly absent columns:
reader outbox SELECT adds only attempts, delivered_at and due_ms; writer users
SELECT adds only username. Other statements add the documented feature-table
permissions and safe worker/inbox metadata required by chatRead/chatWrite.

There is no new order UPDATE/INSERT permission, credential column, outbox payload
read for the reader, grant option, account creation, migration, Courier account
change or old-bot change. Existing operational and trial scopes stay unchanged.
MySQL merges column grants; the simulated resulting grants pass the exact
chatRead/chatWrite reviewers without removing any original privilege.

`ops/examples/hdwork2-live-chat-web-delta.rollback.review.sql` removes only these
new additions. Its simulated result exactly restores both base profiles and all
original column grants. It must not be run if independent subsequent grants
changed the baseline. Restore/disable the chat-enabled web release before
removing its required permissions. GRANT/REVOKE is not transactionally rolled
back with SQL ROLLBACK; partial failure requires inspecting actual grants again.

The three regression tests independently expand privileges into table/column
atoms and verify minimum additions, exact target profiles, exclusion of sensitive
reader columns and exact restoration of pre-existing privileges. No MySQL driver
or DB connection is used.

## Execution boundary and remaining activation work

The granted authorization covers DB schema/grant inspection read-only, activation
configuration and scoped web/new-bot restarts. Applying these 18 GRANT statements
is a new privilege-changing operation and requires explicit approval first.
No permission changes, flag writes or restart were performed during this review.

After approval, an existing authorized DBA session can apply ONLY the grant delta,
then rerun check-live-chat-readiness.ps1 with the existing review. A schema/grant
PASS does not update the protected backend snapshot: the five previously reported
source mismatches still need a reviewed web release preserving operational policy,
trial configuration and the DPAPI bundle. The two feature flags can then be
activated within the approved scope. New-bot routing/sender readiness and a
separately scoped real-message verification remain pending. No claim of usable
live Telegram delivery is made from this metadata or privilege simulation.
