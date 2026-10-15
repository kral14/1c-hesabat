import unittest
from unittest.mock import Mock, patch
from services.cluster_gui import ClusterSessionsGUI

class RunnerSessionTests(unittest.TestCase):
    def gui(self):
        gui = ClusterSessionsGUI.__new__(ClusterSessionsGUI)
        gui.root = Mock()
        gui.backend_url = 'http://office:5050'
        gui.action = None
        gui.server_agent = 'aztrade3:1540'
        gui.target_base = 'aztrade2023'
        gui.tree = Mock()
        gui.tree.get_children.return_value = []
        gui.session_notice = Mock()
        gui.connection_notice = Mock()
        gui.status_bar = Mock()
        gui.btn_terminate = Mock()
        gui.btn_clean_com = Mock()
        return gui

    def test_own_com_connection_is_shown_independently_of_cluster_failure(self):
        gui=self.gui()
        gui._display_session_error('1540 timeout')
        gui._display_connection_status({'connected':True})
        self.assertIn('COM bağlıdır',gui.connection_notice.config.call_args.kwargs['text'])
        self.assertIn('aztrade3 / aztrade2023',gui.connection_notice.config.call_args.kwargs['text'])
        self.assertIn('oxumaq mümkün olmadı',gui.session_notice.config.call_args.kwargs['text'])

    def test_busy_worker_is_not_reported_as_verified_connection(self):
        gui=self.gui()
        gui._display_connection_status({'busy':True,'connected':None})
        text=gui.connection_notice.config.call_args.kwargs['text']
        self.assertIn('sorğu icra edir',text)
        self.assertNotIn('COM bağlıdır',text)

    def test_no_connection_is_clear_and_does_not_open_one(self):
        gui=self.gui();gui._backend=Mock()
        gui._display_connection_status({'connected':False,'worker_available':True})
        self.assertIn('COM bağlantısı yoxdur',gui.connection_notice.config.call_args.kwargs['text'])
        gui._backend.assert_not_called()

    def test_session_error_is_visible_above_grid_and_disables_termination(self):
        gui=self.gui()
        gui._display_session_error('TCP timeout')
        text=gui.session_notice.config.call_args.kwargs['text']
        self.assertIn('aztrade3:1540',text)
        self.assertIn('sessiya olmadığı demək deyil',text)
        gui.btn_terminate.config.assert_called_with(state='disabled')
        gui.btn_clean_com.config.assert_called_with(state='disabled')

    def test_empty_selected_base_does_not_claim_all_licenses_are_free(self):
        gui=self.gui()
        gui._display_sessions([])
        text=gui.status_bar.config.call_args.kwargs['text']
        self.assertIn('Seçilmiş bazada',text)
        self.assertNotIn('lisenziya',text)
        gui.btn_terminate.config.assert_called_with(state='disabled')

    def test_success_after_failure_restores_session_actions(self):
        gui=self.gui()
        gui._display_session_error('timeout')
        gui._display_sessions([dict(session_id='1',user_name='Demo',app_id='COMConnection',host='PC',started_at='',is_hanging=True)])
        gui.btn_terminate.config.assert_called_with(state='normal')
        gui.btn_clean_com.config.assert_called_with(state='normal')

    def test_reuse_calls_probe_and_does_not_terminate(self):
        gui = self.gui()
        gui._backend = Mock(return_value={'success':True,'connected':True})
        gui._on_reuse()
        gui._backend.assert_called_once_with('api/connection/resume')
        self.assertEqual(gui.action,'reuse')
        gui.root.destroy.assert_called_once()

    def test_failed_reuse_leaves_gui_open(self):
        gui = self.gui()
        gui._backend = Mock(side_effect=RuntimeError('no retained session'))
        with patch('services.cluster_gui.messagebox.showerror') as error:
            gui._on_reuse()
            error.assert_called_once()
        gui.root.destroy.assert_not_called()
        self.assertIsNone(gui.action)

    def test_clean_only_disconnected_com(self):
        gui=self.gui();gui._load_sessions=Mock()
        gui._backend=Mock(side_effect=[{'sessions':[
            {'session_id':'1','app_id':'COMConnection','is_hanging':False},
            {'session_id':'2','app_id':'COMConnection','is_hanging':True},
            {'session_id':'3','app_id':'ThinClient','is_hanging':True}]}, {'success':True}])
        with patch('services.cluster_gui.messagebox.askyesno',return_value=True), patch('services.cluster_gui.messagebox.showinfo'):
            gui._on_auto_clean()
        self.assertEqual(gui._backend.call_count,2)
        gui._backend.assert_called_with('api/cluster/terminate',{'session_id':'2','only_hanging':True})

if __name__=='__main__': unittest.main()
