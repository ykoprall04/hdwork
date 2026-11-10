"""Seed only Telegram offset into a new journal; never replay old events or ACKs."""
import sqlite3
from pathlib import Path


def seed_offset(journal, source, bot_id, fingerprint, boundary):
    marker = journal.db.execute("SELECT value FROM metadata WHERE key='production_boundary'").fetchone()
    if marker:
        if marker['value'] != boundary:
            raise ValueError('production_boundary_changed')
        return
    if (journal.db.execute('SELECT COUNT(*) FROM updates').fetchone()[0] or
            journal.db.execute('SELECT COUNT(*) FROM deliveries').fetchone()[0]):
        raise ValueError('new_production_journal_required')
    source = Path(source)
    if not source.is_file() or source.is_symlink() or source.resolve() != source.absolute():
        raise ValueError('source_journal_rejected')
    old = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)
    try:
        old.execute('PRAGMA query_only=ON')
        old.execute('PRAGMA trusted_schema=OFF')
        metadata = dict(old.execute("SELECT key,value FROM metadata WHERE key IN ('bot_id','token_fingerprint','offset')"))
        if metadata.get('bot_id') != bot_id or metadata.get('token_fingerprint') != fingerprint:
            raise ValueError('source_journal_identity_mismatch')
        offset = metadata.get('offset')
        if offset is not None and (not offset.isdigit() or not 0 <= int(offset) <= 9007199254740991):
            raise ValueError('source_offset_invalid')
    finally:
        old.close()
    with journal.db:
        if offset is not None:
            journal.db.execute("INSERT INTO metadata(key,value) VALUES ('offset',?)", (offset,))
        journal.db.execute("INSERT INTO metadata(key,value) VALUES ('production_boundary',?)", (boundary,))
