"""Group/command filter; order validation replies are created by the durable backend workflow."""
import re
from .commands import parse_command


class CommandGate:
    def __init__(self, groups, journal=None):
        if not isinstance(groups, list) or not groups:
            raise ValueError('command_groups_required')
        self.groups = groups
        seen = set()
        for group in groups:
            if group.get('profile') not in ('TIAL1', 'TIAL2', 'SOLVER1', 'ALL', 'ASSUREN', 'B2B', 'REPLACEMENT') or group.get('threadMode') not in ('thread', 'non_topic'):
                raise ValueError('command_group_invalid')
            chat, thread = group.get('chatId'), group.get('threadId')
            if not isinstance(chat, str) or not re.fullmatch(r'-?[1-9]\d{0,15}', chat) or abs(int(chat)) > 4503599627370495:
                raise ValueError('command_group_invalid')
            if (group['threadMode'] == 'thread') != (thread is not None):
                raise ValueError('command_topic_invalid')
            if thread is not None and (not isinstance(thread, str) or not re.fullmatch(r'[1-9]\d{0,9}', thread) or int(thread) > 2147483647):
                raise ValueError('command_topic_invalid')
            key = (chat, thread)
            if key in seen:
                raise ValueError('command_group_invalid')
            seen.add(key)

    def allow(self, envelope, telegram=None):
        event = envelope['event']
        group = next((g for g in self.groups if g['chatId'] == event['chat_id'] and g['threadId'] == event['telegram_thread_id']), None)
        if group is None or event['kind'] != 'message':
            return False
        if event['reply_to_message_id'] and not event['text'].lstrip().startswith('/'):
            return True
        parsed = parse_command(event['text'], group['profile'])
        allowed = group.get('commands')
        if allowed is not None and parsed.get('command') not in allowed:
            return False
        # Forward malformed but recognized commands to the durable backend. It
        # records the reason and queues one idempotent reply in the inbox txn.
        return parsed['valid'] or bool(parsed.get('command'))
