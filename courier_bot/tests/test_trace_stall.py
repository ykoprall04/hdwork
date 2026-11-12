import tempfile
import unittest
from unittest.mock import Mock
from courier.journal import Journal
from courier.clients import InternalClient
from courier.raw_log import observe,current_trace_id
from test_fifo_ack import job
class TraceStallTests(unittest.TestCase):
    def test_client_propagates_trace_without_payload(self):
        config=Mock();config.bot_id='sandbox';config.service_key='synthetic';config.server='http://127.0.0.1:3901';transport=Mock();client=InternalClient(config,transport)
        def call():
            client.post('/internal/courier/v1/events',{'synthetic':True})
            self.assertEqual(transport.post.call_args.args[2]['X-Courier-Trace'],current_trace_id())
        observe('INBOX_FORWARD',call)
    def test_stall_age_persists_and_alert_is_throttled_without_changing_ack(self):
        with tempfile.TemporaryDirectory() as folder:
            now=[1000];path=folder+'/journal.sqlite';j=Journal(path,'sandbox','fingerprint',clock=lambda:now[0]);item=job();j.begin_delivery(item);j.delivery_result(item,{'result':'sent','telegram_message_id':'55'});ack=j.next_ack()['ack'];now[0]+=61
            self.assertEqual(len(j.overdue_acks()),1);self.assertEqual(j.overdue_acks(),[]);self.assertEqual(j.next_ack()['ack'],ack);j.close();j=Journal(path,'sandbox','fingerprint',clock=lambda:now[0]);self.assertEqual(j.overdue_acks(),[]);now[0]+=60;self.assertEqual(j.overdue_acks()[0]['age_ms'],121000);j.close()
