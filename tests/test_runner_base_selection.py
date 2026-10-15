import io
import json
import unittest
from unittest.mock import patch
import run


def response(data):
    return io.BytesIO(json.dumps(data).encode('utf-8'))


class RunnerBaseSelectionTests(unittest.TestCase):
    def test_saved_bases_and_active_selection_are_loaded_without_credentials(self):
        data = {'success':True,'bases':[
            {'server':'aztrade3','ref':'aztrade2023','title':'Main'},
            {'server':'Test1C','ref':'Aztrade_test3','title':'Test','password':'do-not-render'},
            {'server':'test1c','ref':'aztrade_TEST3','title':'Duplicate'},
            {'server':'','ref':'invalid'}],
            'active_base':{'server':'Test1C','ref':'Aztrade_test3','user':'demo','password':'do-not-render'}}
        with patch.object(run.urllib.request,'urlopen',return_value=response(data)) as network:
            bases, selected = run.get_startup_bases('http://office:5050/')
        self.assertEqual(len(bases),2)
        self.assertEqual(selected,1)
        self.assertTrue(all(set(b) == {'server','ref','title'} for b in bases))
        network.assert_called_once_with('http://office:5050/api/bases',timeout=15)

    def test_active_base_is_included_when_missing_from_saved_list(self):
        with patch.object(run.urllib.request,'urlopen',return_value=response({'bases':[], 'active_base':{'server':'Test1C','ref':'Aztrade_test3'}})):
            bases, selected = run.get_startup_bases('http://local:5050')
        self.assertEqual(bases[0]['ref'],'Aztrade_test3')
        self.assertEqual(selected,0)

    def test_same_base_never_overwrites_credentials_or_reconnects(self):
        with patch.object(run.urllib.request,'urlopen',return_value=response({'active_base':{'server':'TEST1C','ref':'Aztrade_test3','user':'demo','password':'retained'}})) as network, patch.object(run,'ensure_1c_connection') as connect:
            run.select_startup_base('http://office:5050',{'server':'Test1C','ref':'Aztrade_test3','title':'Test'})
        self.assertEqual(network.call_count,1)
        connect.assert_not_called()

    def test_changed_base_persists_only_selected_identity(self):
        selected = {'server':'Test1C','ref':'Aztrade_test3','title':'Test'}
        with patch.object(run.urllib.request,'urlopen',side_effect=[response({'active_base':{'server':'aztrade3','ref':'aztrade2023','password':'old'}}),response({'success':True})]) as network:
            run.select_startup_base('http://office:5050',selected)
        request = network.call_args.args[0]
        self.assertEqual(request.full_url,'http://office:5050/api/bases/set_active')
        self.assertEqual(json.loads(request.data),selected)

    def test_cluster_window_uses_chosen_base_not_previous_active_base(self):
        selected = {'server':'Test1C','ref':'Aztrade_test3','title':'Test'}
        with patch('services.cluster_gui.open_cluster_gui',return_value=None) as gui, patch.object(run.urllib.request,'urlopen') as network:
            self.assertIsNone(run.manage_startup_sessions('http://office:5050',parent='launcher',selected_base=selected))
        network.assert_not_called()
        gui.assert_called_once_with(server_agent='Test1C:1540',target_base='Aztrade_test3',backend_url='http://office:5050',parent='launcher')

    def test_api_failure_is_not_presented_as_a_valid_selection(self):
        with patch.object(run.urllib.request,'urlopen',return_value=response({'success':False,'error':'offline'})):
            with self.assertRaisesRegex(RuntimeError,'offline'): run.get_startup_bases('http://office:5050')
