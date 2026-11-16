import io,json,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from courier.raw_log import RawLog,CapturedStream,redact,safe_error
from courier.clients import TelegramClient
from courier.http import TransportError

class TelegramLogTests(unittest.TestCase):
    def test_size_rotation_preserves_latest_original_records(self):
        with tempfile.TemporaryDirectory() as directory:
            log = RawLog(directory, max_bytes=200)
            for index in range(12):
                log.emit('ROTATION_TEST', count=index)
                log.flush()
            log.shutdown()
            files = list(Path(directory).glob('*.jsonl'))
            self.assertEqual(len(files), 2)
            rows = [json.loads(line) for file in files for line in file.read_text().splitlines()]
            self.assertIn(11, [row['count'] for row in rows])
            self.assertTrue(all(row['event'] == 'ROTATION_TEST' for row in rows))

    def test_original_streams_fragmented_secrets_and_shutdown_tail(self):
        with tempfile.TemporaryDirectory() as directory:
            log=RawLog(directory)
            output=io.StringIO();stream=CapturedStream(output,'stderr',log)
            with patch.dict(os.environ,{'COURIER_TELEGRAM_BOT_TOKEN':'123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef'}):
                stream.write('2026-11-15 ERROR timeout token=123456789:ABC')
                stream.flush();self.assertEqual(output.getvalue(),'')
                stream.write('DEFGHIJKLMNOPQRSTUVWXYZabcdef\n')
                stream.write('Traceback (most recent call last):\n  File "http.py", line 12, in post\nTimeoutError: timed out\n')
            log.flush();log.shutdown()
            stored=next(Path(directory).glob('*.jsonl')).read_text()
            self.assertNotIn('ABCDEFGHIJKLMNOPQRSTUVWXYZ',stored)
            self.assertNotIn('ABCDEFGHIJKLMNOPQRSTUVWXYZ',output.getvalue())
            rows=[json.loads(l) for l in stored.splitlines()]
            self.assertEqual(''.join(r['text'] for r in rows),output.getvalue())
            self.assertIn('TimeoutError: timed out',stored)
            self.assertTrue(all(r['source']=='python' and r['stream']=='stderr' for r in rows))

    def test_unhandled_traceback_customer_message_and_source_literals(self):
        with tempfile.TemporaryDirectory() as directory:
            log=RawLog(directory);output=io.StringIO();stream=CapturedStream(output,'stderr',log)
            stream.write('Traceback (most recent call last):\n  File "runner.py", line 12, in run\n    raise ValueError("PRIVATE CUSTOMER")\nValueError: PRIVATE CUSTOMER\n')
            log.flush();log.shutdown()
            self.assertNotIn('PRIVATE',output.getvalue())
            self.assertIn('runner.py',output.getvalue());self.assertIn('ValueError:',output.getvalue())
            for kind in ('Exception','StopIteration','CustomFailure'):
                stream.write('Traceback (most recent call last):\n'+kind+': PRIVATE CUSTOMER\n')
            self.assertNotIn('PRIVATE',output.getvalue())

    def test_payloads_customer_fields_headers_and_urls_redacted(self):
        for line in ['payload={"text":"PRIVATE CUSTOMER"}', 'SC/IN:PRIVATE ORDER', 'Authorization:Bearer PRIVATE', 'chat_id=-123456789', 'caption=PRIVATE', 'first_name=PRIVATE', 'password=PRIVATE']:
            self.assertNotIn('PRIVATE',redact(line));self.assertNotIn('-123456789',redact(line))
        self.assertEqual(redact('2026-11-15 08:00:00 ERROR getUpdates timeout=10 durationMs=1500'), '2026-11-15 08:00:00 ERROR getUpdates timeout=10 durationMs=1500')

    def test_native_traceback_keeps_frames_types_errno_and_retry_without_source(self):
        try:
            try:raise OSError(13,'PRIVATE NAME token=PRIVATE')
            except OSError as cause:raise TransportError(429,17) from cause
        except Exception as error:
            text=safe_error(error)['nativeTraceback']
        self.assertIn('Traceback (most recent call last):',text)
        self.assertIn('test_telegram_log.py',text);self.assertIn('PermissionError',text)
        self.assertIn('TransportError: courier_transport_error',text)
        self.assertIn('status=429',text);self.assertIn('retry_after=17',text)
        self.assertNotIn('PRIVATE',text)

    def test_api_metadata_only_never_token_request_or_response(self):
        class Transport:
            def post(self,url,body):return {'result':[]}
        with tempfile.TemporaryDirectory() as directory:
            log=RawLog(directory)
            with patch('courier.clients.logger',return_value=log),patch('courier.raw_log.logger',return_value=log):
                self.assertEqual(TelegramClient('PRIVATE_TOKEN',Transport()).updates(123),[])
            log.flush();log.shutdown()
            text=next(Path(directory).glob('*.jsonl')).read_text()
            self.assertNotIn('PRIVATE',text);self.assertNotIn('offset',text)
            rows=[json.loads(x) for x in text.splitlines()]
            self.assertEqual(rows[0]['apiMethod'],'getUpdates')
            self.assertGreaterEqual(rows[1]['durationMs'],0)
