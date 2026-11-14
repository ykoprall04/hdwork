import os
import sys
import signal
import threading
from urllib.request import build_opener, HTTPRedirectHandler, ProxyHandler
from .runtime_config import RuntimeConfig, private_directory
from .http import JsonTransport, TransportError
from .clients import InternalClient, TelegramClient
from .groups import IngressPolicy
from .journal import Journal
from .lock import PollingLock
from .durable_runner import DurableCourier, WorkerLease


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise TransportError()


def serve(courier, stop, report=lambda code: print(code, file=sys.stderr)):
    failures = 0
    while not stop.is_set():
        retry_after = 0
        try:
            courier.run_once()
            failures = 0
        except Exception as error:
            if isinstance(error, TransportError) and error.status in (401, 403, 409):
                raise
            failures += 1
            if isinstance(error, TransportError):
                retry_after = min(300, max(0, error.retry_after))
            report('Courier cycle failed; durable backlog retained')
        stop.wait(max(retry_after, min(60, 2 ** min(failures + 1, 6))))

def main():
    if sys.argv[1:] != ['--run']:
        print('Courier disabled; explicit --run required', file=sys.stderr)
        return 1
    journal = lock = lease = None
    try:
        config = RuntimeConfig.from_env(os.environ)
        private_directory(config.lock_dir)
        private_directory(config.journal_dir)
        lock = PollingLock(config.lock_dir, config.fingerprint)
        journal_path = config.journal_dir / 'courier.sqlite3'
        if journal_path.is_symlink():
            raise ValueError('journal_path_rejected')
        journal = Journal(str(journal_path), config.base.bot_id, config.fingerprint)
        internal = InternalClient(config.base, JsonTransport(build_opener(ProxyHandler({}), NoRedirect()).open))
        telegram = TelegramClient(config.base.token, JsonTransport(build_opener(NoRedirect()).open))
        lease = WorkerLease(internal)
        stop = threading.Event()
        if os.environ.get('COURIER_PRIVATE_CONTROL_STDIN') == 'true':
            # Parent EOF or STOP closes only this new courier, not legacy workers.
            def watch_parent():
                if sys.stdin.readline().strip() in ('STOP', ''):
                    stop.set()
            threading.Thread(target=watch_parent, daemon=True).start()
        courier = DurableCourier(telegram, internal, journal,
                                 IngressPolicy(config.base.bot_id, config.username, config.groups), lease,
                                 poll=config.poll, send=config.send, stopped=stop.is_set,
                                 report=lambda code: print(code, file=sys.stderr))
        for name in ('SIGINT', 'SIGTERM', 'SIGBREAK'):
            if hasattr(signal, name):
                signal.signal(getattr(signal, name), lambda *_args: stop.set())
        lease.ensure()
        print('READY', flush=True)
        serve(courier, stop)
        return 0
    except KeyboardInterrupt:
        return 0
    except Exception:
        print('Courier configuration or journal rejected', file=sys.stderr)
        return 1
    finally:
        if lease:
            lease.close()
        if journal:
            journal.close()
        if lock:
            lock.close()

if __name__ == '__main__':
    sys.exit(main())
