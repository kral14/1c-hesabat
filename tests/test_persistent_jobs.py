import json
import tempfile
import unittest
import threading
from unittest.mock import Mock
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from services.job_store import JobStore
from services.action_queue import ActionQueue
from services.onec_gateway import OneCGateway
from services.onec_result_queue import ResultQueue


class DurableJobsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name)/'jobs.db'
        self.store = JobStore(self.path)
        self.args = ('request-identifier-1', 'x'*48, 'get_audit_diff', {'server':'Test1C','ref':'Aztrade_test3','user':'test','password':'private'})

    def test_lost_reply_does_not_create_second_job(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.store.create(*self.args), range(8)))
        self.assertEqual(sum(created for _,created in results),1)
        self.assertEqual(len({job_id for job_id,_ in results}),1)

    def test_api_restart_preserves_result_and_chunks(self):
        job_id,_=self.store.create(*self.args)
        self.store.running(job_id)
        self.store.chunk(job_id,0,{'kind':'snapshot'})
        self.store.chunk(job_id,1,{'kind':'events','events':[{}]*150})
        self.store.finish(job_id,result={'event_count':150})
        reopened=JobStore(self.path).get(job_id,'x'*48)
        self.assertEqual(reopened['state'],'succeeded')
        self.assertEqual(reopened['result']['event_count'],150)
        self.assertEqual(len(reopened['chunks'][1]['data']['events']),150)
        self.assertNotIn(b'private',self.path.read_bytes())
        self.assertNotIn(b'x'*48,self.path.read_bytes())

    def test_access_token_required(self):
        job_id,_=self.store.create(*self.args)
        with self.assertRaises(PermissionError):self.store.get(job_id,'wrong')

    def test_request_identity_cannot_change(self):
        self.store.create(*self.args)
        with self.assertRaises(ValueError):self.store.create(*self.args[:3],{'ref':'different'})

    def test_partial_results_have_no_total_cap(self):
        job_id,_=self.store.create(*self.args)
        for i in range(25):self.store.chunk(job_id,i,{'events':[i]*10})
        first=self.store.get(job_id,'x'*48)
        self.assertTrue(first['has_more'])
        second=self.store.get(job_id,'x'*48,after=19)
        self.assertEqual(len(first['chunks'])+len(second['chunks']),25)
        self.assertFalse(second['has_more'])

    def test_recovery_marks_pending_jobs_not_completed_ones(self):
        job_id,_=self.store.create(*self.args)
        self.store.running(job_id)
        self.store.interrupt_pending()
        self.assertEqual(self.store.get(job_id,'x'*48)['state'],'interrupted')
        job_id,created=self.store.create(*self.args)
        self.assertTrue(created)
        self.store.finish(job_id,result={})
        self.store.interrupt_pending()
        self.assertEqual(self.store.get(job_id,'x'*48)['state'],'succeeded')

    def test_control_calls_precede_queued_bulk_work(self):
        queue=ActionQueue()
        queue.put(('get_audit_events',{},None))
        queue.put(('get_users',{},None))
        self.assertEqual(queue.get()[0],'get_users')
        self.assertEqual(queue.get()[0],'get_audit_events')

    def test_api_close_does_not_shutdown_worker(self):
        gateway=OneCGateway(auto_start=False)
        gateway.request=lambda *_args,**_kwargs:self.fail('API close must not call the worker')
        gateway.close_all()
        with self.assertRaises(PermissionError):gateway.shutdown_worker()

    def test_native_result_is_materialized_on_owner_thread(self):
        response=ResultQueue();owner=[]
        class NativeValue:
            def __init__(self):self.owner=threading.get_ident()
            def __str__(self):
                if threading.get_ident()!=self.owner:raise RuntimeError('Wrong apartment')
                owner.append(self.owner)
                return 'resolved-on-worker'
        thread=threading.Thread(target=lambda:response.put((True,{'value':NativeValue()})))
        thread.start();thread.join()
        ok,result=response.get_nowait()
        self.assertTrue(ok);self.assertEqual(result,{'value':'resolved-on-worker'})
        self.assertNotEqual(owner[0],threading.get_ident())

    def test_writes_are_never_automatically_retried(self):
        gateway=OneCGateway(auto_start=False)
        gateway.ensure_worker=lambda:None
        gateway.request=Mock(return_value={'result':True})
        gateway.execute('save_price_document',{},retry=2)
        self.assertEqual(gateway.request.call_args.args[1]['retry'],0)

    def test_large_cached_results_are_bounded_per_response(self):
        job_id,_=self.store.create(*self.args)
        for i in range(6):self.store.chunk(job_id,i,{'fragment':'a'*60000})
        result=self.store.get(job_id,'x'*48)
        self.assertLessEqual(len(json.dumps(result['chunks']).encode()),130*1024)
        self.assertTrue(result['has_more'])


if __name__=='__main__':unittest.main()
