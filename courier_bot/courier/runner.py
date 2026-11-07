import time
from .parser import parse_update
from .http import TransportError

class Courier:
    def __init__(self, bot_id, telegram, internal, clock=time.monotonic):
        self.bot_id, self.telegram, self.internal, self.offset = bot_id, telegram, internal, None

        self.clock, self.cooldown_until = clock, 0

    def run_once(self):
        if self.clock() < self.cooldown_until:
            return
        try:
            updates = self.telegram.updates(self.offset)
        except TransportError as error:
            if error.status == 429:
                self.cooldown_until = self.clock() + max(1, error.retry_after)
            raise
        for update in updates:
            event = parse_update(update, self.bot_id)
            if event is not None:
                accepted = self.internal.event(event)
                if not accepted.get('ok'):
                    raise TransportError()
            # Advance only after the backend acknowledged the event.
            self.offset = update['update_id'] + 1
        for delivery in self.internal.claim():
            try:
                message_id = self.telegram.send(delivery['payload'])
                result = {'result': 'sent', 'telegram_message_id': str(message_id)}
            except TransportError as error:
                if error.status == 429:
                    self.cooldown_until = self.clock() + max(1, error.retry_after)
                permanent = error.status in (400, 403)
                code = 'FORBIDDEN' if error.status == 403 else 'BAD_REQUEST' if error.status == 400 else 'RATE_LIMIT' if error.status == 429 else 'NETWORK'
                result = {'result': 'failed' if permanent else 'retry', 'error_code': code, 'retry_after': error.retry_after}
            self.internal.settle(delivery, result)
