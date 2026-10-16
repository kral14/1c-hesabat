import re,sys,datetime
from pathlib import Path
import pythoncom,win32com.client
sys.stdout.reconfigure(encoding='utf-8')
source=Path('tests/diagnostics/check_test_base.py').read_text(encoding='utf-8')
connection=re.search(r"Connect\('([^']+)'\)",source)[1]
assert 'Srvr="Test1C"' in connection and 'Ref="Aztrade_test3"' in connection
pythoncom.CoInitialize()
conn=q=sel=None
try:
 conn=win32com.client.Dispatch('V83.COMConnector').Connect(connection)
 for value in [datetime.datetime(2026,10,12),datetime.datetime(2026,10,12,tzinfo=datetime.timezone.utc)]:
  q=conn.NewObject('Запрос');q.SetParameter('Probe',value)
  q.Text='ВЫБРАТЬ &Probe КАК Raw, ДЕНЬ(&Probe) КАК DayNum, ЧАС(&Probe) КАК HourNum'
  sel=q.Execute().Choose();sel.Next()
  print('INPUT',str(value),'SERVER DAY/HOUR',sel.DayNum,sel.HourNum,'RETURN',str(sel.Raw))
finally:
 sel=q=conn=None
 pythoncom.CoUninitialize()
