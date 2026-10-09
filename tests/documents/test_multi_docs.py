import win32com.client, pythoncom, sys
sys.stdout.reconfigure(encoding='utf-8')

pythoncom.CoInitialize()
conn = win32com.client.Dispatch("V83.COMConnector").Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

q = conn.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ
    Т.Склад.Наименование КАК Warehouse,
    Т.Номенклатура.Наименование КАК Item,
    ПРЕДСТАВЛЕНИЕ(Т.Регистратор) КАК DocPres,
    Т.КоличествоНачальныйОстаток КАК StartBal,
    Т.КоличествоПриход КАК InQty,
    Т.КоличествоРасход КАК OutQty,
    Т.КоличествоКонечныйОстаток КАК EndBal,
    Т.КоличествоОборот КАК Turnover
ИЗ
    РегистрНакопления.ТоварыНаСкладах.ОстаткиИОбороты(ДАТАВРЕМЯ(2026, 8, 1), ДАТАВРЕМЯ(2026, 8, 31, 23, 59, 59), Авто, , ) КАК Т
ГДЕ
    Т.Склад.Наименование = "Test Emin"
    И Т.Номенклатура.Наименование ПОДОБНО "%DIROL X energy%"
"""
res = q.Execute().Choose()
while res.Next():
    print(f"Item: {res.Item} | Doc: {str(res.DocPres)} | Start: {res.StartBal} | In: {res.InQty} | Out: {res.OutQty} | End: {res.EndBal}")
