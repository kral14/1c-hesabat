import win32com.client, pythoncom

pythoncom.CoInitialize()
conn = win32com.client.Dispatch("V83.COMConnector").Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

q = conn.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ
    КОЛИЧЕСТВО(*) КАК TotalRows,
    КОЛИЧЕСТВО(РАЗЛИЧНЫЕ Т.Номенклатура) КАК ItemCount
ИЗ
    РегистрНакопления.ТоварыНаСкладах.ОстаткиИОбороты(ДАТАВРЕМЯ(2026, 9, 1), ДАТАВРЕМЯ(2026, 9, 30, 23, 59, 59), Авто, , ) КАК Т
ГДЕ
    Т.Склад.Наименование = "Anbar Gəncə"
"""
res = q.Execute().Choose()
if res.Next():
    print("Total rows with Авто for Sep 2026:", res.TotalRows, "Distinct items:", res.ItemCount)

# What about for the whole year 2026?
q2 = conn.NewObject("Запрос")
q2.Text = """
ВЫБРАТЬ
    КОЛИЧЕСТВО(*) КАК TotalRows,
    КОЛИЧЕСТВО(РАЗЛИЧНЫЕ Т.Номенклатура) КАК ItemCount
ИЗ
    РегистрНакопления.ТоварыНаСкладах.ОстаткиИОбороты(ДАТАВРЕМЯ(2026, 1, 1), ДАТАВРЕМЯ(2026, 9, 30, 23, 59, 59), Авто, , ) КАК Т
ГДЕ
    Т.Склад.Наименование = "Anbar Gəncə"
"""
res2 = q2.Execute().Choose()
if res2.Next():
    print("Total rows with Авто for Jan-Sep 2026:", res2.TotalRows, "Distinct items:", res2.ItemCount)
