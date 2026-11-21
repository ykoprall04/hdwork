import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest

from courier.clients import TelegramClient
from courier.groups import IngressPolicy
from courier.http import TransportError
from courier.photos import cache_key, cleanup_due, fetch_requested, mark_delivered

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ioAAAAASUVORK5CYII=')


class FakeTransport:
    def __init__(self):
        self.calls = []
        self.file_path = 'photos/example.png'

    def post(self, url, body, headers=None):
        self.calls.append((url, body, headers))
        return {'result': {'file_path': self.file_path, 'message_id': 42}}

    def download(self, url, limit):
        self.calls.append((url, limit))
        return PNG


class ChatPhotoTests(unittest.TestCase):
    def media_directory(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        outgoing = Path(directory.name) / 'outgoing'
        outgoing.mkdir()
        (outgoing / ('c' * 64 + '.img')).write_bytes(PNG)
        return directory.name

    def test_send_photo_preserves_topic_and_reply(self):
        transport = FakeTransport()
        directory = self.media_directory()
        client = TelegramClient('test-token', transport, directory)
        group = {'chatId': '-1001', 'threadId': '2', 'threadMode': 'thread', 'profile': 'TIAL1', 'commands': ['order']}
        policy = IngressPolicy('fixture', 'FixtureBot', [group], chat_enabled=True)
        payload = {'method': 'sendPhoto', 'chat_id': '-1001', 'thread_mode': 'thread', 'telegram_thread_id': '2',
                   'reply_to_message_id': '3', 'text': '', 'photoKey': 'c' * 64}
        policy.outgoing(payload)
        with self.assertRaises(TransportError):
            policy.outgoing({**payload, 'telegram_thread_id': '9'})
        self.assertEqual(client.send(payload), 42)
        url, body, headers = transport.calls[0]
        self.assertTrue(url.endswith('/sendPhoto'))
        self.assertTrue(headers['Content-Type'].startswith('multipart/form-data; boundary='))
        self.assertIn(PNG, body)
        self.assertIn(b'name="message_thread_id"\r\n\r\n2', body)
        self.assertIn(b'{"message_id":3,"allow_sending_without_reply":false}', body)

    def test_incoming_cache_keeps_file_id_private_and_rejects_wrong_paths(self):
        transport = FakeTransport()
        client = TelegramClient('test-token', transport)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            requests = root / 'requests'
            requests.mkdir()
            prefix = hashlib.sha256(b'fixture').hexdigest()[:16]
            for file_id, thumbnail in [('tiny', True), ('synthetic', False)]:
                key = cache_key('fixture', file_id)
                request = requests / (prefix + '-' + key + '.fetch')
                request.write_text(json.dumps({'botId': 'fixture', 'fileId': file_id, 'thumbnail': thumbnail}), encoding='utf8')
                fetch_requested(client, root, 'fixture')
                self.assertFalse(request.exists())
                self.assertEqual((root / (key + '.img')).read_bytes(), PNG)
            self.assertEqual(transport.calls[0][1], {'file_id': 'tiny'})
            self.assertEqual(transport.calls[1][1], 128 * 1024)
            self.assertEqual(transport.calls[2][1], {'file_id': 'synthetic'})
            self.assertEqual(transport.calls[3][1], 20 * 1024 * 1024)
        transport.file_path = '../invalid'
        with self.assertRaises(TransportError):
            client.download_photo('synthetic', 512)
        self.assertEqual(len(transport.calls), 5)


    def test_daily_cleanup_uses_jakarta_cutoff_and_only_removes_old_cache(self):
        before = datetime(2026, 11, 21, 18, 59, tzinfo=timezone.utc).timestamp()
        after = before + 60
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old = root / ('a' * 64 + '.img')
            fresh = root / ('b' * 64 + '.img')
            outgoing = root / 'outgoing'
            outgoing.mkdir()
            queued = outgoing / ('c' * 64 + '.img')
            delivered = outgoing / ('d' * 64 + '.img')
            unrelated = root / 'queued-photo.png'
            for file in (old, fresh, queued, delivered, unrelated):
                file.write_bytes(PNG)
            os.utime(old, (after - 86400, after - 86400))
            os.utime(fresh, (after, after))
            os.utime(unrelated, (after - 100000, after - 100000))
            mark_delivered(directory, 'd' * 64)
            sent = delivered.with_suffix('.sent')
            self.assertTrue(sent.exists())
            for path in (sent, queued):
                os.utime(path, (after - 100000, after - 100000))
            marker = cleanup_due(root, None, before)
            self.assertFalse(sent.exists())
            self.assertTrue(queued.exists())
            self.assertTrue(old.exists())
            marker = cleanup_due(root, marker, after + 1)
            self.assertFalse(old.exists())
            self.assertTrue(fresh.exists())
            self.assertTrue(unrelated.exists())
            self.assertEqual(cleanup_due(root, marker, after + 2), marker)

    def test_image_as_document_preserves_the_file_bytes(self):
        transport = FakeTransport()
        client = TelegramClient('test-token', transport, self.media_directory())
        with self.assertRaises(TransportError):
            client.send({'method': 'sendPhoto', 'chat_id': '-1001', 'thread_mode': 'non_topic', 'telegram_thread_id': None, 'text': '', 'photoKey': '../outside'})
        self.assertEqual(transport.calls, [])
        client.send({'method': 'sendDocument', 'chat_id': '-1001', 'thread_mode': 'non_topic',
                     'telegram_thread_id': None, 'reply_to_message_id': '3', 'text': 'caption',
                     'photoKey': 'c' * 64})
        url, body, _ = transport.calls[0]
        self.assertTrue(url.endswith('/sendDocument'))
        self.assertIn(b'name="document"; filename="photo.png"', body)
        self.assertIn(PNG, body)
