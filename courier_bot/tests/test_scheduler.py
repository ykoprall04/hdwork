import tempfile
import unittest
from courier.journal import Journal
from courier.scheduler import Scheduler,ApiBudget,LocalBudget
class SchedulerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.now=1000;self.j=Journal(self.temp.name+'/journal.sqlite','sandbox','fingerprint',clock=lambda:self.now)
    def tearDown(self):self.j.close();self.temp.cleanup()
    def test_dynamic_groups_pacing_and_restart_are_durable(self):
        s=Scheduler(self.j,clock=lambda:self.now);s.reserve('-1001');self.assertIn('-1001',s.blocked());self.now+=1;s.reserve('-9999');self.assertEqual(set(s.blocked()),{'-1001','-9999'});restarted=Scheduler(self.j,clock=lambda:self.now)
        with self.assertRaises(LocalBudget):restarted.reserve('-1001')
        self.now+=3;restarted.reserve('-1001')
    def test_429_is_group_local_and_honors_retry_after(self):
        s=Scheduler(self.j,clock=lambda:self.now);s.reserve('-1');s.limited('-1',30);self.now+=1;s.reserve('-2');self.assertLess(s.group('-1')['rate'],18);self.now+=20;self.assertIn('-1',s.blocked());self.assertNotIn('-2',s.blocked());self.now+=10;s.reserve('-1')
    def test_global_bound_and_idle_fallback(self):
        s=Scheduler(self.j,clock=lambda:self.now);s.reserve('-1')
        with self.assertRaises(LocalBudget):s.reserve('-2')
        self.assertEqual(s.delay(True),1);self.now+=10;self.assertEqual(s.delay(False),2)
    def test_internal_budget_caps_270_with_ack_and_lease_reservations(self):
        b=ApiBudget(clock=lambda:self.now)
        for _ in range(170):b.take('/outbox/claim')
        with self.assertRaises(LocalBudget):b.take('/routing')
        for _ in range(90):b.take('/outbox/id/result')
        for _ in range(10):b.take('/worker/renew')
        with self.assertRaises(LocalBudget):b.take('/worker/renew')
        self.now+=60;b.take('/routing')
