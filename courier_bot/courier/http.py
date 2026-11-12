import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from .raw_log import logger

class TransportError(Exception):
    def __init__(self, status=0, retry_after=0):
        super().__init__('courier_transport_error')
        self.status = status
        self.retry_after = retry_after

class JsonTransport:
    def __init__(self, opener=None):
        self.opener = opener

    def post(self, url, payload, headers=None):
        body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()
        request = Request(url, data=body, headers={'Content-Type': 'application/json', **(headers or {})}, method='POST')
        try:
            with (self.opener or urlopen)(request, timeout=10) as response:
                raw = response.read(1_048_577)
                if len(raw) > 1_048_576:
                    raise TransportError()
                result = json.loads(raw)
                if not isinstance(result, dict):
                    raise TransportError()
                if result.get('ok') is False:
                    raise TransportError(result.get('error_code', 0), min(300, max(0, int(result.get('parameters', {}).get('retry_after', 0)))))
                return result
        except HTTPError as error:
            logger().emit('HTTP_FAILURE', error=error, status='ERROR')
            retry = 0
            if error.code == 429:
                try:
                    data = json.loads(error.read(65536))
                    retry = min(300, max(1, int(data.get('parameters', {}).get('retry_after', error.headers.get('Retry-After', 1)))))
                except Exception:
                    retry = 1
            raise TransportError(error.code, retry) from None
        except TransportError:
            raise
        except Exception as error:
            logger().emit('HTTP_FAILURE', error=error, status='ERROR')
            raise TransportError() from None
