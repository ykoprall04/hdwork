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
                abs(int(chat)) > 4503599627370495 or
                group.get('threadMode') not in ('thread', 'non_topic') or 'threadId' not in group or
                group.get('profile') not in ('TIAL1', 'TIAL2', 'SOLVER1', 'ASSUREN', 'B2B', 'REPLACEMENT') or
                not isinstance(commands, list) or not commands or
                any(not isinstance(c, str) or c not in ((group['profile'].lower(),) if group['profile'] in ('ASSUREN', 'B2B', 'REPLACEMENT') else ('order', 'req', 'config_psb', 'mo')) for c in commands) or
                len(set(commands)) != len(commands) or (group['profile'] == 'SOLVER1' and 'order' in commands)):
            raise ValueError('group_invalid')
        thread = group['threadId']
        if group['threadMode'] == 'thread':
            if not isinstance(thread, str) or not re.fullmatch(r'[1-9]\d{0,9}', thread) or int(thread) > 2147483647:
                raise ValueError('thread_invalid')
        elif thread is not None:
            raise ValueError('thread_invalid')
        pair = (chat, thread)
        if pair in seen:
            raise ValueError('group_duplicate')
        seen.add(pair)
    return groups


class IngressPolicy:
    def __init__(self, bot_id, bot_username, groups, test_window=None):
        self.bot_id, self.bot_username = bot_id, bot_username
        self.groups = validate_groups(groups)
        self.test_window, self.selected_message = test_window, None

    def refresh(self, configuration):
        groups = validate_groups(configuration.get('groups'))
        targets = configuration.get('alertTargets', [])
        if not isinstance(targets, list) or len(targets) > 20:
            raise ValueError('alert_targets_invalid')
        for target in targets:
            if (not isinstance(target, dict) or set(target) != {'chatId', 'threadId', 'anchorId'} or
                    not re.fullmatch(r'-[1-9]\d{0,15}', str(target['chatId'])) or
                    not re.fullmatch(r'[1-9]\d{0,9}', str(target['anchorId'])) or
                    int(target['anchorId']) > 2147483647 or
                    (target['threadId'] is not None and (not re.fullmatch(r'[1-9]\d{0,9}', str(target['threadId'])) or int(target['threadId']) > 2147483647))):
                raise ValueError('alert_targets_invalid')
        self.groups, self.alert_targets = groups, targets

    def allows_source(self, update):
        # Inspect source identifiers only; do not project text/attachments first.
        if not isinstance(update, dict):
            return False
        message = update.get('message', update.get('edited_message'))
        if not isinstance(message, dict) or not isinstance(message.get('chat'), dict):
            return False
        chat, thread = message['chat'].get('id'), message.get('message_thread_id')
        if type(chat) is not int or (thread is not None and type(thread) is not int):
            return False
        if self.test_window and chat < 0 and str(chat) != '-5436357946':
            raise ValueError('non_testing_group_encountered')
        group = next((g for g in self.groups if g['chatId'] == str(chat) and g['threadId'] == (str(thread) if thread is not None else None)), None)
        if group is None:
            return False
        return not (group['threadMode'] == 'non_topic' and (message.get('is_topic_message') is True or message['chat'].get('is_forum') is True))

    def prepare(self, update):
        if not self.allows_source(update):
            return None, 'IGNORED', 'unmapped_group_or_thread'
        envelope = parse_update(update, self.bot_id)
        if envelope is None:
            return None, 'IGNORED', 'unsupported_update'
        event = envelope['event']
        message = update.get('message', update.get('edited_message', {}))
        group = next((g for g in self.groups if g['chatId'] == event['chat_id'] and g['threadId'] == event['telegram_thread_id']), None)
        if group is None:
            return None, 'IGNORED', 'unmapped_group_or_thread'
        if group['threadMode'] == 'non_topic' and (message.get('is_topic_message') is True or message.get('chat', {}).get('is_forum') is True):
            return None, 'IGNORED', 'forum_not_allowed'
        if event['kind'] != 'message':
            return None, 'IGNORED', 'edit_requires_review'
        parsed = parse_command(event['text'], group['profile'], self.bot_username)
        if not parsed['valid'] or parsed['command'] not in group['commands']:
            return None, 'IGNORED', 'command_not_allowed_or_invalid'
        if self.test_window:
            if event['timestamp'] < self.test_window['not_before'] or parsed.get('sc_in') != self.test_window['reference']:
                return None, 'IGNORED', 'outside_single_order_window'
            identity = (envelope['update_id'], event['message_id'])
            if self.selected_message and identity != self.selected_message:
                return None, 'IGNORED', 'single_order_limit_reached'
            self.selected_message = identity
        return envelope, 'PENDING', None

    def outgoing(self, payload):
        from .http import TransportError
        if (isinstance(payload, dict) and payload.get('method') == 'sendMessage' and
                re.fullmatch(r'HD Work 2\.0 system alert: [A-Z][A-Z0-9_]{1,63}', payload.get('text', '')) and
                any(t['chatId'] == payload.get('chat_id') and t['threadId'] == payload.get('telegram_thread_id') and t['anchorId'] == payload.get('reply_to_message_id') and payload.get('thread_mode') == ('non_topic' if t['threadId'] is None else 'thread') for t in getattr(self, 'alert_targets', []))):
            return
        if (not isinstance(payload, dict) or payload.get('method') != 'sendMessage' or
                not any(g['chatId'] == payload.get('chat_id') and g['threadId'] == payload.get('telegram_thread_id') and g['threadMode'] == payload.get('thread_mode') for g in self.groups) or
                not isinstance(payload.get('reply_to_message_id'), str) or
                not re.fullmatch(r'[1-9]\d{0,9}', payload['reply_to_message_id']) or
                int(payload['reply_to_message_id']) > 2147483647 or
                not isinstance(payload.get('text'), str) or not 1 <= len(payload['text'].encode('utf-16-le')) // 2 <= 4096):
            raise TransportError(400)
