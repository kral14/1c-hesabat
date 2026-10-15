import unittest
from unittest.mock import Mock, patch
from services.connection_status import worker_snapshot, public_details
from services.onec_gateway import OneCGateway


class ComManagementTests(unittest.TestCase):
    def test_snapshot_has_start_times_and_only_live_connections(self):
        worker = Mock()
        worker.connections = {'secret-cache-key': object()}
        worker.connection_details = {
            'secret-cache-key': dict(server='Test1C',ref='Test',user='User',connected_at=110),
            'old': dict(server='Old')}
        worker.busy = False
        worker.connection_generation = 2
        worker.req_q.qsize.return_value = 0
        worker.is_alive.return_value = True
        state = worker_snapshot(worker,123,100,now=120)
        self.assertEqual(state['process_uptime_seconds'],20)
        self.assertEqual(state['connections'][0]['connected_at'],110)
        self.assertEqual(len(state['connections']),1)
        self.assertNotIn('secret-cache-key',str(state))

    def test_public_details_remove_all_private_fields(self):
        state = dict(pid=123,session_tokens=['secret'],password='secret',
                     connections=[dict(server='Test',password='secret',key='secret')])
        result = public_details(state)
        self.assertNotIn('secret',str(result))
        self.assertEqual(result['connections'][0]['server'],'Test')

    def test_restart_requires_explicit_boolean_confirmation(self):
        gateway = OneCGateway(auto_start=False)
        gateway.status = Mock()
        for value in (False,None,1,'yes'):
            with self.assertRaises(PermissionError): gateway.restart_worker(value)
        gateway.status.assert_not_called()

    def run_restart(self, stuck):
        gateway = OneCGateway()
        gateway.status = Mock(side_effect=[dict(available=True,pid=123),dict(available=True,pid=456)])
        gateway.shutdown_worker = Mock(side_effect=TimeoutError() if stuck else None)
        gateway.ensure_worker = Mock()
        with patch('services.worker_lifecycle.WorkerHandle') as factory:
            handle = factory.return_value
            handle.wait.return_value = True
            result = gateway.restart_worker(confirmed=True)
            factory.assert_called_once_with(123)
            handle.close.assert_called_once()
            self.assertEqual(handle.terminate.call_count,1 if stuck else 0)
        gateway.shutdown_worker.assert_called_once_with(confirmed=True)
        gateway.ensure_worker.assert_called_once()
        self.assertEqual(result['pid'],456)

    def test_graceful_restart_does_not_force_terminate(self):
        self.run_restart(False)

    def test_stuck_restart_targets_only_authenticated_worker_handle(self):
        self.run_restart(True)

    def test_restart_route_requires_confirmation(self):
        from flask import Flask
        from routes.job_routes import job_bp
        app = Flask(__name__)
        app.register_blueprint(job_bp)
        with patch('routes.job_routes.one_c') as gateway:
            response = app.test_client().post('/api/connection/worker-restart',json={})
            self.assertEqual(response.status_code,403)
            gateway.restart_worker.assert_not_called()

if __name__ == '__main__': unittest.main()
