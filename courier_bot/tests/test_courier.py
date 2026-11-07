import copy
import hashlib
import hmac
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from courier.parser import parse_update
from courier.clients import InternalClient, TelegramClient
from courier.runner import Courier
from courier.http import JsonTransport, TransportError
from courier.config import Config


def update():
    return {'update_id': 1, 'message': {'chat': {'id': -1001234567890}, 'message_id': 42, 'date': 1700000000, 'from': {'id': 17}, 'text': 'synthetic'}}


class CourierTests(unittest.TestCase):
    def test_parser_ids_topic_reply_caption_and_projection(self):
        raw = update()
        raw['message'].update({'message_thread_id': 5, 'reply_to_message': {'message_id': 4, 'text': 'not copied'}, 'document': {'file_id': 'dummy-file', 'file_unique_id': 'dummy-unique', 'file_name': 'dummy.txt', 'file_size': 8}, 'unknown': 'not copied'})
        event = parse_update(raw, 'sandbox')['event']
        self.assertEqual((event['chat_id'], event['message_id'], event['telegram_thread_id'], event['reply_to_message_id']), ('-1001234567890', '42', '5', '4'))
        self.assertNotIn('unknown', event)
        self.assertNotIn('text', event['attachments'][0])
        self.assertIsNone(parse_update(update(), 'sandbox')['event']['telegram_thread_id'])
        raw['message']['caption'] = raw['message'].pop('text')
        self.assertEqual(parse_update(raw, 'sandbox')['event']['text'], 'synthetic')

    def test_invalid_ids_and_unsupported_updates(self):
        for value in [0, -1, True, 1.5, '42', 2147483648]:
            raw = update(); raw['message']['message_id'] = value
            with self.assertRaises(ValueError):
                parse_update(raw, 'sandbox')
        raw = update(); raw['message']['chat']['id'] = -4503599627370496
        with self.assertRaises(ValueError):
            parse_update(raw, 'sandbox')
        self.assertIsNone(parse_update({'update_id': 2, 'callback_query': {}}, 'sandbox'))

    def test_edit_is_distinct_update_and_largest_photo_metadata_only(self):
        raw = update(); raw['edited_message'] = raw.pop('message'); raw['edited_message']['photo'] = [{'file_id': 'small'}, {'file_id': 'large', 'file_size': 10}]
        self.assertEqual(parse_update(raw, 'sandbox')['event']['kind'], 'edited_message')
        self.assertEqual(parse_update(raw, 'sandbox')['event']['attachments'][0]['file_id'], 'large')

    def test_service_signature_uses_raw_bytes_and_no_token_header(self):
        captured = []
        config = SimpleNamespace(bot_id='sandbox', service_key='synthetic-only-' * 3, server='http://127.0.0.1:3091')
        transport = SimpleNamespace(post=lambda *args: captured.append(args) or {'ok': True})
        client = InternalClient(config, transport, clock=lambda: 1700000000, nonce=lambda: 'a' * 32)
        client.event(parse_update(update(), 'sandbox'))
        url, raw, headers = captured[0]
        content = '\n'.join(['sandbox', '1700000000', 'a' * 32, 'POST', '/internal/courier/v1/events', hashlib.sha256(raw).hexdigest()])
        self.assertEqual(headers['X-Courier-Signature'], hmac.new(config.service_key.encode(), content.encode(), hashlib.sha256).hexdigest())
        self.assertNotIn('Authorization', headers)

    def test_telegram_transport_is_mocked_and_reply_is_not_silently_dropped(self):
        captured = []
        transport = SimpleNamespace(post=lambda *args: captured.append(args) or {'result': {'message_id': 99}})
        telegram = TelegramClient('dummy-not-a-token', transport)
        message = {'method': 'sendMessage', 'thread_mode': 'thread', 'chat_id': '-1001234567890', 'telegram_thread_id': '5', 'reply_to_message_id': '42', 'text': 'synthetic'}
        self.assertEqual(telegram.send(message), 99)
        body = captured[0][1]
        self.assertEqual(body['message_thread_id'], 5)
        self.assertFalse(body['reply_parameters']['allow_sending_without_reply'])
        with self.assertRaises(TransportError):
            telegram.send({**message, 'telegram_thread_id': None})

    def test_runner_does_not_advance_offset_until_server_accepts(self):
        telegram = SimpleNamespace(updates=lambda offset: [update()], send=lambda payload: 99)
        internal = SimpleNamespace(event=lambda event: (_ for _ in ()).throw(TransportError()), claim=lambda: [])
        runner = Courier('sandbox', telegram, internal)
        with self.assertRaises(TransportError):
            runner.run_once()
        self.assertIsNone(runner.offset)
        internal.event = lambda event: {'ok': True, 'duplicate': True}
        runner.run_once(); self.assertEqual(runner.offset, 2)

    def test_runner_send_retry_and_permanent_failures(self):
        for status, expected in [(429, 'retry'), (0, 'retry'), (500, 'retry'), (400, 'failed'), (403, 'failed')]:
            reports = []
            telegram = SimpleNamespace(updates=lambda offset: [], send=lambda payload: (_ for _ in ()).throw(TransportError(status, 3 if status == 429 else 0)))
            job = {'delivery_id': 'dummy', 'lease_token': 'dummy', 'payload': {}}
            internal = SimpleNamespace(claim=lambda: [job], settle=lambda delivery, result: reports.append(result))
            runner = Courier('sandbox', telegram, internal, clock=lambda: 0); runner.run_once()
            self.assertEqual(reports[0]['result'], expected)
            if status == 429:
                runner.run_once(); self.assertEqual(len(reports), 1)

    def test_no_actual_network_and_no_exception_url_leak(self):
        with patch('courier.http.urlopen', side_effect=RuntimeError('https://secret-token/private-payload')):
            with self.assertRaises(TransportError) as caught:
                JsonTransport().post('https://example.invalid', {})
            self.assertEqual(str(caught.exception), 'courier_transport_error')

    def test_config_disabled_separate_token_and_loopback_only(self):
        with self.assertRaises(ValueError):
            Config.from_env({'TELEGRAM_BOT_TOKEN': 'legacy-not-used'})
        env = {'COURIER_ENABLED': 'true', 'COURIER_ALLOW_NETWORK': 'true', 'COURIER_BOT_ID': 'sandbox', 'COURIER_SERVICE_KEY': 'synthetic-only-' * 3, 'COURIER_TELEGRAM_BOT_TOKEN': '123456:' + 'x' * 32}
        self.assertEqual(Config.from_env(env).server, 'http://127.0.0.1:3091')
        self.assertNotIn(env['COURIER_TELEGRAM_BOT_TOKEN'], repr(Config.from_env(env)))
        self.assertNotIn(env['COURIER_SERVICE_KEY'], repr(Config.from_env(env)))
        for url in ['https://external.example', 'http://localhost:3091', 'http://user:password@127.0.0.1:3091', 'http://127.0.0.1:3091/path']:
            with self.assertRaises(ValueError):
                Config.from_env({**env, 'COURIER_SERVER_URL': url})


if __name__ == '__main__':
    unittest.main()
