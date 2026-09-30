import win32com.client, pythoncom

pythoncom.CoInitialize()
connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

# Get DCS (СхемаКомпоновкиДанных) of ВедомостьТоварыНаСкладах
try:
    obj = conn.Отчеты.ВедомостьТоварыНаСкладах.Создать()
    skd = obj.СхемаКомпоновкиДанных
    # Write SKD XML to file
    writer = conn.NewObject("ЗаписьXML")
    writer.ОткрытьФайл("skd_tovary_na_skladakh.xml")
    serializer = conn.NewObject("СериализаторXDTO")
    serializer.ЗаписатьXML(writer, skd)
    writer.Закрыть()
    print("Exported skd_tovary_na_skladakh.xml successfully!")
except Exception as e:
    print("Error getting SKD for ВедомостьТоварыНаСкладах:", e)

# Also check УниверсальныйОтчет or ОтчетОстаткиИОбороты
try:
    obj2 = conn.Отчеты.УниверсальныйОтчет.Создать()
    print("УниверсальныйОтчет created successfully")
    # Check its properties
    try:
        print("ПостроительОтчета:", hasattr(obj2, "ПостроительОтчета"))
    except:
        pass
except Exception as e2:
    print("Error creating УниверсальныйОтчет:", e2)
