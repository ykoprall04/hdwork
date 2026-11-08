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
        gate = None
        if os.environ.get('COURIER_COMMAND_GROUPS_JSON'):
            import json
            from pathlib import Path
            from .gate import CommandGate
            journal = os.environ.get('COURIER_REJECTION_DB', '')
            if not Path(journal).is_absolute() or Path(__file__).resolve().parents[2] in Path(journal).resolve().parents:
                raise ValueError('Private rejection journal path required')
            gate = CommandGate(json.loads(os.environ['COURIER_COMMAND_GROUPS_JSON']), journal)
        if gate is None:
            raise ValueError('Command groups must be reviewed before starting new courier')
        courier = Courier(config.bot_id, TelegramClient(config.token, transport), InternalClient(config, transport), gate=gate)
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
