# FIFO release metadata revision

Development only; supersedes the 707f7ec delivery design. Production is unchanged.

707f7ec has a bot-wide unsequenced legacy gate in `MysqlStore.claim`; its FIFO
predicate/head consider every non-SENT predecessor blocking forever. Moving the
outer activation boundary does not change the predecessor predicate. Leaving
historical metadata NULL and moving the boundary can skip unresolved history.

The new mode requires **both** FIFO and `HDWORK2_COURIER_FIFO_RELEASE_ENABLED=true`.
015-only mode remains compatible and retains its historical fail-closed behavior.
016 is PLAN_ONLY and is not loaded by startup. Missing 016 fails closed; web
preflight probes the new columns before use. Optional production-plan `fifoRelease`
only supports an already-reviewed FIFO plan; no current plan/flag is changed.

## Identity and independence

A lane remains the bot/chat/topic/original-order anchor digest. Rate limiting
remains by chat_id in the unchanged durable Python Scheduler, not by lane.
New identity is accepted only when the outgoing anchor matches an actual order's
bot/chat/topic/message. No anchor/match means unsequenced HOLD, never a guessed
chat-wide lane or a per-DEAD fabricated lane. Stored identity is checked again at claim.

All unresolved unknown-identity non-SENT rows, including the eight legacy DEAD
inside/outside the original boundary, remain HOLD. They do not form a bot-wide
stop. A candidate is provably independent only if its order record AND original
Telegram message timestamp are later than every unknown hold. Telegram anchor
time must exceed hold time by 300 seconds. A freshly inserted order record alone
is NOT proof: delayed ingestion of an old Telegram anchor remains held.
This rule requires immutable trusted original timestamps and verified clock skew
less than 300 seconds; metadata preflight must STOP if that cannot be established.
Existing orders that could correspond to unknown legacy remain conservatively
held until those specific IDs are manually released. Claim does not read/guess
legacy payload identity and does not move the original activation boundary.

Known predecessors block only their own lane. Only DEAD with a durable
`fifo_release` marker ceases to block. Status, sequence, payload and idempotency
key are unchanged. A released original is never requeued. Manual disposition is
an explicit operator decision to release, not proof that Telegram failed/succeeded.

## Telegram evidence and outcomes

An automatic marker requires known identity plus a NEW authenticated send-result
with parsed Bot API `{ok:false,error_code:400}` evidence. HTTP/local 400 alone,
authorization failure, NETWORK and legacy BAD_REQUEST never auto-release.
Only TelegramClient.send labels Bot API evidence; internal HTTP errors cannot do so.
Status remains DEAD. Marker and `COURIER_FIFO_AUTO_RELEASE_ALERT` audit commit
atomically; a metadata-only log alert is emitted after commit. This is a durable
alert record/log, not a new external notification/Telegram sender.

Telegram code and description are stored in `telegram_error`. Descriptions are
restricted to static error phrases; arbitrary Bot API text is redacted because
it can echo message/customer input. Nothing raw is printed. The full result is
journaled before ACK, so evidence survives restart. Ambiguous outcomes remain
TIDAK_PASTI; a failed ACK/expired lease never authorizes resend. A delayed ACK
cannot turn DEAD into QUEUED or SENT in release mode. A verified late receipt
stays in the journal for per-ID review rather than rewriting a released predecessor.

Manual late delivery is an explicit `fifo_release.late` attestation with its own
operator/reason/time. It is never relabelled ordered SENT, changes no status and
does not send or enqueue. An existing release can only gain an append-only late
attestation; its original release facts are retained.

## Safety limits

Unknown existing lanes cannot simultaneously be assumed independent and kept
strictly ordered. They remain HOLD; no claim of universal progress is made.
All producers must use the same reviewed release mode and trusted order creation;
mixed old/new writers and unbounded clock drift are activation blockers.
Migration, backfill or force assignment of legacy identities is not implemented.
No external-message resend capability is added. Manual tools require an existing
owner-managed session adapter; they do not search/decrypt credentials.
