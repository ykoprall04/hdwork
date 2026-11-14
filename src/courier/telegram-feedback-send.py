"""Single request transport. Secrets enter stdin only; stdout is metadata only."""
import json
import re
import sys
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler
from urllib.error import HTTPError


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise ValueError('redirect_rejected')


def main():
    data = json.loads(sys.stdin.buffer.read(32769))
    token = data.pop('token', '')
    if not re.fullmatch(r'9133904377:[A-Za-z0-9_-]{30,}', token):
        raise ValueError('token_identity_rejected')
    mode, payload = data.get('mode'), data.get('payload', {})
    if mode == 'identity':
        method, body = 'getMe', {}
    elif mode == 'send':
        if (payload.get('chat_id') != '-5436357946' or
                payload.get('thread_mode') != 'non_topic' or
                payload.get('telegram_thread_id') is not None or
                not re.fullmatch(r'[1-9]\d{0,9}', str(payload.get('reply_to_message_id', ''))) or
                not isinstance(payload.get('text'), str) or
                not 1 <= len(payload['text'].encode('utf-16-le')) // 2 <= 4096):
            raise ValueError('testing_payload_rejected')
        method = 'sendMessage'
        body = dict(chat_id='-5436357946', text=payload['text'],
                    reply_parameters=dict(message_id=int(payload['reply_to_message_id']),
                                          allow_sending_without_reply=False))
    else:
        raise ValueError('mode_rejected')
    request = Request('https://api.telegram.org/bot' + token + '/' + method,
                      data=json.dumps(body, ensure_ascii=False).encode(),
                      headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=10) as response:
            value = json.loads(response.read(131073))
    except HTTPError as error:
        retry = 0
        if error.code == 429:
            try:
                detail = json.loads(error.read(65536))
                retry = min(300, max(1, int(detail.get('parameters', {}).get('retry_after', 1))))
            except Exception:
                retry = 1
        return dict(ok=False, status=error.code, retryAfter=retry, code='TELEGRAM_API_REJECTED')
    except Exception:
        return dict(ok=False, status=0, code='TELEGRAM_NETWORK_UNCONFIRMED')
    if value.get('ok') is not True:
        return dict(ok=False, status=value.get('error_code', 0), code='TELEGRAM_API_REJECTED')
    result = value.get('result', {})
    if mode == 'identity':
        return dict(ok=result.get('is_bot') is True and str(result.get('id')) == '9133904377',
                    botId=str(result.get('id')))
    if (str(result.get('chat', {}).get('id')) != '-5436357946' or
            str(result.get('reply_to_message', {}).get('message_id')) != str(payload['reply_to_message_id']) or
            type(result.get('message_id')) is not int):
        return dict(ok=False, status=200, code='TELEGRAM_RESPONSE_MISMATCH')
    return dict(ok=True, messageId=str(result['message_id']), chatId='-5436357946',
                replyToMessageId=str(payload['reply_to_message_id']))


try:
    print(json.dumps(main()), flush=True)
except Exception:
    print(json.dumps(dict(ok=False, status=0, code='TRANSPORT_INPUT_OR_RUNTIME_REJECTED')), flush=True)
    sys.exit(1)
