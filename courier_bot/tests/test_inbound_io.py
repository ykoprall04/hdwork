import copy
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock
from courier.durable_runner import DurableCourier
from courier.journal import Journal
from courier.groups import IngressPolicy
from courier.scheduler import Scheduler
from test_durable import GROUPS,update
from test_fifo_ack import job,A,B
class InboundIoTests(unittest.TestCase):
    def test_long_poll_and_forward_http_do_not_wait_on_outbound_or_advance_offset_early(self):
        with tempfile.TemporaryDirectory() as directory:
            now=[1000];j=Journal(directory+'/journal.sqlite','sandbox','fingerprint',clock=lambda:now[0]);pollEntered=threading.Event();pollRelease=threading.Event();forwardEntered=threading.Event();forwardRelease=threading.Event()
            incoming=Mock()
            def poll(offset,timeout):
                self.assertIsNone(offset);self.assertEqual(timeout,25);pollEntered.set();pollRelease.wait(10);return [update()]
            incoming.updates.side_effect=poll
            sender=Mock();sender.send.return_value=90;api=Mock();api.worker={};first=job();other=job(B,'22');other['payload']['chat_id']='-1002';api.claim.side_effect=[[first],[other],[]];ack=Mock();ack.settle.return_value={'ok':True};forward=Mock()
            def event(body):forwardEntered.set();forwardRelease.wait(10);return {'ok':True,'receipt_id':'durable-fixture'}
            forward.event.side_effect=event
            r=DurableCourier(sender,api,j,IngressPolicy('sandbox','HDWorkOpsBot',copy.deepcopy(GROUPS)),Mock(),poll=True,send=True,fifo_ack=True,ack_internal=ack,scheduler=Scheduler(j,clock=lambda:now[0]),inbound_telegram=incoming,forward_internal=forward,clock=lambda:now[0])
            try:
                r.run_once();self.assertTrue(pollEntered.wait(1));self.assertEqual(sender.send.call_count,1);self.assertIsNone(j.offset)
                pollRelease.set();deadline=time.monotonic()+2
                while r.poll_pump.pump.completed is None and time.monotonic()<deadline:time.sleep(.001)
                now[0]+=1;r.run_once();self.assertEqual(j.offset,2);self.assertTrue(forwardEntered.wait(1));self.assertEqual(sender.send.call_count,2);self.assertFalse(forwardRelease.is_set());self.assertEqual(incoming.updates.call_count,1)
                forwardRelease.set()
            finally:pollRelease.set();forwardRelease.set();r.close();j.close()
    def test_conflicting_poller_stops_only_inbound_component(self):
        from courier.inbound_io import PollPump
        from courier.http import TransportError
        client=Mock();client.updates.side_effect=TransportError(409);now=[0];pump=PollPump(client,lambda:None,clock=lambda:now[0]);pump.take(None)
        deadline=time.monotonic()+1
        while pump.pump.completed is None and time.monotonic()<deadline:time.sleep(.001)
        self.assertIsNotNone(pump.take(None)[1]);now[0]=100000;pump.take(None);self.assertEqual(client.updates.call_count,1);pump.close()
