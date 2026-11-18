import copy
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from unittest.mock import patch
from courier.command_settings import COMMANDS, CommandSettingsCache
from courier.groups import IngressPolicy
from courier.journal import Journal
from courier.http import TransportError
from courier.clients import InternalClient


def config(**switches):
    return {'ok': True, 'commands': {key: {'enabled': switches.get(key, True), 'version': 1} for key in COMMANDS}}


def update(command, uid=1, chat=-1001, reply=False):
    message = {'message_id': uid+10, 'chat': {'id': chat}, 'from': {'id': 9}, 'date': 1700000000,
               'text': '/' + command + '@HDWorkOpsBot\nsynthetic body'}
    if reply:
        message['reply_to_message'] = {'message_id': 5, 'from': {'id': 7}, 'chat': {'id': chat}, 'date': 1700000000}
    return {'update_id': uid, 'message': message}


class Tests(unittest.TestCase):
    def setUp(self):
        self.client = Mock()
        self.client.command_settings.return_value = config()
        self.errors = []
        self.cache = CommandSettingsCache(self.client, emit=lambda *_: self.errors.append('static'))
        groups = [{'chatId': str(chat), 'threadId': None, 'threadMode': 'non_topic', 'profile': 'ALL', 'commands': list(COMMANDS)} for chat in (-1001, -1002)]
        self.cache.refresh()
        self.client.reset_mock()
        self.policy = IngressPolicy('sandbox', 'HDWorkOpsBot', groups, chat_enabled=True, command_settings=self.cache)

    def test_default_on_all_commands(self):
        for command in COMMANDS:
            self.assertTrue(self.cache.enabled(command))
            self.assertEqual(self.policy.prepare(update(command))[1], 'PENDING')

    def test_each_off_on_globally_case_and_bot_suffix_no_reply(self):
        for command in COMMANDS:
            self.client.command_settings.return_value = config(**{command: False})
            self.assertTrue(self.cache.refresh())
            for chat in (-1001, -1002):
                for spelling in (command, command.upper(), command.title()):
                    self.assertEqual(self.policy.prepare(update(spelling, chat=chat)), (None, 'IGNORED', 'global_command_disabled'))
            for other in COMMANDS:
                self.assertEqual(self.cache.enabled(other), other != command)
            self.client.command_settings.return_value = config()
            self.cache.refresh()
            self.assertEqual(self.policy.prepare(update(command))[1], 'PENDING')

    def test_last_valid_on_errors_and_malformed_partial_boolean(self):
        self.client.command_settings.return_value = config(order=False)
        self.cache.refresh()
        for value in ({'ok': False}, {'ok': True, 'commands': {}}, config(order='false')):
            self.client.command_settings.return_value = value
            self.assertFalse(self.cache.refresh())
            self.assertFalse(self.cache.enabled('order'))
        self.client.command_settings.side_effect = TransportError(503)
        self.assertFalse(self.cache.refresh())
        self.assertFalse(self.cache.enabled('order'))
        self.assertEqual(len(self.errors), 2)

    def test_error_log_throttled_60_seconds(self):
        clock = [0]
        self.cache.clock = lambda: clock[0]
        self.client.command_settings.side_effect = TransportError(503)
        for instant in (0, 1, 4, 20, 59, 60):
            clock[0] = instant
            self.cache.refresh()
        self.assertEqual(len(self.errors), 2)

    def test_no_network_or_database_per_message_no_telegram_toggle(self):
        self.cache.refresh()
        for i in range(1000):
            self.policy.prepare(update('req', uid=i))
        self.assertEqual(self.client.method_calls, [unittest.mock.call.command_settings()])

    def test_dedicated_signed_internal_endpoint_not_telegram(self):
        transport = Mock()
        internal = InternalClient(SimpleNamespace(bot_id='sandbox', service_key='k'*32, server='http://127.0.0.1:9000'), transport)
        internal.command_settings()
        self.assertEqual(transport.post.call_args.args[0], 'http://127.0.0.1:9000/internal/courier/v1/commands')
        self.assertIn('X-Courier-Signature', transport.post.call_args.args[2])

    def test_existing_journal_backlog_and_chat_survive_off_and_offset_advances(self):
        journal = Journal(':memory:', 'sandbox', 'synthetic-fingerprint')
        try:
            journal.append([update('req', 1)], self.policy.prepare)
            old = journal.next_event()
            self.client.command_settings.return_value = config(req=False)
            self.cache.refresh()
            journal.append([update('req', 2)], self.policy.prepare)
            self.assertEqual(journal.next_event()['payload'], old['payload'])
            self.assertEqual(journal.offset, 3)
            ignored = journal.db.execute("SELECT state,payload FROM updates WHERE update_id='2'").fetchone()
            self.assertEqual(tuple(ignored), ('IGNORED', None))
            self.assertEqual(self.policy.prepare(update('req', 3, reply=True))[1], 'PENDING')
        finally:
            journal.close()

    def test_cache_survives_restart_without_api(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'commands.json'
            cache = CommandSettingsCache(self.client, file=path, emit=lambda *_: None)
            self.client.command_settings.return_value = config(mo=False)
            cache.refresh()
            cache.close()
            self.client.command_settings.side_effect = TransportError(503)
            restored = CommandSettingsCache(self.client, file=path, emit=lambda *_: None)
            self.assertFalse(restored.enabled('mo'))
            self.assertFalse(restored.refresh())
            self.assertFalse(restored.enabled('mo'))
            restored.close()

    def test_cache_write_failure_retries_without_losing_valid_memory(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp)/'commands.json'
            cache = CommandSettingsCache(self.client, file=file, emit=lambda *_: None)
            self.client.command_settings.return_value = config(order=False)
            with patch('courier.command_settings.os.replace', side_effect=OSError()):
                self.assertFalse(cache.refresh())
            self.assertFalse(cache.enabled('order'))
            self.assertTrue(cache.refresh())
            self.assertFalse(json.loads(file.read_text())['commands']['order']['enabled'])
            cache.close()

    def test_normal_update_under_five_seconds_independent_of_polling(self):
        initial = threading.Event()
        state = [config()]
        def fetch():
            initial.set()
            return copy.deepcopy(state[0])
        self.client.command_settings.side_effect = fetch
        self.cache.start()
        try:
            self.assertTrue(initial.wait(1))
            start = time.monotonic()
            state[0] = config(order=False)
            while self.cache.enabled('order') and time.monotonic()-start < 4.9:
                time.sleep(.01)
            self.assertFalse(self.cache.enabled('order'))
            self.assertLess(time.monotonic()-start, 5)
        finally:
            self.cache.close()
        self.assertFalse(self.cache._thread.is_alive())


if __name__ == '__main__':
    unittest.main()
