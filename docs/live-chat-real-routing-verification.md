# Real Telegram routing check before activation

The operator supplied an expected bot username/numeric ID, three non-topic group
IDs (TIAL1/TIAL2/SOLVER1), and Ultra Insthink as the source on 10 November 2026,
12:29–12:30 WIB. These are candidates, not membership/permission proof. No actual
production IDs, token or filled routing input is checked into this change.

The operator requested immediate activation. That authorizes progressing toward
activation; it does not remove the explicit requirement to verify routing before
sending or permit guessing an internal Courier namespace.

## One host-side check with backend preparation

Use Administrator PowerShell. Supply the exact candidate values provided by the
operator, the existing activation review, -ApprovedReadOnly,
-ApprovedCourierReadOnly and -ConfirmedNewBot:

```powershell
.\scripts\verify-live-chat-production-routing.ps1 `
  -TelegramBotId '<candidate numeric ID>' -BotUsername '<candidate username>' `
  -Tial1ChatId '<candidate TIAL1 ID>' -Tial2ChatId '<candidate TIAL2 ID>' `
  -SolverChatId '<candidate SOLVER1 ID>' -Source '<source and observed time>' `
  -Review $review -ApprovedReadOnly -ApprovedCourierReadOnly -ConfirmedNewBot
```

Values in angle brackets are deliberately invalid placeholders, never defaults.
The command writes candidate/report files only into a new private directory under
C:\ProgramData\HDWork2LiveChatVerification-*. It does not change current task
arguments, credentials, routing DB rows, production environment or service state.
The source and encrypted bundle backups are prepared separately if routing passes.

## Internal identity: configuration AND getMe

The Node checker searches only the two known non-secret Courier plan files:
.local/courier.receive-only.plan.json and .local/courier.modules.plan.json.
It never derives the internal namespace from a bot username or numeric ID. An
existing matching botId, username and protected token reference are required;
ambiguous matches stop. -CourierPlan may name a specific already-existing
non-secret plan after local review. Inline credentials are rejected. The old
receive-only plan is not enabled, edited, repurposed or passed to its runtime.

The checker uses the existing CurrentUser-DPAPI reader over private IPC for the
referenced token. No token is requested from chat, logged, written or placed in
child arguments. Its numeric prefix must match the supplied expected bot ID
BEFORE any network request, and getMe must independently confirm is_bot, ID and
username. A protected credential unavailable in this Windows user context stops
verification; do not rotate, copy plaintext or guess another token to force it.
An inactive plan can prove a configured identity, not a running Courier process.

## Only non-mutating Bot API methods

The hard allowlist is getMe, getChat, getChatMember and getWebhookInfo. Requests
use HTTPS directly to api.telegram.org, bounded time/size, no redirects and no
automatic retry. The code has no send, polling, webhook-delete or admin-change
method. It never calls getUpdates or consumes offsets/messages.

Each exact group must have the expected ID/type and not be a forum for these
non-topic candidates. The returned member must be the expected bot. Text-send
permission is confirmed for administrators/creator, an ordinary member with
explicit default can_send_messages, or a restricted current member explicitly
allowed to send text. Missing permission evidence fails closed. The checker never
promotes itself or assumes group membership from a third-party ID listing.

Reports omit group titles, webhook URL, credential paths and response/error bodies.
Failures expose safe method phase and Telegram status code, not raw descriptions.
ROUTING_VERIFIED_NO_MESSAGES means identity, membership and text permissions passed;
messagesSent remains 0. webhookConfigured=true blocks polling activation and does
not delete an existing webhook. It is not proof that a second poller does not exist.

## Courier metadata (additional approved read-only scope)

With -ApprovedCourierReadOnly, only the DB reference in that same identified plan
is used. The DB must be the existing loopback hdwork2/hdwork_courier identity;
root, remote databases and missing references stop. Passwords use the existing
protected reader and are never output. The checker reads SHOW GRANTS for that
account, its lease expiry and inbox/outbox STATE COUNTS only. It never reads a
payload, order/user/message record or lease token, and performs no SQL writes.

The desired grant profile is courierSendChat. A recognized older profile and exact
missing permissions are reported rather than automatically widened. Connections
are closed after checks. leaseActive=false is not repaired with manual SQL.
backlogReviewed and courierRuntimeVerified remain false until the actual new-bot
task/journal/backlog owner is reviewed. An access-denied login is a stop condition,
not a reason to retry guessed credentials.

## What happens after a successful check

The wrapper writes a private verified-routing REVIEW from observed identity and
permissions, then, when -Review is supplied and no webhook conflicts exist, invokes
the safe backend preparation wrapper. That stages the five files plus required
dependencies, checks Git ancestry/preimages, prepares private backups and prints
HDWork2* task names/states without arguments. Unknown local source, a dependency
lock mismatch or unreadable paths stop staging without overwriting anything.

These results provide the facts needed for the production change. They do not
write DB mappings, start/restart Courier, acquire a lease, switch frontend, or
restart web. activationReady remains false until the verified current runtime,
restartable rollback profile and backlog are established. Do not report active
Live Chat from a green metadata check or queued message. Tests simulate API/DB;
the approved command run on the office host uses actual Telegram metadata APIs.
