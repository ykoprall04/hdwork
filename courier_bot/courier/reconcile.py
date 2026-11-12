"""Offline local reconciliation. Requires the existing OS polling lock; never sends HTTP/Telegram."""
import argparse
import json
import re
import sqlite3
from contextlib import closing
from pathlib import Path
from .journal import Journal
from .lock import PollingLock

def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--journal', required=True)
    parser.add_argument('--lock-directory', required=True)
    parser.add_argument('--delivery-id')
    parser.add_argument('--expected-hash')
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--list', action='store_true')
    action.add_argument('--retry-ack', action='store_true')
    action.add_argument('--verified-receipt')
    parser.add_argument('--evidence-sha256')
    parser.add_argument('--confirm-original-chat-topic-reply', action='store_true')
    args = parser.parse_args(argv)
    file = Path(args.journal)
    directory = Path(args.lock_directory)
    if not file.is_absolute() or file.is_symlink() or not file.is_file() or not directory.is_absolute() or directory.is_symlink() or not directory.is_dir():
        raise ValueError('existing_private_paths_required')
    with closing(sqlite3.connect(file.as_uri()+'?mode=ro', uri=True)) as reader:
        metadata = dict(reader.execute("SELECT key,value FROM metadata WHERE key IN ('bot_id','token_fingerprint')"))
    if not re.fullmatch(r'[a-f0-9]{64}', metadata.get('token_fingerprint','')) or file.stat().st_nlink != 1 or file.resolve() != file.absolute() or directory.resolve() != directory.absolute():
        raise ValueError('journal_identity_or_path_rejected')
    lock = PollingLock(directory, metadata['token_fingerprint'])
    journal = None
    try:
        journal = Journal(str(file), metadata['bot_id'], metadata['token_fingerprint'])
        if args.list:
            print(json.dumps(journal.reconciliation_items()))
            return
        if not re.fullmatch(r'[a-fA-F0-9-]{36}', args.delivery_id or '') or not re.fullmatch(r'[a-f0-9]{64}', args.expected_hash or ''):
            raise ValueError('exact_delivery_and_payload_hash_required')
        if args.retry_ack:
            journal.retry_reviewed_ack(args.delivery_id, args.expected_hash)
        else:
            if not args.confirm_original_chat_topic_reply:
                raise ValueError('manual_original_route_verification_required')
            journal.verified_receipt(args.delivery_id, args.expected_hash, args.verified_receipt, args.evidence_sha256 or '')
        print(json.dumps({'status':'RECONCILIATION_RECORDED_NO_SEND', 'delivery_id':args.delivery_id}))
    finally:
        if journal:
            journal.close()
        lock.close()

if __name__ == '__main__':
    main()
