# Final Courier handbook/recovery candidate (offline)

Prepared on `feat/courier-handbook-final` from Web/handbook reference
`2596e2499a0c9234295b0e8096b1491d4f8025d0`. No commit or activation performed.

## Composition

The source delta is based on the existing Courier base
`d6c95293875bfb0d30f7b44ec6137195dc338760` and preserves the 11 runtime files
from recovery `a925748ec67a4c11bbeb92cd4075db20267728ec`. Each was compared with
the approved Git source and the active snapshot, permitting only newline
representation differences; active byte hashes matched their pins. Recovery
files were not edited to implement handbook compatibility.

The package contains only 19 source files: those 11 recovery files, the current
B2C contract, both command parsers and both pure network helpers, rejection,
group authorization and the frozen legacy contract. No Web frontend/export,
database scripts, dependencies, credentials, runtime config, DPAPI bundle, task
XML, journal, queue or offset files are included. It is a source delta for
existing staging, not a standalone runnable production release.

The private ignored `.local/courier-handbook-final-*/` artifact contains payload,
manifest with actual-byte SHA-256 for each source file, and offline test receipt.
Before activation, an isolated full snapshot and dependency/binary pins must be
bound using the existing mechanism. Keep existing protected identity/plan/state
paths; do not copy secrets merely to prepare this source package.

## Exact legacy rejection compatibility

`contracts/b2c-commands.legacy.json` is the unmodified pre-handbook contract from
the base above. The existing Node parser is reused with its historical optional
duplicate behavior only by `parseLegacyCommand`. Normal intake still invokes
`parseCommand`, uses the current contract, rejects all recognized duplicate
labels and remains in parity with Python. No config switch selects legacy intake.

Current rejection authorization/allocation is unchanged. If current exact text
does not match, outgoing authorization may recognize an exact historical B2C
rejection only when all of the following hold:

- The route/command, original bot/chat/message/topic, non-reply message kind and
  PROCESSED inbox proof are valid.
- A QUEUED/SENDING outbox is joined to that exact committed inbox through the
  existing `b2c:<inbox UUID>:format-rejected` namespace.
- Its hash equals the canonical requested payload hash, and the stored payload
  independently canonicalizes to the same bytes used for that digest.
- The frozen legacy parser rejects the original text with exactly the stored
  static reasons, without a template. No arbitrary prefix or altered reason is
  accepted. Workspace commands are outside this compatibility path.

The join avoids choosing a SENT predecessor's receipt when historical multiple
receipts exist for the same Telegram original. Current FIFO allocation does not
use this compatibility path: it cannot create a new legacy rejection. No order
is fabricated and no DEAD row, status, ACK, journal or offset is repaired/reset.
No additional database schema or grant is needed for existing inbox/outbox reads.

## Verification

- Source suites: 82 Node tests PASS (parser/parity, rejection, namespaces, guards,
  ACK, FIFO, writer fence, deduplication and isolated recovery processes).
- TCP-disabled owned MySQL fixture: 9 tests PASS, including mixed old/new
  rejection dispatch, exact stored proof, idempotent ACK, unchanged order count,
  VALID/INVALID every three seconds, rollback and existing least-privilege grants.
- Python: 100 tests PASS, including durable journal/offset, ACK and recovery.
- Actual base archive plus the 19-file delta: 15 Node and 100 Python tests PASS
  in a disposable tree. Test files are not part of the production payload.
- All 19 payload hashes were rechecked after testing. No production connection,
  real Telegram message, task registration or production process action occurred.

Recovery remains bounded (four identity attempts, 120-second READY budget,
permanent failure suppression and transient task retry policy). IgnoreNew,
supervisor mutex, child drain, Python lock and worker ownership remain existing
mechanisms. No new recovery service or watchdog is introduced.

## Read-only production review and remaining limits

The source package is ready for an approved read-only preflight, not activation.
Review active source/config/task pins, binaries/dependencies, unique ownership,
worker lease and aggregate pending inbox/outbox/journal/ACK state without exposing
customer messages or credentials. Preserve the active recovery wrapper, opt-in
binding, three retries at 60 seconds and IgnoreNew when later staging configs.

Historical orders and PROCESSED inboxes are not reprocessed. Pending inboxes may
change validation outcome at cutover and require an explicit boundary/review.
Existing DEAD/uncertain/expired deliveries and unknown FIFO predecessors remain
held; this patch does not resend or automatically release them. The legacy join's
cost on a large production backlog is not measured by synthetic tests.

Forward compatibility covers proven stored legacy rejections in the candidate.
An untouched old snapshot still cannot authorize new template-bearing replies.
Before post-activation rollback, drain/review those replies with compatible code
or prepare a separately reviewed compatible rollback package. Do not restore old
database/journal/offset backups or indiscriminately requeue uncertain sends.

No production queue, journal contents or database credentials were accessed.
Pre-existing deployment notes and private operational files remain untouched.

## Working-tree file list

Recovered unchanged from the approved recovery commit:

- `contracts/courier-startup-recovery.json`
- `courier_bot/courier/__main__.py`, `clients.py`, `http.py`
- `ops/windows/courier-native-control.ps1`, `courier-native-supervisor.ps1`
- `scripts/configure-courier-recovery.ps1`, `courier-startup-trace.py`,
  `courier-task-runner.js`, `run-courier-scheduled-owner.ps1`,
  `run-production-live-chat-courier.js`

Compatibility changes:

- `contracts/b2c-commands.legacy.json`
- `src/b2c-workflow/commands.js`, `rejection.js`
- `src/courier/groups.js`

Tests and documentation:

- `courier_bot/tests/test_startup_recovery.py`, `test_startup_trace.py`
- `tests/courier-auto-recovery.test.cjs`, `courier-rejection-compat.test.cjs`,
  `invalid-order-fifo-mysql.test.cjs`, `helpers/courier-db.js`
- `docs/courier-auto-recovery.md`, `courier-handbook-final.md`
