import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from courier.groups import IngressPolicy
from courier.commands import parse_command
from courier.durable_runner import DurableCourier
from courier.http import TransportError

COMMANDS = ['order', 'req', 'config_psb', 'mo', 'assuren', 'b2b', 'replacement']
GROUP = {'chatId': '-1001', 'threadId': None, 'threadMode': 'non_topic', 'profile': 'ALL', 'commands': COMMANDS}

class SharedGroupsTests(unittest.TestCase):
    def test_one_group_accepts_all_existing_formats_and_rejects_unknown_commands(self):
        texts = ['/order\nSC/IN:X-AO1\nNO INET:000123\nSN ONT:SN1\nSTO:ABC\nKETERANGAN:test\nNIK:SYNTHETIC', '/req help', '/config_psb\nOrder ID:X-AO2\nSTO:ABC', '/mo\nSC/IN:X-MO3\nSTO:ABC']
        texts += [f'/{c}\nSC/IN:{c}-100\nNO INET/TELP:00012345\nSTO:ABC\nTRANSAKSI:PERBAIKAN\nKETERANGAN:fixture' for c in COMMANDS[4:]]
        policy = IngressPolicy('synthetic-all', 'SyntheticAllBot', [GROUP], chat_enabled=True)
        for command, text in zip(COMMANDS, texts):
            self.assertEqual(parse_command(text, 'ALL')['command'], command)
            update = {'update_id': 1, 'message': {'message_id': 10, 'chat': {'id': -1001}, 'from': {'id': 9}, 'date': 1700000000, 'text': text}}
            self.assertEqual(policy.prepare(update)[1], 'PENDING')
        self.assertFalse(parse_command('/login anything', 'ALL')['valid'])
        self.assertFalse(parse_command('/req@AnotherTestBot hello', 'ALL', 'SyntheticAllBot')['valid'])

    def test_disabling_last_group_produces_empty_snapshot_without_crashing(self):
        policy = IngressPolicy('synthetic-all', 'SyntheticAllBot', [GROUP])
        policy.refresh({'groups': [], 'dispatchAuthorizationRequired': True})
        self.assertEqual(policy.groups, [])
        with self.assertRaises(TransportError):
            policy.outgoing({'method': 'sendMessage', 'chat_id': '-1001', 'text': 'must stop'})

    def test_final_backend_denial_prevents_telegram_send(self):
        policy = IngressPolicy('synthetic-all', 'SyntheticAllBot', [GROUP])
        policy.refresh({'groups': [GROUP], 'dispatchAuthorizationRequired': True})
        payload = {'method': 'sendMessage', 'chat_id': '-1001', 'telegram_thread_id': None, 'thread_mode': 'non_topic', 'reply_to_message_id': '10', 'text': 'pending'}
        delivery = {'delivery_id': 'synthetic-delivery', 'lease_token': 'synthetic-lease', 'payload': payload}
        internal = SimpleNamespace(claim=lambda: [delivery], authorize_delivery=Mock(return_value=False))
        journal = SimpleNamespace(next_ack=lambda: None, has_ack=lambda: False, begin_delivery=lambda _: None, delivery_result=Mock())
        telegram = SimpleNamespace(send=Mock(side_effect=AssertionError('must not send')))
        DurableCourier(telegram, internal, journal, policy, SimpleNamespace(ensure=lambda: None), send=True).run_once()
        telegram.send.assert_not_called()
        internal.authorize_delivery.assert_called_once_with(delivery)
        self.assertEqual(journal.delivery_result.call_args.args[1]['result'], 'failed')

    def test_cached_success_is_acknowledged_without_new_send_or_route_approval(self):
        policy = IngressPolicy('synthetic-all', 'SyntheticAllBot', [GROUP])
        policy.refresh({'groups': [], 'dispatchAuthorizationRequired': True})
        delivery = {'delivery_id': 'known-delivery', 'lease_token': 'new-lease', 'payload': {'method': 'sendMessage', 'chat_id': '-1001'}}
        internal = SimpleNamespace(claim=lambda: [delivery], authorize_delivery=Mock(side_effect=AssertionError('no new send')))
        journal = SimpleNamespace(next_ack=lambda: None, has_ack=lambda: False, begin_delivery=lambda _: '123', delivery_result=Mock())
        telegram = SimpleNamespace(send=Mock(side_effect=AssertionError('must not resend')))
        DurableCourier(telegram, internal, journal, policy, SimpleNamespace(ensure=lambda: None), send=True).run_once()
        telegram.send.assert_not_called()
        internal.authorize_delivery.assert_not_called()
        self.assertEqual(journal.delivery_result.call_args.args[1], {'result': 'sent', 'telegram_message_id': '123'})
