import os
import unittest
from unittest.mock import patch
from courier.groups import IngressPolicy
from courier.journal import Journal


class TrialIngressTests(unittest.TestCase):
    def setUp(self):
        self.policy = IngressPolicy('hdworkopsbot-testing', 'HDWorkOpsBot', [
            dict(chatId='-5436357946', threadId=None, threadMode='non_topic',
                 profile='TIAL1', commands=['order'])])
        self.text = ('/order@HDWorkOpsBot\nSC/IN:TRIAL-AO20261109A\n'
                     'NO INET:000000001234\nSN ONT:DUMMY-ONT\nSTO:ABC\n'
                     'KETERANGAN:' + 'dummy panjang ' * 240 + '\nNIK:DUMMY')

    def update(self, uid=1, chat=-5436357946, date=200):
        return dict(update_id=uid, message=dict(message_id=10, date=date,
                    chat=dict(id=chat), text=self.text, **{'from': dict(id=123)}))

    def test_long_order_allowlist_cutover_and_replay(self):
        journal = Journal(':memory:', 'hdworkopsbot-testing', 'test-fingerprint')
        with patch.dict(os.environ, {'COURIER_TRIAL_NOT_BEFORE': '100'}):
            journal.append([self.update(1, chat=-999), self.update(2, date=99),
                            self.update(3)], self.policy.prepare)
            journal.append([self.update(3)], self.policy.prepare)
        self.assertEqual(journal.db.execute('SELECT COUNT(*) FROM updates').fetchone()[0], 2)
        self.assertEqual(journal.db.execute("SELECT COUNT(*) FROM updates WHERE state='PENDING'").fetchone()[0], 1)
        self.assertIn('dummy panjang', journal.next_event()['payload'])
        self.assertEqual(journal.offset, 4)
        journal.close()

    def test_retry_budget_quarantines_without_losing_evidence(self):
        now = [1000]
        journal = Journal(':memory:', 'hdworkopsbot-testing', 'test', clock=lambda: now[0])
        journal.append([self.update()], self.policy.prepare)
        for attempt in range(8):
            row = journal.next_event()
            self.assertIsNotNone(row)
            journal.defer(row)
            now[0] += 301
        self.assertIsNone(journal.next_event())
        row = journal.db.execute('SELECT * FROM updates').fetchone()
        self.assertEqual(row['state'], 'QUARANTINED')
        self.assertEqual(row['attempts'], 8)
        self.assertIsNotNone(row['payload'])
        journal.close()
