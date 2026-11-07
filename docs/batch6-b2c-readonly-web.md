# Batch 6 — B2C workflow read-only web integration

## Boundary

New web reads use `hdwork2.hd2_orders` / `hd2_audit` through the existing main API-only pool. They do not read, import or reconcile `hd_b2c.sheet_import_test`. The `/b2c/staging` diagnostic page and `/api/b2c-staging/orders` remain unchanged. No fallback to staging, Preview or localStorage demo data occurs on errors or empty responses. No courier processor, Telegram client, timer/worker or legacy socket is imported by these routes.

Reading is disabled unless **both** `B2C_WORKFLOW_READ_ENABLED=true` and `DB_NAME=hdwork2` are set in a future approved environment. No .env is changed in this batch. Missing tables return a generic 503; the API never creates tables. Manual SQL 004/005 from earlier batches has **not** been executed. Before enabling, rehearse schema/permissions on an isolated database and confirm the intended environment, approved data ingestion and backups. The web cannot create orders itself; without an enabled ingestion pipeline, a valid empty database correctly produces an empty list.

## Authorization and limits

Existing Bearer JWT authentication remains. Every new request additionally requires an active SUPER_ADMIN from the current `users` row, not merely a JWT claim. Deleted, deactivated or downgraded accounts fail closed. hd2_orders has no confirmed city/account ownership mapping, so HD/ADMIN access cannot safely be enabled yet. A future authorization design is required before expanding access. All these reads are private, not Public Monitoring endpoints.

The route has a connection limiter of 120 requests/minute and a separate authenticated-account limiter of 60/minute; supplied forwarded-IP headers cannot change the account key. Existing loopback bind, CORS allowlist, staging limits and session validation are retained. Responses use no-store. SQL runs inside a read-only transaction; no DDL or mutation is executed.

## Endpoints

Only GET routes are registered:

- `/api/b2c/orders`: `module=TIAL|LOGIC_PSB|LOGIC_MO` (default TIAL), `date=YYYY-MM-DD` (optional), `status=WAITING|IN_PROGRESS|DONE|FAILED|DUPLICATE|FINISHED` (optional), `q` (SC/IN or INET literal substring, max 100 characters), `page` (1..1000), `limit` (1..50, default 25). `FINISHED` means DONE or FAILED. STO is not stored in the schema: a nonempty `sto` is rejected rather than silently ignored. Unknown/array query values and invalid calendar dates are rejected.
- `/api/b2c/orders/:id`: stable UUID v4 order identity, 404 for a missing order.
- `/api/b2c/orders/:id/history`: bounded page/limit over ORDER_RECEIVED, DUPLICATE_ORDER_RECORDED and STATUS_CHANGED audit rows, newest first. Other audit actions and sensitive detail JSON are excluded.

List/history responses contain `page`, `pageSize`, `hasMore` via one-row lookahead, without an invented total. Ordering is deterministic by created_at DESC, id DESC. Offset pagination is bounded; concurrent arrivals can still move rows between pages. No snapshot/cursor consistency is claimed. Real query plans must be reviewed on a disposable representative dataset before scaling, especially substring search.

Metadata: `source=HDWORK2`, `readOnly=true`, `dateBasis=telegram_business_day_jakarta`, and an actions contract with PICK/CEK/RECEK/DONE/GAGAL **all false**. No mutation endpoints or action buttons exist. Future action adapters must be separately implemented/authorized, not activated by changing browser state.

## Safe DTO and dates

Only approved identifiers, module, business date, workflow status, validated SC/IN token, masked INET, duplicate-order UUID and processing timestamps are projected. INET never returns in full (only last four characters for values longer than four). Telegram chat/message/thread/sender IDs, bot alias, inbox payload, messages/attachments, raw failure reason, credentials and internal errors are excluded. Audit returns only UUID, action, from/to status and timestamp. HD identity cannot currently be mapped safely to a web username and is shown as unavailable.

Business date comes from the original Telegram message timestamp in Asia/Jakarta (Batch 5), not the staging import date. `receivedAt` is the hdwork2 row creation time; start/completion and audit timestamps are server processing times. No exact Telegram original timestamp is invented. Global/status totals, STO, owner and durations remain unavailable where the contract does not support them.

## Web behavior

`/work/B2C/TIAL` retains the existing enterprise layout, cards, filter area, table, pagination and ~60-second nonoverlapping refresh. It now uses server workflow status tabs, a status select and an explicit hdwork2 source label. Filter edits reset pagination and cancel old requests. Refresh retains the last table and row identity; failed background refresh marks it stale. 401/403 remove the data and stop list refresh. No dummy fallback is provided.

Selecting an order identifier opens `/orders/:id` for read-only detail and paginated status history. The detail page retains B2C workspace navigation; back returns to TIAL. Preview routes and providers are untouched; all Preview actions remain isolated DEMO. The staging diagnostic remains a separate link.

## Validation performed

- Node: 116 isolated tests passed, including 6 new read-API tests, current-account authorization/revocation, disabled configuration, query/pagination bounds, safe DTO/history, error sanitization, rate limits and API-only dependency isolation.
- Frontend: 50 unit tests passed, including 3 transport/reconciliation tests, Preview/workflow regressions, source separation, auth/server errors, empty data and abort handling.
- Frontend production build passed. Lint passed with pre-existing warnings in legacy/Preview files; those files were not changed.
- Four Chromium suites passed with intercepted synthetic API responses: TIAL/filter/pagination/60s refresh, detail/history/empty/error, desktop/mobile screenshots and independent Preview; stable row during refresh/session revocation; operational login/navigation/diagnostics/mobile/logout/DEMO isolation; Preview fidelity/check-in/Light-Dark.
- Screenshots generated at `/tmp/hdwork-batch6` (test artifacts, not committed). No real API, MySQL, Telegram or production service was contacted. The test Vite server uses a separate loopback port; no operational backend was started.

Safe repeat commands:

```powershell
node --test --test-isolation=none tests/b2c-read.test.js tests/api-only-isolation.test.js tests/api-security.test.js tests/b2c-workflow.test.js tests/courier-mysql.test.js
cd frontend
node --experimental-strip-types --test --test-isolation=none tests/*.test.ts
npm run lint
npm run build
```

Browser suites require Playwright/Chromium and a **frontend-only** test Vite server. `HD_PREVIEW_URL` sets its URL. All API requests are mocked. These tests establish code behavior, not a tested production connection or MySQL grant verification.
