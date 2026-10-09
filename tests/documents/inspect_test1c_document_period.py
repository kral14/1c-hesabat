"""Read-only date-range summary for the test database's sales documents."""
import sys
import gc
import pythoncom
import win32com.client

sys.stdout.reconfigure(encoding='utf-8')
pythoncom.CoInitialize()
connector = conn = query = rows = None
try:
    connector = win32com.client.Dispatch('V83.COMConnector')
    conn = connector.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')
    query = conn.NewObject('Запрос')
    query.Text = '''ВЫБРАТЬ КОЛИЧЕСТВО(*) КАК Total,
        МИНИМУМ(Т.Дата) КАК FirstDate, МАКСИМУМ(Т.Дата) КАК LastDate
        ИЗ Документ.РеализацияТоваровУслуг КАК Т'''
    rows = query.Execute().Choose()
    if rows.Next():
        print('Total:', int(rows.Total), 'First:', str(rows.FirstDate), 'Last:', str(rows.LastDate))
finally:
    rows = query = conn = connector = None
    gc.collect()
    pythoncom.CoUninitialize()
