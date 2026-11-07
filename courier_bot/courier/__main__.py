import os
import sys
import time
from .config import Config
from .http import JsonTransport
from .clients import InternalClient, TelegramClient
from .runner import Courier

def main():
    if sys.argv[1:] != ['--run']:
        print('Courier disabled; explicit --run required', file=sys.stderr)
        return 1
    try:
        config = Config.from_env(os.environ)
        transport = JsonTransport()
        courier = Courier(config.bot_id, TelegramClient(config.token, transport), InternalClient(config, transport))
    except Exception:
        print('Courier configuration rejected', file=sys.stderr)
        return 1
    while True:
        try:
            courier.run_once()
            time.sleep(2)
        except KeyboardInterrupt:
            return 0
        except Exception:
            # Never print exceptions/URLs (Telegram URLs contain the bot token).
            print('Courier cycle failed; retry deferred', file=sys.stderr)
            time.sleep(5)

if __name__ == '__main__':
    sys.exit(main())
