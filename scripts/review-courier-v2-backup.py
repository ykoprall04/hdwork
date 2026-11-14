"""Read only the verified offline backup and optional metadata JSONL; no credentials."""
import argparse
from contextlib import closing
import hashlib
import json
import re
import sqlite3
from pathlib import Path

EXPECTED_PLAN = 'c48da7844ee8f854e247336c4dbb7305554224be8cbe2ed54d6ff5bab6ff084b'

def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1048576), b''):
            h.update(chunk)
    return h.hexdigest()

def review(directory, dead_file=None):
    directory = Path(directory).resolve(strict=True)
    plan_file = directory / 'preparation.json'
    if digest(plan_file) != EXPECTED_PLAN:
        raise ValueError('PREVIOUS_PREPARATION_HASH_MISMATCH')
    plan = json.loads(plan_file.read_text(encoding='utf-8-sig'))
    backup = directory / 'journal-backup' / 'courier.sqlite3'
    if backup.is_symlink() or backup.stat().st_nlink != 1 or digest(backup) != plan['backupSha256']:
        raise ValueError('BACKUP_HASH_MISMATCH')
    rows = []
    # immutable=1 is appropriate ONLY for this finalized standalone offline backup.
    with closing(sqlite3.connect(backup.as_uri() + '?mode=ro&immutable=1', uri=True)) as c:
        if c.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise ValueError('BACKUP_INTEGRITY_FAILED')
        if dead_file:
            lines = Path(dead_file).read_text(encoding='utf-8-sig').splitlines()
            if len(lines) > 1000:
                raise ValueError('METADATA_WINDOW_TOO_LARGE')
            for line in lines:
                if not line.strip():
                    continue
                item = json.loads(line)
                if not re.fullmatch(r'[a-fA-F0-9-]{36}', item.get('id', '')) or item.get('state') != 'DEAD':
                    raise ValueError('INVALID_DEAD_METADATA')
                found = c.execute('SELECT success_id IS NOT NULL,ack IS NOT NULL,state FROM deliveries WHERE delivery_id=?', (item['id'],)).fetchone()
                code = item.get('errorCode')
                safe_code = code if isinstance(code, str) and re.fullmatch(r'[A-Z_]{1,40}', code) else None
                ambiguous = safe_code in ('NETWORK','UNKNOWN','ECONNRESET','ETIMEDOUT','LEASE_EXPIRED')
                category = 'TELEGRAM_REJECTION' if safe_code in ('FORBIDDEN','RATE_LIMIT') else 'UNDETERMINED'
                recommendation = 'HOLD_NO_REPLAY; review audit evidence'
                if found and found[0]:
                    recommendation = 'HOLD_NO_REPLAY; cached Telegram result, review ACK evidence'
                elif ambiguous or item.get('telegramResultPresent'):
                    recommendation = 'HOLD_NO_REPLAY; delivery may have succeeded, reconcile evidence'
                # Explicit allowlist: never echo arbitrary imported fields or error text.
                rows.append({'id': item['id'], 'createdAtUtc': item.get('createdAtUtc') if isinstance(item.get('createdAtUtc'),str) and re.fullmatch(r'[0-9T:. Z+-]{10,40}',item['createdAtUtc']) else None,
                             'state':'DEAD', 'attempts':item['attempts'] if isinstance(item.get('attempts'),int) else None,
                             'errorCode':safe_code,'causeCategory':category,
                             'journalRowPresentAtBackup': bool(found), 'journalCachedSuccess':bool(found and found[0]),
                             'journalAckPending':bool(found and found[1]), 'recommendation':recommendation})
    if digest(backup) != plan['backupSha256']:
        raise ValueError('BACKUP_CHANGED_DURING_REVIEW')
    return {'status':'OFFLINE_BACKUP_REVIEW_PASS','integrity':'PASS','backupSha256':plan['backupSha256'],
            'productionAccessed':False,'deadRows':rows,'perMessageReviewPending':dead_file is None,
            'absenceOfCachedSuccessProvesNotSent':False,'snapshotMayBeOlderThanDatabase':True}

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--directory',required=True)
    parser.add_argument('--dead-metadata')
    args=parser.parse_args()
    try:
        print(json.dumps(review(args.directory,args.dead_metadata),indent=2))
    except Exception:
        print(json.dumps({'status':'OFFLINE_BACKUP_REVIEW_FAILED','productionChanged':False}))
        raise SystemExit(1)
