"""Real journal/runner with fake Telegram and fake backend, no network or MySQL."""
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'courier_bot'))
from courier.groups import IngressPolicy
from courier.journal import Journal
from courier.durable_runner import DurableCourier
from courier.http import TransportError


class ReceiveOnlyTests(unittest.TestCase):
    def setUp(self):
        fixture = json.loads((Path(__file__).resolve().parents[2] / 'ops/examples/courier-four-workspaces.fixture.json').read_text())
        self.fixture = fixture
        self.updates = []
        for item in fixture['events']:
            event = item['event']
            message = {'message_id': int(event['message_id']), 'date': event['timestamp'], 'chat': {'id': int(event['chat_id'])}, 'text': event['text']}
            if event['telegram_thread_id']:
                message.update(message_thread_id=int(event['telegram_thread_id']), is_topic_message=True)
                message['chat']['is_forum'] = True
            self.updates.append({'update_id': int(item['update_id']), 'message': message})
        self.now = 1000
        self.journal = Journal(':memory:', fixture['botId'], 'synthetic-new-bot-fingerprint', clock=lambda: self.now)
        self.policy = IngressPolicy(fixture['botId'], fixture['botUsername'], fixture['groups'])

    def tearDown(self):
        self.journal.close()

    def runner(self, fail_first=False):
        updates = self.updates
        class Telegram:
            sends = 0
            def updates(self, offset):
                return [u for u in updates if offset is None or u['update_id'] >= offset]
            def send(self, _payload):
                self.sends += 1
                raise AssertionError('send forbidden in receive-only')
        class Internal:
            def __init__(self):
                self.calls, self.events, self.claims = 0, [], 0
            def event(self, event):
                self.calls += 1
                if fail_first and self.calls == 1:
                    raise TransportError(503)
                self.events.append(event)
                return {'ok': True, 'receipt_id': 'synthetic-receipt-' + event['update_id']}
            def claim(self):
                self.claims += 1
                raise AssertionError('claim forbidden in receive-only')
            def settle(self, *_args):
                raise AssertionError('outbox ACK forbidden in receive-only')
        class Lease:
            def ensure(self):
                pass
        telegram, internal = Telegram(), Internal()
        return DurableCourier(telegram, internal, self.journal, self.policy, Lease(), poll=True, send=False, clock=lambda: self.now), telegram, internal

    def test_four_topics_internal_receipts_never_send_telegram_reply_or_outbox_ack(self):
        runner, telegram, internal = self.runner()
        runner.run_once()
        self.assertEqual(len(internal.events), 4)
        self.assertEqual([e['event']['telegram_thread_id'] for e in internal.events], [None, '10', '11', '12'])
        self.journal.append(self.updates, self.policy.prepare)
        runner.run_once()
        self.assertEqual(len(internal.events), 4)
        self.assertEqual(self.journal.db.execute("SELECT COUNT(*) FROM updates WHERE state='ACKED'").fetchone()[0], 4)
        self.assertEqual(telegram.sends, 0)
        self.assertEqual(internal.claims, 0)

    def test_retry_preserves_fifo_and_does_not_enable_send(self):
        runner, telegram, internal = self.runner(fail_first=True)
        runner.run_once()
        self.assertEqual(internal.events, [])
        runner.run_once()
        self.assertEqual(internal.calls, 1)
        self.now += 3
        runner.run_once()
        self.assertEqual([e['update_id'] for e in internal.events], ['1', '2', '3', '4'])
        self.assertEqual(telegram.sends, 0)
        self.assertEqual(internal.claims, 0)


if __name__ == '__main__':
    unittest.main()
