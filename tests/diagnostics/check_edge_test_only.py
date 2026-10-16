import re
from pathlib import Path
import pythoncom
import win32com.client
from services.documents.realization import get_realization_list
from services.documents.navigation import EdgeConnection
source=Path('tests/diagnostics/check_test_base.py').read_text(encoding='utf-8')
connection=re.search(r"Connect\('([^']+)'\)",source)[1]
assert 'Srvr="Test1C"' in connection and 'Ref="Aztrade_test3"' in connection
pythoncom.CoInitialize()
conn=None
try:
    conn=win32com.client.Dispatch('V83.COMConnector').Connect(connection)
    payload=dict(date_from='2026-10-01',date_to='2026-10-31',limit=10,offset=0)
    for edge in (None,'home','end'):
        p=dict(payload)
        if edge: p.update(navigation_edge=edge,sort_field='date',sort_ascending=True)
        result=get_realization_list(EdgeConnection(conn,p) if edge else conn,p)
        print(edge,len(result['items']),[r['date'] for r in result['items']],result.get('debug_info'))
finally:
    conn=None
    pythoncom.CoUninitialize()

