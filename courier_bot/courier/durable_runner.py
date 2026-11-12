import json
import time
import uuid
from .http import TransportError
from .raw_log import logger, observe


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
        def technical_report(code):
            reasons = {'inbox_quarantined_review_required', 'inbox_backend_unavailable', 'outbox_ack_stale_cached_result_retained', 'outbox_ack_pending'}
            logger().emit('COURIER_NOTICE', reason=code.upper() if code in reasons else 'REDACTED')
            report(code)
        self.report = technical_report

    def flush_events(self):
        for _ in range(5):
            if self.stopped():
                return
            row = self.journal.next_event()
            if not row:
                return
            self.lease.ensure()
            try:
                ack = observe('INBOX_FORWARD', lambda: self.internal.event(json.loads(row['payload'])))
                if ack.get('ok') is not True:
                    raise TransportError()
                observe('JOURNAL_INBOX_ACK', lambda: self.journal.accepted(row, ack.get('receipt_id')), correlationId=ack.get('receipt_id'))
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
            result = observe('ACK', lambda: self.internal.settle(ack, ack['result']), correlationId=ack.get('delivery_id'))
            if result.get('ok') is not True:
                raise TransportError()
            observe('JOURNAL_ACK_FINISH', lambda: self.journal.finish_ack(row), correlationId=ack.get('delivery_id'))
        except TransportError as error:
            if error.status == 409:
                observe('JOURNAL_ACK_FINISH', lambda: self.journal.finish_ack(row), correlationId=ack.get('delivery_id'))
                self.report('outbox_ack_stale_cached_result_retained')
            else:
                self.journal.defer_ack(row, retry_after=error.retry_after)
                self.report('outbox_ack_pending')

    def run_once(self):
        if self.stopped():
            return
        self.lease.ensure()
        if self.database_routing:
            configuration = observe('ROUTING', self.internal.routing)
            if configuration.get('ok') is not True:
                raise TransportError()
            self.policy.refresh(configuration)
        if self.poll and self.clock() >= self.cooldown_until:
            try:
                updates = observe('TELEGRAM_POLL', lambda: self.telegram.updates(self.journal.offset))
            except TransportError as error:
                self.cooldown_until = self.clock() + max(2, error.retry_after if error.status == 429 else 5)
                updates = None
            if updates is not None:
                observe('JOURNAL_INCOMING', lambda: self.journal.append(updates, self.policy.prepare))
                logger().emit('TELEGRAM_POLL_RESULT', count=len(updates))
        if self.poll and not self.stopped():
            self.flush_events()
        reason = 'SEND_DISABLED' if not self.send else 'STOPPED' if self.stopped() else 'COOLDOWN' if self.clock() < self.cooldown_until else None
        if reason:
            logger().emit('OUTBOX_BLOCKED', reason=reason, waitMs=max(0, self.cooldown_until-self.clock())*1000)
            return
        self.flush_ack()
        ack_pending = self.journal.has_ack()
        if ack_pending or self.stopped():
            logger().emit('OUTBOX_BLOCKED', reason='ACK_PENDING' if ack_pending else 'STOPPED')
            return
        self.lease.ensure()
        deliveries = observe('OUTBOX_CLAIM', self.internal.claim)
        logger().emit('OUTBOX_CLAIM_RESULT', count=len(deliveries) if isinstance(deliveries, list) else 0, reason='CLAIMED' if deliveries else 'NO_ELIGIBLE_MESSAGE')
        if not isinstance(deliveries, list) or len(deliveries) > 1:
            raise TransportError()
        for delivery in deliveries:
            if self.stopped():
                return
            self.lease.ensure()
            correlation = delivery.get('delivery_id')
            logger().emit('DELIVERY_START', correlationId=correlation, attempt=delivery.get('attempt', 0))
            cached = observe('JOURNAL_BEGIN', lambda: self.journal.begin_delivery(delivery), correlationId=correlation)
            try:
                if not cached:
                    self.policy.outgoing(delivery['payload'])
                if not cached and getattr(self.policy, 'dispatch_authorization_required', False) and not observe('AUTHORIZE', lambda: self.internal.authorize_delivery(delivery), correlationId=correlation):
                    raise TransportError(403)
                message_id = cached or str(observe('TELEGRAM_SEND', lambda: self.telegram.send(delivery['payload']), correlationId=correlation))
                result = {'result': 'sent', 'telegram_message_id': message_id}
            except TransportError as error:
                if error.status == 429:
                    self.cooldown_until = self.clock() + max(1, error.retry_after)
                code = {400: 'BAD_REQUEST', 403: 'FORBIDDEN', 429: 'RATE_LIMIT'}.get(error.status, 'NETWORK')
                result = {'result': 'failed' if error.status in (400, 403) else 'retry',
                          'error_code': code, 'retry_after': min(300, max(0, error.retry_after))}
            observe('JOURNAL_RESULT', lambda: self.journal.delivery_result(delivery, result), correlationId=correlation)
            logger().emit('DELIVERY_RESULT', correlationId=correlation, status=result['result'].upper(), retryAfterMs=result.get('retry_after', 0)*1000)
            if not self.stopped():
                self.flush_ack()
