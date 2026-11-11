"""Mock backend snapshots + real disposable journal; no Telegram/network/production DB."""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from courier.groups import IngressPolicy
from courier.journal import Journal
from courier.durable_runner import DurableCourier
from courier.http import TransportError

ROOT = Path(__file__).resolve().parents[2]
COMMANDS = ['order', 'req', 'config_psb', 'mo']
TEXTS = ['/order\nSC/IN:X-AO1\nNO INET:000123\nSN ONT:SN1\nSTO:ABC\nKETERANGAN:test\nNIK:SYNTHETIC',
         '/req Synthetic request', '/config_psb\nORDER ID:X-AO2\nSTO:ABC', '/MO\nSC/IN:X-MO3\nSTO:ABC']


def effective(groups):
    # Consume the actual Node projection rather than duplicating its logic in Python.
    code = "const fs=require('node:fs');console.log(JSON.stringify(require('./src/courier/shared-group').universalB2CGroups(JSON.parse(fs.readFileSync(0,'utf8')))))"
    result = subprocess.run(['node', '-e', code], cwd=ROOT, input=json.dumps(groups), text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def update(uid, text, chat=-1001, thread=None):
    message = {'message_id': uid + 10, 'chat': {'id': chat}, 'from': {'id': 9}, 'date': 1700000000, 'text': text}
    if thread is not None:
        message.update(message_thread_id=thread, is_topic_message=True)
        message['chat']['is_forum'] = True
    return {'update_id': uid, 'message': message}


class UniversalB2CTests(unittest.TestCase):
    def test_all_b2c_profiles_receive_each_command_after_backend_refresh_and_preserve_anchors(self):
        for profile in ('TIAL1', 'TIAL2', 'SOLVER1', 'ALL'):
            for thread in (None, 12):
                with self.subTest(profile=profile, thread=thread):
                    original = {'chatId': '-1001', 'threadId': str(thread) if thread else None,
                                'threadMode': 'thread' if thread else 'non_topic', 'profile': profile,
                                'commands': ['config_psb', 'mo'] if profile == 'SOLVER1' else COMMANDS if profile == 'ALL' else ['order', 'req']}
                    policy = IngressPolicy('synthetic-universal', 'SyntheticUniversalBot', [original])
                    policy.refresh({'groups': effective([original]), 'dispatchAuthorizationRequired': True})
                    for i, text in enumerate(TEXTS, 1):
                        envelope, state, reason = policy.prepare(update(i, text, thread=thread))
                        self.assertEqual((state, reason), ('PENDING', None))
                        self.assertEqual(envelope['event']['chat_id'], '-1001')
                        self.assertEqual(envelope['event']['telegram_thread_id'], str(thread) if thread else None)
                        self.assertEqual(envelope['event']['message_id'], str(i + 10))
                    self.assertEqual(policy.prepare(update(30, TEXTS[0], chat=-999, thread=thread))[1], 'IGNORED')
                    self.assertEqual(policy.prepare(update(31, '/req@AnotherBot hi', thread=thread))[1], 'IGNORED')
                    self.assertEqual(policy.prepare(update(32, TEXTS[0], thread=13 if thread is None else None))[1], 'IGNORED')

    def test_restart_refreshes_routes_before_poll_and_replays_journal_without_resending_telegram(self):
        original = {'chatId': '-1001', 'threadId': None, 'threadMode': 'non_topic', 'profile': 'TIAL1', 'commands': ['order', 'req']}
        snapshot = {'ok': True, 'groups': effective([original]), 'dispatchAuthorizationRequired': True}
        with tempfile.TemporaryDirectory() as folder:
            path = str(Path(folder) / 'journal.sqlite')
            journal = Journal(path, 'synthetic-universal', 'synthetic-fingerprint', clock=lambda: 1700000000)
            try:
                policy = IngressPolicy('synthetic-universal', 'SyntheticUniversalBot', [original])
                telegram, internal = Mock(), Mock()
                internal.routing.return_value = snapshot
                internal.event.side_effect = TransportError(503)
                telegram.updates.return_value = [update(i, text) for i, text in enumerate(TEXTS, 1)]
                runner = DurableCourier(telegram, internal, journal, policy, Mock(), poll=True, send=False, database_routing=True, clock=lambda: 1700000000)
                runner.run_once()
                self.assertEqual(journal.offset, 5)
                self.assertEqual(journal.db.execute("SELECT COUNT(*) FROM updates WHERE state='PENDING'").fetchone()[0], 4)
                telegram.send.assert_not_called()
                journal.close()
                journal = Journal(path, 'synthetic-universal', 'synthetic-fingerprint', clock=lambda: 1700000020)
                policy = IngressPolicy('synthetic-universal', 'SyntheticUniversalBot', [original])
                internal.event.side_effect = None
                internal.event.return_value = {'ok': True, 'receipt_id': 'synthetic-persistent-receipt'}
                telegram.updates.side_effect = lambda offset: self.assertEqual(offset, 5) or []
                runner = DurableCourier(telegram, internal, journal, policy, Mock(), poll=True, send=False, database_routing=True, clock=lambda: 1700000020)
                runner.run_once()
                self.assertEqual(journal.db.execute("SELECT COUNT(*) FROM updates WHERE state='ACKED'").fetchone()[0], 4)
                self.assertEqual(policy.groups, snapshot['groups'])
                telegram.send.assert_not_called()
                internal.routing.side_effect = TransportError(503)
                telegram.updates.reset_mock()
                with self.assertRaises(TransportError):
                    runner.run_once()
                telegram.updates.assert_not_called()
            finally:
                journal.close()
