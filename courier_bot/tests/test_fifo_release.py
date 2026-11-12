import io
import json
import unittest
import tempfile
from urllib.error import HTTPError
from unittest.mock import Mock
from courier.http import JsonTransport, TransportError
from courier.clients import TelegramClient
from courier.journal import Journal

PAYLOAD = {'method':'sendMessage','thread_mode':'non_topic','chat_id':'-1001','telegram_thread_id':None,'reply_to_message_id':'11','text':'SYNTHETIC'}

class FifoReleaseTransportTests(unittest.TestCase):
    def test_rejection_evidence_survives_journal_restart_and_original_is_not_replayed(self):
        with tempfile.TemporaryDirectory() as directory:
            file=directory+'/journal.sqlite'
            delivery={'delivery_id':'10000001-1000-4000-8000-000000000001','lease_token':'10000002-1000-4000-8000-000000000001','payload':PAYLOAD}
            evidence={'source':'TELEGRAM_BOT_API','code':400,'description':'Bad Request: chat not found','rejected':True}
            j=Journal(file,'fixture','a'*64)
            try:
                j.begin_delivery(delivery,strict=True)
                j.delivery_result(delivery,{'result':'failed','error_code':'BAD_REQUEST','telegram_error':evidence})
            finally:j.close()
            j=Journal(file,'fixture','a'*64)
            try:
                result=json.loads(j.db.execute('SELECT last_result FROM deliveries').fetchone()[0])
                self.assertEqual(result['telegram_error'],evidence)
                with self.assertRaises(TransportError):j.begin_delivery(delivery,strict=True)
            finally:j.close()

    def error(self, body, status=400):
        def opener(*args, **kwargs):
            raise HTTPError('https://example.invalid', status, 'HTTP failure', {}, io.BytesIO(json.dumps(body).encode()))
        return JsonTransport(opener=opener)

    def test_confirmed_bot_api_rejection_keeps_safe_code_description(self):
        transport=self.error({'ok':False,'error_code':400,'description':'Bad Request: chat not found'})
        client=TelegramClient('fixture-not-a-token',transport)
        with self.assertRaises(TransportError) as raised:client.send(PAYLOAD)
        self.assertEqual(raised.exception.telegram_error,{'source':'TELEGRAM_BOT_API','code':400,'description':'Bad Request: chat not found','rejected':True})

    def test_untrusted_description_is_not_message_storage(self):
        client=TelegramClient('fixture-not-a-token',self.error({'ok':False,'error_code':400,'description':'PRIVATE_MESSAGE_ECHO'}))
        with self.assertRaises(TransportError) as raised:client.send(PAYLOAD)
        self.assertEqual(raised.exception.telegram_error['description'],'[TELEGRAM_DESCRIPTION_REDACTED]')
        self.assertNotIn('PRIVATE_MESSAGE_ECHO',str(raised.exception))

    def test_local_400_invalid_json_and_internal_failure_are_not_telegram_proof(self):
        client=TelegramClient('fixture-not-a-token',Mock())
        with self.assertRaises(TransportError) as raised:client.send({**PAYLOAD,'method':'invalid'})
        self.assertFalse(hasattr(raised.exception,'telegram_error'))
        client=TelegramClient('fixture-not-a-token',self.error({'error':'local failure'}))
        with self.assertRaises(TransportError) as raised:client.send(PAYLOAD)
        self.assertFalse(hasattr(raised.exception,'telegram_error'))
        client=TelegramClient('fixture-not-a-token',self.error({'ok':False,'error_code':400,'description':'Bad Request: chat not found'},500))
        with self.assertRaises(TransportError) as raised:client.send(PAYLOAD)
        self.assertFalse(hasattr(raised.exception,'telegram_error'))
