import json
import time
import uuid
from .http import TransportError


class WorkerLease:
    def __init__(self, internal, clock=time.monotonic):
        self.internal, self.clock = internal, clock
        self.worker_id, self.token, self.until, self.renew_at = str(uuid.uuid4()), None, 0, 0

    def ensure(self):
        now = self.clock()
        if self.token and now < self.renew_at and now + 15 < self.until:
            return
        action = 'renew' if self.token and now < self.until else 'acquire'
        try:
            result = self.internal.lease(action, self.worker_id, self.token if action == 'renew' else None)
            ttl = result.get('lease_ms')
            if result.get('ok') is not True or type(ttl) is not int or not 20000 <= ttl <= 60000 or not isinstance(result.get('lease_token'), str):
                raise TransportError()
            until = now + ttl / 1000
            if self.clock() + 15 >= until:
                raise TransportError()
            self.token, self.until, self.renew_at = result['lease_token'], until, now + 10
            self.internal.worker = {'id': self.worker_id, 'lease_token': self.token}
        except TransportError as error:
            self.internal.worker, self.renew_at = None, 0
            if error.status in (401, 403, 409):
                self.token, self.until = None, 0
            raise
        except Exception:
            self.internal.worker = None
            self.token, self.until, self.renew_at = None, 0, 0
            raise

    def close(self):
        try:
            if self.token:
                self.internal.lease('release', self.worker_id, self.token)
        except Exception:
            pass
        finally:
            self.internal.worker, self.token = None, None


class DurableCourier:
    def __init__(self, telegram, internal, journal, policy, lease, *, poll=False, send=False,
                 clock=time.monotonic, stopped=lambda: False, report=lambda _code: None, database_routing=False):
        self.telegram, self.internal, self.journal, self.policy, self.lease = telegram, internal, journal, policy, lease
        self.poll, self.send, self.clock, self.stopped = poll, send, clock, stopped
        self.database_routing = database_routing
        self.cooldown_until = 0
        self.report = report

    def flush_events(self):
        for _ in range(5):
            if self.stopped():
                return
            row = self.journal.next_event()
            if not row:
                return
            self.lease.ensure()
            try:
                ack = self.internal.event(json.loads(row['payload']))
                if ack.get('ok') is not True:
                    raise TransportError()
                self.journal.accepted(row, ack.get('receipt_id'))
            except TransportError as error:
                self.journal.defer(row, terminal=error.status in (400, 403, 409, 413), retry_after=error.retry_after)
                self.report('inbox_quarantined_review_required' if error.status in (400,403,409,413) else 'inbox_backend_unavailable')
                return
            except (KeyError, ValueError, TypeError):
                self.journal.defer(row)
                return

    def flush_ack(self):
        row = self.journal.next_ack()
        if not row:
            return
        ack = json.loads(row['ack'])
        self.lease.ensure()
        try:
            result = self.internal.settle(ack, ack['result'])
            if result.get('ok') is not True:
                raise TransportError()
            self.journal.finish_ack(row)
        except TransportError as error:
            if error.status == 409:
                self.journal.finish_ack(row)
                self.report('outbox_ack_stale_cached_result_retained')
            else:
                self.journal.defer_ack(row, retry_after=error.retry_after)
                self.report('outbox_ack_pending')

    def run_once(self):
        if self.stopped():
            return
        self.lease.ensure()
        if self.database_routing:
            configuration = self.internal.routing()
            if configuration.get('ok') is not True:
                raise TransportError()
            self.policy.refresh(configuration)
        if self.poll and self.clock() >= self.cooldown_until:
            try:
                updates = self.telegram.updates(self.journal.offset)
            except TransportError as error:
                self.cooldown_until = self.clock() + max(2, error.retry_after if error.status == 429 else 5)
                updates = None
            if updates is not None:
                self.journal.append(updates, self.policy.prepare)
        if self.poll and not self.stopped():
            self.flush_events()
        if not self.send or self.stopped() or self.clock() < self.cooldown_until:
            return
        self.flush_ack()
        if self.journal.has_ack() or self.stopped():
            return
        self.lease.ensure()
        deliveries = self.internal.claim()
        if not isinstance(deliveries, list) or len(deliveries) > 1:
            raise TransportError()
        for delivery in deliveries:
            if self.stopped():
                return
            self.lease.ensure()
            cached = self.journal.begin_delivery(delivery)
            try:
                if not cached:
                    self.policy.outgoing(delivery['payload'])
                if not cached and getattr(self.policy, 'dispatch_authorization_required', False) and not self.internal.authorize_delivery(delivery):
                    raise TransportError(403)
                message_id = cached or str(self.telegram.send(delivery['payload']))
                result = {'result': 'sent', 'telegram_message_id': message_id}
            except TransportError as error:
                if error.status == 429:
                    self.cooldown_until = self.clock() + max(1, error.retry_after)
                code = {400: 'BAD_REQUEST', 403: 'FORBIDDEN', 429: 'RATE_LIMIT'}.get(error.status, 'NETWORK')
                result = {'result': 'failed' if error.status in (400, 403) else 'retry',
                          'error_code': code, 'retry_after': min(300, max(0, error.retry_after))}
            self.journal.delivery_result(delivery, result)
            if not self.stopped():
                self.flush_ack()
