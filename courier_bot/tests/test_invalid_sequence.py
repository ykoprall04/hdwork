"""Offline Python half of the 3-second mixed-order scenario; real SQLite/ACK pump."""
import collections,json,tempfile,time,unittest,uuid
from pathlib import Path
from unittest.mock import Mock
from courier.groups import IngressPolicy
from courier.commands import parse_command
from courier.journal import Journal
from courier.durable_runner import DurableCourier

VALID='/order\nSC/IN:FIXTURE-AO100\nSN ONT:SYNTHETIC\nTIPE TRANSAKSI:AO\nSTO:ABC\nKETERANGAN:offline\nNIK:TEST'
GROUP={'chatId':'-1001','threadId':None,'threadMode':'non_topic','profile':'TIAL1','commands':['order','req','config_psb','mo']}

class InvalidSequenceTests(unittest.TestCase):
    def test_valid_invalid_three_seconds_preserve_forwarding_offset_journal_and_ack(self):
        with tempfile.TemporaryDirectory() as directory:
            now=[1700000000.0];journal=Journal(str(Path(directory)/'offline.sqlite3'),'sandbox','synthetic-fingerprint',clock=lambda:now[0])
            incoming=collections.deque();queue=collections.deque();receipts={};sent=[];settled={}
            tg=Mock();tg.updates.side_effect=lambda offset:list(incoming.popleft()) if incoming else []
            tg.send.side_effect=lambda payload:sent.append((now[0],payload)) or len(sent)
            api=Mock();api.worker=None;api.claim.side_effect=lambda:list([queue.popleft()]) if queue else []
            def event(envelope):
                uid=envelope['update_id'];e=envelope['event']
                if uid not in receipts:
                    parsed=parse_command(e['text'],'TIAL1','SyntheticOpsBot')
                    text='\u2705 Berhasil! Order diterima.' if parsed['valid'] else '\u274c Gagal! Format order salah. Alasan: '+', '.join(parsed['errors'])
                    receipts[uid]=str(uuid.uuid4())
                    queue.append({'delivery_id':str(uuid.uuid4()),'lease_token':str(uuid.uuid4()),'attempt':1,'payload':{'method':'sendMessage','chat_id':e['chat_id'],'telegram_thread_id':None,'thread_mode':'non_topic','reply_to_message_id':e['message_id'],'text':text}})
                return {'ok':True,'receipt_id':receipts[uid]}
            api.event.side_effect=event
            ack=Mock()
            def settle(body,result):
                self.assertEqual(result['result'],'sent');settled.setdefault(body['delivery_id'],result)
                return {'ok':True}
            ack.settle.side_effect=settle
            policy=IngressPolicy('sandbox','SyntheticOpsBot',[GROUP])
            runner=DurableCourier(tg,api,journal,policy,Mock(),poll=True,send=True,fifo_ack=True,ack_internal=ack,clock=lambda:now[0])
            texts=[VALID,VALID.replace('SC/IN:FIXTURE-AO100','SC/IN:'),VALID.replace('AO100','AO101'),VALID.replace('SN ONT:SYNTHETIC','SN ONT:-'),VALID]
            try:
                for index,text in enumerate(texts):
                    arrival=now[0];uid=index+1
                    raw={'update_id':uid,'message':{'message_id':100+uid,'date':int(now[0]),'chat':{'id':-1001},'from':{'id':9},'text':text}}
                    incoming.append([raw]);runner.run_once()
                    self.assertEqual(len(sent),uid);self.assertEqual(sent[-1][0],arrival)
                    self.assertEqual(sent[-1][1]['reply_to_message_id'],str(100+uid))
                    if index in (1,3):self.assertIn('Gagal!',sent[-1][1]['text'])
                    # Drain real background ACK completion, never advance time or resend.
                    for _ in range(100):
                        runner.flush_ack()
                        if not journal.has_ack():break
                        runner.wakeup.wait(.005);runner.wakeup.clear()
                    self.assertFalse(journal.has_ack());self.assertEqual(len(settled),uid)
                    self.assertEqual(journal.offset,uid+1)
                    row=journal.db.execute('SELECT state,attempts FROM updates WHERE update_id=?',(str(uid),)).fetchone()
                    self.assertEqual((row['state'],row['attempts']),('ACKED',0))
                    # Same update repeated by Telegram does not generate another reply.
                    incoming.append([raw]);runner.run_once();self.assertEqual(len(sent),uid)
                    now[0]+=3
                self.assertEqual([row[0]-sent[0][0] for row in sent],[0,3,6,9,12])
                self.assertEqual(journal.db.execute("SELECT COUNT(*) FROM deliveries WHERE state='SETTLED'").fetchone()[0],5)
                self.assertEqual(journal.db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            finally:runner.close();journal.close()
