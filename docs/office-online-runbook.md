# HD Work2 — Windows startup and activation

Target hdwork2.yoloo.space, existing tunnel hdwork2; trial hostname preserved.
These procedures do not authorize public DNS or routes. No commits/push are made.

## Private credentials

Run `scripts/setup-office-service-secrets.ps1` visibly in elevated PowerShell.
Confirm the existing tunnel name and enter only its token at the hidden prompt.
Never paste the token into a shell command, chat, screenshots or logs. If exposed
earlier, rotate it through the Dashboard first; no automatic rotation is performed.
The helper copies existing application secrets without rotating their values.
DPAPI LocalMachine ciphertext is stored under ProgramData with only SYSTEM and
Administrators access. No plaintext secret file is created. Existing ciphertext
is preserved during a resumed setup.

Cloudflared's existing Windows service will read its token from a SYSTEM-only
named pipe. HDWork2-TunnelTokenBroker supplies the decrypted bytes in memory.
Native pipe compatibility was checked with an invalid synthetic token only;
this was not a real tunnel connection. Do not replace the pipe with a plaintext file.

## Startup preparation

`scripts/install-office-startup.ps1 -ApprovedStartupSetup` requires elevation,
encrypted credentials and safe code ACLs. It registers only HDWork2-Web and
HDWork2-TunnelTokenBroker startup tasks. Existing task names are never overwritten.
It updates only the existing Cloudflared service's credential-input path while
retaining Disabled; it does not reinstall/start the service or create DNS/routes.

The web task decrypts its machine-protected bundle into the child Node process's
stdin. The Node entry point captures auth/read secrets and clears temporary values.
Only auth sessions/security audit can be written by approved login/logout; modules
stay read-only. Session validity, Origin, CSRF, cookie, permissions and throttling
remain enforced. No courier is started. The supervisor's EOF stops its owned web.

The tasks are configured AtStartup with IgnoreNew and bounded restart attempts.
Actual restart-PC verification requires a maintenance window; do not reboot an
office PC hosting legacy services merely to test this configuration.

## Activation gates

Before connector start, verify the provided token belongs to existing hdwork2 and
that no published application, private-network or VPN route will become active.
User confirmation or an authenticated read-only Dashboard/API review is required.
A tunnel token alone does not grant DNS or remote ingress-management API access.
Before public activation, test real application login locally and obtain explicit
public consent. Preserve hdwork.yoloo.space and every unrelated route/record.

Only HTTPS127.0.0.1:8443 may be an origin, with SNI localhost and project CA
verification. No public3306/3090/3091/DevTools, no Access, no TLS bypass. Use the
prepared testing-host ingress, with deny rules before web/API allow rules.

## Stop/recover after approved installation

Stop the existing Cloudflared service to disconnect only the new tunnel connector.
For the web, send `stop` to its local HDWork2WebControl pipe with an authorized
local process before stopping HDWork2-Web. The task supervisor owns the Node stdin
lease; no other Node, PM2 or MySQL process should be stopped. Restart only the named
HDWork2 tasks as needed. Retain database, journal, profiles and private reports.
If public verification fails, remove/disable only the newly approved testing-host
route and DNS change through the account that applied it, then stop the connector.

## Current proof boundary

Source/bootstrap tests and synthetic pipe verification do not prove a real token,
connector Healthy state, scheduled-task runtime, browser auth, reboot recovery or
public deployment. Track these separately; never mark them PASS from configuration.
