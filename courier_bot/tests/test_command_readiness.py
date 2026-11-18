import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from urllib.error import URLError
from unittest.mock import Mock, patch
from courier.command_settings import CommandSettingsCache, COMMANDS
from courier.clients import InternalClient
from courier.http import JsonTransport, TransportError
from courier.groups import IngressPolicy
from courier.journal import Journal
from courier.durable_runner import DurableCourier


def snapshot(**switches):
    return {'ok': True, 'commands': {k: {'enabled': switches.get(k, True), 'version': 1} for k in COMMANDS}}


class ReadinessTests(unittest.TestCase):
    def test_unknown_cache_blocks_only_new_polling_not_journal_ack_or_outbox(self):
        client = Mock()
        client.command_settings.side_effect = TransportError(503)
        cache = CommandSettingsCache(client, emit=lambda *_: None)
        self.assertFalse(cache.refresh())
        self.assertFalse(cache.ready)
        journal = Journal(':memory:', 'sandbox', 'fixture')
        telegram, internal, lease = Mock(), Mock(), Mock()
        internal.claim.return_value = []
        policy = SimpleNamespace(command_settings=cache)
        runner = DurableCourier(telegram, internal, journal, policy, lease, poll=True, send=True)
        runner.flush_events = Mock()
        runner.flush_ack = Mock()
        try:
            runner.run_once()
            telegram.updates.assert_not_called()
            runner.flush_events.assert_called_once()
            self.assertGreater(runner.flush_ack.call_count, 0)
            internal.claim.assert_called_once()
            self.assertIsNone(journal.offset)
        finally:
            runner.close()
            journal.close()

    def test_invalid_cache_never_acknowledges_new_message(self):
        groups = [{'chatId': '-1001', 'threadId': None, 'threadMode': 'non_topic', 'profile': 'TIAL1', 'commands': ['req']}]
        cache = CommandSettingsCache(Mock(), emit=lambda *_: None)
        policy = IngressPolicy('sandbox', 'FixtureBot', groups, command_settings=cache)
        update = {'update_id': 1, 'message': {'message_id': 11, 'chat': {'id': -1001}, 'from': {'id': 9}, 'date': 1700000000, 'text': '/req hello'}}
        journal = Journal(':memory:', 'sandbox', 'fixture')
        try:
            with self.assertRaisesRegex(RuntimeError, 'not_ready'):
                journal.append([update], policy.prepare)
            self.assertIsNone(journal.offset)
            self.assertEqual(journal.db.execute('SELECT COUNT(*) FROM updates').fetchone()[0], 0)
        finally:
            journal.close()

    def test_existing_delivery_completes_and_ack_settles_with_off_or_unknown_cache(self):
        for valid in (False,True):
            with self.subTest(validCache=valid):
                client=Mock();client.command_settings.return_value=snapshot(order=False)
                cache=CommandSettingsCache(client,emit=lambda *_:None)
                if valid:cache.refresh()
                groups=[{'chatId':'-1001','threadId':None,'threadMode':'non_topic','profile':'TIAL1','commands':['order','req']}]
                policy=IngressPolicy('sandbox','FixtureBot',groups,command_settings=cache)
                telegram,internal=Mock(),Mock();telegram.send.return_value=42
                delivery={'delivery_id':'10000001-1000-4000-8000-000000000001','lease_token':'10000002-1000-4000-8000-000000000001','payload':{'method':'sendMessage','chat_id':'-1001','telegram_thread_id':None,'thread_mode':'non_topic','reply_to_message_id':'11','text':'SYNTHETIC'}}
                internal.claim.return_value=[delivery];internal.settle.return_value={'ok':True}
                journal=Journal(':memory:','sandbox','fixture')
                runner=DurableCourier(telegram,internal,journal,policy,Mock(),poll=False,send=True)
                try:
                    runner.run_once()
                    telegram.send.assert_called_once_with(delivery['payload'])
                    internal.settle.assert_called_once()
                    self.assertFalse(journal.has_ack())
                finally:
                    runner.close();journal.close()

    def test_restart_off_and_api_failure_use_last_valid_cache_before_ingress(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = Mock();client.command_settings.return_value = snapshot(order=False)
            file = Path(tmp)/'settings.json'
            first = CommandSettingsCache(client, file=file, emit=lambda *_: None)
            first.refresh()
            client.command_settings.side_effect = TransportError(503)
            restarted = CommandSettingsCache(client, file=file, emit=lambda *_: None)
            self.assertTrue(restarted.ready)
            self.assertFalse(restarted.enabled('order'))
            self.assertFalse(restarted.refresh())
            self.assertFalse(restarted.enabled('order'))

    def test_real_transport_failure_throttled_and_condition_changes_and_recovery_logged(self):
        clock = [0];events = [];http_logs = []
        def fail(*_args, **_kwargs):
            raise URLError('SYNTHETIC_FAILURE')
        transport = JsonTransport(opener=fail, timeout=1, report_failure=lambda *_: None)
        client = InternalClient(SimpleNamespace(bot_id='fixture', service_key='k'*32, server='http://127.0.0.1:1'), transport)
        cache = CommandSettingsCache(client, clock=lambda: clock[0], emit=lambda *args: events.append(args))
        with patch('courier.http.logger') as log:
            for instant in (0,4,8,12):
                clock[0] = instant;cache.refresh()
            log.return_value.emit.assert_not_called()
        self.assertEqual(len(events), 1)
        cache.client = Mock();cache.client.command_settings.side_effect = TransportError(401)
        cache.refresh();self.assertEqual(len(events), 2)
        cache.client.command_settings.side_effect = None;cache.client.command_settings.return_value = snapshot()
        self.assertTrue(cache.refresh());self.assertEqual(events[-1][0], 'COMMAND_SETTINGS_RECOVERED')

    def test_applied_report_only_after_valid_cache_no_telegram_requests(self):
        client=Mock();client.command_settings.return_value=snapshot(req=False);client.command_settings_applied.return_value={'ok':True}
        cache=CommandSettingsCache(client,worker=lambda:{'id':'fixture','lease_token':'synthetic'},emit=lambda *_:None)
        cache.refresh();self.assertTrue(cache.ready)
        self.assertFalse(client.command_settings_applied.call_args.args[0]['req']['enabled'])
        self.assertEqual([c[0] for c in client.method_calls],['command_settings','command_settings_applied'])

    def test_normal_toggle_does_not_wake_telegram_polling(self):
        client=Mock();client.command_settings.return_value=snapshot()
        wake=Mock();cache=CommandSettingsCache(client,wake=wake,emit=lambda *_:None)
        cache.refresh();wake.assert_called_once()
        client.command_settings.return_value=snapshot(order=False)
        cache.refresh();wake.assert_called_once()


if __name__=='__main__':unittest.main()
