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
import sys
from pathlib import Path

_context = contextvars.ContextVar('courier_log_context', default=None)
_ID = re.compile(r'^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$')

def redact(text):
    """Redact before queueing, including credentials split across stream writes."""
    for key, value in os.environ.items():
        if re.search(r'TOKEN|PASSWORD|SECRET|SESSION|SERVICE_KEY|IDENTITY_KEY', key, re.I) and len(value) >= 4:
            text = text.replace(value, '[REDACTED]')
    text = re.sub(r'\b\d{6,12}:[A-Za-z0-9_-]{20,}\b', '[REDACTED_TOKEN]', text)
    text = re.sub(r'(?i)(https?://)[^\s/]+@', r'\1[REDACTED]@', text)
    # Payloads are never debugging metadata. Preserve surrounding traceback/HTTP details.
    text = re.sub(r'''(?ix)(["']?(?:authorization|cookie|set-cookie|token|password|secret|session|service_key|identity_key|lease_token|text|caption|payload|raw_text|first_name|last_name|username|phone_number|chat_id|sender_id|SC\s*/\s*IN|NO\s+INET|NIK|SN\s+ONT|alamat|nama\s+pelanggan)["']?\s*[:=]\s*).*''', r'\1[REDACTED]', text)
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b', '[REDACTED_EMAIL]', text)
    text = re.sub(r'(?<![\w.])\+?\d{9,}(?![\w.])', '[REDACTED_ID]', text)
    return text

def exception_text(error, seen=None):
    # Do not include source lines or locals, which may embed customer input/secrets.
    seen = set() if seen is None else seen
    if id(error) in seen:
        return ''
    seen.add(id(error))
    lines = []
    cause = error.__cause__ or (error.__context__ if not error.__suppress_context__ else None)
    if cause is not None:
        lines.extend([exception_text(cause, seen), '\nThe above exception was the direct cause of the following exception:\n\n' if error.__cause__ else '\nDuring handling of the above exception, another exception occurred:\n\n'])
    lines.append('Traceback (most recent call last):\n')
    for f in traceback.extract_tb(error.__traceback__):
        lines.append(f'  File "{f.filename}", line {f.lineno}, in {f.name}\n')
    message = '[REDACTED_EXCEPTION_MESSAGE]'
    if type(error).__module__ == 'builtins' and isinstance(error, OSError) and error.errno:
        message = f'[Errno {error.errno}] {os.strerror(error.errno)}'
    elif str(error) in ('courier_transport_error', 'timed out', 'The read operation timed out', 'Connection refused', 'Connection reset by peer'):
        message = str(error)
    lines.append(f'{type(error).__name__}: {message}\n')
    for attr in ('status', 'code', 'retry_after', 'errno', 'sqlite_errorcode'):
        value = getattr(error, attr, None)
        if type(value) is int:
            lines.append(f'{attr}={value}\n')
    reason = getattr(error, 'reason', None)
    if isinstance(reason, BaseException):
        lines.append(exception_text(reason, seen))
    return redact(''.join(lines))

