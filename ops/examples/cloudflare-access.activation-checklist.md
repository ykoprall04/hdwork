# Review only — no Cloudflare resource or DNS changes

- Confirm domain ownership, Cloudflare account and intended hostname with user.
- Use a dedicated tunnel and private DPAPI token; no quick tunnel/borrowed domain.
- Create an Access self-hosted application for the exact hostname only after
  approval. Default deny; explicit allowed users/groups, MFA and bounded session.
- Configure required Access JWT validation at cloudflared originRequest, with the
  correct teamName and application audTag. Never mark Access reviewed merely
  because the browser displays a Cloudflare login page.
- Remote-managed ingress must match the reviewed local plan. Only HTTPS origin
  127.0.0.1:8443, certificate SNI localhost, private CA, noTLSVerify=false.
- Preserve public Host and Origin; CORS/CSRF/frontend must use the owned public
  origin. Express proxy trust stays false until a verified alternative is tested.
- Deny internal courier, /ready, legacy paths, metrics and DevTools publicly;
  retain catch-all 404. Authenticated API still enforces HD Work session/role/module.
- No inbound forwarding of 3306, 3090, 3091, 8443 or DevTools. Audit firewall
  exceptions and router; default BlockInbound alone is insufficient evidence.
- Confirm permanent auth-only write policy separately from read-only operations.
- Audit real account identities/grants and readiness of both auth/read pools.
- User approval required before DNS/tunnel start/public deployment.
- Rollback: stop only the owned tunnel, receive-only courier and owned origin;
  keep journal/inbox/state. Do not alter shared MySQL, PM2 or older bots.

Official references:

- [Access validation at origin](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/)
- [TLS origin configuration](https://developers.cloudflare.com/tunnel/troubleshooting/https-origins/)
