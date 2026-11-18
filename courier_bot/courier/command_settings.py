"""Global new-order switches. No network or disk I/O on the message path."""
import json
import os
import threading
import time
from .raw_log import logger

COMMANDS = ('order', 'req', 'config_psb', 'mo')


def validated(value):
    if not isinstance(value, dict) or value.get('ok') is not True:
        raise ValueError('command_settings_invalid')
    rows = value.get('commands')
    if not isinstance(rows, dict) or set(rows) != set(COMMANDS):
        raise ValueError('command_settings_invalid')
    for row in rows.values():
        if (not isinstance(row, dict) or set(row) != {'enabled', 'version'} or
                type(row['enabled']) is not bool or type(row['version']) is not int or row['version'] < 0):
            raise ValueError('command_settings_invalid')
    return {key: dict(rows[key]) for key in COMMANDS}


class CommandSettingsCache:
    interval = 4.0  # independent of getUpdates, outbox cooldown and scheduler idle delay

    def __init__(self, client, file=None, clock=time.monotonic, emit=None, worker=lambda: None, wake=lambda: None):
        self.client, self.file, self.clock = client, file, clock
        self.worker = worker
        self.wake = wake
        self.emit = emit or (lambda event, reason=None: logger().emit(event, status='OK' if event.endswith('RECOVERED') else 'ERROR', **({'reason': reason} if reason else {})))
        self._rows = {key: {'enabled': True, 'version': 0} for key in COMMANDS}
        self._lock, self._stop = threading.Lock(), threading.Event()
        self._thread, self._last_error = None, float('-inf')
        self._dirty = False
        self._ready, self._condition = False, None
        if file is not None and file.exists():
            try:
                if file.is_symlink() or file.stat().st_size > 4096:
                    raise ValueError('command_cache_invalid')
                self._rows = validated(json.loads(file.read_text(encoding='utf-8')))
                self._ready = True
            except Exception as error:
                self._error(error)

    def _error(self, error):
        condition = (type(error).__name__, getattr(error, 'status', 0), getattr(error, 'phase', None))
        if condition != self._condition or self.clock() - self._last_error >= 60:
            self._last_error = self.clock()
            status = getattr(error, 'status', 0)
            reason = 'API_AUTH' if status in (401,403) else 'API_FAILURE' if status else 'CACHE_INVALID' if isinstance(error, ValueError) else 'TRANSPORT_OR_STORAGE_FAILURE'
            self.emit('COMMAND_SETTINGS_REFRESH_FAILED', reason)
        self._condition = condition

    @property
    def ready(self):
        with self._lock:
            return self._ready

    def enabled(self, command):
        with self._lock:
            return self._rows.get(command, {'enabled': True})['enabled']

    def refresh(self):
        try:
            rows = validated(self.client.command_settings())
            with self._lock:
                became_ready = not self._ready
                changed = became_ready or rows != self._rows
                self._rows = rows
                self._ready = True
            self._dirty = self._dirty or changed
            # Only release startup's paused ingress. Normal toggles must not
            # cause another polling cycle or Telegram API request.
            if became_ready:
                self.wake()
            if self._dirty and self.file is not None:
                tmp = self.file.with_suffix('.tmp')
                if self.file.is_symlink() or tmp.is_symlink():
                    raise ValueError('command_cache_invalid')
                try:
                    tmp.write_text(json.dumps({'ok': True, 'commands': rows}), encoding='utf-8')
                    os.replace(tmp, self.file)
                    self._dirty = False
                finally:
                    if tmp.exists():
                        tmp.unlink()
            worker = self.worker()
            if worker is not None:
                result = self.client.command_settings_applied(rows, dict(worker))
                if not isinstance(result, dict) or result.get('ok') is not True:
                    raise ValueError('command_report_failed')
            if self._condition is not None:
                self.emit('COMMAND_SETTINGS_RECOVERED')
                self._condition = None
            return True
        except Exception as error:
            self._error(error)
            return False

    def start(self):
        if self._thread is not None:
            return
        def run():
            while not self._stop.is_set():
                deadline = self.clock() + self.interval
                self.refresh()
                self._stop.wait(max(0, deadline-self.clock()))
        self._thread = threading.Thread(target=run, daemon=True, name='courier-command-settings')
        self._thread.start()

    def close(self):
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)
