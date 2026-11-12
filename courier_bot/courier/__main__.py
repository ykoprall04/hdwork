import os
import sys
import signal
import threading
import json
from pathlib import Path
from urllib.request import build_opener, HTTPRedirectHandler, ProxyHandler
from .runtime_config import RuntimeConfig, private_directory
from .http import JsonTransport, TransportError
from .clients import InternalClient, TelegramClient
from .groups import IngressPolicy
from .journal import Journal
from .lock import PollingLock
from .raw_log import logger, observe
from .durable_runner import DurableCourier, WorkerLease


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise TransportError()


def serve(courier, stop, report=lambda code: print(code, file=sys.stderr)):
    failures = 0
    while not stop.is_set():
        retry_after = 0
        local_budget=False
        try:
            observe('COURIER_CYCLE', courier.run_once)
            failures = 0
        except Exception as error:
            failures += 1
            local_budget=getattr(error,'local_budget',False)
            if isinstance(error, TransportError):
                retry_after = min(300, max(0, error.retry_after))
            logger().emit('CYCLE_RETRY', error=error, retryAfterMs=max(retry_after, min(60, 2 ** min(failures + 1, 6)))*1000)
            report('Courier cycle failed; durable backlog retained')
        if local_budget:
            stop.wait(min(2,max(.05,retry_after)));continue
        wait=max(retry_after,min(60,2**min(failures+1,6))) if failures else courier.recommended_delay() if getattr(courier,'scheduler',None) else 2
        if getattr(courier,'scheduler',None):
            courier.wakeup.wait(wait);courier.wakeup.clear()
        else:
            stop.wait(wait)

def main():
    if sys.argv[1:] != ['--run']:
        print('Courier disabled; explicit --run required', file=sys.stderr)
        return 1
    journal = lock = lease = courier = None
    try:
        config = RuntimeConfig.from_env(os.environ)
        private_directory(config.lock_dir)
        private_directory(config.journal_dir)
        lock = PollingLock(config.lock_dir, config.fingerprint)
        journal_path = config.journal_dir / 'courier.sqlite3'
        if journal_path.is_symlink():
            raise ValueError('journal_path_rejected')
        journal = Journal(str(journal_path), config.base.bot_id, config.fingerprint)
        if config.production_bot_id:
            from .cutover import seed_offset
            source = os.environ.get('COURIER_SOURCE_JOURNAL_FILE', '')
            if not source or Path(source).resolve() == journal_path.resolve():
                raise ValueError('separate_source_journal_required')
            seed_offset(journal, source, config.base.bot_id, config.fingerprint, os.environ['COURIER_ACTIVATION_NOT_BEFORE'])
        from .scheduler import ApiBudget,Scheduler
        budget=ApiBudget() if config.scheduler else None
        scheduler=Scheduler(journal,config.group_rate,config.global_rate) if config.scheduler else None
        internal = InternalClient(config.base, JsonTransport(build_opener(ProxyHandler({}), NoRedirect()).open), fifo_ack=config.fifo_ack,budget=budget)
        ack_internal = InternalClient(config.base, JsonTransport(build_opener(ProxyHandler({}), NoRedirect()).open),budget=budget) if config.fifo_ack else None
        inbound_telegram=TelegramClient(config.base.token,JsonTransport(build_opener(NoRedirect()).open,timeout=35)) if config.separate_io else None
        forward_internal=InternalClient(config.base,JsonTransport(build_opener(ProxyHandler({}),NoRedirect()).open),budget=budget) if config.separate_io else None
        telegram = TelegramClient(config.base.token, JsonTransport(build_opener(NoRedirect()).open))
        if config.production_bot_id:
            telegram.verify_identity(config.production_bot_id, config.username)
        lease = WorkerLease(internal)
        stop = threading.Event()
        if os.environ.get('COURIER_PRIVATE_CONTROL_STDIN') == 'true':
            # Parent EOF or STOP closes only this new courier, not legacy workers.
            def watch_parent():
                if sys.stdin.readline().strip() in ('STOP', ''):
                    stop.set()
            threading.Thread(target=watch_parent, daemon=True).start()
        test_reference = os.environ.get('COURIER_SINGLE_TEST_REFERENCE')
        window = None
        if test_reference:
            if config.send or len(config.groups) != 1 or config.groups[0]['chatId'] != '-5436357946' or config.groups[0]['threadId'] is not None:
                raise ValueError('single_test_scope_rejected')
            window = {'reference': test_reference, 'not_before': int(os.environ['COURIER_SINGLE_TEST_NOT_BEFORE'])}
        def report(code):
            if window:
                print(json.dumps({'event': 'FAILED', 'code': 'COURIER_RUNTIME_FAILED'}), flush=True)
                stop.set()
            else:
                print(code, file=sys.stderr)
        courier = DurableCourier(telegram, internal, journal,
                                 IngressPolicy(config.base.bot_id, config.username, config.groups, test_window=window, chat_enabled=config.chat_enabled), lease,
                                 poll=config.poll, send=config.send, stopped=stop.is_set,
                                 report=report, database_routing=config.database_routing, fifo_ack=config.fifo_ack, ack_internal=ack_internal,scheduler=scheduler,inbound_telegram=inbound_telegram,forward_internal=forward_internal)
        for name in ('SIGINT', 'SIGTERM', 'SIGBREAK'):
            if hasattr(signal, name):
                signal.signal(getattr(signal, name), lambda *_args: stop.set())
        if config.fifo_ack:
            lease.ensure()
            internal.ensure_protocol()
        if window:
            lease.ensure()
            print(json.dumps({'event': 'READY', 'send': False}), flush=True)
        elif config.production_bot_id:
            lease.ensure()
            print(json.dumps({'event': 'READY', 'send': config.send, 'productionIdentityVerified': True}), flush=True)
        serve(courier, stop, report=report)
        return 0
    except KeyboardInterrupt:
        return 0
    except Exception as error:
        logger().emit('COURIER_START_FAILED', error=error)
        print('Courier configuration or journal rejected', file=sys.stderr)
        return 1
    finally:
        if courier:
            courier.close()
        if lease:
            lease.close()
        if journal:
            journal.close()
        if lock:
            lock.close()

if __name__ == '__main__':
    sys.exit(main())
