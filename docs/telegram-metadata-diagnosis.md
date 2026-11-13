# Telegram metadata diagnosis from candidate 965a53d

The old `telegram()` helper in `scripts/verify-live-chat-production-routing.js`
mapped request/response errors, JSON parsing failures and several upstream HTTP
errors to `TELEGRAM_METADATA_UNAVAILABLE`. Its inactivity timeout destroyed the
request without retaining the timeout reason. The failed cutover receipt therefore
cannot identify the historical failure's precise method or network phase.

## Observed evidence (13 November 2026 UTC / 14 November WIB)

- At 18:31 UTC the original helper was observed during one getMe. DNS resolved
  api.telegram.org to 149.154.166.110; TCP connected over IPv4, then the request
  failed ECONNRESET **before secureConnect or any HTTP response**. The check took
  about 6.9 seconds including DPAPI loading. The helper returned
  TELEGRAM_METADATA_UNAVAILABLE. A separate TLS
  probe to the same address also failed to finish within 8 seconds.
- System DNS (8.8.8.8 / 8.8.4.4) and an independent 1.1.1.1 query returned the same
  IPv4 address. No api.telegram.org hosts override was present. No proxy environment
  variables, user proxy/PAC, or active recognized VPN adapter were observed. This
  does not establish the absence of upstream filtering or a transparent proxy.
- At 18:33 UTC TLS to that same Telegram address succeeded with certificate
  validation and TLSv1.3 in 480 ms. GitHub and the HD Work public hostname also
  passed TLS. This establishes intermittency rather than persistent DNS or TLS
  trust failure.
- At 18:36 UTC a separate getMe verification using the corrected helper stopped
  at its 10-second total deadline with TELEGRAM_METADATA_TIMEOUT,
  phase=TLS, transportCode=ETIMEDOUT, timeoutKind=TOTAL. The recorded end-to-end
  duration also includes loading the existing DPAPI token. No retry was made.

The directly reproduced cause is an intermittent failure of the HTTPS transport
during TLS establishment, before any Bot API response. The diagnostics do not
identify whether the remote service, ISP, router or another upstream device caused
the reset/stall. No authentication rejection (401/403) or malformed Telegram
response was received. Existing DPAPI decryption and expected bot-token prefix
passed, but successful Bot API authentication remains unverified in this session.
It would be incorrect to claim a bad token, DNS poisoning, a specific VPN/ISP
fault, or a repaired network connection from these observations.

## Code correction

`scripts/lib/telegram-metadata.cjs` now distinguishes DNS, TCP, TLS, response,
parse/API, truncation, oversize and deadline failures. Diagnostics permit only
the metadata method, fixed phase, finite transport codes, numeric HTTP status
and fixed timeout kind. They never retain an original exception/cause, request
URL, token, arbitrary error code, raw response or Telegram description. The CLI
and group verifier preserve these sanitized diagnostics.

Only getMe/getChat/getChatMember/getWebhookInfo remain allowed. TLS verification
is explicit, redirects are rejected, the 128 KiB response cap is retained, and
the existing 10-second budget also covers DNS/connect/handshake. There is no
automatic retry, proxy selection, IPv4 workaround, DNS change or insecure TLS
fallback. The Windows test fixture now supplies the same private-parent marker
as its real wrapper; the production path check remains unchanged.

Offline tests cover the reproduced TLS reset, timeout phases, DNS/TCP/certificate
failures, credential rejection, malformed responses, forbidden methods, redirects,
response bounds and secret redaction. These tests use fake transports only.
Result: 45 related JavaScript tests PASS, zero skips/failures; JavaScript syntax
and git diff --check PASS.

No cutover, Courier startup, getUpdates, send, database operation, offset/queue
change, fence action, network setting change or personal-bot control is part of
this diagnosis. The pinned candidate snapshot remains unchanged at 965a53d.
Network reliability is still unresolved. A later explicit activation must repeat
its safety gates and use a separately reviewed immutable release if this fix is
included; do not edit the previously pinned snapshot in place.