def safe_error(error):
    frames = []
    for frame in traceback.extract_tb(error.__traceback__):
        frames.append({'file': Path(frame.filename).name, 'line': frame.lineno, 'function': frame.name if re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*|<module>|<lambda>', frame.name) else '[redacted]'})
    result = {'type': type(error).__name__ if type(error).__module__ in ('builtins', 'courier.http', 'sqlite3') else 'Exception',
              'message': '[redacted]', 'traceback': frames, 'nativeTraceback': exception_text(error)}
    for key in ('status', 'retry_after', 'errno', 'sqlite_errorcode'):
        value = getattr(error, key, None)
        if type(value) is int:
            result[key] = value
    if error.__cause__ and error.__cause__ is not error:
        result['cause'] = {'type': type(error.__cause__).__name__, 'message': '[redacted]'}
    return result

class RawLog:
    def __init__(self, directory, enabled=True, now=time.time, limit=2048, max_bytes=10*1024*1024):
        self.directory, self.now = Path(directory), now
        self.enabled = enabled
        self.max_bytes = max_bytes
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
            elif key == 'phase' and value in ('DNS', 'TCP', 'TLS', 'HTTP', 'NETWORK_TIMEOUT', 'REQUEST'):
                row[key] = value
            elif key == 'apiMethod' and value in ('getMe', 'getWebhookInfo', 'getUpdates', 'sendMessage', 'getFile', 'sendPhoto', 'sendDocument'):
                row[key] = value
            elif key == 'command' and value in ('order', 'req', 'config_psb', 'mo', 'assuren', 'b2b', 'replacement'):
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
                        match = re.fullmatch(r'hdwork2-(\d{4}-\d{2}-\d{2})-[a-z-]+-\d+(?:\.previous)?\.jsonl', file.name)
                        if match and match[1] < str(date-datetime.timedelta(days=6)):
                            try:
                                file.unlink()
                            except OSError:
                                pass
                target = self.directory / f'hdwork2-{date}-python-{os.getpid()}.jsonl'
                if target.is_symlink():
                    raise OSError('log_link_rejected')
                if target.exists() and target.stat().st_size >= self.max_bytes:
                    backup = target.with_suffix('.previous.jsonl')
                    if target.stat().st_nlink != 1 or backup.is_symlink() or (backup.exists() and backup.stat().st_nlink != 1):
                        raise OSError('log_link_rejected')
                    os.replace(target, backup)
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

    def stream(self, name, text):
        if not self.enabled:
            return
        row = {'timestamp': datetime.datetime.fromtimestamp(self.now(), datetime.timezone.utc).isoformat(timespec='milliseconds'),
               'source': 'python', 'pid': os.getpid(), 'event': 'PYTHON_' + name.upper(),
               'stream': name, 'text': redact(text)}
        try:
            self.queue.put_nowait(row)
        except queue.Full:
            self.dropped += 1

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

class CapturedStream:
    def __init__(self, original, name, log):
        self.original, self.name, self.log = original, name, log
        self.pending = ''
        self.in_traceback = False
        self.lock = threading.RLock()

    def write(self, text):
        with self.lock:
            self.pending += text
            while '\n' in self.pending:
                line, self.pending = self.pending.split('\n', 1)
                if line.startswith('Traceback (most recent call last):'):
                    self.in_traceback = True
                elif self.in_traceback and line.startswith('    '):
                    # Keep code structure but never source literals or caret snippets.
                    line = re.sub(r'''(['"])(?:\\.|(?!\1).)*\1''', "'[REDACTED_LITERAL]'", line)
                elif self.in_traceback and re.match(r'^[A-Za-z_][\w.]*:', line):
                    kind, message = line.split(':', 1)
                    if message.strip() not in ('timed out', 'The read operation timed out', 'courier_transport_error', 'Connection refused', 'Connection reset by peer'):
                        line = kind + ': [REDACTED_EXCEPTION_MESSAGE]'
                    self.in_traceback = False
                safe = redact(line) + '\n'
                self.log.stream(self.name, safe)
                self.original.write(safe)
            if len(self.pending) > 65536:
                self.pending = '[REDACTED_OVERSIZED_LINE]'
        return len(text)

    def flush(self):
        # Keep unfinished lines buffered so fragmented secrets cannot escape redaction.
        self.original.flush()

    def __getattr__(self, name):
        return getattr(self.original, name)

def capture_streams():
    log = logger()
    if log.enabled:
        for name in ('stdout', 'stderr'):
            original = getattr(sys, name)
            if not isinstance(original, CapturedStream):
                stream = CapturedStream(original, name, log)
                setattr(sys, name, stream)
                def finish(stream=stream):
                    if stream.pending:
                        stream.write('\n')
                atexit.register(finish)
