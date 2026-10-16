import re
from pathlib import Path
import pythoncom,win32com.client
source=Path('tests/diagnostics/check_test_base.py').read_text(encoding='utf-8')
connection=re.search(r"Connect\('([^']+)'\)",source)[1]
assert 'Srvr="Test1C"' in connection and 'Ref="Aztrade_test3"' in connection
pythoncom.CoInitialize()
conn=None
try:
 conn=win32com.client.Dispatch('V83.COMConnector').Connect(connection)
 meta=conn.Метаданные.Документы.Найти('ЗаказПокупателя')
 print('HEADER', [str(r.Имя) for r in meta.Реквизиты])
 for table in meta.ТабличныеЧасти:
  print('TABLE',str(table.Имя),[str(r.Имя) for r in table.Реквизиты])
 contract=conn.Метаданные.Справочники.Найти('ДоговорыКонтрагентов')
 print('CONTRACT', [str(r.Имя) for r in contract.Реквизиты if 'Портф' in str(r.Имя)])
finally:
 conn=None
 pythoncom.CoUninitialize()
