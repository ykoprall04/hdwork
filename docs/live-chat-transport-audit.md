# Live Chat transport audit ? 2026-11-17

Source preparation only, main worktree. No production configuration or state changed.

Production evidence from the preceding read-only audit: enqueue 09:02:00.618Z,
commit 09:02:00.621Z, send start 09:03:31.367Z, Telegram response 09:03:32.943Z.
Repeated getUpdates transport failures lasted 10?13.5 seconds and installed a
shared 5-second cooldown before outbox claims. The production plan did not opt
into separateIo/adaptiveScheduler. A send timeout became DEAD/NETWORK, not a safe
retry. No same-lane SENT inversion was found.

DNS/TCP/TLS/HTTP: old logs show timeout/TransportError, not a definitive phase.
No active production Telegram probe was performed. The patch classifies wrapped
DNS errors, connection errors, TLS errors, HTTP errors and ambiguous socket
timeouts without logging URLs, headers, request bodies or exception messages.
A timeout remains NETWORK_TIMEOUT because urllib does not establish whether it
occurred while connecting, handshaking or reading. TLS 1.2 retains default CA and
hostname validation, matching the previously verified production workaround.
Long polling is 25 seconds on a separate transport with a 35-second socket timeout;
send/identity use a separate 10-second transport. These are socket timeouts, not
end-to-end deadlines (DNS and multiple address attempts may take longer).

FIFO V2 production loader now enables the existing scheduler and separate I/O by
default. Receive-only mode stays disabled for both. No second poller, SQLite
owner, service or supervisor is introduced. Polling cooldown is independent from
outgoing cooldown; group/global limits, Telegram retry_after, per-order FIFO,
ACK receipt persistence, uncertain-send holds, lease and fences are unchanged.
Different orders and human Telegram posts do not share a total-order guarantee.

## Final validation

Receive-only failure had two causes: the original fixture omitted required
TIPE TRANSAKSI, and workflow still attempted confirmation/rejection replies in
receive-only mode. The fixture now tests both valid and invalid input. Workflow
suppresses outbound replies when store.receiveOnly is true; store enqueue,
claim, authorize and settle restrictions are unchanged. Sender regression tests
still require normal confirmation/rejection and idempotency behavior.

Lifecycle compatibility was checked against the committed production lifecycle
reference cc90aadee18d0e5ac5446fefdeef7d5e53b65cee without accessing live state.
An isolated git archive under .local/live-chat-lifecycle-validation was overlaid
with the eight changed main source/test files listed in validation-inputs.json.
No merge/cherry-pick or change to the lifecycle checkout occurred. Mock plans,
fake secrets, unique fixture task/mutex names and temporary files were used.
Task configuration tests mock Scheduler calls; process tests run only synthetic
children, with no production Task, database or Telegram client.

Compatibility fixes retain transient_network/temporary_network startup error
classification, exit code 75 for retryable startup failure, and bounded log
rotation. Main still does not contain the full lifecycle overlay; deployment
must retain that overlay, especially identity retry clients and Windows owner/
supervisor/recovery scripts. Replacing the complete deployed runtime with bare
main was not validated or authorized. No release-specific deployment framework
or supervisor was added.

Final results (distinct tests within each environment, reruns not added):
- Main Python: 59 PASS, 0 FAIL.
- Main Node: 78 PASS, 0 FAIL (68 targeted tests plus 10 mock integration tests).
- Lifecycle-overlay Python: 72 PASS, 0 FAIL.
- Lifecycle-overlay Node: 44 PASS, 0 FAIL. Four initial fixture failures were
  missing mocked recovery-contract dependencies, fixed in the common fixture;
  the affected 12-test file then passed. The other 32 tests already passed.
- Combined environment executions: 253 PASS, 0 unresolved FAIL.
- git diff --check: PASS.

Covered: heartbeat advancement, lock/single-instance rejection, old-child drain,
startup retry limits, permanent failure, recovery fence, launcher readiness,
exclusive worker lease and signed/fenced internal access, FIFO predecessor holds,
ACK recovery, journal persistence, uncertain-send replay prevention, TLS trust,
rate-limit handling and diagnostic redaction.

READY for an authorized deployment retaining the validated lifecycle overlay.
No commit, push, deployment or activation was performed. Production latency and
the exact DNS/TCP/TLS/HTTP timeout origin remain to be observed after authorized
activation. Network outages can still delay polling/delivery. DEAD/NETWORK must
not be blindly replayed; rollback must never rewind journal, offset, ACK or queues.
