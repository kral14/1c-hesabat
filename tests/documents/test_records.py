import win32com.client, pythoncom

pythoncom.CoInitialize()
conn = win32com.client.Dispatch("V83.COMConnector").Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

q = conn.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ
    Т.Склад.Наименование КАК Warehouse,
    Т.Номенклатура.Наименование КАК Item,
    Т.Регистратор КАК Doc,
    ПРЕДСТАВЛЕНИЕ(Т.Регистратор) КАК DocPres,
    Т.КоличествоНачальныйОстаток КАК StartBal,
    Т.КоличествоПриход КАК InQty,
    Т.КоличествоРасход КАК OutQty,
    Т.КоличествоКонечныйОстаток КАК EndBal,
    Т.КоличествоОборот КАК Turnover
ИЗ
    РегистрНакопления.ТоварыНаСкладах.ОстаткиИОбороты(ДАТАВРЕМЯ(2026, 9, 1), ДАТАВРЕМЯ(2026, 9, 30, 23, 59, 59), Авто, , ) КАК Т
ГДЕ
    Т.Склад.Наименование = "Anbar Gəncə"
"""
res = q.Execute().Choose()
count = 0
while res.Next() and count < 10:
    count += 1
    print(f"Item: {res.Item[:20]} | Doc: {str(res.DocPres)[:25]} | Start: {res.StartBal} | In: {res.InQty} | Out: {res.OutQty} | End: {res.EndBal}")

print(f"Sampled {count} rows")
