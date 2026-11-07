"""Projection only: no order status, ownership or workflow decisions."""

def number(value, *, positive=True, maximum=4503599627370495):
    if type(value) is not int or value == 0 or (positive and value < 0) or abs(value) > maximum:
        raise ValueError('invalid_telegram_id')
    return str(value)


def optional_message(value):
    return None if value is None else number(value, maximum=2147483647)


def parse_update(update, bot_id):
    if not isinstance(update, dict):
        raise ValueError('invalid_update')
    uid = update.get('update_id')
    if type(uid) is not int or uid < 0 or uid > 9007199254740991:
        raise ValueError('invalid_update')
    kind = 'message' if 'message' in update else 'edited_message' if 'edited_message' in update else None
    if kind is None:
        return None
    m = update[kind]
    if not isinstance(m, dict):
        raise ValueError('invalid_message')
    timestamp = m.get('date')
    if type(timestamp) is not int or timestamp < 0:
        raise ValueError('invalid_timestamp')
    attachments = []
    candidates = []
    if m.get('photo'):
        photos = m['photo']
        if not isinstance(photos, list) or not all(isinstance(p, dict) for p in photos):
            raise ValueError('invalid_attachment')
        candidates.append(('photo', photos[-1]))
    for name in ('document', 'video', 'audio', 'voice', 'animation', 'sticker'):
        if name in m:
            candidates.append((name, m[name]))
    for name, attachment in candidates:
        if not isinstance(attachment, dict) or not isinstance(attachment.get('file_id'), str) or not attachment['file_id']:
            raise ValueError('invalid_attachment')
        attachments.append({
            'kind': name, 'file_id': attachment['file_id'],
            'file_unique_id': attachment.get('file_unique_id'),
            'name': attachment.get('file_name'), 'mime_type': attachment.get('mime_type'),
            'size': attachment.get('file_size'),
        })
    text = m.get('text', m.get('caption', ''))
    if not isinstance(text, str):
        raise ValueError('invalid_text')
    sender = m.get('from') or {}
    reply = m.get('reply_to_message') or {}
    if not isinstance(sender, dict) or not isinstance(reply, dict) or not isinstance(m.get('chat'), dict):
        raise ValueError('invalid_message')
    return {'version': 1, 'bot_id': bot_id, 'update_id': str(uid), 'event': {
        'kind': kind, 'chat_id': number(m.get('chat', {}).get('id'), positive=False),
        'message_id': number(m.get('message_id'), maximum=2147483647),
        'telegram_thread_id': optional_message(m.get('message_thread_id')),
        'sender_id': number(sender['id']) if 'id' in sender else None,
        'reply_to_message_id': optional_message(reply.get('message_id')),
        'timestamp': timestamp, 'text': text, 'attachments': attachments,
    }}
