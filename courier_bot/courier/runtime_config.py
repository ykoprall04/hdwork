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

    @classmethod
    def from_env(cls, env):
        if env.get('COURIER_INTEGRATION_ENABLED') != 'true':
            raise ValueError('integration_disabled')
        for flag in ('COURIER_POLL_ENABLED', 'COURIER_SEND_ENABLED'):
            if env.get(flag, 'false') not in ('true', 'false'):
                raise ValueError('integration_flag_invalid')
        base = Config.from_env(env)
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
                   env.get('COURIER_POLL_ENABLED') == 'true', env.get('COURIER_SEND_ENABLED') == 'true')


def private_directory(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink():
        raise ValueError('private_directory_required')
    if __import__('os').name != 'nt' and path.stat().st_mode & 0o077:
        raise ValueError('private_directory_permissions_required')
