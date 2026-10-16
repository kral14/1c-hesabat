import ast
import io
import unittest
from pathlib import Path
from unittest.mock import Mock,patch
from flask import Flask,request
import run

class RuntimeReadinessTests(unittest.TestCase):
    def test_readiness_never_requests_com_diagnostics(self):
        with patch.object(run.urllib.request,'urlopen',return_value=io.BytesIO(b'{"auto_reload":true}')) as network:
            self.assertTrue(run.read_runtime_status('http://127.0.0.1:5050')['auto_reload'])
            self.assertEqual(network.call_args.args[0],'http://127.0.0.1:5050/api/runtime/status?worker=0')
            self.assertEqual(network.call_args.kwargs['timeout'],3)
    def test_transient_timeout_does_not_migrate_running_server(self):
        with patch.object(run,'is_server_running',return_value=True),patch.object(run.urllib.request,'urlopen',side_effect=[TimeoutError(),io.BytesIO(b'{"auto_reload":true}')]),patch.object(run.time,'sleep'),patch.object(run,'stop_legacy_local_server') as stop:
            self.assertTrue(run.ensure_server(run.LOCAL_SERVER_URL))
            stop.assert_not_called()
    def test_unknown_status_never_terminates_a_process(self):
        with patch.object(run,'is_server_running',return_value=True),patch.object(run,'read_runtime_status',return_value=None),patch.object(run,'stop_legacy_local_server') as stop:
            with self.assertRaises(RuntimeError):run.ensure_server(run.LOCAL_SERVER_URL)
            stop.assert_not_called()
    def test_light_endpoint_never_calls_worker(self):
        tree=ast.parse(Path('app.py').read_text(encoding='utf-8-sig'))
        node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='runtime_status')
        node.decorator_list=[]
        worker=Mock();scope={'request':request,'one_c':worker,'os':__import__('os')}
        exec(compile(ast.Module(body=[node],type_ignores=[]),'runtime_status','exec'),scope)
        app=Flask(__name__)
        with app.test_request_context('/api/runtime/status?worker=0'):
            result=scope['runtime_status']()
        self.assertIsNone(result['worker'])
        worker.status.assert_not_called()

if __name__=='__main__':unittest.main()
