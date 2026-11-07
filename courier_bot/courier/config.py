from dataclasses import dataclass, field
from urllib.parse import urlsplit
import re

@dataclass(frozen=True)
class Config:
    bot_id: str
    token: str = field(repr=False)
    service_key: str = field(repr=False)
    server: str

    @classmethod
    def from_env(cls, env):
        if env.get('COURIER_ENABLED') != 'true' or env.get('COURIER_ALLOW_NETWORK') != 'true':
            raise ValueError('courier_disabled')
        bot_id = env.get('COURIER_BOT_ID', '')
        token = env.get('COURIER_TELEGRAM_BOT_TOKEN', '')
        key = env.get('COURIER_SERVICE_KEY', '')
        server = env.get('COURIER_SERVER_URL', 'http://127.0.0.1:3091')
        url = urlsplit(server)
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', bot_id) or not re.fullmatch(r'\d{6,12}:[A-Za-z0-9_-]{30,}', token) or len(key.encode()) < 32:
            raise ValueError('courier_config_invalid')
        if url.scheme != 'http' or url.hostname not in ('127.0.0.1', '::1') or url.username or url.password or url.query or url.fragment or url.path not in ('', '/'):
            raise ValueError('courier_origin_invalid')
        return cls(bot_id, token, key, server.rstrip('/'))
