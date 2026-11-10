import importlib.util
import io
import json
import unittest
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('startup_trace_fixture', Path(__file__).resolve().parents[2] / 'scripts/courier-startup-trace.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StartupTraceTests(unittest.TestCase):
    def setUp(self):
        module.state.update(phase='PYTHON_STARTUP', directories=0, reported=False)

    def frame(self, name, function):
        return SimpleNamespace(f_globals={'__name__':name}, f_code=SimpleNamespace(co_name=function))

    def test_permission_failure_exposes_phase_and_errno_without_exception_text(self):
        module.trace(self.frame('courier.runtime_config', 'private_directory'), 'call', None)
        module.trace(self.frame('courier.lock', '__init__'), 'call', None)
        error = PermissionError(13, 'SYNTHETIC_PRIVATE_VALUE')
        with patch('sys.stderr', io.StringIO()) as output:
            module.trace(self.frame('__main__', 'main'), 'exception', (type(error), error, None))
            value = output.getvalue()
        self.assertEqual(json.loads(value), {'event':'STARTUP_FAILURE', 'phase':'BOT_LOCK', 'exceptionType':'PermissionError', 'osError':13})
        self.assertNotIn('SYNTHETIC_PRIVATE_VALUE', value)

    def test_lease_rejection_reports_http_status_only_once(self):
        from courier.http import TransportError
        module.trace(self.frame('courier.durable_runner', 'ensure'), 'call', None)
        error = TransportError(409)
        with patch('sys.stderr', io.StringIO()) as output:
            for _ in range(2): module.trace(self.frame('__main__', 'main'), 'exception', (type(error), error, None))
            lines = output.getvalue().splitlines()
        self.assertEqual(len(lines), 1)
        self.assertEqual(json.loads(lines[0])['httpStatus'], 409)
        self.assertEqual(json.loads(lines[0])['phase'], 'WORKER_LEASE')

    def test_real_module_wrapper_preserves_run_argument_and_disables_trace_after_ready(self):
        source = (Path(__file__).resolve().parents[2] / 'scripts/courier-startup-trace.py').read_text()
        with tempfile.TemporaryDirectory() as folder:
            package = Path(folder) / 'courier'
            package.mkdir()
            (package / '__init__.py').write_text('')
            env = dict(os.environ, PYTHONPATH=folder, PYTHONDONTWRITEBYTECODE='1')
            for failed in [True, False]:
                body = "raise PermissionError(13, 'SYNTHETIC_PRIVATE_VALUE')" if failed else "print(json.dumps({'event':'READY','send':True}),flush=True); assert sys.gettrace() is None"
                code = "import sys,json\nassert sys.argv[1:]==['--run']\ndef main():\n try:\n  " + body + "\n except Exception:\n  return 1\n return 0\nsys.exit(main())\n"
                (package / '__main__.py').write_text(code)
                result = subprocess.run([sys.executable, '-B', '-c', source, '--run'], cwd=folder, env=env, capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 1 if failed else 0)
                self.assertNotIn('SYNTHETIC_PRIVATE_VALUE', result.stderr)
                if failed:
                    self.assertEqual(json.loads(result.stderr)['osError'], 13)
                else:
                    self.assertEqual(json.loads(result.stdout)['event'], 'READY')
