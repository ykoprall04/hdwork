import hashlib
import hmac
import json
import re
import time
import uuid
from .http import TransportError
from .raw_log import current_trace_id

class InternalClient:
    def __init__(self, config, transport, clock=time.time, nonce=lambda: uuid.uuid4().hex, fifo_ack=False, budget=None):
        self.config, self.transport, self.clock, self.nonce = config, transport, clock, nonce
        self.worker = None
        self.fifo_ack = fifo_ack
        self.protocol_verified = False
        self.budget = budget

    def post(self, path, body):
        if self.budget:
            self.budget.take(path)
        raw = json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode()
        stamp, nonce = str(int(self.clock())), self.nonce()
        content = '\n'.join([self.config.bot_id, stamp, nonce, 'POST', path, hashlib.sha256(raw).hexdigest()])
        signature = hmac.new(self.config.service_key.encode(), content.encode(), hashlib.sha256).hexdigest()
        return self.transport.post(self.config.server + path, raw, {**({'X-Courier-Trace': current_trace_id()} if current_trace_id() else {}), 'X-Courier-Id': self.config.bot_id, 'X-Courier-Time': stamp, 'X-Courier-Nonce': nonce, 'X-Courier-Signature': signature})

    def event(self, event):
        return self.post('/internal/courier/v1/events', {**event, **({'worker': self.worker} if self.worker else {})})

    def routing(self):
        return self.post('/internal/courier/v1/routing', {'worker': self.worker})

    def ensure_protocol(self):
        if self.fifo_ack and not self.protocol_verified:
            value = self.post('/internal/courier/v1/capabilities', {'worker': self.worker})
            if value.get('delivery_protocol') != 'fifo-ack-v2':
                raise TransportError(409)
            self.protocol_verified = True

    def claim(self, exclude_chats=None):
        self.ensure_protocol()
        response = self.post('/internal/courier/v1/outbox/claim', {'limit': 1, **({'exclude_chat_ids':exclude_chats} if exclude_chats else {}), **({'delivery_protocol':'fifo-ack-v2'} if self.fifo_ack else {}), **({'worker': self.worker} if self.worker else {})})
        if self.fifo_ack and response.get('delivery_protocol') != 'fifo-ack-v2':
            raise TransportError(409)
        return response['messages']

    def authorize_delivery(self, delivery):
        return self.post('/internal/courier/v1/outbox/' + delivery['delivery_id'] + '/authorize', {'lease_token': delivery['lease_token'], 'worker': self.worker}).get('allowed') is True

    def settle(self, delivery, result):
        return self.post('/internal/courier/v1/outbox/' + delivery['delivery_id'] + '/result', {'lease_token': delivery['lease_token'], **result, **({'worker': self.worker} if self.worker else {})})

    def lease(self, action, worker_id, token=None):
        return self.post('/internal/courier/v1/worker/' + action, {'worker_id': worker_id, **({'lease_token': token} if token else {})})

class TelegramClient:
    def __init__(self, token, transport):
        self._base, self.transport = 'https://api.telegram.org/bot' + token + '/', transport

    def verify_identity(self, expected_id, username):
        me = self.transport.post(self._base + 'getMe', {})['result']
        if (me.get('is_bot') is not True or str(me.get('id')) != expected_id or
                str(me.get('username', '')).lower() != username.lower()):
            raise ValueError('production_bot_identity_mismatch')
        webhook = self.transport.post(self._base + 'getWebhookInfo', {})['result']
        if webhook.get('url'):
            raise ValueError('production_webhook_already_configured')

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
