"""Startup probes only: read-only SQLite and Telegram identity; never poll/send."""
import json
import os
import sqlite3
import sys
from pathlib import Path


def inspect_journals(config, env):
    source = Path(env['COURIER_SOURCE_JOURNAL_FILE'])
    target = config.journal_dir / 'courier.sqlite3'
    if not source.is_file() or source.is_symlink() or source.resolve() != source.absolute() or source.resolve() == target.resolve():
        return 'SOURCE_JOURNAL_PATH_REJECTED'
    for file, old in [(source, True), (target, False)]:
        if not file.exists():
            continue
        if file.is_symlink():
            return 'TARGET_JOURNAL_PATH_REJECTED'
        connection = sqlite3.connect(file.resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
        try:
            connection.execute('PRAGMA query_only=ON')
            connection.execute('PRAGMA trusted_schema=OFF')
            meta = dict(connection.execute("SELECT key,value FROM metadata WHERE key IN ('bot_id','token_fingerprint','offset','production_boundary')"))
            if meta.get('bot_id') != config.base.bot_id:
                return 'SOURCE_NAMESPACE_MISMATCH' if old else 'TARGET_NAMESPACE_MISMATCH'
            if meta.get('token_fingerprint') != config.fingerprint:
                return 'SOURCE_TOKEN_FINGERPRINT_MISMATCH' if old else 'TARGET_TOKEN_FINGERPRINT_MISMATCH'
            if not old:
                marker = meta.get('production_boundary')
                if marker is not None and marker != env['COURIER_ACTIVATION_NOT_BEFORE']:
                    return 'TARGET_ACTIVATION_BOUNDARY_MISMATCH'
                if marker is None and (connection.execute('SELECT COUNT(*) FROM updates').fetchone()[0] or connection.execute('SELECT COUNT(*) FROM deliveries').fetchone()[0]):
                    return 'TARGET_JOURNAL_NOT_EMPTY'
            elif meta.get('offset') is not None and (not meta['offset'].isdigit() or not 0 <= int(meta['offset']) <= 9007199254740991):
                return 'SOURCE_OFFSET_INVALID'
        finally:
            connection.close()
    return 'JOURNAL_METADATA_PASS'


def main():
    phase = 'PYTHON_IMPORT'
    env = {}
    try:
        from courier.runtime_config import RuntimeConfig
        from courier.clients import TelegramClient
        from courier.http import JsonTransport
        from courier.__main__ import NoRedirect
        from urllib.request import build_opener
        phase = 'PYTHON_CONFIG'
        env = json.load(sys.stdin)
        config = RuntimeConfig.from_env(env)
        phase = 'JOURNAL_METADATA'
        status = inspect_journals(config, env)
        if status != 'JOURNAL_METADATA_PASS':
            return {'status': status, 'phase': phase}
        phase = 'TELEGRAM_IDENTITY'
        TelegramClient(config.base.token, JsonTransport(build_opener(NoRedirect()).open)).verify_identity(config.production_bot_id, config.username)
        return {'status': 'READ_ONLY_PROBES_PASS', 'phase': phase}
    except Exception as error:
        known = {'production_bot_identity_mismatch': 'TELEGRAM_IDENTITY_MISMATCH', 'production_webhook_already_configured': 'TELEGRAM_WEBHOOK_CONFIGURED'}
        code = known.get(str(error), 'READ_ONLY_PROBE_FAILED')
        if getattr(error, 'status', None) in (400, 401, 403, 409, 429):
            code = 'TELEGRAM_API_' + str(error.status)
        return {'status': code, 'phase': phase}
    finally:
        for key in list(env):
            env[key] = ''


if __name__ == '__main__':
    print(json.dumps(main()), flush=True)
