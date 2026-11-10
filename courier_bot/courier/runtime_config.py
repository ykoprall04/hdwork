from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit
import hashlib
import json
import re
from .config import Config
from .groups import validate_groups


@dataclass(frozen=True)
class RuntimeConfig:
    base: Config = field(repr=False)
    username: str
    groups: list = field(repr=False)
    journal_dir: Path
    lock_dir: Path
    fingerprint: str = field(repr=False)
    poll: bool
    send: bool
    database_routing: bool = False
    chat_enabled: bool = False
    production_bot_id: str = None

    @classmethod
    def from_env(cls, env):
        if env.get('COURIER_INTEGRATION_ENABLED') != 'true':
            raise ValueError('integration_disabled')
        for flag in ('COURIER_POLL_ENABLED', 'COURIER_SEND_ENABLED', 'COURIER_DATABASE_ROUTING_ENABLED', 'COURIER_CHAT_ENABLED', 'COURIER_PRODUCTION_MODE'):
            if env.get(flag, 'false') not in ('true', 'false'):
                raise ValueError('integration_flag_invalid')
        if env.get('COURIER_CHAT_ENABLED') == 'true' and env.get('COURIER_DATABASE_ROUTING_ENABLED') != 'true':
            raise ValueError('chat_requires_database_routing')
        base = Config.from_env(env)
        expected_id = None
        if env.get('COURIER_PRODUCTION_MODE') == 'true':
            expected_id = env.get('COURIER_EXPECTED_TELEGRAM_BOT_ID', '')
            if (not re.fullmatch(r'[1-9]\d{5,11}', expected_id) or base.token.split(':')[0] != expected_id or
                    env.get('COURIER_CHAT_ENABLED') != 'true' or env.get('COURIER_SINGLE_TEST_REFERENCE') or
                    not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z', env.get('COURIER_ACTIVATION_NOT_BEFORE', ''))):
                raise ValueError('production_identity_or_boundary_required')
        server = urlsplit(base.server)
        port = server.port
        if server.hostname != '127.0.0.1' or port is None or not 1 <= port <= 65535 or port in (3090, 3306):
            raise ValueError('courier_port_invalid')
        username = env.get('COURIER_BOT_USERNAME', '')
        if not re.fullmatch(r'[A-Za-z0-9_]{5,32}', username) or not any(env.get(f) == 'true' for f in ('COURIER_POLL_ENABLED', 'COURIER_SEND_ENABLED')):
            raise ValueError('integration_config_invalid')
        groups = validate_groups(json.loads(env.get('COURIER_COMMAND_GROUPS_JSON', 'null')))
        root = Path(__file__).resolve().parents[2]
        paths = []
        for name in ('COURIER_JOURNAL_DIR', 'COURIER_LOCK_DIR'):
            value = env.get(name, '')
            p = Path(value)
            if not value or not p.is_absolute() or p.is_symlink():
                raise ValueError('private_directory_required')
            p = p.resolve()
            if p == root or root in p.parents:
                raise ValueError('journal_outside_repository_required')
            paths.append(p)
        return cls(base, username, groups, *paths, hashlib.sha256(base.token.encode()).hexdigest(),
                   env.get('COURIER_POLL_ENABLED') == 'true', env.get('COURIER_SEND_ENABLED') == 'true', env.get('COURIER_DATABASE_ROUTING_ENABLED') == 'true', env.get('COURIER_CHAT_ENABLED') == 'true', expected_id)


def private_directory(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink():
        raise ValueError('private_directory_required')
    if __import__('os').name != 'nt' and path.stat().st_mode & 0o077:
        raise ValueError('private_directory_permissions_required')
