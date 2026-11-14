import copy
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from courier.commands import parse_command
from courier.groups import IngressPolicy, validate_groups
from courier.journal import Journal
from courier.lock import PollingLock
from courier.durable_runner import DurableCourier, WorkerLease
from courier.runtime_config import RuntimeConfig
from courier.http import TransportError
from courier.__main__ import serve, NoRedirect, main

GROUPS = [{'chatId': '-1001', 'threadId': None, 'threadMode': 'non_topic', 'profile': 'TIAL1', 'commands': ['order', 'req']},
          {'chatId': '-1002', 'threadId': None, 'threadMode': 'non_topic', 'profile': 'SOLVER1', 'commands': ['config_psb', 'mo']}]
TEXT = '/order\nSC/IN:PREFIX-AOi123\nNO INET:000123\nSN ONT:SN1\nSTO:ABC\nKETERANGAN:test\nNIK:TEST'


def update(uid=1, text=TEXT, chat=-1001):
    return {'update_id': uid, 'message': {'message_id': uid + 10, 'chat': {'id': chat}, 'from': {'id': 9}, 'date': 1700000000, 'text': text}}


def job():
    return {'delivery_id': '10000001-1000-4000-8000-000000000001', 'lease_token': '10000002-1000-4000-8000-000000000001',
            'payload': {'method': 'sendMessage', 'chat_id': '-1001', 'telegram_thread_id': None, 'thread_mode': 'non_topic', 'reply_to_message_id': '11', 'text': '🟡 Data di cek Synthetic'}}


class DurableTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = str(Path(self.directory.name) / 'journal.sqlite')
        self.now = 1700000000
        self.policy = IngressPolicy('sandbox', 'HDWorkOpsBot', copy.deepcopy(GROUPS))
        self.journal = Journal(self.path, 'sandbox', 'synthetic-fingerprint', clock=lambda: self.now)

    def tearDown(self):
        self.journal.close()
        self.directory.cleanup()

    def runner(self, **kwargs):
        tg, api = Mock(), Mock()
        tg.updates.return_value = []
        tg.send.return_value = 50
        api.event.return_value = {'ok': True, 'receipt_id': 'persistent-synthetic-receipt'}
        api.claim.return_value = []
        api.settle.return_value = {'ok': True}
        return DurableCourier(tg, api, self.journal, self.policy, Mock(), clock=lambda: self.now, **kwargs), tg, api

    def test_parser_variants_mentions_allowlist_and_shared_module_mapping(self):
        cases = [(TEXT, '-1001', 'order'), ('  /ReQ@hdworkopsbot   untouched\n body', '-1001', 'req'),
                 ('/CONFIG_PSB@HDWorkOpsBot\nOrder ID:X-AOi2\nSTO:ABC', '-1002', 'config_psb'),
                 ('/MO\nSC/IN:X-MOk2\nSTO:ABC', '-1002', 'mo')]
        for text, chat, command in cases:
            envelope, state, _ = self.policy.prepare(update(text=text, chat=int(chat)))
            self.assertEqual(state, 'PENDING')
            self.assertEqual(envelope['event']['chat_id'], chat)
            self.assertEqual(envelope['event']['message_id'], '11')
            self.assertEqual(parse_command(text, 'TIAL1', 'HDWorkOpsBot')['command'], command)
            self.assertIsNone(envelope['event']['telegram_thread_id'])
        for raw in [update(chat=-1003), update(text='/req@AnotherBot hello'), update(text='/config_psb\nOrder ID:X-AOi1\nSTO:ABC'), update(text='DONE')]:
            self.assertEqual(self.policy.prepare(raw)[1], 'IGNORED')
        invalid_order=update(text='/order\nSC/IN:bad')
        envelope,state,reason=self.policy.prepare(invalid_order)
        self.assertEqual((state,reason),('PENDING',None));self.assertEqual(envelope['event']['message_id'],'11')
        forum=update();forum['message']['chat']['is_forum']=True
        self.assertEqual(self.policy.prepare(forum)[1], 'IGNORED')
        self.assertFalse(parse_command('/req@HDWorkOpsBot hello', 'TIAL1')['valid'])

    def test_group_configuration_fails_closed(self):
        for groups in [[], [{**GROUPS[0], 'commands': []}], [{**GROUPS[0], 'chatId': '<UNSET>'}],
                       [{**GROUPS[0], 'threadId': '1'}], [GROUPS[0], GROUPS[0]], [{**GROUPS[1], 'commands': ['order']}]]:
            with self.assertRaises(ValueError):
                validate_groups(groups)

    def test_commit_checkpoint_before_next_poll_even_when_backend_is_offline(self):
        runner, tg, api = self.runner(poll=True)
        tg.updates.return_value = [update(1), update(2, '/req follow-up')]
        api.event.side_effect = TransportError(503)
        runner.run_once()
        self.assertEqual(self.journal.offset, 3)
        self.assertEqual(self.journal.db.execute("SELECT COUNT(*) FROM updates WHERE state='PENDING'").fetchone()[0], 2)
        runner.run_once()
        self.assertEqual(tg.updates.call_args.args[0], 3)
        self.assertEqual(api.event.call_count, 1)  # Durable backoff, no busy retry.
        self.journal.close()
        self.journal = Journal(self.path, 'sandbox', 'synthetic-fingerprint', clock=lambda: self.now)
        self.now += 10
        api.event.side_effect = None
        tg.updates.return_value = []
        runner.journal = self.journal
        runner.run_once()
        self.assertEqual(self.journal.db.execute("SELECT COUNT(*) FROM updates WHERE state='ACKED'").fetchone()[0], 2)

    def test_ack_lost_resends_same_event_and_requires_persistent_receipt(self):
        runner, tg, api = self.runner(poll=True)
        tg.updates.return_value = [update()]
        accepted = []
        def event(value):
            accepted.append(value)
            if len(accepted) == 1:
                raise TransportError()  # Simulated committed inbox, lost HTTP ACK.
            return {'ok': True, 'receipt_id': 'same-persistent-receipt'}
        api.event.side_effect = event
        runner.run_once()
        self.now += 5
        runner.run_once()
        self.assertEqual(accepted[0], accepted[1])
        self.assertEqual(self.journal.db.execute('SELECT COUNT(*) FROM updates').fetchone()[0], 1)
        tg.updates.return_value = [update(2)]
        api.event.side_effect = None
        api.event.return_value = {'ok': True}
        runner.run_once()
        self.assertIsNotNone(self.journal.db.execute("SELECT 1 FROM updates WHERE state='PENDING'").fetchone())

    def test_internal_rate_limit_retry_after_is_persisted_and_does_not_busy_loop(self):
        runner, tg, api = self.runner(poll=True)
        tg.updates.return_value = [update()]
        api.event.side_effect = TransportError(429, 60)
        runner.run_once(); self.now += 30; runner.run_once()
        self.assertEqual(api.event.call_count, 1)
        self.now += 31; runner.run_once();self.assertEqual(api.event.call_count, 2)

    def test_sqlite_failure_rolls_back_whole_batch_and_offset(self):
        self.journal.db.execute("CREATE TRIGGER fail_second BEFORE INSERT ON updates WHEN NEW.update_id='2' BEGIN SELECT RAISE(ABORT,'synthetic'); END")
        self.journal.db.commit()
        with self.assertRaises(sqlite3.IntegrityError):
            self.journal.append([update(1), update(2)], self.policy.prepare)
        self.assertIsNone(self.journal.offset)
        self.assertEqual(self.journal.db.execute('SELECT COUNT(*) FROM updates').fetchone()[0], 0)

    def test_redelivery_conflict_and_malformed_update_leave_a_trace(self):
        self.journal.append([update()], self.policy.prepare)
        self.journal.append([update()], self.policy.prepare)
        with self.assertRaises(ValueError):
            self.journal.append([update(text=TEXT+' changed')], self.policy.prepare)
        self.assertEqual(self.journal.offset, 2)
        malformed = update(2); malformed['message']['message_id'] = -5
        self.journal.append([malformed], self.policy.prepare)
        self.assertEqual(self.journal.db.execute("SELECT reason FROM updates WHERE update_id='2'").fetchone()[0], 'projection_invalid')
        self.assertEqual(self.journal.offset, 3)

    def test_backend_permanent_rejection_is_quarantined_not_silently_deleted(self):
        runner, tg, api = self.runner(poll=True)
        tg.updates.return_value = [update()]
        api.event.side_effect = TransportError(403)
        runner.run_once()
        row = self.journal.db.execute('SELECT * FROM updates').fetchone()
        self.assertEqual(row['state'], 'QUARANTINED')
        self.assertIsNotNone(row['payload'])
        self.assertEqual(self.journal.offset, 2)

    def test_outbox_ack_lost_restart_does_not_send_again(self):
        runner, tg, api = self.runner(send=True)
        api.claim.return_value = [job()]
        api.settle.side_effect = TransportError()
        runner.run_once()
        self.assertEqual(tg.send.call_count, 1)
        self.assertTrue(self.journal.has_ack())
        self.journal.close()
        self.journal = Journal(self.path, 'sandbox', 'synthetic-fingerprint', clock=lambda: self.now)
        runner.journal = self.journal
        self.now += 10
        api.settle.side_effect = None
        api.claim.return_value = []
        runner.run_once()
        self.assertEqual(tg.send.call_count, 1)
        self.assertFalse(self.journal.has_ack())

    def test_expired_ack_and_fresh_claim_use_cached_success(self):
        runner, tg, api = self.runner(send=True)
        api.claim.return_value = [job()]
        api.settle.side_effect = TransportError(409)
        runner.run_once()
        self.assertEqual(tg.send.call_count, 1)
        fresh = job(); fresh['lease_token'] = '10000003-1000-4000-8000-000000000001'
        api.claim.return_value = [fresh]
        api.settle.side_effect = None
        runner.run_once()
        self.assertEqual(tg.send.call_count, 1)
        self.assertEqual(api.settle.call_args.args[0]['lease_token'], fresh['lease_token'])

    def test_outbox_retry_rate_limit_and_unauthorized_target(self):
        for status in (0, 429, 400, 403):
            runner, tg, api = self.runner(send=True)
            delivery = job(); delivery['delivery_id'] = str(__import__('uuid').uuid4())
            api.claim.return_value = [delivery]
            tg.send.side_effect = TransportError(status, 3 if status == 429 else 0)
            runner.run_once()
            self.assertEqual(api.settle.call_args.args[1]['result'], 'failed' if status in (400,403) else 'retry')
            if status == 429:
                runner.run_once(); self.assertEqual(tg.send.call_count, 1)
        runner, tg, api = self.runner(send=True)
        delivery = job(); delivery['delivery_id'] = 'unmapped'; delivery['payload']['chat_id'] = '-999'
        api.claim.return_value = [delivery]
        runner.run_once()
        tg.send.assert_not_called()
        self.assertEqual(api.settle.call_args.args[1]['error_code'], 'BAD_REQUEST')

    def test_flags_and_stop_never_poll_or_send(self):
        runner, tg, api = self.runner()
        runner.run_once(); tg.updates.assert_not_called(); tg.send.assert_not_called(); api.claim.assert_not_called()
        runner, tg, api = self.runner(poll=True, send=True, stopped=lambda: True)
        runner.run_once(); tg.updates.assert_not_called(); api.claim.assert_not_called()

    def test_os_lock_and_graceful_release(self):
        directory = Path(self.directory.name)
        lock = PollingLock(directory, 'test-fingerprint')
        with self.assertRaises(ValueError):
            PollingLock(directory, 'test-fingerprint')
        lock.close()
        another = PollingLock(directory, 'test-fingerprint'); another.close()
        stop = threading.Event()
        courier = Mock(); courier.run_once.side_effect = stop.set
        serve(courier, stop)
        self.assertEqual(courier.run_once.call_count, 1)

    def test_worker_lease_stop_on_competing_worker_and_shutdown(self):
        api = Mock(); now = [0]
        api.lease.return_value = {'ok': True, 'lease_token': 'synthetic-lease', 'lease_ms': 60000}
        lease = WorkerLease(api, clock=lambda: now[0]); lease.ensure()
        self.assertEqual(api.lease.call_args.args[0], 'acquire')
        now[0] = 11; lease.ensure(); self.assertEqual(api.lease.call_args.args[0], 'renew')
        now[0] = 80; api.lease.side_effect = TransportError(409)
        with self.assertRaises(TransportError): lease.ensure()
        self.assertIsNone(api.worker)
        api.lease.side_effect = None; lease.ensure(); lease.close()
        self.assertEqual(api.lease.call_args.args[0], 'release')

    def test_transient_lease_renewal_failure_preserves_token_but_blocks_io_until_retry(self):
        api = Mock(); now = [0]
        api.lease.return_value = {'ok': True, 'lease_token': 'synthetic-lease', 'lease_ms': 60000}
        lease = WorkerLease(api, clock=lambda: now[0]); lease.ensure()
        now[0] = 11; api.lease.side_effect = TransportError(503)
        with self.assertRaises(TransportError): lease.ensure()
        self.assertIsNone(api.worker)
        api.lease.side_effect = None; lease.ensure()
        self.assertEqual(api.lease.call_args.args, ('renew', lease.worker_id, 'synthetic-lease'))

    def test_journal_rejects_another_bot_or_token_without_modifying_pending_records(self):
        self.journal.append([update()], self.policy.prepare)
        for bot, token in [('another-bot', 'synthetic-fingerprint'), ('sandbox', 'different-fingerprint')]:
            with self.assertRaisesRegex(ValueError, 'journal_identity_mismatch'):
                Journal(self.path, bot, token)
        self.assertEqual(self.journal.offset, 2)
        self.assertIsNotNone(self.journal.next_event())

    def test_disabled_startup_and_redirect_no_secrets_or_network(self):
        with patch('sys.argv', ['courier', '--run']), patch.dict('os.environ', {}, clear=True), patch('courier.__main__.build_opener') as transport:
            self.assertEqual(main(), 1)
            transport.assert_not_called()
        with self.assertRaises(TransportError):
            NoRedirect().redirect_request(None, None, None, None, None)

    def test_configuration_requires_private_paths_flags_and_explicit_mapping(self):
        env = {'COURIER_ENABLED':'true','COURIER_ALLOW_NETWORK':'true','COURIER_INTEGRATION_ENABLED':'true',
               'COURIER_POLL_ENABLED':'true','COURIER_BOT_ID':'sandbox','COURIER_SERVICE_KEY':'synthetic-only-'*3,
               'COURIER_TELEGRAM_BOT_TOKEN':'123456:'+'x'*32,'COURIER_BOT_USERNAME':'HDWorkOpsBot',
               'COURIER_COMMAND_GROUPS_JSON':json.dumps(GROUPS),'COURIER_JOURNAL_DIR':self.directory.name,'COURIER_LOCK_DIR':self.directory.name}
        self.assertTrue(RuntimeConfig.from_env(env).poll)
        self.assertNotIn(env['COURIER_TELEGRAM_BOT_TOKEN'], repr(RuntimeConfig.from_env(env)))
        for change in [{'COURIER_INTEGRATION_ENABLED':'false'}, {'COURIER_POLL_ENABLED':'false'},
                       {'COURIER_JOURNAL_DIR':str(Path(__file__).resolve().parents[2])}, {'COURIER_COMMAND_GROUPS_JSON':'[]'},
                       {'COURIER_SERVER_URL':'http://127.0.0.1:3090'}]:
            with self.assertRaises(ValueError): RuntimeConfig.from_env({**env, **change})


if __name__ == '__main__':
    unittest.main()
