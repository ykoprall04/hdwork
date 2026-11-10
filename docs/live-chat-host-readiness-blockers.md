# Observed office readiness blockers

The operator's read-only report after commit 207612a returned BLOCKED.
No database writes, order reads, Telegram access or restart occurred. The active
environment hash remained unchanged and existing writer approval was preserved.

Confirmed observations:

- chatRead/chatWrite grants do not match their expected profiles. `unsafe: true`
  means a grant shape is rejected; it does NOT by itself prove extra dangerous
  privileges. For example, an old narrower column SELECT list also differs from
  the exact expanded chat profile. Do not issue speculative REVOKE statements.
- All seven system tables and hd2_chat_messages were missing OR invisible to
  the two existing web accounts. This is not proof that they do not exist.
  Resolve using an existing authorized DBA's metadata visibility before DDL.
- hd2_courier_outbox.delivered_at was visible (not in the missing list). Do not
  replay migration 012 unchanged: its unconditional ADD COLUMN can fail after
  earlier statements have already committed. No automatic DDL batch is proposed.
- Active backend differs in src/chat/service.js, src/config/operational-pools.js,
  src/config/live-chat-activation.js, src/system/routes.js and src/system/store.js.
  Repository pull alone did not update the protected active service snapshot.
- Routing remains UNKNOWN; Courier transport is unverified. No verified route,
  sender readiness, or permission to send a real Telegram test is inferred.

## Concrete next steps

1. Use `ops/examples/hdwork2-live-chat-schema-inspect.review.sql` in an existing
   authorized DBA session. It reads metadata/privileges only, including index
   definitions; it does not read MySQL authentication tables or order data.
   Return the results, never credentials or a secret bundle. This remains within
   the already approved read-only inspection scope.
2. Once authoritative schema is known, review CREATE statements from manual
   migrations 012/013 for only genuinely absent tables. Do not drop, replace,
   truncate or silently accept incompatible existing tables. Already visible
   delivered_at must be preserved without another ADD COLUMN.
3. Review `ops/examples/hdwork2-live-chat-web-delta.review.sql`: it adds only the
   difference between approved base and chat web profiles. No Courier account,
   auth account, existing order mutation permission, secret or user creation is
   included. Extra existing privileges, if actually found, need separate review.
   Do not execute until schema/grant changes are explicitly authorized.
4. After DB prerequisites pass, stage the matching backend with preserved
   operational policy, trial overlay and secret bundle. Apply the two reviewed
   feature flags and restart only the already authorized web/new-bot scope.
   Do not use the old operational-write deploy script to widen permissions.
5. Re-run readiness, verify exact new-bot routing/worker/sender configuration,
   then obtain a precise approved destination/message for delivery verification.
   An API success or ANTRE state is not confirmed Telegram delivery.

The user approved DB schema/grant inspection **read-only**, flag activation and
scoped restarts. That approval did not authorize migrations, GRANT/REVOKE, data
changes, legacy-bot changes or a Telegram test message. Schema/grant mutations
require an additional explicit decision after the metadata review.
