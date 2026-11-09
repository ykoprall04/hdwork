# hdwork2 Windows Service — preparation, not installed

Existing tunnel: hdwork2. Testing hostname: hdwork2.yoloo.space. The trial
hdwork.yoloo.space remains untouched. HTTPS origin remains127.0.0.1:8443,
SNI localhost, private project CA and noTLSVerify=false. No Access is used.

Preparation writes a new .local/online-candidate-hdwork2-service-* profile and
React build. The running localhost profile is not restarted or changed.
ingress.review.yml uses the current project CA for offline validation;
ingress.service.review.yml references the CA copy planned under ProgramData,
where the service account can read it after approved installation.

## Explicit approvals, in order

1. Confirm the UUID binding for the EXISTING hdwork2 tunnel using the user's
   Cloudflare account. Never create or replace a tunnel. No token is requested
   through chat, arguments, reports or logs during this preparation.
2. Approve elevated disabled-service registration. Only then set the private
   plan's installationApproved/tunnelIdentityVerified fields and verified UUID.
   scripts/register-hdwork2-service.ps1 requires an explicit approval switch,
   administrator rights and the approved plan. It refuses existing services,
   event sources and service directories. It copies only the public CA,
   creates the event source, registers Cloudflared DISABLED, and never starts it.
3. Approve the service credential-storage method separately. The native installer
   stores a token file protected by SYSTEM/Administrators ACLs; this is not DPAPI
   encryption. Do not silently convert encrypted private credentials to plaintext.
   The prepared registration does NOT create a token file or provision secrets.
   An encrypted/brokered alternative needs a separate implementation/review if
   plaintext service credentials remain prohibited. LocalSystem cannot simply
   decrypt the application's CurrentUser DPAPI files; do not change the app account.
4. Approve switching only the owned HD Work2 runtime to the testing-origin profile
   after a graceful stop, then validate app sessions/CSRF and readiness. Do not
   restart MySQL/PM2/legacy bots. The profile's auth approval remains false until
   the approved runtime launch. Keep operations read-only and courier disabled.
5. Review remote ingress for the existing tunnel. Ensure it has no pre-existing
   operational routes that would become active when its service connects.
   Backend3090, courier3091, MySQL3306, readiness and DevTools must not be routed.
6. Obtain separate approval for the testing DNS/public hostname and service start.
   Only after real app/network/grant gates pass, publish hdwork2.yoloo.space and
   enable/start the existing tunnel connector. Never replace the trial hostname.

Do not run the native cloudflared service install command during preparation:
it installs Automatic and immediately starts. The registration helper avoids this.
No token value is stored in its SCM ImagePath. The token FILE path is only a future
reference; credentials are intentionally absent and the service must stay disabled.

The tunnel service alone does not start the Node web application. Automatic Node
startup, if requested later, must preserve the Windows user owning application
DPAPI secrets; no app service or scheduled task is installed here.

Sources:
- https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/as-a-service/windows/
- https://github.com/cloudflare/cloudflared/blob/master/cmd/cloudflared/windows_service.go
