import tempfile
import unittest
from pathlib import Path
from courier.commands import parse_command
from courier.gate import CommandGate
from courier.runner import Courier
from unittest.mock import Mock

BASE='/order\nSC/IN: free PREFIX-AOi123_suffix\nNO INET:000123\nSN ONT:SN1\nSTO:ABC\nKETERANGAN:test\nNIK:TEST'
class CommandTests(unittest.TestCase):
    def test_extraction_and_required(self):
        for code in ('AOi1','PDAk1','MOk1','DOk1'):
            for cmd,label,expected in [('config_psb','Order ID DSC','PREFIX-'+code),('MO','SC / IN',code)]:
                result=parse_command(f'/{cmd}\n{label}:free PREFIX-{code}_suffix\nSTO:X','TIAL1')
                self.assertTrue(result['valid']);self.assertEqual(result['sc_in'],expected)
        self.assertTrue(parse_command(BASE,'TIAL2')['valid'])
        self.assertFalse(parse_command(BASE,'SOLVER1')['valid'])
        for field in ('SC/IN','NO INET','SN ONT','STO','KETERANGAN','NIK'):
            rest='\n'.join(s for s in BASE.splitlines() if not s.startswith(field+':'))
            for value in (None,'',' ','-'):
                self.assertFalse(parse_command(rest+(f'\n{field}:{value}' if value is not None else ''),'TIAL1')['valid'])
        self.assertIsNone(parse_command(BASE,'TIAL1')['fields']['NO VOICE'])
        self.assertEqual(parse_command('/req  asli\n teks','SOLVER1')['original'],'/req  asli\n teks')

    def test_rejection_never_forwarded_and_not_repeated_after_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            groups=[{'chatId':'-1001','threadId':None,'threadMode':'non_topic','profile':'SOLVER1'}]
            tg,internal=Mock(),Mock();internal.claim.return_value=[]
            tg.updates.return_value=[{'update_id':1,'message':{'message_id':10,'chat':{'id':-1001},'from':{'id':9},'date':1700000000,'text':BASE}}]
            journal=str(Path(directory)/'rejections.sqlite')
            gate=CommandGate(groups,journal);Courier('sandbox',tg,internal,gate=gate).run_once()
            internal.event.assert_not_called();self.assertEqual(tg.send.call_count,1)
            payload=tg.send.call_args[0][0];self.assertEqual(payload['reply_to_message_id'],'10')
            gate.db.close()
            second=CommandGate(groups,journal);Courier('sandbox',tg,internal,gate=second).run_once();self.assertEqual(tg.send.call_count,1);second.db.close()

    def test_required_other_commands(self):
        for command, label in [('config_psb','Order ID'),('MO','SC/IN')]:
            for field in (label,'STO'):
                rest=f'/{command}\n'+('STO:X' if field==label else label+':PREFIX-AOi1')
                for value in (None,'',' ','-'):
                    self.assertFalse(parse_command(rest+(f'\n{field}:{value}' if value is not None else ''),'TIAL1')['valid'])
        self.assertFalse(parse_command('/req   ','TIAL1')['valid'])

    def test_valid_forwarded(self):
        gate=CommandGate([{'chatId':'-1001','threadId':None,'threadMode':'non_topic','profile':'TIAL1'}],':memory:')
        tg,internal=Mock(),Mock();internal.claim.return_value=[];internal.event.return_value={'ok':True}
        tg.updates.return_value=[{'update_id':1,'message':{'message_id':10,'chat':{'id':-1001},'from':{'id':9},'date':1700000000,'text':BASE}}]
        Courier('sandbox',tg,internal,gate=gate).run_once();internal.event.assert_called_once();tg.send.assert_not_called();gate.db.close()
