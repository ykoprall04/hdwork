import copy
import json
import unittest
from courier.groups import IngressPolicy
from courier.journal import Journal

GROUP = {'chatId':'-100123', 'threadId':None, 'threadMode':'non_topic', 'profile':'TIAL1', 'commands':['order','req']}


def reply():
    return {'update_id':1, 'message':{'message_id':21, 'chat':{'id':-100123, 'type':'supergroup'}, 'from':{'id':9}, 'date':1700000000, 'text':'synthetic reply', 'message_thread_id':10, 'reply_to_message':{'message_id':13}}}


class NonForumReplyTests(unittest.TestCase):
    def test_discussion_reply_is_journaled_with_non_topic_route_and_original_anchor(self):
        policy = IngressPolicy('synthetic', 'SyntheticBot', [GROUP], chat_enabled=True)
        raw = reply()
        before = copy.deepcopy(raw)
        journal = Journal(':memory:', 'synthetic', 'synthetic-fingerprint')
        try:
            journal.append([raw], policy.prepare)
            row = journal.next_event()
            self.assertIsNotNone(row)
            event = json.loads(row['payload'])['event']
            self.assertIsNone(event['telegram_thread_id'])
            self.assertEqual(event['reply_to_message_id'], '13')
            self.assertEqual(event['text'], 'synthetic reply')
            self.assertEqual(raw, before)
            self.assertEqual(journal.offset, 2)
        finally:
            journal.close()

    def test_normalization_is_chat_only_and_does_not_accept_forums_foreign_groups_or_invalid_ids(self):
        policy = IngressPolicy('synthetic', 'SyntheticBot', [GROUP], chat_enabled=True)
        self.assertFalse(IngressPolicy('synthetic', 'SyntheticBot', [GROUP]).allows_source(reply()))
        for change in [lambda m:m['chat'].update(id=-999), lambda m:m['chat'].update(is_forum=True), lambda m:m.update(is_topic_message=True), lambda m:m.pop('reply_to_message'), *[lambda m, value=value:m.update(message_thread_id=value) for value in [-1,0,True,'10',2147483648]]]:
            raw = reply()
            change(raw['message'])
            self.assertFalse(policy.allows_source(raw))
        topic = {**GROUP, 'threadId':'10', 'threadMode':'thread'}
        forum = IngressPolicy('synthetic', 'SyntheticBot', [topic], chat_enabled=True)
        raw = reply()
        raw['message']['chat']['is_forum'] = True
        self.assertEqual(forum.prepare(raw)[0]['event']['telegram_thread_id'], '10')
        raw['message']['message_thread_id'] = 11
        self.assertFalse(forum.allows_source(raw))
