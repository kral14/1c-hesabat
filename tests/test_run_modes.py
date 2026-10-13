import sys
import json
import tempfile
import unittest
import io
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import run

class StartupConnectionTests(unittest.TestCase):
    def test_http_ready_but_onec_failed_is_rejected(self):
        with patch.object(run.urllib.request, 'urlopen', return_value=io.BytesIO(b'{"success":false,"connected":false,"error":"1C unavailable"}')):
            with self.assertRaisesRegex(RuntimeError, '1C unavailable'):
                run.ensure_1c_connection('http://localhost:5050')

    def test_successful_startup_checks_actual_connection_endpoint(self):
        body = b'{"success":true,"connected":true,"server":"Test1C","ref":"Aztrade_test3"}'
        with patch.object(run.urllib.request, 'urlopen', return_value=io.BytesIO(body)) as network:
            result = run.ensure_1c_connection('http://localhost:5050', {'server':'Test1C','ref':'Aztrade_test3'})
            self.assertTrue(result['connected'])
            req = network.call_args.args[0]
            self.assertEqual(req.full_url, 'http://localhost:5050/api/ping_connection')
            self.assertEqual(req.get_method(), 'POST')
            self.assertEqual(json.loads(req.data)['ref'], 'Aztrade_test3')

class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.connection_patch = patch.object(run, 'ensure_1c_connection', return_value={'connected':True})
        self.connection = self.connection_patch.start()
        gui_patch = patch.object(run, 'manage_startup_sessions', return_value='connect')
        self.sessions_gui = gui_patch.start()
        self.addCleanup(gui_patch.stop)
        self.addCleanup(self.connection_patch.stop)

    def test_existing_connection_skips_new_warmup(self):
        self.sessions_gui.return_value = 'reuse'
        with patch.object(run, 'prepare_mode', return_value=run.LOCAL_SERVER_URL), patch.object(run, 'open_electron') as electron:
            run.main(['--office'])
            self.connection.assert_not_called()
            electron.assert_called_once()

    def test_closing_session_gui_cancels_launch(self):
        self.sessions_gui.return_value = None
        with patch.object(run, 'prepare_mode', return_value=run.LOCAL_SERVER_URL), patch.object(run, 'open_electron') as electron:
            run.main(['--office'])
            self.connection.assert_not_called()
            electron.assert_not_called()

    def test_connection_failure_prevents_electron(self):
        self.connection.side_effect = RuntimeError('1C unavailable')
        with patch.object(run, 'ensure_server', return_value=True), patch.object(run, 'open_electron') as electron:
            with self.assertRaises(RuntimeError): run.main(['--office'])
            electron.assert_not_called()

    def test_home_warms_up_through_proxy(self):
        with patch.object(run, 'is_url_active', return_value=True), patch.object(run, 'ensure_proxy_server', return_value=True):
            run.prepare_mode('home', 'http://office:5050')
            self.connection.assert_called_once_with(run.PROXY_SERVER_URL)

    def test_managed_server_is_reused_without_restarting_electron(self):
        with patch.object(run,'is_server_running',return_value=True), \
             patch.object(run.urllib.request,'urlopen',return_value=io.BytesIO(b'{"auto_reload":true}')), \
             patch.object(run,'stop_legacy_local_server') as stop, \
             patch.object(run.subprocess,'Popen') as launch:
            self.assertTrue(run.ensure_server(run.LOCAL_SERVER_URL))
            stop.assert_not_called()
            launch.assert_not_called()
    def test_office_uses_local_server_without_proxy(self):
        with patch.object(run, 'ensure_server', return_value=True) as local, patch.object(run, 'ensure_proxy_server') as proxy:
            self.assertEqual(run.prepare_mode('office', run.OFFICE_SERVER_URL), run.LOCAL_SERVER_URL)
            local.assert_called_once_with(run.LOCAL_SERVER_URL)
            proxy.assert_not_called()

    def test_home_only_uses_remote_and_proxy(self):
        with patch.object(run, 'is_url_active', return_value=True), patch.object(run, 'ensure_proxy_server', return_value=True) as proxy, patch.object(run, 'ensure_server') as local:
            self.assertEqual(run.prepare_mode('home', 'http://office:5050'), run.PROXY_SERVER_URL)
            proxy.assert_called_once_with('http://office:5050')
            local.assert_not_called()

    def test_remote_unavailable_does_not_start_proxy(self):
        with patch.object(run, 'is_url_active', return_value=False), patch.object(run, 'ensure_proxy_server') as proxy:
            with self.assertRaises(RuntimeError): run.prepare_mode('home', 'http://office:5050')
            proxy.assert_not_called()

    def test_proxy_failure_is_not_reported_as_ready(self):
        with patch.object(run, 'is_url_active', return_value=True), patch.object(run, 'ensure_proxy_server', return_value=False):
            with self.assertRaises(RuntimeError): run.prepare_mode('home', 'http://office:5050')

    def test_cancel_gui_never_opens_app(self):
        with patch.object(run, 'show_mode_selector', return_value=None), patch.object(run, 'open_electron') as electron:
            self.assertEqual(run.main([]), 0)
            electron.assert_not_called()

    def test_explicit_mode_skips_gui(self):
        with patch.object(run, 'show_mode_selector') as gui, patch.object(run, 'prepare_mode', return_value=run.LOCAL_SERVER_URL), patch.object(run, 'open_electron') as electron:
            run.main(['--office'])
            gui.assert_not_called()
            electron.assert_called_once_with(run.LOCAL_SERVER_URL)

    def test_saved_home_selection_and_address(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as directory:
            config = Path(directory) / 'run_mode.json'
            config.write_text(json.dumps({'mode':'home','office_url':'http://office:5050'}), encoding='utf-8')
            with patch.object(run, 'CONFIG_FILE', str(config)):
                self.assertEqual(run.load_settings()['mode'], 'home')
                self.assertEqual(run.load_settings()['office_url'], 'http://office:5050')

    def test_invalid_remote_url_rejected_before_network(self):
        with patch.object(run, 'is_url_active') as network:
            with self.assertRaises(ValueError): run.prepare_mode('home', 'file:///tmp/anything')
            network.assert_not_called()

if __name__ == '__main__': unittest.main()
