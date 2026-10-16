import unittest
from unittest.mock import Mock
from renew_com import main

class RenewComTests(unittest.TestCase):
    def setUp(self):
        self.gateway=Mock()
        self.before=dict(available=True,pid=1,session_count=1,connections=[dict(server='Test1C',ref='test',user='User')])
        self.gateway.status.side_effect=[self.before,dict(available=True,pid=2,session_count=1)]
        self.base=Mock(return_value=dict(server='Test1C',ref='test',user='User',password='private-password'))
        self.output=Mock()
    def run_script(self,args):
        return main(args,gateway=self.gateway,base_reader=self.base,output=self.output)
    def test_status_does_not_connect_or_read_credentials(self):
        self.assertEqual(self.run_script(['--status']),0)
        self.base.assert_not_called()
        self.gateway.restart_worker.assert_not_called()
        self.gateway.execute.assert_not_called()
    def test_default_restart_never_reads_input(self):
        from unittest.mock import patch
        with patch('builtins.input',side_effect=AssertionError('No prompt expected')) as prompt:
            self.assertEqual(self.run_script([]),0)
            prompt.assert_not_called()
        self.gateway.restart_worker.assert_called_once_with(confirmed=True)
    def test_confirmed_restart_reconnects_same_target_without_retry(self):
        self.assertEqual(self.run_script([]),0)
        self.gateway.restart_worker.assert_called_once_with(confirmed=True)
        self.gateway.execute.assert_called_once_with('ping',self.base.return_value,retry=0,timeout=60)
        self.assertNotIn('private-password',str(self.output.call_args_list))
    def test_different_base_is_not_disconnected(self):
        self.base.return_value['ref']='different'
        self.assertEqual(self.run_script(['--yes']),1)
        self.gateway.restart_worker.assert_not_called()
    def test_failure_does_not_print_credentials(self):
        self.gateway.restart_worker.side_effect=RuntimeError('private-password')
        self.assertEqual(self.run_script(['--yes']),1)
        self.assertNotIn('private-password',str(self.output.call_args_list))
        self.gateway.execute.assert_not_called()
    def test_same_pid_is_not_reported_as_success(self):
        self.gateway.status.side_effect=[self.before,dict(available=True,pid=1,session_count=1)]
        self.assertEqual(self.run_script(['--yes']),1)

if __name__=='__main__': unittest.main()
