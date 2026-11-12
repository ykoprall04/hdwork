import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('backup_fixture',Path(__file__).resolve().parents[2]/'scripts/backup-courier-v2-journal.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class PreparationBackupTests(unittest.TestCase):
    def test_live_wal_committed_pages_are_folded_and_v1_upgrade_only_touches_copy(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);live=root/'live';backup=root/'backup';live.mkdir();backup.mkdir();source=live/'courier.sqlite3';c=sqlite3.connect(source);c.execute('PRAGMA journal_mode=WAL')
            c.executescript("CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE updates(seq INTEGER PRIMARY KEY,update_id TEXT UNIQUE,hash TEXT,payload TEXT,state TEXT,reason TEXT,attempts INT DEFAULT 0,due REAL DEFAULT 0,receipt TEXT);CREATE TABLE deliveries(seq INTEGER PRIMARY KEY,delivery_id TEXT UNIQUE,hash TEXT,success_id TEXT,ack TEXT,due REAL DEFAULT 0,attempts INT DEFAULT 0,state TEXT);")
            c.executemany('INSERT INTO metadata VALUES (?,?)',[('bot_id','sandbox'),('token_fingerprint','f'*64),('offset','123')]);ack=json.dumps({'delivery_id':'12345678-1234-1234-1234-123456789abc','lease_token':'PRIVATE_LEASE','result':{'result':'sent','telegram_message_id':'55'}});c.execute('INSERT INTO deliveries VALUES (1,?,?,?,?,0,0,?)',('12345678-1234-1234-1234-123456789abc','h'*64,'55',ack,'ACK_PENDING'));c.commit();self.assertTrue(Path(str(source)+'-wal').exists())
            c.execute("INSERT INTO updates(seq,update_id,hash,payload,state) VALUES (1,'999','private-hash','SYNTHETIC_PRIVATE','PENDING')")
            result=module.prepare(source,backup/'courier.sqlite3','sandbox');self.assertEqual(result['integrity'],'PASS');self.assertTrue(c.in_transaction);self.assertEqual(result['inboxStates'],{});self.assertTrue(result['protocolInvariantsPreserved']);self.assertTrue(result['sourceSidecars']['-wal']['exists']);self.assertTrue(result['additiveUpgradeRequired']);self.assertNotIn('PRIVATE_LEASE',json.dumps(result));self.assertNotIn('SYNTHETIC_PRIVATE',json.dumps(result));self.assertFalse(result['productionJournalChanged']);self.assertNotIn('last_result',{r[1] for r in c.execute('PRAGMA table_info(deliveries)')});self.assertEqual(c.execute('SELECT ack FROM deliveries').fetchone()[0],ack);self.assertEqual(c.execute("SELECT value FROM metadata WHERE key='offset'").fetchone()[0],'123');c.close()
    def test_wrong_identity_refuses_preparation(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);a=root/'live';b=root/'backup';a.mkdir();b.mkdir();c=sqlite3.connect(a/'courier.sqlite3');c.execute('CREATE TABLE metadata(key,value)');c.execute("INSERT INTO metadata VALUES ('bot_id','other')");c.commit();c.close()
            with self.assertRaisesRegex(ValueError,'IDENTITY'):module.prepare(a/'courier.sqlite3',b/'courier.sqlite3','sandbox')
