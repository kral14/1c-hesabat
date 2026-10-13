import queue, threading, unittest
from unittest.mock import patch
from services.onec_service import OneCService
class Probe:
    def __init__(self,alive): self.alive=alive
    def Execute(self):
        if not self.alive: raise RuntimeError('stale COM session')
class Connection:
    def __init__(self,alive): self.alive=alive
    def String(self,value): return str(value)
    def NewObject(self,name): return Probe(self.alive)
class Connector:
    def __init__(self): self.calls=0;self.owner=None
    def Connect(self,value): self.calls+=1;self.owner=threading.get_ident();return Connection(True)
class ReconnectTests(unittest.TestCase):
    def check(self,alive):
        connector=Connector();worker=OneCService.__new__(OneCService)
        threading.Thread.__init__(worker,daemon=True)
        worker.req_q=queue.Queue();worker.busy=False
        existing=Connection(alive);key='test1c_aztrade_test3_nesib_demo'
        worker.connections={key:existing}
        with patch('services.onec_service.win32com.client.Dispatch',return_value=connector), patch('services.onec_service.database.get_active_base',return_value={}), patch('services.onec_service.pythoncom.CoInitialize'), patch('services.onec_service.pythoncom.CoUninitialize'):
            worker.start()
            try:
                result=worker.execute('ping',{'server':'Test1C','ref':'Aztrade_test3','user':'Nesib','password':'demo'},retry=0,timeout=2)
                self.assertEqual(result,'pong')
                self.assertEqual(connector.calls,0 if alive else 1)
                if alive:self.assertIs(worker.connections[key],existing)
                else:self.assertEqual(connector.owner,worker.ident)
            finally:worker.close_all();worker.join(timeout=2)
    def test_healthy_session_reused(self):self.check(True)
    def test_stale_session_replaced_on_sta_worker(self):self.check(False)
if __name__=='__main__':unittest.main()
