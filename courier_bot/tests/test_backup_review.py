import importlib.util
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

spec=importlib.util.spec_from_file_location('backup_review',Path(__file__).resolve().parents[2]/'scripts/review-courier-v2-backup.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ReviewTests(unittest.TestCase):
    def test_cached_sent_and_ambiguous_are_held_and_private_fields_are_not_echoed(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); (root/'journal-backup').mkdir(); db=root/'journal-backup/courier.sqlite3'
            first='11111111-1111-4111-8111-111111111111';second='22222222-2222-4222-8222-222222222222'
            with closing(sqlite3.connect(db)) as c:
                c.execute('CREATE TABLE deliveries(delivery_id TEXT,success_id TEXT,ack TEXT,state TEXT)')
                c.execute('INSERT INTO deliveries VALUES (?,?,?,?)',(first,'123','PRIVATE_LEASE','SETTLED'))
                c.commit()
            plan=root/'preparation.json';plan.write_text(json.dumps({'backupSha256':module.digest(db)}))
            old=module.EXPECTED_PLAN; module.EXPECTED_PLAN=module.digest(plan)
            try:
                data=root/'dead.jsonl'
                data.write_text('\n'.join(json.dumps({'id':i,'createdAtUtc':'2026-11-12 00:00:00.000','state':'DEAD','attempts':1,'errorCode':'NETWORK','body':'PRIVATE_CHAT','token':'PRIVATE_TOKEN'}) for i in [first,second]))
                before=db.read_bytes();report=module.review(root,data)
                self.assertEqual(db.read_bytes(),before)
                self.assertTrue(report['deadRows'][0]['journalCachedSuccess'])
                self.assertFalse(report['deadRows'][1]['journalRowPresentAtBackup'])
                self.assertTrue(all('HOLD_NO_REPLAY' in row['recommendation'] for row in report['deadRows']))
                for private in ('PRIVATE_CHAT','PRIVATE_TOKEN','PRIVATE_LEASE','123'):
                    self.assertNotIn(private,json.dumps(report))
                db.write_bytes(db.read_bytes()+b'changed')
                with self.assertRaisesRegex(ValueError,'BACKUP_HASH_MISMATCH'):module.review(root,data)
            finally:module.EXPECTED_PLAN=old

    def test_unverified_preparation_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d)/'preparation.json').write_text('{}')
            with self.assertRaisesRegex(ValueError,'PREVIOUS_PREPARATION_HASH_MISMATCH'):module.review(d)

if __name__=='__main__':unittest.main()
