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
            CREATE TABLE IF NOT EXISTS reconciliation_audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, delivery_id TEXT NOT NULL, payload_hash TEXT NOT NULL, action TEXT NOT NULL, evidence_sha256 TEXT, at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS deliveries (
                seq INTEGER PRIMARY KEY AUTOINCREMENT, delivery_id TEXT NOT NULL UNIQUE,
                hash TEXT NOT NULL, success_id TEXT, ack TEXT, due REAL NOT NULL DEFAULT 0,
                attempts INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL
            );
        ''')
        columns = {row['name'] for row in self.db.execute('PRAGMA table_info(deliveries)')}
        for name in ('last_result', 'last_lease_token'):
            if name not in columns:
                self.db.execute('ALTER TABLE deliveries ADD COLUMN '+name+' TEXT')
        for name in ('ack_since', 'ack_alert_at'):
            if name not in columns:
                self.db.execute('ALTER TABLE deliveries ADD COLUMN '+name+' REAL')
        self.db.execute("UPDATE deliveries SET ack_since=? WHERE ack IS NOT NULL AND ack_since IS NULL", (self.clock(),))
        self.db.execute('CREATE INDEX IF NOT EXISTS ack_due ON deliveries(state,due,seq)')
        self.db.commit()
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
        with self.db:
            self.db.execute('UPDATE updates SET state=?,reason=?,attempts=?,due=? WHERE seq=?',
                            ('QUARANTINED' if terminal else 'PENDING', 'backend_rejected' if terminal else 'backend_unavailable',
                             attempts, self.clock() + min(300, max(retry_after, 2 ** min(attempts, 9))), row['seq']))

    def begin_delivery(self, delivery, strict=False):
        fingerprint = hashlib.sha256(encoded(delivery['payload']).encode()).hexdigest()
        with self.db:
            row = self.db.execute('SELECT * FROM deliveries WHERE delivery_id=?', (delivery['delivery_id'],)).fetchone()
            if row and row['hash'] != fingerprint:
                raise ValueError('outbox_payload_conflict')
            if row and row['success_id']:
                return row['success_id']
            if strict and row:
                previous = json.loads(row['last_result']) if row['last_result'] else {}
                if not (previous.get('result') == 'retry' and previous.get('error_code') == 'RATE_LIMIT'):
                    from .http import TransportError
                    raise TransportError()  # Crash window/ambiguous history: never repeat Telegram send.
            self.db.execute("INSERT INTO deliveries(delivery_id,hash,state) VALUES (?,?,'SENDING') ON CONFLICT(delivery_id) DO UPDATE SET state='SENDING'", (delivery['delivery_id'], fingerprint))
            self.db.execute('UPDATE deliveries SET last_lease_token=? WHERE delivery_id=?', (delivery['lease_token'], delivery['delivery_id']))
        return None

    def delivery_result(self, delivery, result):
        ack = {'delivery_id': delivery['delivery_id'], 'lease_token': delivery['lease_token'], 'result': result}
        with self.db:
            self.db.execute("UPDATE deliveries SET success_id=COALESCE(?,success_id),ack=?,last_result=?,last_lease_token=?,ack_since=?,ack_alert_at=NULL,due=0,attempts=0,state='ACK_PENDING' WHERE delivery_id=?",
                            (result.get('telegram_message_id') if result['result'] == 'sent' else None, encoded(ack), encoded(result), delivery['lease_token'], self.clock(), delivery['delivery_id']))

    def next_ack(self, independent=False):
        if independent:
            row = self.db.execute("SELECT * FROM deliveries WHERE ack IS NOT NULL AND state='ACK_PENDING' AND due<=? ORDER BY due,seq LIMIT 1", (self.clock(),)).fetchone()
            return dict(row) if row else None
        row = self.db.execute("SELECT * FROM deliveries WHERE ack IS NOT NULL ORDER BY seq LIMIT 1").fetchone()
        return dict(row) if row and row['due'] <= self.clock() else None

    def finish_ack(self, row):
        with self.db:
            changed = self.db.execute("UPDATE deliveries SET ack=NULL,state='SETTLED' WHERE seq=? AND ack=?", (row['seq'], row['ack']))
            return changed.rowcount == 1

    def defer_ack(self, row, retry_after=0, max_attempts=None, terminal=False):
        with self.db:
            attempts = row['attempts'] + 1
            state = 'ACK_REVIEW' if terminal or max_attempts is not None and attempts >= max_attempts else 'ACK_PENDING'
            changed = self.db.execute('UPDATE deliveries SET due=?,attempts=?,state=? WHERE seq=? AND ack=?', (self.clock() + min(300, max(retry_after, 2 ** min(attempts, 9))), attempts, state, row['seq'], row['ack']))
            return state if changed.rowcount == 1 else 'SUPERSEDED'

    def has_ack(self):
        return self.db.execute('SELECT 1 FROM deliveries WHERE ack IS NOT NULL LIMIT 1').fetchone() is not None

    def overdue_acks(self, age=60, interval=60):
        with self.db:
            rows = self.db.execute("SELECT delivery_id,ack_since FROM deliveries WHERE state IN ('ACK_PENDING','ACK_REVIEW') AND ack IS NOT NULL AND ack_since<=? AND (ack_alert_at IS NULL OR ack_alert_at<=?) ORDER BY ack_since LIMIT 10", (self.clock()-age, self.clock()-interval)).fetchall()
            for row in rows:
                self.db.execute('UPDATE deliveries SET ack_alert_at=? WHERE delivery_id=?', (self.clock(), row['delivery_id']))
            return [{'delivery_id':row['delivery_id'], 'age_ms':max(0,(self.clock()-row['ack_since'])*1000)} for row in rows]

    def reconciliation_items(self):
        return [dict(row) for row in self.db.execute("SELECT delivery_id,hash,state,attempts FROM deliveries WHERE state IN ('ACK_REVIEW','SENDING') ORDER BY seq")]

    def retry_reviewed_ack(self, delivery_id, expected_hash):
        with self.db:
            row = self.db.execute("SELECT * FROM deliveries WHERE delivery_id=? AND hash=? AND state='ACK_REVIEW'", (delivery_id, expected_hash)).fetchone()
            if not row or not row['ack']:
                raise ValueError('reviewed_ack_required')
            self.db.execute("UPDATE deliveries SET state='ACK_PENDING',attempts=0,due=0 WHERE delivery_id=?", (delivery_id,))
            self.db.execute("INSERT INTO reconciliation_audit(delivery_id,payload_hash,action,at) VALUES (?,?,'RETRY_ACK',?)", (delivery_id, expected_hash, self.clock()))

    def verified_receipt(self, delivery_id, expected_hash, telegram_message_id, evidence_sha256):
        import re
        if not re.fullmatch(r'[1-9]\d{0,9}', telegram_message_id) or int(telegram_message_id)>2147483647 or not re.fullmatch(r'[a-f0-9]{64}', evidence_sha256):
            raise ValueError('verified_receipt_evidence_required')
        with self.db:
            row = self.db.execute('SELECT * FROM deliveries WHERE delivery_id=? AND hash=?', (delivery_id, expected_hash)).fetchone()
            if not row or not row['last_lease_token'] or row['success_id'] and row['success_id'] != telegram_message_id:
                raise ValueError('receipt_binding_rejected')
            result = {'result':'sent', 'telegram_message_id':telegram_message_id, 'reconciliation':True, 'evidence_sha256':evidence_sha256}
            ack = {'delivery_id':delivery_id, 'lease_token':row['last_lease_token'], 'result':result}
            self.db.execute("UPDATE deliveries SET success_id=?,ack=?,last_result=?,state='ACK_PENDING',attempts=0,due=0 WHERE delivery_id=?", (telegram_message_id, encoded(ack), encoded(result), delivery_id))
            self.db.execute("INSERT INTO reconciliation_audit(delivery_id,payload_hash,action,evidence_sha256,at) VALUES (?,?,'VERIFIED_RECEIPT',?,?)", (delivery_id, expected_hash, evidence_sha256, self.clock()))

    def close(self):
        self.db.close()
