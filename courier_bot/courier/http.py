import json
import socket
import errno
import ssl
from urllib.error import URLError
from urllib.request import build_opener, HTTPSHandler, HTTPRedirectHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from .raw_log import logger

SAFE_TELEGRAM_DESCRIPTIONS = frozenset((
    'Bad Request: chat not found', 'Bad Request: message to reply not found',
    'Bad Request: message thread not found',
    'Bad Request: not enough rights to send text messages to the chat',
    'Bad Request: message is too long',
))

def api_failure(data, http_status=None):
    """Keep only static descriptions: Bot API may echo user-controlled input."""
    if not isinstance(data, dict) or data.get('ok') is not False:
        return None
    code = data.get('error_code')
    if type(code) is not int or code not in (400, 403, 429) or (http_status is not None and http_status != code):
        return None
    description = data.get('description')
    return {'code': code, 'description': description if isinstance(description, str) and description in SAFE_TELEGRAM_DESCRIPTIONS else '[TELEGRAM_DESCRIPTION_REDACTED]', 'rejected': True}

class TransportError(Exception):
    def __init__(self, status=0, retry_after=0, transient_network=False):
        super().__init__('courier_transport_error')
        self.status = status
        self.retry_after = retry_after
        self.transient_network = transient_network

def temporary_network(error):
    if isinstance(error, URLError):
        error = error.reason
    if isinstance(error, (ssl.SSLCertVerificationError, ssl.CertificateError)):
        return False
    if isinstance(error, (TimeoutError, socket.timeout, ssl.SSLEOFError,
                          ConnectionResetError, ConnectionRefusedError,
                          ConnectionAbortedError, BrokenPipeError)):
        return True
    if isinstance(error, socket.gaierror):
        return error.errno == socket.EAI_AGAIN
    return isinstance(error, OSError) and error.errno in (
        errno.ETIMEDOUT, errno.ECONNRESET, errno.ECONNREFUSED,
        errno.ECONNABORTED, errno.ENETUNREACH, errno.EHOSTUNREACH, errno.EPIPE)

class NoTelegramRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise TransportError()


def telegram_transport(timeout=10):
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.maximum_version = ssl.TLSVersion.TLSv1_2
    return JsonTransport(build_opener(HTTPSHandler(context=context), NoTelegramRedirect()).open, timeout)


def transport_phase(error):
    cause = error.reason if isinstance(error, URLError) else error
    if isinstance(cause, socket.gaierror):
        return 'DNS'
    if isinstance(cause, ssl.SSLError):
        return 'TLS'
    if isinstance(cause, (ConnectionError,)):
        return 'TCP'
    # A socket timeout alone cannot distinguish connect, handshake, or read.
    if isinstance(cause, TimeoutError):
        return 'NETWORK_TIMEOUT'
    return 'REQUEST'


class JsonTransport:
    def __init__(self, opener=None, timeout=10):
        self.opener = opener
        self.timeout = timeout

    def post(self, url, payload, headers=None):
        body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()
        request = Request(url, data=body, headers={'Content-Type': 'application/json', **(headers or {})}, method='POST')
        try:
            with (self.opener or urlopen)(request, timeout=self.timeout) as response:
                raw = response.read(1_048_577)
                if len(raw) > 1_048_576:
                    raise TransportError()
                result = json.loads(raw)
                if not isinstance(result, dict):
                    raise TransportError()
                if result.get('ok') is False:
                    error = TransportError(result.get('error_code', 0), min(300, max(0, int(result.get('parameters', {}).get('retry_after', 0)))))
                    error.api_failure = api_failure(result)
                    raise error
                return result
        except HTTPError as error:
            logger().emit('HTTP_FAILURE', error=error, status='ERROR', phase='HTTP')
            retry = 0
            data = None
            try:
                raw = error.read(65537)
                if len(raw) <= 65536:
                    data = json.loads(raw)
            except Exception:
                pass
            finally:
                error.close()
            if error.code == 429:
                try:
                    retry = min(300, max(1, int(data.get('parameters', {}).get('retry_after', error.headers.get('Retry-After', 1)))))
                except Exception:
                    retry = 1
            failure = TransportError(error.code, retry)
            failure.api_failure = api_failure(data, error.code)
            raise failure from None
        except TransportError:
            raise
        except Exception as error:
            logger().emit('HTTP_FAILURE', error=error, status='ERROR', phase=transport_phase(error))
            raise TransportError(transient_network=temporary_network(error)) from None
