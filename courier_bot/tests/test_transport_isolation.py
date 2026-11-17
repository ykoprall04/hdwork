import json
import socket
import ssl
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import URLError, HTTPError
from courier.http import telegram_transport, JsonTransport, TransportError, transport_phase, NoTelegramRedirect
from courier.raw_log import RawLog
import test_fifo_ack as fixtures
from test_fifo_ack import job


class TransportTests(unittest.TestCase):
    def test_tls_context_and_timeouts(self):
        with patch('courier.http.build_opener') as opener:
            for timeout in (10, 35):
                transport = telegram_transport(timeout)
                handler = opener.call_args.args[0]
                context = handler._context
                self.assertEqual(context.minimum_version, ssl.TLSVersion.TLSv1_2)
                self.assertEqual(context.maximum_version, ssl.TLSVersion.TLSv1_2)
                self.assertTrue(context.check_hostname)
                self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
                self.assertEqual(transport.timeout, timeout)

    def test_redirect_is_not_followed(self):
        with self.assertRaises(TransportError):
            NoTelegramRedirect().redirect_request(None, None, None, None, None)

    def test_http_status_and_retry_after_are_preserved(self):
        import io
        failure = HTTPError('https://example.invalid/botSECRET', 429, 'SECRET', {}, io.BytesIO(b'{"ok":false,"error_code":429,"parameters":{"retry_after":17}}'))
        with self.assertRaises(TransportError) as caught:
            JsonTransport(Mock(side_effect=failure)).post('https://example.invalid', {})
        self.assertEqual(caught.exception.status, 429)
        self.assertEqual(caught.exception.retry_after, 17)

    def test_failure_phases_do_not_invent_timeout_location(self):
        for error, phase in [(socket.gaierror('SECRET'), 'DNS'),
                             (ConnectionRefusedError('SECRET'), 'TCP'),
                             (ssl.SSLError('SECRET'), 'TLS'),
                             (TimeoutError('SECRET'), 'NETWORK_TIMEOUT')]:
            self.assertEqual(transport_phase(URLError(error)), phase)
            log = Mock()
            with patch('courier.http.logger', return_value=log):
                with self.assertRaises(TransportError):
                    JsonTransport(Mock(side_effect=URLError(error))).post('https://example.invalid/botSECRET', {'text': 'SECRET'})
                self.assertEqual(log.emit.call_args.kwargs['phase'], phase)

    def test_phase_logging_redacts_secrets(self):
        with tempfile.TemporaryDirectory() as folder:
            log = RawLog(folder)
            log.emit('HTTP_FAILURE', phase='TLS', error=ssl.SSLError('SECRET'), url='https://botSECRET', text='SECRET')
            log.flush()
            text = next(Path(folder).glob('*.jsonl')).read_text()
            self.assertNotIn('SECRET', text)
            self.assertEqual(json.loads(text)['phase'], 'TLS')


class CooldownTests(unittest.TestCase):
    setUp = fixtures.FifoAckTests.setUp
    tearDown = fixtures.FifoAckTests.tearDown
    runner = fixtures.FifoAckTests.runner
    def test_poll_timeout_does_not_block_outbox(self):
        runner, tg, api = self.runner(lambda *args: {'ok': True})
        runner.poll = True
        tg.updates.side_effect = TransportError()
        api.claim.return_value = [job()]
        try:
            runner.run_once()
            self.assertEqual(tg.send.call_count, 1)
            self.assertEqual(runner.cooldown_until, 0)
            self.assertGreater(runner.poll_cooldown_until, self.now)
        finally:
            runner.close()

    def test_poll_rate_limit_stays_local_and_send_cooldown_is_retained(self):
        runner, tg, api = self.runner(lambda *args: {'ok': True})
        runner.poll = True
        tg.updates.side_effect = TransportError(429, 30)
        api.claim.return_value = [job()]
        tg.send.side_effect = TransportError(429, 20)
        try:
            runner.run_once()
            self.assertEqual(tg.send.call_count, 1)
            self.assertEqual(runner.poll_cooldown_until, self.now + 30)
            self.assertEqual(runner.cooldown_until, self.now + 20)
        finally:
            runner.close()
