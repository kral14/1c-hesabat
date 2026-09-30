import win32com.client, pythoncom

pythoncom.CoInitialize()
connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

# Read DCS query from ВедомостьТоварыНаСкладах
try:
    obj = conn.Отчеты.ВедомостьТоварыНаСкладах.Создать()
    skd = obj.СхемаКомпоновкиДанных
    ds = skd.НаборыДанных.Получить(0)
    query_text = ds.Запрос
    with open("skd_query_text.txt", "w", encoding="utf-8") as f:
        f.write(query_text)
    print("Exported skd_query_text.txt successfully!")
except Exception as e:
    with open("skd_query_error.txt", "w", encoding="utf-8") as f:
        f.write(str(e))
    print("Error:", e)
