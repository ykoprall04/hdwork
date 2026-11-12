import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from courier.raw_log import RawLog, safe_error, observe

class RawLogTests(unittest.TestCase):
    def test_redaction_and_original_traceback(self):
        with tempfile.TemporaryDirectory() as folder:
            log = RawLog(folder)
            try:
                raise PermissionError(13, 'SECRET_CHAT token=SECRET session=SECRET')
            except Exception as error:
                log.emit('JOURNAL_FAILURE', error=error, status='ERROR', text='SECRET_CHAT', token='SECRET', correlationId='12345678-1234-1234-1234-123456789abc')
            log.flush()
            text = next(Path(folder).glob('*.jsonl')).read_text()
            self.assertNotIn('SECRET', text)
            row = json.loads(text)
            self.assertEqual(row['error']['errno'], 13)
            self.assertEqual(row['error']['traceback'][-1]['file'], 'test_raw_log.py')
            self.assertEqual(row['error']['traceback'][-1]['function'], 'test_redaction_and_original_traceback')
            log.shutdown()

    def test_rotation_and_retention_wib(self):
        with tempfile.TemporaryDirectory() as folder:
            now = [1794416399.0]  # explicit UTC instants below
            import datetime
            now[0] = datetime.datetime(2026, 11, 11, 16, 59, 59, tzinfo=datetime.timezone.utc).timestamp()
            old = Path(folder)/'hdwork2-2026-11-04-node-1.jsonl'
            old.write_text('old synthetic')
            keep = Path(folder)/'keep.txt'
            keep.write_text('keep')
            log = RawLog(folder, now=lambda: now[0])
            log.emit('FIRST_DAY'); log.flush()
            now[0] += 2
            log.emit('SECOND_DAY'); log.flush()
            self.assertFalse(old.exists())
            self.assertTrue(keep.exists())
            self.assertEqual(len(list(Path(folder).glob('*.jsonl'))), 2)
            log.shutdown()

    def test_error_identity_and_result_are_unchanged(self):
        class FakeLog:
            def emit(self, *args, **kwargs):
                pass
        with patch('courier.raw_log.logger', return_value=FakeLog()):
            result = object()
            self.assertIs(observe('TEST_CALL', lambda: result), result)
            error = RuntimeError('SECRET')
            def fail():
                raise error
            with self.assertRaises(RuntimeError) as caught:
                observe('TEST_CALL', fail)
            self.assertIs(caught.exception, error)

    def test_disabled_and_disk_failure_do_not_fail_delivery(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder)/'disabled'
            log = RawLog(target, enabled=False)
            log.emit('DISABLED')
            self.assertFalse(target.exists())
            bad = Path(folder)/'file'
            bad.write_text('x')
            log = RawLog(bad)
            log.emit('DISK_FAILURE'); log.flush()
            self.assertEqual(log.dropped, 1)
            log.shutdown()

    def test_nested_stages_share_trace_and_correlation(self):
        with tempfile.TemporaryDirectory() as folder:
            log = RawLog(folder)
            correlation = '12345678-1234-1234-1234-123456789abc'
            with patch('courier.raw_log.logger', return_value=log):
                observe('OUTER', lambda: observe('INNER', lambda: None), correlationId=correlation)
            log.flush()
            rows = [json.loads(line) for line in next(Path(folder).glob('*.jsonl')).read_text().splitlines()]
            self.assertEqual(rows[0]['traceId'], rows[1]['traceId'])
            self.assertEqual(rows[0]['correlationId'], correlation)
            self.assertEqual(rows[1]['correlationId'], correlation)
            log.shutdown()
