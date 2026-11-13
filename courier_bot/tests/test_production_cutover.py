import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from courier.journal import Journal
from courier.cutover import seed_offset
from courier.clients import TelegramClient
from courier.runtime_config import RuntimeConfig


class ProductionCutoverTests(unittest.TestCase):
    def test_offset_only_is_copied_and_old_events_and_ack_data_are_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'old.sqlite3'
            old = Journal(str(source), 'synthetic', 'synthetic-fingerprint')
            with old.db:
                old.db.execute("INSERT INTO metadata VALUES ('offset','123')")
                old.db.execute("INSERT INTO updates(update_id,hash,payload,state,reason) VALUES ('122','synthetic','{}','PENDING','synthetic')")
                old.db.execute("INSERT INTO deliveries(delivery_id,hash,ack,state) VALUES ('old-delivery','synthetic','{}','ACK_PENDING')")
            old.close()
            before = hashlib.sha256(source.read_bytes()).hexdigest()
            new = Journal(str(Path(directory) / 'new.sqlite3'), 'synthetic', 'synthetic-fingerprint')
            try:
                seed_offset(new, source, 'synthetic', 'synthetic-fingerprint', 'fixed-boundary')
                self.assertEqual(new.offset, 123)
                self.assertEqual(new.db.execute('SELECT COUNT(*) FROM updates').fetchone()[0], 0)
                self.assertEqual(new.db.execute('SELECT COUNT(*) FROM deliveries').fetchone()[0], 0)
                seed_offset(new, source, 'synthetic', 'synthetic-fingerprint', 'fixed-boundary')
                with self.assertRaisesRegex(ValueError, 'boundary_changed'):
                    seed_offset(new, source, 'synthetic', 'synthetic-fingerprint', 'different-boundary')
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), before)
            finally:
                new.close()

    def test_wrong_source_identity_is_rejected_without_copying_offset(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'old.sqlite3'
            old = Journal(str(source), 'other-bot', 'other-token')
            old.close()
            new = Journal(str(Path(directory) / 'new.sqlite3'), 'synthetic', 'synthetic-fingerprint')
            try:
                with self.assertRaisesRegex(ValueError, 'identity_mismatch'):
                    seed_offset(new, source, 'synthetic', 'synthetic-fingerprint', 'fixed-boundary')
                self.assertIsNone(new.offset)
            finally:
                new.close()

    def test_identity_check_uses_metadata_methods_only_and_blocks_webhook_or_wrong_bot(self):
        class Transport:
            def __init__(self): self.methods = []; self.me = {'id': 123456789, 'is_bot': True, 'username': 'SyntheticBot'}; self.webhook = ''
            def post(self, url, body):
                method = url.rsplit('/', 1)[1]; self.methods.append(method)
                if method == 'getMe': return {'result': self.me}
                if method == 'getWebhookInfo': return {'result': {'url': self.webhook}}
                raise AssertionError('No polling or sending during identity verification')
        transport = Transport()
        client = TelegramClient('123456789:' + 'x' * 35, transport)
        client.verify_identity('123456789', 'SyntheticBot')
        self.assertEqual(transport.methods, ['getMe', 'getWebhookInfo'])
        transport.webhook = 'https://synthetic.invalid'
        with self.assertRaisesRegex(ValueError, 'webhook'):
            client.verify_identity('123456789', 'SyntheticBot')
        with self.assertRaisesRegex(ValueError, 'identity_mismatch'):
            client.verify_identity('987654321', 'SyntheticBot')

    def test_production_environment_requires_token_identity_boundary_and_no_trial_window(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {'COURIER_ENABLED':'true', 'COURIER_ALLOW_NETWORK':'true', 'COURIER_INTEGRATION_ENABLED':'true',
                   'COURIER_BOT_ID':'synthetic', 'COURIER_BOT_USERNAME':'SyntheticBot', 'COURIER_TELEGRAM_BOT_TOKEN':'123456789:' + 'x'*35,
                   'COURIER_SERVICE_KEY':'synthetic-service-'*4, 'COURIER_SERVER_URL':'http://127.0.0.1:3091',
                   'COURIER_PRODUCTION_MODE':'true', 'COURIER_EXPECTED_TELEGRAM_BOT_ID':'123456789',
                   'COURIER_ACTIVATION_NOT_BEFORE':'2026-01-01T00:00:00.000Z', 'COURIER_DATABASE_ROUTING_ENABLED':'true',
                   'COURIER_CHAT_ENABLED':'true', 'COURIER_POLL_ENABLED':'true', 'COURIER_SEND_ENABLED':'true',
                   'COURIER_JOURNAL_DIR':str(Path(directory)/'journal'), 'COURIER_LOCK_DIR':str(Path(directory)/'lock'),
                   'COURIER_COMMAND_GROUPS_JSON':json.dumps([{'chatId':'-100123', 'threadId':None, 'threadMode':'non_topic', 'profile':'TIAL1', 'commands':['order','req']}])}
            self.assertEqual(RuntimeConfig.from_env(env).production_bot_id, '123456789')
            for key, value in [('COURIER_EXPECTED_TELEGRAM_BOT_ID','987654321'), ('COURIER_ACTIVATION_NOT_BEFORE',''), ('COURIER_SINGLE_TEST_REFERENCE','trial')]:
                changed = copy.deepcopy(env); changed[key] = value
                with self.assertRaises(ValueError): RuntimeConfig.from_env(changed)
            receive_only = {**env, 'COURIER_RECEIVE_ONLY': 'true', 'COURIER_SEND_ENABLED': 'false'}
            config = RuntimeConfig.from_env(receive_only)
            self.assertTrue(config.poll)
            self.assertFalse(config.send)
            self.assertEqual(config.production_bot_id, '123456789')
            for key, value in [('COURIER_SEND_ENABLED', 'true'), ('COURIER_SEND_ENABLED', ''),
                               ('COURIER_POLL_ENABLED', 'false'), ('COURIER_RECEIVE_ONLY', 'yes'),
                               ('COURIER_FIFO_ACK_ENABLED', 'true'), ('COURIER_ADAPTIVE_SCHEDULER_ENABLED', 'true'),
                               ('COURIER_SEPARATE_IO_ENABLED', 'true'), ('COURIER_EXPECTED_TELEGRAM_BOT_ID', '987654321'),
                               ('COURIER_ACTIVATION_NOT_BEFORE', '')]:
                with self.subTest(receive_only_option=key):
                    with self.assertRaises(ValueError):
                        RuntimeConfig.from_env({**receive_only, key: value})
