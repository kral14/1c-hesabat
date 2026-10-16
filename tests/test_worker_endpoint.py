import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from services.worker_endpoint import resolve_port,save_port
from services.onec_gateway import OneCGateway

class WorkerEndpointTests(unittest.TestCase):
    def test_default_and_persisted_port(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as root,patch.dict('os.environ',{'REPORTER_WORKER_PORT':''}):
            self.assertEqual(resolve_port(root),5052)
            save_port(root,5053)
            self.assertEqual(resolve_port(root),5053)
    def test_existing_gateway_follows_project_configuration(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as root,patch.dict('os.environ',{'REPORTER_WORKER_PORT':''}):
            gateway=OneCGateway(root=root)
            save_port(root,5053)
            gateway._sync_endpoint()
            self.assertEqual(gateway.url,'http://127.0.0.1:5053')
            self.assertIsNone(gateway._status)
    def test_explicit_port_never_follows_other_configuration(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as root,patch.dict('os.environ',{'REPORTER_WORKER_PORT':''}):
            save_port(root,5053)
            gateway=OneCGateway(port=5060,root=root)
            gateway._sync_endpoint()
            self.assertEqual(gateway.port,5060)
    def test_environment_override(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as root,patch.dict('os.environ',{'REPORTER_WORKER_PORT':'5061'}):
            save_port(root,5053)
            self.assertEqual(resolve_port(root),5061)
    def test_invalid_ports_rejected(self):
        for value in (0,65536,'bad'):
            with self.assertRaises(ValueError):resolve_port('.',value)
    def test_malformed_config_does_not_switch_to_another_port(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as root,patch.dict('os.environ',{'REPORTER_WORKER_PORT':''}):
            path=Path(root)/'logs'/'worker-endpoint.json';path.parent.mkdir();path.write_text('{}')
            with self.assertRaises(ValueError):resolve_port(root)

if __name__=='__main__':unittest.main()
