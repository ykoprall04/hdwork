"""Batch12 ingress validation only. Workflow/ownership decisions remain in Node."""
import re
from .commands import parse_command
from .parser import parse_update


def validate_groups(groups):
    if not isinstance(groups, list) or not groups or len(groups) > 20:
        raise ValueError('groups_invalid')
    seen = set()
    for group in groups:
        if not isinstance(group, dict):
            raise ValueError('group_invalid')
        chat, commands = group.get('chatId'), group.get('commands')
        if (not isinstance(chat, str) or not re.fullmatch(r'-[1-9]\d{0,15}', chat) or
                abs(int(chat)) > 4503599627370495 or chat in seen or
                group.get('threadMode') != 'non_topic' or 'threadId' not in group or group['threadId'] is not None or
                group.get('profile') not in ('TIAL1', 'TIAL2', 'SOLVER1') or
                not isinstance(commands, list) or not commands or
                any(not isinstance(c, str) or c not in ('order', 'req', 'config_psb', 'mo') for c in commands) or
                len(set(commands)) != len(commands) or (group['profile'] == 'SOLVER1' and 'order' in commands)):
            raise ValueError('group_invalid')
        seen.add(chat)
    return groups


class IngressPolicy:
    def __init__(self, bot_id, bot_username, groups):
        self.bot_id, self.bot_username = bot_id, bot_username
        self.groups = validate_groups(groups)

    def prepare(self, update):
        envelope = parse_update(update, self.bot_id)
        if envelope is None:
            return None, 'IGNORED', 'unsupported_update'
        event = envelope['event']
        message = update.get('message', update.get('edited_message', {}))
        if message.get('is_topic_message') is True or message.get('chat', {}).get('is_forum') is True:
            return None, 'IGNORED', 'forum_not_allowed'
        group = next((g for g in self.groups if g['chatId'] == event['chat_id']), None)
        if group is None or event['telegram_thread_id'] is not None:
            return None, 'IGNORED', 'unmapped_group_or_thread'
        if event['kind'] != 'message':
            return None, 'IGNORED', 'edit_requires_review'
        parsed = parse_command(event['text'], group['profile'], self.bot_username)
        if not parsed['valid'] or parsed['command'] not in group['commands']:
            return None, 'IGNORED', 'command_not_allowed_or_invalid'
        return envelope, 'PENDING', None

    def outgoing(self, payload):
        from .http import TransportError
        if (not isinstance(payload, dict) or payload.get('method') != 'sendMessage' or
                payload.get('thread_mode') != 'non_topic' or payload.get('telegram_thread_id') is not None or
                not any(g['chatId'] == payload.get('chat_id') for g in self.groups) or
                not isinstance(payload.get('reply_to_message_id'), str) or
                not re.fullmatch(r'[1-9]\d{0,9}', payload['reply_to_message_id']) or
                int(payload['reply_to_message_id']) > 2147483647 or
                not isinstance(payload.get('text'), str) or not 1 <= len(payload['text'].encode('utf-16-le')) // 2 <= 4096):
            raise TransportError(400)
