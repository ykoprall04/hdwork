import hashlib
import sqlite3
import re
from .commands import parse_command

class CommandGate:
    def __init__(self, groups, journal):
        if not isinstance(groups, list) or not groups: raise ValueError('command_groups_required')
        self.groups = groups
        seen = set()
        for g in groups:
            if g.get('profile') not in ('TIAL1', 'TIAL2', 'SOLVER1') or g.get('threadMode') not in ('thread', 'non_topic'):
                raise ValueError('command_group_invalid')
            # Reuse normalization/ID validation from the transport parser.
            chat = g.get('chatId'); thread = g.get('threadId')
            if not isinstance(chat, str) or not re.fullmatch(r'-?[1-9]\d{0,15}', chat) or abs(int(chat)) > 4503599627370495: raise ValueError('command_group_invalid')
            if (g['threadMode'] == 'thread') != (thread is not None): raise ValueError('command_topic_invalid')
            if thread is not None and (not isinstance(thread, str) or not re.fullmatch(r'[1-9]\d{0,9}', thread) or int(thread) > 2147483647): raise ValueError('command_topic_invalid')
            key = (chat, thread)
            if key in seen: raise ValueError('command_group_invalid')
            seen.add(key)
        self.db = sqlite3.connect(journal)
        self.db.execute('CREATE TABLE IF NOT EXISTS rejections (key TEXT PRIMARY KEY)')
        self.db.commit()

    def allow(self, envelope, telegram):
        e = envelope['event']
        group = next((g for g in self.groups if g['chatId'] == e['chat_id'] and g['threadId'] == e['telegram_thread_id']), None)
        if group is None: return False  # No unverified topic inference or unsolicited reply.
        if e['kind'] != 'message': return False
        # Status replies remain Node decisions. Slash submissions, even replies, are validated.
        if e['reply_to_message_id'] and not e['text'].lstrip().startswith('/'): return True
        parsed = parse_command(e['text'], group['profile'])
        if parsed['valid']: return True
        key = hashlib.sha256((envelope['bot_id'] + ':' + envelope['update_id']).encode()).hexdigest()
        # Reserve before sending: retries/restarts do not emit another rejection.
        # Ambiguous Telegram failure may lose a rejection; never duplicate it automatically.
        if self.db.execute('INSERT OR IGNORE INTO rejections VALUES (?)', (key,)).rowcount:
            self.db.commit()
            telegram.send({'method': 'sendMessage', 'chat_id': e['chat_id'], 'telegram_thread_id': group['threadId'], 'thread_mode': group['threadMode'], 'reply_to_message_id': e['message_id'], 'text': 'Ditolak. Perbaiki: ' + ', '.join(parsed['errors'])})
        return False
