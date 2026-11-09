Batch A implements the HD Work 2.0 cookie-session path. Legacy JWT routes are unchanged.

Apply `database/manual/010_hdwork2_account_approval.sql` before deploying. Existing accounts, including trial accounts, default to APPROVED; passwords and sessions are preserved. New accounts are PENDING/inactive. Activation through update cannot bypass approval. No first-login password change is required.

Account API:

- `POST /api/admin/users`: name, username, password, role, modules, is_active. Creation always overrides is_active to false. SHOW_ONLY is the existing stored/API value for View Only.
- `POST /api/admin/users/:id/approve`: ADMIN approves HD/SHOW_ONLY; SUPER_ADMIN approves ADMIN/HD/SHOW_ONLY. Self-approval is forbidden. All mutations use cookie authentication and CSRF.
- Existing update/reset/revoke endpoints use the same role hierarchy.
- `POST /api/auth/change-password`: currentPassword, password. Available to every active approved role; bcrypt cost 12; revokes all sessions and clears cookie.

The existing read-only/session-audit-only runtime stays read-only. Account management and password changes require the writable deployment profile (`HDWORK2_LOCAL_READ_ONLY=false`) and DBA-provided permissions for hdwork_auth: users SELECT/INSERT/UPDATE, hd2_sessions SELECT/INSERT/UPDATE, hd2_security_audit SELECT/INSERT, hd2_user_modules SELECT/INSERT/DELETE, hd2_auth_guard SELECT/UPDATE. The readiness grant reviewer supports this profile. No live credentials, grants, environment, or database were changed in Batch A.

For Batch B:

- Keep `Work.id` as internal API/navigation UUID. Display scIn, then inetMasked, then the original command label. UUID validation accepts imported UUID versions.
- `duration()` returns HH:mm with unbounded hours, preserving timestamps in storage. Avoid reintroducing seconds in the UI.
- POST /operations/orders always returns 403. Courier ingress and deduplication storage remain independent and unchanged.
- Completion and duplicate decisions retain version/session/module/owner validation, append audit events, enqueue Telegram feedback, and update only the selected order. Regression tests cover canonical preservation.
- Detail JSON decoding tolerates legacy plain/malformed values and Buffers. Detail reads include actual owner, finisher and paginated audit history. No demo reconstruction.
- Application-session boundary admits account APIs so their cookie/role/CSRF checks can run; read-only middleware still blocks writes in read-only deployments.

Verification: frontend production build; backend suite; focused account/order/Telegram regression tests; frontend workflow unit tests. Live MySQL/Telegram verification requires a configured disposable environment and has not been performed.

Final validation: backend 254/257 passed. Three unrelated environment failures: missing scripts/setup-office-service-secrets.ps1, scripts/tunnel-token-broker.ps1, and .local/tls/localhost.crt. Frontend workflow unit tests 4/4 passed; production build passed.
