import hashlib
import os
from pathlib import Path
import tempfile
import re
import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from .http import TransportError
from .raw_log import logger

UPLOAD_LIMIT = 5 * 1024 * 1024
DOWNLOAD_LIMIT = 20 * 1024 * 1024
THUMBNAIL_LIMIT = 128 * 1024


def image_type(data):
    if len(data) >= 4 and data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    return None


def read_outgoing(directory, key):
    if not directory or not Path(directory).is_absolute() or not isinstance(key, str) or not re.fullmatch(r'[0-9a-f]{64}', key):
        raise TransportError(400)
    try:
        with (Path(directory) / 'outgoing' / (key + '.img')).open('rb') as image:
            return image.read(UPLOAD_LIMIT + 1)
    except OSError:
        raise TransportError(400) from None


def multipart_photo(fields, data, field='photo'):
    mime = image_type(data)
    if not mime or len(data) > UPLOAD_LIMIT:
        raise TransportError(400)
    boundary = uuid4().hex
    parts = [
        (f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n').encode()
        for key, value in fields.items()
    ]
    extension = 'png' if mime == 'image/png' else 'jpg'
    parts.extend([
        (f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="photo.{extension}"\r\n'
         f'Content-Type: {mime}\r\n\r\n').encode(),
        data,
        f'\r\n--{boundary}--\r\n'.encode(),
    ])
    return b''.join(parts), {'Content-Type': f'multipart/form-data; boundary={boundary}'}


def cache_key(bot_id, file_id):
    return hashlib.sha256((bot_id + '\0' + file_id).encode()).hexdigest()


def cache_file(telegram, root, bot_id, file_id, limit):
    target = root / (cache_key(bot_id, file_id) + '.img')
    if target.is_file():
        return
    temporary = None
    try:
        data = telegram.download_photo(file_id, limit)
        if not image_type(data) or len(data) > limit:
            return
        with tempfile.NamedTemporaryFile(dir=root, prefix=target.stem+'-', suffix='.partial', delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(data)
        if os.name != 'nt':
            temporary.chmod(0o640)
        os.replace(temporary, target)
    except (TransportError, OSError, KeyError, TypeError, ValueError):
        logger().emit('CHAT_PHOTO_CACHE_FAILED', status='ERROR')
    finally:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                logger().emit('CHAT_PHOTO_CACHE_FAILED', status='ERROR')


def fetch_requested(telegram, root, bot_id):
    import json
    prefix = hashlib.sha256(bot_id.encode()).hexdigest()[:16]
    for request in (root / 'requests').glob(prefix + '-*.fetch'):
        if not re.fullmatch(prefix + r'-[0-9a-f]{64}\.fetch', request.name):
            continue
        try:
            if request.is_symlink() or not request.is_file() or request.stat().st_size > 2048:
                continue
            body = json.loads(request.read_text(encoding='utf8'))
            file_id = body.get('fileId') if isinstance(body, dict) else None
            if not isinstance(file_id, str) or not 1 <= len(file_id) <= 512 or body.get('botId') != bot_id:
                continue
            if request.name != prefix + '-' + cache_key(bot_id, file_id) + '.fetch':
                continue
            if time.time() - request.stat().st_mtime <= 86400:
                cache_file(telegram, root, bot_id, file_id, THUMBNAIL_LIMIT if body.get('thumbnail') is True else DOWNLOAD_LIMIT)
            request.unlink(missing_ok=True)
            return
        except (OSError, ValueError):
            # A newly written request may still be incomplete. Try it next cycle.
            continue


def mark_delivered(directory, key):
    if not directory or not Path(directory).is_absolute() or not isinstance(key, str) or not re.fullmatch(r'[0-9a-f]{64}', key):
        return
    root = Path(directory) / 'outgoing'
    source = root / (key + '.img')
    target = root / (key + '.sent')
    try:
        if source.is_file():
            os.utime(source, None)
            os.replace(source, target)
    except OSError:
        logger().emit('CHAT_PHOTO_CACHE_FAILED', status='ERROR')


def cleanup_due(root, previous, now=None):
    now = time.time() if now is None else now
    # The cutoff uses 02:00 Asia/Jakarta, independent of the host time zone.
    day = (datetime.fromtimestamp(now, timezone(timedelta(hours=7))) - timedelta(hours=2)).date()
    if previous == day:
        return previous
    for folder, pattern in ((root, r'[0-9a-f]{64}(?:\.img|-[a-z0-9_]+\.partial)'), (root / 'requests', r'[0-9a-f]{16}-[0-9a-f]{64}\.fetch'),
                            (root / 'outgoing', r'[0-9a-f]{64}(?:\.sent|\.[a-f0-9-]{36}\.partial)')):
        try:
            for file in folder.iterdir() if folder.is_dir() else ():
                if not re.fullmatch(pattern, file.name) or file.is_symlink():
                    continue
                if file.is_file() and now-file.stat().st_mtime > 86400:
                    file.unlink(missing_ok=True)
        except OSError:
            logger().emit('CHAT_PHOTO_CACHE_FAILED', status='ERROR')
    return day


def valid_file_path(value):
    return (isinstance(value, str) and len(value) <= 512
            and all(re.fullmatch(r'[A-Za-z0-9_.-]+', segment) and segment not in ('.', '..')
                    for segment in value.split('/')))
