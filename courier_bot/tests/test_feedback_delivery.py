import unittest
from courier.journal import Journal
from courier.http import TransportError


class FeedbackDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.journal = Journal(':memory:', 'testing', 'fingerprint')
        self.item = {'delivery_id': 'receipt-1', 'lease_token': 'lease-1',
                     'payload': {'text': 'Order diterima'}}

    def tearDown(self):
        self.journal.close()

    def test_crash_in_send_window_never_blindly_resends(self):
        self.assertIsNone(self.journal.begin_delivery(self.item))
        with self.assertRaises(TransportError):
            self.journal.begin_delivery(self.item)

    def test_confirmed_send_uses_cached_telegram_id_after_lease_reclaim(self):
        self.journal.begin_delivery(self.item)
        self.journal.delivery_result(self.item, {'result': 'sent', 'telegram_message_id': '99'})
        self.assertEqual(self.journal.begin_delivery({**self.item, 'lease_token': 'new'}), '99')

    def test_explicit_rate_limit_can_retry_after_settlement(self):
        self.journal.begin_delivery(self.item)
        self.journal.delivery_result(self.item, {'result': 'retry', 'error_code': 'RATE_LIMIT', 'retry_after': 2})
        self.journal.finish_ack(self.journal.next_ack())
        self.assertIsNone(self.journal.begin_delivery({**self.item, 'lease_token': 'new'}))
