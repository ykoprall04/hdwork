# Stage 1 operational repairs

Baseline: `4974cdc`, branch `chore/remove-cacti-hdwork2`. No existing office system,
production database, runtime configuration or Telegram endpoint was accessed.

## Confirmed defects and changes

- The persistent `operational-write` gate admitted only login/logout and operation
  mutations, rejecting `/api/admin/users` and password changes before route RBAC.
  It now admits exact account mutations; session, role, CSRF and module checks
  remain mandatory. Session-only and bounded read-only profiles remain restricted.
- The proposed office ingress generator routed only login/logout/me and operations,
  then denied other APIs. Its generated proposal now includes account APIs.
  **No active tunnel configuration was changed.** An existing deployment must be
  reviewed separately before using these routes publicly.
- Public registration was Preview-only. `/register` now submits to the real auth
  API/store. The separate 15-minute signed double-submit registration cookie does
  not replace or revoke a logged-in session. Registration is rate limited and
  accepts only name, username, password and confirmation. Usernames are normalized
  and unique; bcrypt uses the existing cost 12 and 12-character/72-byte policy.
- Registered users are PENDING, inactive, SHOW_ONLY and have no modules. Only
  SUPER_ADMIN can decide public applications, selecting role and module grants
  on approval. Rejections persist as REJECTED/inactive; normal update and login
  cannot bypass them. Admin-created accounts retain the existing hierarchy.
- Username conflicts and safe validation/policy errors are displayed without SQL,
  credentials or stack traces. Raw database failures use a sanitized availability
  error; operational grants and actual production account creation are unverified.
- Duplicate ingestion previously emitted `arrival`, indistinguishable from a normal
  order. It now emits `change`; canonical order/reservations are untouched.
  Pending duplicates have a separate list tab and are excluded from normal waiting
  counts. They remain available for explicit LANJUT CEK/TOLAK DUPLIKAT decisions.
- Duplicate actions retain HD/module/state/owner guards and return specific safe
  errors. Frontend hides actions outside the current module grant.
- Existing row lock, version check and atomic status/audit/outbox remain intact.
  Rejected PICK/duplicate conflicts now append ACTION_REJECTED after rollback,
  rechecking session/module scope; they never mutate assignment or enqueue a reply.
  Explicit TAKEOVER remains separate from PICK. Successful replay remains idempotent.

## Manual schema review and rollout prerequisites

`database/manual/011_hdwork2_registration_rejection.sql` extends the existing CHECK
constraint in one ALTER TABLE, retaining every existing row/password/session.
It requires migration 010 first and authorization for the exact target. It has
not been applied to production. Do not use the historical release provisioner
as an automatic rollout of 011: its strict 010 preflight intentionally does not
accept the extended constraint. A reviewed production release procedure and
schema/grant preflight remain required.

Auth identity uses the existing users/modules/session/security-audit permissions;
no new table grants or broad writer permissions are introduced. Rejection audit
uses the existing operations audit INSERT privilege. Database or Courier failures
never select demo data as a fallback. Preview and legacy source files are unchanged.

## Verification

The committed unit/HTTP tests use memory adapters and synthetic data. The browser
rehearsal uses the built React UI, HTTPS, API routes, CSRF and cookies in Chromium
with a memory adapter; it is MOCK PASS, not MySQL or live Telegram verification.
The guarded MySQL auth runner includes registration uniqueness races, hashing,
PENDING denial, approval hierarchy, persisted rejection and audit-failure rollback.
The existing operations runner covers concurrent PICK and transactional outbox.

Final verification: 293 backend tests, 70 frontend tests and 31 Python Courier
unit tests pass; operational frontend build and changed-file lint pass. Chromium
registration, PENDING login denial, Super Admin approval/role/module assignment,
direct account creation and mobile layout pass with a memory adapter.

Authorized disposable MySQL 8.4.13: auth, operations and Python Courier roundtrip
suites all pass. Verified registration uniqueness/hash/rejection/rollback, race
PICK, takeover, duplicate decisions, outbox/audit correlation, SSE, fake delivery
ACK, lost-ACK/restart recovery and database recovery. Export covers 550 rows.
The image was `mysql:8.4`, digest
`sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902`,
bound to 127.0.0.1:13316; each suite used a new hdwork2_test_* schema/user. The
owned container and its tmpfs data were removed after verification. Telegram was
FAKE_ONLY; no real message or operational credential was used.

Two stale runner assumptions were corrected after actual failures: web-only
operations fixtures now use botUsername, explicit allowedCommands and no Telegram
actors; unmapped sources are discarded before journal storage, so the roundtrip
expects two journal IGNORED records rather than three. Its incoming list now
asserts two normal orders and a separate pending duplicate, preserving coverage.

Stage 1 status: INTEGRATION PASS for the isolated scope above. No LIVE VERIFIED
claim is made for the office deployment or Telegram. The production schema,
permissions, ingress and rollout still need separate review and approval.
