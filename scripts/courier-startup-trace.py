"""Wrap the unchanged Courier entrypoint; emit only fixed startup phase/type codes."""
import builtins
import json
import runpy
import sys

state = {'phase': 'PYTHON_STARTUP', 'directories': 0, 'reported': False}
phases = {
    ('courier.runtime_config', 'from_env'): 'PYTHON_CONFIG',
    ('courier.lock', '__init__'): 'BOT_LOCK',
    ('courier.journal', '__init__'): 'JOURNAL_OPEN',
    ('courier.cutover', 'seed_offset'): 'JOURNAL_SEED',
    ('courier.clients', 'verify_identity'): 'TELEGRAM_IDENTITY',
    ('courier.groups', '__init__'): 'INGRESS_POLICY',
    ('courier.durable_runner', 'ensure'): 'WORKER_LEASE',
}
types = {'PermissionError', 'FileNotFoundError', 'OSError', 'ValueError', 'TypeError', 'RuntimeError', 'ImportError', 'ModuleNotFoundError', 'OperationalError', 'DatabaseError', 'IntegrityError', 'TransportError', 'TimeoutError'}


def trace(frame, event, arg):
    module, name = frame.f_globals.get('__name__'), frame.f_code.co_name
    if event == 'call':
        if (module, name) in phases:
            state['phase'] = phases[(module, name)]
        elif (module, name) == ('courier.runtime_config', 'private_directory'):
            state['directories'] += 1
            state['phase'] = 'LOCK_DIRECTORY' if state['directories'] == 1 else 'JOURNAL_DIRECTORY'
    elif event == 'exception' and module == '__main__' and name == 'main' and not state['reported']:
        error = arg[1]
        state['reported'] = True
        result = {'event': 'STARTUP_FAILURE', 'phase': state['phase'], 'exceptionType': type(error).__name__ if type(error).__name__ in types else 'OTHER_EXCEPTION'}
        if getattr(error, 'status', None) in (400, 401, 403, 409, 429, 503):
            result['httpStatus'] = error.status
        if type(getattr(error, 'errno', None)) is int and 0 < error.errno < 256:
            result['osError'] = error.errno
        sys.stderr.write(json.dumps(result) + '\n')
        sys.stderr.flush()
    return trace


def main():
    original_print = builtins.print

    def print_control(*args, **kwargs):
        original_print(*args, **kwargs)
        if len(args) == 1 and isinstance(args[0], str):
            try:
                if json.loads(args[0]).get('event') == 'READY':
                    sys.settrace(None)
            except (ValueError, AttributeError):
                pass

    builtins.print = print_control
    sys.settrace(trace)
    try:
        runpy.run_module('courier', run_name='__main__', alter_sys=True)
    finally:
        sys.settrace(None)
        builtins.print = original_print


if __name__ == '__main__':
    main()
