import queue
import time
import unittest
from services.onec_service import OneCService

class QueueTimeoutTests(unittest.TestCase):
    def test_blocked_queue_returns_error_and_does_not_mutate_request(self):
        worker=OneCService.__new__(OneCService)
        worker.req_q=queue.Queue()
        payload={'server':'Test1C','ref':'Aztrade_test3'}
        with self.assertRaises(TimeoutError):
            worker.execute('get_audit_list',payload,retry=0,timeout=0.01)
        action,queued,response=worker.req_q.get_nowait()
        self.assertEqual(action,'get_audit_list')
        self.assertNotIn('_queue_deadline',payload)
        self.assertLessEqual(queued['_queue_deadline'],time.monotonic())

if __name__=='__main__': unittest.main()
