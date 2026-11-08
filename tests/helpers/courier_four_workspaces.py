"""No Telegram client, HTTP transport, or application database."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'courier_bot'))
from courier.groups import IngressPolicy, validate_groups
from courier.commands import parse_command
from courier.clients import TelegramClient


class FourWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.groups = [{'chatId': '-1007001', 'threadId': None, 'threadMode': 'non_topic', 'profile': 'TIAL1', 'commands': ['req']}]
        self.groups += [{'chatId': '-1007002', 'threadId': str(i + 10), 'threadMode': 'thread', 'profile': p, 'commands': [p.lower()]} for i, p in enumerate(('ASSUREN', 'B2B', 'REPLACEMENT'))]
        self.policy = IngressPolicy('synthetic-four', 'SyntheticFourBot', self.groups)

    def update(self, index):
        group = self.groups[index]
        body = '/req Synthetic' if index == 0 else f"/{group['profile'].lower()}\nSC/IN:ORDER-100\nNO INET/TELP:00012345\nSTO:ABC\nTRANSAKSI:PERBAIKAN"
        message = {'message_id': 100 + index, 'date': 1700000000, 'chat': {'id': int(group['chatId'])}, 'text': body}
        if index:
            message.update(message_thread_id=int(group['threadId']), is_topic_message=True)
            message['chat']['is_forum'] = True
        return {'update_id': index + 1, 'message': message}

    def test_four_workspace_topic_routing(self):
        for index in range(4):
            envelope, state, _ = self.policy.prepare(self.update(index))
            self.assertEqual(state, 'PENDING')
            self.assertEqual(envelope['event']['telegram_thread_id'], self.groups[index]['threadId'])
        update = self.update(2)
        update['message']['message_thread_id'] = 10
        self.assertEqual(self.policy.prepare(update)[1], 'IGNORED')
        with self.assertRaises(ValueError):
            validate_groups(self.groups + [self.groups[1]])

    def test_fields_mentions_and_duplicate_aliases(self):
        body = self.update(2)['message']['text']
        self.assertTrue(parse_command(body, 'B2B', 'SyntheticFourBot')['valid'])
        for changed in (body + '\nINET:1234', body.replace('/b2b', '/b2b@OtherBot'), body.replace('SC/IN:ORDER-100', 'SC/IN:-')):
            self.assertFalse(parse_command(changed, 'B2B', 'SyntheticFourBot')['valid'])
        self.assertFalse(parse_command(body, 'ASSUREN', 'SyntheticFourBot')['valid'])

    def test_outgoing_mock_has_exact_topic_and_reply_anchor(self):
        calls = []
        class FakeTransport:
            def post(self, url, body):
                calls.append(body)
                return {'result': {'message_id': 999}}
        payload = {'method': 'sendMessage', 'chat_id': '-1007002', 'telegram_thread_id': '11', 'thread_mode': 'thread', 'reply_to_message_id': '102', 'text': 'Synthetic'}
        self.policy.outgoing(payload)
        client = TelegramClient('synthetic-not-a-real-token', FakeTransport())
        self.assertEqual(client.send(payload), 999)
        self.assertEqual(calls[0]['message_thread_id'], 11)
        self.assertEqual(calls[0]['reply_parameters'], {'message_id': 102, 'allow_sending_without_reply': False})


if __name__ == '__main__':
    unittest.main()
