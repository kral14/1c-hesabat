# -*- coding: utf-8 -*-
import win32com.client
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

epf_path = r"C:\Users\nesib\.gemini\antigravity-ide\scratch\1c_reporter\epf_cache\sales_report.epf"
if not os.path.exists(epf_path):
    epf_path = r"C:\Users\nesib\.gemini\antigravity-ide\scratch\report.epf"

rep = conn.ВнешниеОтчеты.Создать(epf_path)
schema = rep.СхемаКомпоновкиДанных

# Serialize the entire СКД schema into XML using XMLWriter
xml_writer = conn.NewObject("ЗаписьXML")
xml_file = r"C:\Users\nesib\.gemini\antigravity-ide\scratch\skd_schema.xml"
xml_writer.ОткрытьФайл(xml_file)

serializer = conn.NewObject("СериализаторXDTO")
serializer.ЗаписатьXML(xml_writer, schema)
xml_writer.Закрыть()

print(f"Serialized СКД to XML successfully: {xml_file}")
print(f"File size: {os.path.getsize(xml_file)} bytes")

# Read queries from schema.НаборыДанных
for i in range(schema.НаборыДанных.Количество()):
    ds = schema.НаборыДанных.Получить(i)
    print(f"\n--- Data Set {i}: {ds.Имя} ---")
    try:
        query_text = str(ds.Запрос)
        print("Query length:", len(query_text))
        print("Query preview (first 500 chars):")
        print(query_text[:500])
        with open(r"C:\Users\nesib\.gemini\antigravity-ide\scratch\skd_query.txt", "w", encoding="utf-8") as f:
            f.write(query_text)
        print("\nFull query saved to scratch/skd_query.txt!")
    except Exception as e:
        print("Not a query dataset:", e)

# Read calculated fields (ВычисляемыеПоля) and resources (ПоляРесурсов)
print("\n--- Calculated Fields (Вычисляемые поля) ---")
for i in range(schema.ВычисляемыеПоля.Количество()):
    cf = schema.ВычисляемыеПоля.Получить(i)
    print(f" * Field: '{cf.ПутьКДанным}' -> Expression: '{cf.Выражение}' (Title: '{cf.Заголовок}')")

print("\n--- Resource Fields (Ресурсы - necə cəmlənir və hesablanır) ---")
for i in range(schema.ПоляИтогов.Количество()):
    rf = schema.ПоляИтогов.Получить(i)
    print(f" * Resource: '{rf.ПутьКДанным}' -> Expression: '{rf.Выражение}'")
