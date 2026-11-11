# Universal Telegram B2C commands — implementation and rollout boundary

## Cause and audited paths

The frontend release 6060c1e did not replace the Courier snapshot or routing configuration. Existing `src/system/store.js` derived each route's commands from its stored category: TIAL → order/req, LOGIC → config_psb/mo. Both Node ingress (`src/courier/groups.js`) and Python ingress (`courier_bot/courier/groups.py`) enforce that command list. The SOLVER1 parser additionally rejects /order. UI changes or a working /MO in the solver group do not remove these restrictions in other groups.

`src/system/routing.js` uses database routes for ingress, workflow and outgoing replies. The Python durable runner refreshes those routes before polling on each database-routing iteration. Existing shared-mode production plans use `routingMode: database`, which supplies `HDWORK2_SHARED_GROUPS_ENABLED=true`. Historical pinned plans deliberately keep their original route contract and expectedGroups drift guard. No production configuration was read in this task; the actual Windows mode remains an operator verification item.

## Change

Only in the existing shared-groups mode, validated legacy TIAL1/TIAL2/SOLVER1 mapping rows are projected into effective ALL routes with exactly order, req, config_psb and mo. This reuses the existing ALL parser, command classification, Node/Python policy, dispatch authorization and journal; there is no new parser, sender, flag, worker, queue or status mechanism.

The database category/profile/name/version and all historical mapping/order/audit records are unchanged. The projection is in memory after the existing bot-specific enabled+verified SELECT. Chat ID, topic ID and thread mode are copied exactly. Explicit ALL command lists and ASSUREN/B2B/REPLACEMENT routes retain their existing behavior. B2C-only routes are not broadened to those workspace commands. With shared mode disabled, legacy behavior remains unchanged.

Classification is by command through the existing ALL path:

| Command | Stored module | Dashboard/access module |
| --- | --- | --- |
| /order | TIAL | TIAL |
| /req | TIAL (existing storage contract) | REQ within TIAL/REQ |
| /config_psb | LOGIC_PSB | LOGIC_PSB within LOGIC/SOLVER |
| /MO | LOGIC_MO | LOGIC_MO within LOGIC/SOLVER |

Readiness now evaluates the same effective routes instead of incorrectly reporting missing LOGIC commands on a legacy TIAL mapping in shared mode. Readiness remains infrastructure coverage, not proof of Telegram delivery.

Transport replay remains idempotent by existing inbox/update and original bot/chat/message identities. TIAL's full-history SC/IN deduplication is preserved across groups, including /order received in a formerly SOLVER group. A repeated business request with a new message ID still follows existing command contracts: no speculative business deduplication is added to req/config_psb/mo. Ownership locks, CSRF/session/grants, action audit, outbox retries and exact original reply anchor are unchanged. Disabled/unverified/foreign bot/chat/topic and pre-cutoff traffic remain rejected.

## Files

- `src/courier/shared-group.js`: small validated projection using the existing ALL contract.
- `src/system/store.js`: apply the projection only to routing reads in shared mode; no mapping writes changed.
- `src/operations/b2c-readiness.js`: report coverage from the effective shared routes.
- `tests/universal-b2c-routing.test.js`: actual store/routing/processor mock matrix and scoped reply checks.
- `courier_bot/tests/test_universal_b2c.py`: consume the actual Node projection with Python ingress, real disposable journal restart and mocked transport.
- This document.

## Tests

474 Node tests pass, including 12 universal-routing tests. Matrix: TIAL1, TIAL2, SOLVER1 and ALL; topic and non-topic; all four commands; command-based dashboard modules; unchanged stored mapping; replay; cross-group TIAL duplicates; scoped original replies; disabled/unverified/foreign routes; cutoff; expectedGroups drift; preserved workspace and legacy behavior; readiness coverage. Additional workspace-ingress assertions pass in the targeted matrix.

52 Python tests pass. The new cross-language tests obtain effective routes from the actual Node helper, then test all profiles with the existing Python parser/policy. A real temporary SQLite journal persists four pending command events through a simulated backend outage and restart, restores the checkpoint and acknowledges without creating new update rows. Routing failure prevents Telegram polling; all transports are mocks. Existing suite covers polling lock, identity mismatch, cached delivery/ACK recovery and prevention of repeat sends.

No UI source changed, so frontend/browser checks are not repeated for this backend-only change. No production DB, Telegram or VPN access; no actual messages, deployment, runtime restart, credentials or source-pin changes.

## Configuration and deployment needed before production activation

This commit is implementation-ready for local mock testing, not an activated production release.

1. Verify the active Courier uses the existing database/shared-groups mode. In this codebase that is a production plan with `routingMode: database` and the existing shared flag. Do not silently change an old pinned plan, bypass expectedGroups or enable flags on the active host without a prepared compatible release.
2. Keep existing operator whitelist, verification, bot identity, chat/topic, activation cutoff, suspended-route boundary, journal, source journal, polling lock and dispatch authorization. No migration or rewriting of legacy mapping rows is needed by this change.
3. Deploy the changed backend/Courier source closure through the existing reviewed Windows release mechanism. Courier source hashes are pinned: copying these files into its current snapshot can break the next restart. Prepare an isolated compatible release and reviewed pins using existing tooling; this task does not generate or apply a production package or alter the owner/DPAPI/autostart configuration.
4. Web readiness and Courier must use the same effective-routing version and shared-mode setting. The existing frontend can consume the resulting orders; a frontend-only release cannot update the ingress worker.
5. A normal restart reloads the Node projection and Python obtains effective routes before the next poll. Journal/offset/leases must be retained. Do not replay ignored historical updates, reset cutoff, purge journals or retry held/dead old queues to test activation. New authorized operator tests and exact reply/topic checks are required after rollout.
6. Retain compatible backend/Courier rollback snapshots and existing pins. Do not run the old ccc646a-specific activation helper as a deployment procedure for this commit. Windows DPAPI/task boot and Telegram receive/delivery are not verified by cloud mock tests.
