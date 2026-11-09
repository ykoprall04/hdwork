import hashlib
import hmac
import json
import re
import time
import uuid
from .http import TransportError

class InternalClient:
    def __init__(self, config, transport, clock=time.time, nonce=lambda: uuid.uuid4().hex):
        self.config, self.transport, self.clock, self.nonce = config, transport, clock, nonce
        self.worker = None

    def post(self, path, body):
        raw = json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode()
        stamp, nonce = str(int(self.clock())), self.nonce()
        content = '\n'.join([self.config.bot_id, stamp, nonce, 'POST', path, hashlib.sha256(raw).hexdigest()])
        signature = hmac.new(self.config.service_key.encode(), content.encode(), hashlib.sha256).hexdigest()
        return self.transport.post(self.config.server + path, raw, {'X-Courier-Id': self.config.bot_id, 'X-Courier-Time': stamp, 'X-Courier-Nonce': nonce, 'X-Courier-Signature': signature})

    def event(self, event):
        return self.post('/internal/courier/v1/events', {**event, **({'worker': self.worker} if self.worker else {})})

    def routing(self):
        return self.post('/internal/courier/v1/routing', {'worker': self.worker})

    def claim(self):
        return self.post('/internal/courier/v1/outbox/claim', {'limit': 1, **({'worker': self.worker} if self.worker else {})})['messages']

    def settle(self, delivery, result):
        return self.post('/internal/courier/v1/outbox/' + delivery['delivery_id'] + '/result', {'lease_token': delivery['lease_token'], **result, **({'worker': self.worker} if self.worker else {})})

    def lease(self, action, worker_id, token=None):
        return self.post('/internal/courier/v1/worker/' + action, {'worker_id': worker_id, **({'lease_token': token} if token else {})})

class TelegramClient:
    def __init__(self, token, transport):
        self._base, self.transport = 'https://api.telegram.org/bot' + token + '/', transport

    def updates(self, offset):
        payload = {'timeout': 0, 'limit': 10, 'allowed_updates': ['message', 'edited_message']}
        if offset is not None:
            payload['offset'] = offset
        return self.transport.post(self._base + 'getUpdates', payload)['result']

    def send(self, payload):
        if payload.get('method') != 'sendMessage' or payload.get('thread_mode') not in ('thread', 'non_topic'):
            raise TransportError(400)
        body = {'chat_id': payload['chat_id'], 'text': payload['text']}
        def message_id(value):
            if not isinstance(value, str) or not re.fullmatch(r'[1-9]\d{0,9}', value) or int(value) > 2147483647:
                raise TransportError(400)
            return int(value)
        if payload['thread_mode'] == 'thread':
            if not payload.get('telegram_thread_id'):
                raise TransportError(400)
            body['message_thread_id'] = message_id(payload['telegram_thread_id'])
        elif payload.get('telegram_thread_id') is not None:
            raise TransportError(400)
        if payload.get('reply_to_message_id') is not None:
            body['reply_parameters'] = {'message_id': message_id(payload['reply_to_message_id']), 'allow_sending_without_reply': False}
        result = self.transport.post(self._base + 'sendMessage', body)['result']['message_id']
        if type(result) is not int or result < 1 or result > 2147483647:
            raise TransportError()
        return result
