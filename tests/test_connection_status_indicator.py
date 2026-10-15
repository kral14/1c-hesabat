import ast
import unittest
from pathlib import Path
from unittest.mock import Mock
from flask import Flask,request,jsonify


class ConnectionStatusIndicatorTests(unittest.TestCase):
    def setUp(self):
        # Load only the endpoint: importing the full route module would also
        # initialize unrelated application services and databases.
        source=ast.parse(Path('routes/base_routes.py').read_text(encoding='utf-8-sig'))
        endpoint=next(node for node in source.body if isinstance(node,ast.FunctionDef) and node.name=='connection_status_endpoint')
        endpoint.decorator_list=[]
        self.worker=Mock()
        self.worker.busy=False
        self.worker.req_q.empty.return_value=True
        scope={'one_c':self.worker,'jsonify':jsonify,'request':request}
        exec(compile(ast.Module(body=[endpoint],type_ignores=[]),'connection_status','exec'),scope)
        app=Flask(__name__)
        app.add_url_rule('/status',view_func=scope['connection_status_endpoint'],methods=['POST'])
        self.client=app.test_client()

    def test_missing_service_never_starts_a_worker(self):
        self.worker.status.return_value={'available':False}
        body=self.client.post('/status',json={}).get_json()
        self.assertFalse(body['connected'])
        self.assertFalse(body['worker_available'])
        self.worker.execute.assert_not_called()

    def test_no_session_never_attempts_connect(self):
        self.worker.status.return_value={'available':True,'worker_alive':True,'session_count':0}
        self.assertFalse(self.client.post('/status',json={}).get_json()['connected'])
        self.worker.execute.assert_not_called()

    def test_busy_service_does_not_enqueue_a_probe(self):
        self.worker.status.return_value={'available':True,'worker_alive':True,'session_count':1}
        self.worker.busy=True
        body=self.client.post('/status',json={}).get_json()
        self.assertTrue(body['busy'])
        self.assertIsNone(body['connected'])
        self.worker.execute.assert_not_called()

    def test_existing_session_is_probed_for_selected_base_only(self):
        self.worker.status.return_value={'available':True,'worker_alive':True,'session_count':1}
        self.worker.execute.return_value={'connected':True}
        selected={'server':'Test1C','ref':'Aztrade_test3'}
        body=self.client.post('/status',json=selected).get_json()
        self.assertTrue(body['connected'])
        self.worker.execute.assert_called_once_with('connection_probe',selected,retry=0)

    def test_failed_probe_does_not_reconnect(self):
        self.worker.status.return_value={'available':True,'worker_alive':True,'session_count':1}
        self.worker.execute.side_effect=RuntimeError('Disconnected')
        body=self.client.post('/status',json={}).get_json()
        self.assertFalse(body['connected'])
        self.assertFalse(body['success'])
        self.assertEqual(self.worker.execute.call_count,1)
