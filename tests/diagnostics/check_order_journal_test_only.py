import re,sys
from pathlib import Path
import pythoncom,win32com.client
from services.documents.generic import get_generic_documents_list
sys.stdout.reconfigure(encoding='utf-8')
source=Path('tests/diagnostics/check_test_base.py').read_text(encoding='utf-8')
connection=re.search(r"Connect\('([^']+)'\)",source)[1]
assert 'Srvr="Test1C"' in connection and 'Ref="Aztrade_test3"' in connection
pythoncom.CoInitialize()
conn=None
try:
 conn=win32com.client.Dispatch('V83.COMConnector').Connect(connection)
 payload={'doc_type':'ЗаказПокупателя','limit':3}
 result=get_generic_documents_list(conn,payload)
 assert {'warehouse','portfolio'} <= {c['key'] for c in result['columns']}
 print('PASS Test1C order columns: warehouse + portfolio; rows:',len(result['items']))
 if result['items']:
  row=result['items'][0]
  for key in ('warehouse','portfolio'):
   if not row.get(key): continue
   filtered=get_generic_documents_list(conn,{**payload,'filters':[{'fieldKey':key,'operator':'Равно','value':row[key]}]})
   assert filtered['items'] and all(r[key]==row[key] for r in filtered['items'])
   print('PASS filter:',key,'rows:',len(filtered['items']))
finally:
 conn=None
 pythoncom.CoUninitialize()
