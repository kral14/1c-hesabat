import unittest
from unittest.mock import Mock, patch
from services.cluster_gui import ClusterSessionsGUI

class RunnerSessionTests(unittest.TestCase):
    def gui(self):
        gui = ClusterSessionsGUI.__new__(ClusterSessionsGUI)
        gui.root = Mock()
        gui.backend_url = 'http://office:5050'
        gui.action = None
        return gui

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
