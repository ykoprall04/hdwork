"""Private local SQLite WAL journal. Never stores the Telegram token or logs payloads."""
import hashlib
import json
import os
import sqlite3
import time


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


class Journal:
    def __init__(self, path, bot_id, token_fingerprint, clock=time.time):
        self.clock = clock
        self.db = sqlite3.connect(path, timeout=5)
        if path != ':memory:' and os.name != 'nt':
            os.chmod(path, 0o600)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('PRAGMA trusted_schema=OFF')
        self.db.execute('PRAGMA cache_size=-4096')
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS updates (
                seq INTEGER PRIMARY KEY AUTOINCREMENT, update_id TEXT NOT NULL UNIQUE,
                hash TEXT NOT NULL, payload TEXT, state TEXT NOT NULL, reason TEXT,
                attempts INTEGER NOT NULL DEFAULT 0, due REAL NOT NULL DEFAULT 0, receipt TEXT
            );
            CREATE INDEX IF NOT EXISTS pending_updates ON updates(state,seq);
            CREATE TABLE IF NOT EXISTS deliveries (
                seq INTEGER PRIMARY KEY AUTOINCREMENT, delivery_id TEXT NOT NULL UNIQUE,
                hash TEXT NOT NULL, success_id TEXT, ack TEXT, due REAL NOT NULL DEFAULT 0,
                attempts INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL
            );
        ''')
        try:
            with self.db:
                for key, value in [('bot_id', bot_id), ('token_fingerprint', token_fingerprint)]:
                    old = self.db.execute('SELECT value FROM metadata WHERE key=?', (key,)).fetchone()
                    if old and old['value'] != value:
                        raise ValueError('journal_identity_mismatch')
                    self.db.execute('INSERT OR IGNORE INTO metadata VALUES (?,?)', (key, value))
        except Exception:
            self.db.close()
            raise

    @property
    def offset(self):
        row = self.db.execute("SELECT value FROM metadata WHERE key='offset'").fetchone()
        return int(row['value']) if row else None

    def append(self, updates, prepare):
        if not isinstance(updates, list) or len(updates) > 100:
            raise ValueError('updates_invalid')
        source_allowed = getattr(getattr(prepare, '__self__', None), 'allows_source', None)
        if not callable(source_allowed):
            raise ValueError('source_allowlist_required')
        checkpoint = self.offset
        with self.db:
            for update in updates:
                uid = update.get('update_id') if isinstance(update, dict) else None
                if type(uid) is not int or not 0 <= uid <= 9007199254740991:
                    raise ValueError('update_id_invalid')
                if not source_allowed(update):
                    # Discard before serialization/hash/projection/payload storage.
                    # Keep only the global offset needed to avoid repeated polling.
                    checkpoint = max(checkpoint or 0, uid + 1)
                    continue
                raw = encoded(update)
                fingerprint = hashlib.sha256(raw.encode()).hexdigest()
                existing = self.db.execute('SELECT hash FROM updates WHERE update_id=?', (str(uid),)).fetchone()
                if existing:
                    if existing['hash'] != fingerprint:
                        raise ValueError('update_conflict')
                    continue
                if checkpoint is not None and uid < checkpoint:
                    raise ValueError('unexpected_update_order')
                payload, state, reason = None, 'QUARANTINED', 'projection_invalid'
                if len(raw.encode()) <= 65536:
                    try:
                        payload, state, reason = prepare(update)
                        if payload is not None and len(encoded(payload).encode()) > 60000:
                            payload, state, reason = None, 'QUARANTINED', 'envelope_too_large'
                    except (ValueError, TypeError, KeyError, IndexError):
                        pass
                    stored = encoded(payload) if payload is not None and state == 'PENDING' else None
                else:
                    stored, reason = None, 'update_too_large'
                if state not in ('PENDING', 'IGNORED', 'QUARANTINED'):
                    raise ValueError('projection_state_invalid')
                self.db.execute('INSERT INTO updates(update_id,hash,payload,state,reason) VALUES (?,?,?,?,?)',
                                (str(uid), fingerprint, stored, state, reason))
                checkpoint = uid + 1
            if checkpoint is not None:
                self.db.execute("INSERT INTO metadata(key,value) VALUES ('offset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(checkpoint),))

    def next_event(self):
        # Strict FIFO: a backoff at the head does not reorder later submissions.
        row = self.db.execute("SELECT * FROM updates WHERE state='PENDING' ORDER BY seq LIMIT 1").fetchone()
        return dict(row) if row and row['due'] <= self.clock() else None

    def accepted(self, row, receipt):
        if not isinstance(receipt, str) or not receipt or len(receipt) > 100:
            raise ValueError('persistent_receipt_required')
        with self.db:
            self.db.execute("UPDATE updates SET state='ACKED',receipt=? WHERE seq=?", (receipt, row['seq']))

    def defer(self, row, terminal=False, retry_after=0):
        attempts = row['attempts'] + 1
        terminal = terminal or attempts >= 8
        with self.db:
            self.db.execute('UPDATE updates SET state=?,reason=?,attempts=?,due=? WHERE seq=?',
                            ('QUARANTINED' if terminal else 'PENDING', 'backend_rejected' if terminal else 'backend_unavailable',
                             attempts, self.clock() + min(300, max(retry_after, 2 ** min(attempts, 9))), row['seq']))

    def begin_delivery(self, delivery):
        fingerprint = hashlib.sha256(encoded(delivery['payload']).encode()).hexdigest()
        with self.db:
            row = self.db.execute('SELECT * FROM deliveries WHERE delivery_id=?', (delivery['delivery_id'],)).fetchone()
            if row and row['hash'] != fingerprint:
                raise ValueError('outbox_payload_conflict')
            if row and row['success_id']:
                return row['success_id']
            if row and row['state'] == 'SENDING':
                # The previous process may have sent before crashing. Never resend.
                from .http import TransportError
                raise TransportError(400)
            self.db.execute("INSERT INTO deliveries(delivery_id,hash,state) VALUES (?,?,'SENDING') ON CONFLICT(delivery_id) DO UPDATE SET state='SENDING'", (delivery['delivery_id'], fingerprint))
        return None

    def delivery_result(self, delivery, result):
        ack = {'delivery_id': delivery['delivery_id'], 'lease_token': delivery['lease_token'], 'result': result}
        with self.db:
            self.db.execute("UPDATE deliveries SET success_id=COALESCE(?,success_id),ack=?,due=0,attempts=0,state='ACK_PENDING' WHERE delivery_id=?",
                            (result.get('telegram_message_id') if result['result'] == 'sent' else None, encoded(ack), delivery['delivery_id']))

    def next_ack(self):
        row = self.db.execute("SELECT * FROM deliveries WHERE ack IS NOT NULL ORDER BY seq LIMIT 1").fetchone()
        return dict(row) if row and row['due'] <= self.clock() else None

    def finish_ack(self, row):
        with self.db:
            self.db.execute("UPDATE deliveries SET ack=NULL,state='SETTLED' WHERE seq=?", (row['seq'],))

    def defer_ack(self, row, retry_after=0):
        with self.db:
            attempts = row['attempts'] + 1
            self.db.execute('UPDATE deliveries SET due=?,attempts=? WHERE seq=?', (self.clock() + min(300, max(retry_after, 2 ** min(attempts, 9))), attempts, row['seq']))

    def has_ack(self):
        return self.db.execute('SELECT 1 FROM deliveries WHERE ack IS NOT NULL LIMIT 1').fetchone() is not None

    def close(self):
        self.db.close()
