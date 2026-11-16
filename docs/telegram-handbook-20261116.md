# Telegram handbook alignment - 16 November 2026 (offline)

Authority: the user's supplied specification, rather than the former contract.
Prepared on `feat/telegram-handbook-export`; no production activation performed.

## Commands and storage

- `/order`: existing six required fields and identity/deduplication retained.
  `NO INET/TELP` remains an alias for `NO INET`; additional supported fields remain.
- `/MO`: existing five required fields and identity extraction retained. Legacy
  `STB ID` remains accepted/stored but is omitted from the failure-reply template.
- `/config_psb`: only Order ID DSC, No SN ONT, Keperluan and STO are required.
  Service is optional free text, including the legacy package-labelled field.
  TIPE ONT is optional. GPON hostname and IP are independent fields. The introductory
  sentence and unknown labels are ignored by structured parsing.
- `/req`: unchanged, including empty requests and original body whitespace.

Reuse existing JSON keys: `ORDER ID DSC` -> `ORDER ID`, `NO SN ONT` -> `SN ONT BARU`,
`KEPERLUAN` -> `KETERANGAN`, `NO INET` -> `NO INTERNET`, `USEE TV` -> `NO USEE`.
Existing canonical labels remain accepted. Combined historical GPON/reporter fields
are retained separately rather than guessing how to split historical values.
New NIK ATASAN, HOSTNAME GPON, IP GPON, NAMA/NIK PELAPOR and WITEL are structured.
All recognized duplicate labels are invalid, including alias/canonical pairs and
optional labels. Required blank/dash values remain invalid. Serial/identity
validation and normalization are unchanged.

The existing storage function serializes parsed fields into `command_fields` and
retains the unmodified message in `raw_text`. Invalid messages remain inbox/audit
events with no order row. No DDL, grant change or historical rewrite is needed.

## Rejection delivery

Existing canonical rejection text now appends the matching static full template
from the shared command contract. Reasons contain only validation labels, never
customer values. Exact original chat/topic/message proof, inbox-origin FIFO,
outbox idempotency, dispatch authorization and Telegram reply anchoring remain.
No new transport, polling loop or queue is introduced.

## Export

Select an explicit command specification per authorized worksheet; `_formats`
cannot be interpreted as a command. Preserve all existing authorized categories,
including non-B2C worksheets when granted. B2C sheet names remain TIAL, REQ,
LOGIC MO and LOGIC PSB. Each sheet has relevant command fields; config headers
display Order ID DSC, No SN ONT and Keperluan.

Export all statuses regardless of the current dashboard tab/status. Keep area,
command, dates, text search, and module authorization. An HD filter matches final
handler or, for unfinished work, current owner. Dashboard list/recap behavior is
unchanged. Export retains the existing cross-order (not mine-only) scope within
the caller's authorized modules.

Only `/req` rows select stored body text, strip the leading command, and emit the
body into a dedicated request column. There is no raw/original-message column.
Network fields (ODP, VLAN/Valins, OLT/GPON, slot/port/rack, domain, panel, time)
are excluded. Streaming, keyset pages, worksheet rollover, cancel/timeout,
session ownership, permission rechecks and formula protection remain.

## Offline verification and later activation

Tests use synthetic records, mock pools/Telegram and temporary workbook streams.
The existing FIFO integration fixture starts its own named-pipe MySQL with TCP
disabled and verifies its private datadir; it never uses production credentials.
Python journal/offset tests use temporary SQLite files.

Activation will require both Web (export/contracts) and Courier (both parsers,
contract and rejection helper), through existing independent update mechanisms.
Do not activate only one parser or copy unpinned files into active snapshots.
Before activation/rollback, check pending rejection replies: their exact text is
authorized by recomputation against the parser/contract version. Old replies or
old invalid inputs may no longer match new rules; drain compatible pending work
before handoff rather than resetting/replaying journal, offset or queues. No
automatic recovery of historical rejected messages is included.

Production throughput, actual Telegram delivery and live Excel downloads remain
unverified until separately authorized activation. No services are restarted by
these offline changes.

## Validation receipt

- Node: 172 distinct tests PASS, zero FAIL (77 command/export/routing/payload
  checks, 82 access/workflow/FIFO checks, 8 isolated INVALID/FIFO SQL checks,
  5 isolated VLAN/authorization SQL checks; parent tests included in Node counts).
- Python: 91 tests PASS, zero FAIL, including durable journal/offset/ACK and the
  mixed VALID/INVALID three-second sequence.
- Actual XLSX roundtrip covers all five statuses, request-body extraction,
  formula safety, 501-row keyset pagination, sheet rollover, empty sheets,
  cancellation, session revocation and module-scoped HD/ADMIN/SUPER_ADMIN access.
- Git whitespace validation PASS. No commit, push, merge or deployment.

Changed implementation: `contracts/b2c-commands.json`,
`src/b2c-workflow/commands.js`, `courier_bot/courier/commands.py`,
`src/b2c-workflow/rejection.js`, `src/operations/export.js`,
`src/operations/policy.js`. The synthetic command in
`scripts/check-web-vlan-payload.cjs` now includes the required ONT serial.

New tests: `tests/handbook-20261116.test.cjs`, `tests/handbook-export.test.cjs`.
Updated fixtures/assertions: `tests/b2c-commands.test.js`,
`tests/courier-integration.test.js`, `tests/shared-groups.test.js`,
`tests/universal-b2c-routing.test.js`, `tests/telegram-final-format.test.js`,
`tests/operations.test.js`, `tests/vlan.test.js`, `tests/vlan-mysql.test.cjs`,
`tests/invalid-order-fifo-mysql.test.cjs`, and Python `test_commands.py`,
`test_durable.py`, `test_shared_groups.py`, `test_universal_b2c.py`.
Legacy fixtures now include the required config serial and expect duplicate
optional labels to be invalid; the HTTP CSRF double also stubs the existing
VLAN handler factory without reaching storage.

The pre-existing local `docs/DEPLOYMENT-STATUS.md` changes and private operational
files are unrelated and were not edited or staged by this work.
