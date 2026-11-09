import unittest
from courier.groups import IngressPolicy
from courier.http import TransportError
from courier.durable_runner import DurableCourier

class DatabaseRoutingTests(unittest.TestCase):
    def test_verified_snapshot_replaces_mapping_and_scopes_alerts(self):
        first={'chatId':'-1001','threadId':None,'threadMode':'non_topic','profile':'TIAL1','commands':['order']}
        policy=IngressPolicy('test-bot','SyntheticTestBot',[first])
        second={**first,'chatId':'-1002','profile':'SOLVER1','commands':['config_psb','mo']}
        target={'chatId':'-1003','threadId':None,'anchorId':'7'}
        policy.refresh({'groups':[second],'alertTargets':[target]})
        self.assertEqual(policy.groups,[second])
        payload={'method':'sendMessage','chat_id':'-1003','telegram_thread_id':None,'thread_mode':'non_topic','reply_to_message_id':'7','text':'HD Work 2.0 system alert: MYSQL_OFFLINE'}
        policy.outgoing(payload)
        with self.assertRaises(TransportError):
            policy.outgoing({**payload,'chat_id':'-999'})
        with self.assertRaises(TransportError):
            policy.outgoing({**payload,'text':'arbitrary text'})

    def test_routing_failure_prevents_telegram_poll_and_send(self):
        class Lease:
            def ensure(self): pass
        class Internal:
            def routing(self): raise TransportError()
        class Telegram:
            def updates(self, offset): raise AssertionError('must not poll')
            def send(self, payload): raise AssertionError('must not send')
        runner=DurableCourier(Telegram(),Internal(),None,None,Lease(),poll=True,send=True,database_routing=True)
        with self.assertRaises(TransportError): runner.run_once()

    def test_chat_reply_is_opt_in_and_never_authorizes_foreign_group(self):
        group={'chatId':'-1001','threadId':None,'threadMode':'non_topic','profile':'TIAL1','commands':['order']}
        update={'update_id':1,'message':{'message_id':12,'chat':{'id':-1001},'from':{'id':9},'date':1700000000,'text':'Plain chat reply','reply_to_message':{'message_id':11}}}
        old=IngressPolicy('test-bot','SyntheticTestBot',[group])
        self.assertEqual(old.prepare(update)[1],'IGNORED')
        chat=IngressPolicy('test-bot','SyntheticTestBot',[group],chat_enabled=True)
        self.assertEqual(chat.prepare(update)[1],'PENDING')
        self.assertEqual(chat.prepare({**update,'message':{**update['message'],'chat':{'id':-999}}})[1],'IGNORED')
