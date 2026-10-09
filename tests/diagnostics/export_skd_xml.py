# -*- coding: utf-8 -*-
import win32com.client
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

epf_path = r"C:\Users\nesib\.gemini\antigravity-ide\scratch\1c_reporter\epf_cache\sales_report.epf"
rep = conn.ВнешниеОтчеты.Создать(epf_path)
schema = rep.СхемаКомпоновкиДанных

xml_file = r"C:\Users\nesib\.gemini\antigravity-ide\scratch\skd_schema.xml"
writer = conn.NewObject("ЗаписьXML")
writer.ОткрытьФайл(xml_file)

try:
    serializer = conn.NewObject("СериализаторXDTO", conn.ФабрикаXDTO)
    serializer.ЗаписатьXML(writer, schema)
    writer.Закрыть()
    print(f"Exported СКД XML successfully: {os.path.getsize(xml_file)} bytes")
except Exception as e:
    writer.Закрыть()
    print("Serialization error:", e)
