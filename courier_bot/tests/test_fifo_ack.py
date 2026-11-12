import copy
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import Mock
from courier.journal import Journal
from courier.http import TransportError
from courier.durable_runner import DurableCourier
from courier.clients import InternalClient
from courier.lock import PollingLock
from courier.reconcile import main as reconcile

A='10000001-1000-4000-8000-000000000001'
B='10000001-1000-4000-8000-000000000002'
def job(identity=A,reply='11'):
    return {'delivery_id':identity,'lease_token':'10000002-1000-4000-8000-000000000001','attempt':1,'payload':{'method':'sendMessage','chat_id':'-1001','telegram_thread_id':None,'thread_mode':'non_topic','reply_to_message_id':reply,'text':'SYNTHETIC_PRIVATE_CHAT'}}

class FifoAckTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.file=Path(self.temp.name)/'journal.sqlite';self.now=1000
        self.j=Journal(str(self.file),'sandbox','a'*64,clock=lambda:self.now)
    def tearDown(self):
        self.j.close();self.temp.cleanup()
    def runner(self,sender):
        api=Mock();api.worker={'id':'worker','lease_token':'PRIVATE'};api.claim.return_value=[]
        tg=Mock();tg.send.return_value=99
        policy=Mock();policy.dispatch_authorization_required=False
        ack=Mock();ack.settle.side_effect=sender
        r=DurableCourier(tg,api,self.j,policy,Mock(),send=True,fifo_ack=True,ack_internal=ack,clock=lambda:self.now)
        return r,tg,api
    def wait_result(self,r):
        if r.ack_pump.pending is None:
            return
        deadline=time.monotonic()+2
        while r.ack_pump.completed is None and time.monotonic()<deadline:time.sleep(.001)
        self.assertIsNotNone(r.ack_pump.completed)
    def test_slow_ack_does_not_block_another_conversation_or_touch_sqlite_from_thread(self):
        started=threading.Event();release=threading.Event();finished=threading.Event()
        def settle(*args):started.set();release.wait(10);finished.set();return {'ok':True}
        r,tg,api=self.runner(settle);api.claim.side_effect=[[job()],[job(B,'22')],[]]
        try:
            r.run_once();self.assertTrue(started.wait(1));self.assertEqual(tg.send.call_count,1)
            r.run_once();self.assertEqual(tg.send.call_count,2);self.assertFalse(finished.is_set())
            release.set();self.wait_result(r);r.flush_ack()
            self.assertEqual(tg.send.call_count,2)
        finally:release.set();r.close()
    def test_due_ack_is_not_blocked_by_another_ack_backoff_and_attempt_limit_holds_evidence(self):
        for item in [job(),job(B,'22')]:self.j.begin_delivery(item,strict=True);self.j.delivery_result(item,{'result':'sent','telegram_message_id':'99'})
        first=self.j.next_ack(independent=True);self.j.defer_ack(first,max_attempts=8,retry_after=60)
        self.assertEqual(self.j.next_ack(independent=True)['delivery_id'],B)
        self.j.finish_ack(self.j.next_ack(independent=True))
        for _ in range(7):self.now+=301;row=self.j.next_ack(independent=True);self.j.defer_ack(row,max_attempts=8)
        self.assertIsNone(self.j.next_ack(independent=True));row=self.j.db.execute('SELECT * FROM deliveries WHERE delivery_id=?',(A,)).fetchone();self.assertEqual(row['state'],'ACK_REVIEW');self.assertEqual(row['success_id'],'99');self.assertIsNotNone(row['ack'])
    def test_success_cache_and_pending_ack_survive_restart_without_repeat_telegram(self):
        item=job();self.j.begin_delivery(item,strict=True);self.j.delivery_result(item,{'result':'sent','telegram_message_id':'99'});self.j.close();self.j=Journal(str(self.file),'sandbox','a'*64,clock=lambda:self.now)
        r,tg,api=self.runner(lambda *_:{'ok':True});api.claim.return_value=[item]
        try:r.run_once();self.assertEqual(tg.send.call_count,0);self.assertEqual(self.j.db.execute('SELECT success_id FROM deliveries').fetchone()[0],'99')
        finally:r.close();self.wait_result(r)
    def test_crash_window_is_uncertain_and_never_automatically_replayed(self):
        item=job();self.j.begin_delivery(item,strict=True);self.j.close();self.j=Journal(str(self.file),'sandbox','a'*64,clock=lambda:self.now)
        r,tg,api=self.runner(lambda *_:{'ok':True});api.claim.return_value=[item]
        try:r.run_once();self.assertEqual(tg.send.call_count,0);result=json.loads(self.j.db.execute('SELECT last_result FROM deliveries').fetchone()[0]);self.assertEqual(result['error_code'],'NETWORK')
        finally:r.close();self.wait_result(r)
    def test_stale_ack_completion_cannot_erase_new_attempt_ack(self):
        item=job();self.j.begin_delivery(item,strict=True);self.j.delivery_result(item,{'result':'retry','error_code':'RATE_LIMIT','retry_after':2});old=self.j.next_ack(independent=True)
        fresh=copy.deepcopy(item);fresh['lease_token']='10000003-1000-4000-8000-000000000001';self.j.begin_delivery(fresh,strict=True);self.j.delivery_result(fresh,{'result':'sent','telegram_message_id':'100'})
        self.assertFalse(self.j.finish_ack(old));self.assertEqual(self.j.defer_ack(old,max_attempts=8),'SUPERSEDED');self.assertEqual(json.loads(self.j.next_ack(independent=True)['ack'])['lease_token'],fresh['lease_token'])
    def test_permanent_ack_conflict_keeps_cached_success_for_manual_reconciliation(self):
        r,tg,api=self.runner(lambda *_:(_ for _ in ()).throw(TransportError(409)));api.claim.return_value=[job()]
        try:
            r.run_once();self.wait_result(r);api.claim.return_value=[];r.flush_ack();row=self.j.db.execute('SELECT * FROM deliveries').fetchone();self.assertEqual(row['state'],'ACK_REVIEW');self.assertEqual(row['success_id'],'99');self.assertIsNotNone(row['ack']);self.assertEqual(tg.send.call_count,1)
        finally:r.close()
    def test_offline_reconciliation_requires_lock_and_preserves_audit(self):
        item=job();self.j.begin_delivery(item,strict=True);row=self.j.db.execute('SELECT * FROM deliveries').fetchone();lock=PollingLock(Path(self.temp.name),'a'*64)
        try:
            with self.assertRaisesRegex(ValueError,'another_courier'):reconcile(['--journal',str(self.file),'--lock-directory',self.temp.name,'--list'])
        finally:lock.close()
        self.j.verified_receipt(A,row['hash'],'100','e'*64);self.assertEqual(self.j.db.execute('SELECT action FROM reconciliation_audit').fetchone()[0],'VERIFIED_RECEIPT');self.assertEqual(self.j.begin_delivery(item,strict=True),'100')
    def test_protocol_rejects_legacy_backend_before_any_claim(self):
        transport=Mock();transport.post.return_value={'ok':True,'delivery_protocol':'legacy'}
        config=Mock();config.bot_id='sandbox';config.server='http://127.0.0.1:3901';config.service_key='synthetic-key'
        client=InternalClient(config,transport,fifo_ack=True)
        with self.assertRaises(TransportError):client.claim()
        self.assertEqual(transport.post.call_count,1);self.assertTrue(transport.post.call_args.args[0].endswith('/capabilities'))

    def test_fifo_mode_rejects_receive_only_configuration_before_network(self):
        from courier.runtime_config import RuntimeConfig
        with self.assertRaisesRegex(ValueError,'fifo_ack_requires_verified_sender'):
            RuntimeConfig.from_env({'COURIER_INTEGRATION_ENABLED':'true','COURIER_FIFO_ACK_ENABLED':'true','COURIER_SEND_ENABLED':'false'})

    def test_scheduler_429_cools_only_that_group_before_claim(self):
        from courier.scheduler import Scheduler
        r,tg,api=self.runner(lambda *_:{'ok':True});r.scheduler=Scheduler(self.j,clock=lambda:self.now)
        first=job();other=job(B,'22');other['payload']['chat_id']='-1002';api.claim.side_effect=[[first],[other]];tg.send.side_effect=[TransportError(429,30),100]
        try:
            r.run_once();self.assertEqual(r.cooldown_until,0);self.now+=1;r.run_once();self.assertIn('-1001',api.claim.call_args.kwargs['exclude_chats']);self.assertEqual(tg.send.call_count,2)
        finally:r.close()
