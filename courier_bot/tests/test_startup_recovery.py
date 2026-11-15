import errno
import json
import socket
import ssl
import unittest
import tempfile
import sqlite3
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError
from courier.clients import TelegramClient
from courier.http import JsonTransport, TransportError, temporary_network


class Transport:
    timeout = 10
    def __init__(self, failures=0, error=None, wrong=False):
        self.failures, self.error, self.wrong, self.methods = failures, error, wrong, []
    def post(self, url, body):
        method = url.rsplit('/', 1)[-1]
        self.methods.append(method)
        if self.failures:
            self.failures -= 1
            raise self.error or TransportError(transient_network=True)
        if method == 'getMe':
            return {'result': {'id': 9 if self.wrong else 1, 'is_bot': True, 'username': 'FixtureBot'}}
        if method == 'getWebhookInfo':
            return {'result': {'url': ''}}
        raise AssertionError('Startup must not poll or send')


class RecoveryTests(unittest.TestCase):
    def test_timeout_then_success_backoff_and_jitter_without_send_or_poll(self):
        transport = Transport(failures=2)
        with patch('courier.clients.time.sleep') as sleep, patch('courier.clients.random.uniform', return_value=.5):
            TelegramClient('fixture', transport).verify_identity('1', 'FixtureBot')
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [2.5, 4.5])
        self.assertEqual(transport.methods, ['getMe', 'getMe', 'getMe', 'getWebhookInfo'])

    def test_persistent_network_failure_is_bounded_and_marked_retryable(self):
        transport = Transport(failures=20)
        with patch('courier.clients.time.sleep') as sleep:
            with self.assertRaises(TransportError) as caught:
                TelegramClient('fixture', transport).verify_identity('1', 'FixtureBot')
        self.assertTrue(caught.exception.startup_retryable)
        self.assertEqual(len(transport.methods), 4)
        self.assertEqual(sleep.call_count, 3)

    def test_token_identity_protocol_and_configuration_failures_never_retry(self):
        for status in (0, 400, 401, 403, 409, 429, 503):
            t = Transport(failures=1, error=TransportError(status))
            with patch('courier.clients.time.sleep') as sleep, self.assertRaises(TransportError):
                TelegramClient('fixture', t).verify_identity('1', 'FixtureBot')
            self.assertFalse(sleep.called)
            self.assertEqual(len(t.methods), 1)
        with patch('courier.clients.time.sleep') as sleep, self.assertRaises(ValueError):
            TelegramClient('fixture', Transport(wrong=True)).verify_identity('1', 'FixtureBot')
        self.assertFalse(sleep.called)

    def test_transport_preserves_only_known_transient_network_classification(self):
        for error in (TimeoutError(), URLError(socket.timeout()), ConnectionResetError(errno.ECONNRESET, 'private'), ConnectionResetError(10054, 'private'), socket.gaierror(socket.EAI_AGAIN, 'private')):
            self.assertTrue(temporary_network(error))
        for error in (ValueError('private'), ssl.SSLCertVerificationError('private'), socket.gaierror(socket.EAI_NONAME, 'private')):
            self.assertFalse(temporary_network(error))
        def opener(*args, **kwargs):
            raise URLError(TimeoutError('private'))
        with self.assertRaises(TransportError) as caught:
            JsonTransport(opener).post('https://synthetic.invalid', {})
        self.assertTrue(caught.exception.transient_network)
        self.assertNotIn('private', str(caught.exception))

    def test_node_handshake_budget_exceeds_worst_case_python_identity_retry(self):
        policy = json.loads((Path(__file__).resolve().parents[2] / 'contracts/courier-startup-recovery.json').read_text())
        worst = policy['identityAttempts'] * 2 * policy['requestTimeoutSeconds'] + sum(policy['backoffSeconds']) + (policy['identityAttempts']-1)*policy['jitterSeconds']
        self.assertGreater(policy['readyTimeoutMs']/1000, worst + 10)
        self.assertEqual(policy['taskRestartCount'], 3)
        self.assertEqual(policy['taskRestartIntervalSeconds'], 60)

    def test_invalid_config_and_journal_fail_with_permanent_exit(self):
        import courier.__main__ as main
        for error in (ValueError('configuration'), ValueError('journal'), ValueError('another_courier_owns_token')):
            with patch('sys.argv', ['courier', '--run']), patch.object(main.RuntimeConfig, 'from_env', side_effect=error):
                self.assertEqual(main.main(), 1)

    def test_real_corrupt_fixture_journal_stops_before_telegram_without_repairing_it(self):
        import courier.__main__ as main
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            journal = root / 'courier.sqlite3'
            original = b'not a sqlite database - fixture only'
            journal.write_bytes(original)
            config = SimpleNamespace(lock_dir=root, journal_dir=root, fingerprint='fixture', base=SimpleNamespace(bot_id='fixture'))
            connections, connect = [], sqlite3.connect
            def owned_connect(*args, **kwargs):
                connection = connect(*args, **kwargs)
                connections.append(connection)
                return connection
            try:
                with patch('sys.argv', ['courier', '--run']), patch.object(main.RuntimeConfig, 'from_env', return_value=config), patch.object(main, 'private_directory'), patch.object(main, 'TelegramClient') as telegram, patch('courier.journal.sqlite3.connect', side_effect=owned_connect):
                    self.assertEqual(main.main(), 1)
                    telegram.assert_not_called()
            finally:
                for connection in connections:
                    connection.close()
            self.assertEqual(journal.read_bytes(), original)

    def test_real_fixture_os_lock_conflict_stops_before_journal_or_telegram(self):
        import courier.__main__ as main
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            owner = main.PollingLock(root, 'fixture')
            config = SimpleNamespace(lock_dir=root, journal_dir=root, fingerprint='fixture', base=SimpleNamespace(bot_id='fixture'))
            try:
                with patch('sys.argv', ['courier', '--run']), patch.object(main.RuntimeConfig, 'from_env', return_value=config), patch.object(main, 'private_directory'), patch.object(main, 'TelegramClient') as telegram:
                    self.assertEqual(main.main(), 1)
                    telegram.assert_not_called()
                self.assertFalse((root / 'courier.sqlite3').exists())
            finally:
                owner.close()
