"""Bounded asynchronous technical logging. Never serialize arbitrary errors or payloads."""
import atexit
import contextvars
import uuid
import datetime
import json
import os
import queue
import re
import threading
import time
import traceback
from pathlib import Path

_context = contextvars.ContextVar('courier_log_context', default=None)
_ID = re.compile(r'^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$')

def safe_error(error):
    frames = []
    for frame in traceback.extract_tb(error.__traceback__):
        frames.append({'file': Path(frame.filename).name, 'line': frame.lineno, 'function': frame.name if re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*|<module>|<lambda>', frame.name) else '[redacted]'})
    result = {'type': type(error).__name__ if type(error).__module__ in ('builtins', 'courier.http', 'sqlite3') else 'Exception',
              'message': '[redacted]', 'traceback': frames}
    for key in ('status', 'retry_after', 'errno', 'sqlite_errorcode'):
        value = getattr(error, key, None)
        if type(value) is int:
            result[key] = value
    if error.__cause__ and error.__cause__ is not error:
        result['cause'] = {'type': type(error.__cause__).__name__, 'message': '[redacted]'}
    return result

class RawLog:
    def __init__(self, directory, enabled=True, now=time.time, limit=2048):
        self.directory, self.now = Path(directory), now
        self.enabled = enabled
        self.queue = queue.Queue(limit)
        self.dropped = 0
        self.thread = None
        self.last_day = None
        if enabled:
            self.thread = threading.Thread(target=self._write, daemon=True)
            self.thread.start()

    def emit(self, event, error=None, **values):
        if not self.enabled or not re.fullmatch('[A-Z_]{2,64}', event):
            return
        row = {'timestamp': datetime.datetime.fromtimestamp(self.now(), datetime.timezone.utc).isoformat(timespec='milliseconds'),
               'source': 'python', 'pid': os.getpid(), 'event': event}
        for key, value in {**(_context.get() or {}), **values}.items():
            if key in ('traceId', 'correlationId', 'outboxId') and isinstance(value, str) and _ID.fullmatch(value):
                row[key] = value
            elif key in ('groupRate', 'durationMs', 'queueAgeMs', 'retryAfterMs', 'waitMs', 'count', 'attempt') and type(value) in (int, float):
                row[key] = max(0, value)
            elif key == 'groupHash' and isinstance(value,str) and re.fullmatch('[a-f0-9]{64}',value):
                row[key] = value
            elif key in ('status', 'reason') and isinstance(value, str) and re.fullmatch('[A-Z_]{2,64}', value):
                row[key] = value
        if error is not None:
            row['error'] = safe_error(error)
        try:
            self.queue.put_nowait(row)
        except queue.Full:
            self.dropped += 1

    def _write(self):
        while True:
            row = self.queue.get()
            try:
                if row is None:
                    return
                date = datetime.datetime.fromtimestamp(self.now(), datetime.timezone(datetime.timedelta(hours=7))).date()
                self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
                if self.last_day != date:
                    self.last_day = date
                    for file in self.directory.glob('hdwork2-*.jsonl'):
                        match = re.fullmatch(r'hdwork2-(\d{4}-\d{2}-\d{2})-[a-z-]+-\d+\.jsonl', file.name)
                        if match and match[1] < str(date-datetime.timedelta(days=6)):
                            try:
                                file.unlink()
                            except OSError:
                                pass
                target = self.directory / f'hdwork2-{date}-python-{os.getpid()}.jsonl'
                if target.is_symlink():
                    raise OSError('log_link_rejected')
                descriptor = os.open(str(target), os.O_APPEND | os.O_CREAT | os.O_WRONLY | getattr(os, 'O_NOFOLLOW', 0), 0o600)
                if os.fstat(descriptor).st_nlink != 1:
                    os.close(descriptor)
                    raise OSError('log_hardlink_rejected')
                with os.fdopen(descriptor, 'a', encoding='utf-8') as stream:
                    if self.dropped:
                        stream.write(json.dumps({'timestamp': row['timestamp'], 'event': 'LOG_DROPPED', 'source': 'python', 'dropped': self.dropped})+'\n')
                        self.dropped = 0
                    stream.write(json.dumps(row, ensure_ascii=True, allow_nan=False)+'\n')
            except Exception:
                self.dropped += 1
            finally:
                self.queue.task_done()

    def shutdown(self):
        if self.thread:
            try:
                self.queue.put_nowait(None)
                self.thread.join(timeout=2)
            except queue.Full:
                pass

    def flush(self):
        if self.enabled:
            self.queue.join()

_log = None
_log_lock = threading.Lock()

def logger():
    global _log
    if _log is None:
        with _log_lock:
            if _log is None:
                directory = os.environ.get('HDWORK2_LOG_DIRECTORY') or str(Path(os.environ.get('ProgramData', r'C:\ProgramData'))/'HDWork2'/'Logs')
                _log = RawLog(directory, enabled=os.environ.get('HDWORK2_RAW_LOG_ENABLED') == 'true')
                atexit.register(_log.shutdown)
    return _log

def observe(event, run, **values):
    scope = dict(_context.get() or {'traceId': str(uuid.uuid4())})
    scope.update({k: v for k, v in values.items() if k in ('correlationId', 'outboxId')})
    token = _context.set(scope)
    start = time.perf_counter()
    try:
        result = run()
        logger().emit(event, status='OK', durationMs=(time.perf_counter()-start)*1000, **values)
        return result
    except Exception as error:
        logger().emit(event, error=error, status='ERROR', durationMs=(time.perf_counter()-start)*1000, **values)
        raise
    finally:
        _context.reset(token)

def current_trace_id():
    return (_context.get() or {}).get('traceId')
