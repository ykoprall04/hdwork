"""Test-only Python side of the native disposable roundtrip. No Telegram client."""
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit
from urllib.request import build_opener, ProxyHandler
from courier.clients import InternalClient
from courier.durable_runner import DurableCourier, WorkerLease
from courier.groups import IngressPolicy
from courier.http import JsonTransport, TransportError
from courier.journal import Journal, encoded


def main():
    if sys.argv[1:] != ['--mock-only']:
        raise ValueError('mock_only')
    data = json.load(sys.stdin)
    url = urlsplit(data['server'])
    if url.scheme != 'http' or url.hostname != '127.0.0.1' or not url.port or url.port in (3090,3091,3306):
        raise ValueError('ephemeral_loopback_required')
    if not Path(data['journal']).resolve().is_relative_to(Path(tempfile.gettempdir()).resolve()):
        raise ValueError('temporary_journal_required')
    config = SimpleNamespace(bot_id='hdwork-new', service_key='synthetic-service-roundtrip-'*2, server=data['server'])
    internal = InternalClient(config, JsonTransport(build_opener(ProxyHandler({})).open))
    now = [2000000000 + (0 if data.get('lose_event_ack') or data.get('lose_outbox_ack') else 10000)]
    journal = Journal(data['journal'], config.bot_id, 'synthetic-no-token', clock=lambda: now[0])
    lease = WorkerLease(internal)
    sent = []
    class FakeTelegram:
        def updates(self, offset):
            if journal.offset is not None:
                assert offset == journal.offset
            return data.get('updates', [])

        def send(self, payload):
            assert payload['thread_mode'] == 'non_topic'
            assert payload['telegram_thread_id'] is None
            assert int(payload['reply_to_message_id']) > 0
            sent.append(hashlib.sha256(encoded(payload).encode()).hexdigest())
            count = journal.db.execute('SELECT COUNT(*) FROM deliveries').fetchone()[0]
            return 1000 + count
    lost = [False]
    target = 'event' if data.get('lose_event_ack') else 'settle' if data.get('lose_outbox_ack') else None
    if target:
        original = getattr(internal, target)
        def call(*args):
            result = original(*args)
            if not lost[0]:
                lost[0] = True
                raise TransportError()
            return result
        setattr(internal, target, call)
    try:
        runner = DurableCourier(FakeTelegram(), internal, journal,
                                IngressPolicy(config.bot_id, 'HDWorkOpsBot', data['groups'], chat_enabled=data.get('chat_enabled', False)), lease,
                                poll=data.get('poll', False), send=data.get('send', False), database_routing=data.get('database_routing', False))
        for _ in range(data.get('rounds', 1)):
            runner.run_once()
            now[0] += 10
        states = {r[0]: r[1] for r in journal.db.execute('SELECT state,COUNT(*) FROM updates GROUP BY state')}
        print(json.dumps({'offset': journal.offset, 'states': states, 'sent': sent, 'pendingAck': journal.has_ack()}))
    finally:
        lease.close()
        journal.close()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Mock courier roundtrip failed', file=sys.stderr)
        sys.exit(1)
