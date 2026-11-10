import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from courier.journal import Journal

spec = importlib.util.spec_from_file_location('courier_startup_diagnostic', Path(__file__).resolve().parents[2] / 'scripts/diagnose-production-courier.py')
diagnostic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostic)


class StartupDiagnosticTests(unittest.TestCase):
    def test_journal_identity_failures_are_specific_and_never_change_legacy_data(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'old.sqlite3'
            old = Journal(str(source), 'synthetic', 'old-fingerprint')
            old.close()
            before = hashlib.sha256(source.read_bytes()).hexdigest()
            config = SimpleNamespace(base=SimpleNamespace(bot_id='synthetic'), fingerprint='different', journal_dir=Path(folder)/'new')
            env = {'COURIER_SOURCE_JOURNAL_FILE':str(source), 'COURIER_ACTIVATION_NOT_BEFORE':'fixed'}
            self.assertEqual(diagnostic.inspect_journals(config, env), 'SOURCE_TOKEN_FINGERPRINT_MISMATCH')
            config.fingerprint = 'old-fingerprint'
            self.assertEqual(diagnostic.inspect_journals(config, env), 'JOURNAL_METADATA_PASS')
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), before)
            self.assertFalse(config.journal_dir.exists())

    def test_errors_do_not_echo_token_or_exception_message(self):
        with patch('courier.runtime_config.RuntimeConfig.from_env', side_effect=ValueError('SYNTHETIC_PRIVATE_TOKEN')), patch('sys.stdin', io.StringIO('{}')):
            result = diagnostic.main()
        self.assertEqual(result['phase'], 'PYTHON_CONFIG')
        self.assertNotIn('SYNTHETIC_PRIVATE_TOKEN', json.dumps(result))

    def test_failed_journal_check_prevents_telegram_calls(self):
        config = SimpleNamespace()
        with patch('courier.runtime_config.RuntimeConfig.from_env', return_value=config), patch.object(diagnostic, 'inspect_journals', return_value='SOURCE_OFFSET_INVALID'), patch('courier.clients.TelegramClient.verify_identity') as verify, patch('sys.stdin', io.StringIO('{}')):
            result = diagnostic.main()
        verify.assert_not_called()
        self.assertEqual(result, {'phase':'JOURNAL_METADATA', 'status':'SOURCE_OFFSET_INVALID'})
