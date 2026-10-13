import unittest
from unittest.mock import Mock, patch
from flask import Flask
from routes.job_routes import job_bp
from services.onec_worker_process import READ_ACTIONS


class JobRoutesTests(unittest.TestCase):
    def setUp(self):
        app=Flask(__name__)
        app.register_blueprint(job_bp)
        self.client=app.test_client()

    def test_recovery_never_runs_without_confirmation(self):
        with patch('routes.job_routes.one_c') as gateway:
            response=self.client.post('/api/connection/worker-recover',json={})
            self.assertEqual(response.status_code,403)
            gateway.shutdown_worker.assert_not_called()

    def test_confirmed_recovery_is_explicit(self):
        with patch('routes.job_routes.one_c') as gateway:
            response=self.client.post('/api/connection/worker-recover',json={'confirmed':True})
            self.assertTrue(response.json['success'])
            gateway.shutdown_worker.assert_called_once_with(confirmed=True)

    def test_invalid_access_token_is_not_retryable(self):
        with patch('routes.job_routes.one_c') as gateway:
            gateway.job.side_effect=PermissionError('denied')
            response=self.client.post('/api/jobs/status',json={'job_id':'job','token':'wrong'})
            self.assertEqual(response.status_code,403)

    def test_only_read_actions_are_resumable(self):
        for action in ('save_price_document','change_user_password','delete_document'):
            self.assertNotIn(action,READ_ACTIONS)
        self.assertIn('audit_history',READ_ACTIONS)


if __name__=='__main__':unittest.main()
