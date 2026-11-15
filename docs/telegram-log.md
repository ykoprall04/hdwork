# Telegram Courier V2 logs

Open a new PowerShell window and run from any directory:

```powershell
telegram-log
telegram-log -Errors
telegram-log -Last 100
telegram-log -NoFollow
telegram-log -Errors -Last 100 -NoFollow
```

The default prints the last 100 visible Python records and follows new records every 250 ms. Empty polling, successful getUpdates request wrappers, routine cycles/routing and empty queue checks are hidden only in this viewer. Positive update/queue counts, commands, forwarding, sends/results, retries and errors remain visible. Errors always override routine-event filtering. Original stored history is not changed. It discovers Python log files automatically, including new PIDs and daily rotation. Ctrl+C or closing the terminal stops the independent viewer; Courier and its writer continue. `-Last` counts visible records; a traceback record can contain multiple display lines.

Only Python files in `%ProgramData%\HDWork2\Logs\Telegram` are read. Web, MySQL, Node backend and Windows supervisor files are excluded. The reader reuses `scripts/courier-log.js`; the writer reuses `courier_bot/courier/raw_log.py`, its bounded asynchronous queue and seven-day retention. There is no second logging service or new process manager.

Native technical JSON events are displayed unchanged, including their original timestamp, duration and correlation IDs. Captured Python stdout/stderr is displayed as emitted after redaction, without translated status summaries or added display prefixes. Errors include available traceback frame locations, exception types, HTTP status, errno and retry information. Arbitrary exception messages and source literals can contain customer input and are redacted; no locals or source-code snippets are added to generated exception traces. Partial stream writes are buffered until newline to redact fragmented tokens safely.

Python startup identity requests, polling, command names/validation, journal handling, backend forwarding acknowledgements, outbox claims, sends/results, retries and rate limits use existing instrumentation. Telegram request events add only the fixed API method name and measured timing. Request/response bodies, message text, Telegram URLs/tokens, chat/customer identifiers and credentials are never telemetry fields. Order persistence and queue insertion run in the Node backend; this Python-only view shows handoff/acknowledgement and queue claim/delivery, not database SQL or a fabricated storage-success message.

The production launcher explicitly enables Python logging and sets the dedicated directory because the native supervisor intentionally clears inherited environment variables. The supervisor still drains parent pipes without persisting their unredacted content. Capture happens inside Python before storage and before forwarding its sanitized stream to the parent. Existing READY/control messages remain compatible.

To install/update the viewer for the current Windows user:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\HDWork2-New\scripts\install-courier-log.ps1
```

The installer updates viewer tools and adds an idempotent dot-source line to Windows PowerShell/PowerShell profiles, preserving existing profile encoding and existing Web logging ACLs. It creates a private Telegram log directory. It does not start or stop Courier. For an already-open terminal, load the installed functions once:

```powershell
. "$env:ProgramData\HDWork2\Tools\courier-log.ps1"
```

Python logging changes require the normal controlled Courier snapshot handoff; changing a viewer needs no Courier restart. Historical output discarded while logging was disabled cannot be recovered. Disk failures/queue overflow are counted by the existing logger and must be investigated; logging is not permitted to break message delivery.
